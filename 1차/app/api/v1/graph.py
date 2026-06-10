from collections import deque
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.document_relation import DocumentRelation

router = APIRouter()


# ── 스키마 ─────────────────────────────────────────────────────

class GraphNode(BaseModel):
    id: str
    type: str
    label: str


class GraphEdge(BaseModel):
    source: str
    target: str
    relation_type: str
    source_type: str
    confidence: float


class GraphContextResponse(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]


# ── BFS 탐색 ───────────────────────────────────────────────────

def _fetch_relations(db: Session, entity_id: UUID) -> list[DocumentRelation]:
    """주어진 entity_id가 source 또는 target인 DocumentRelation 모두 조회."""
    return (
        db.query(DocumentRelation)
        .filter(
            (DocumentRelation.source_entity_id == entity_id)
            | (DocumentRelation.target_entity_id == entity_id)
        )
        .all()
    )


def _build_graph(
    db: Session,
    start_entity_type: str,
    start_entity_id: UUID,
    depth: int,
) -> tuple[list[GraphNode], list[GraphEdge]]:
    """BFS로 depth 홉 이내 관계를 탐색하여 nodes/edges 반환."""
    visited: set[str] = set()
    nodes_map: dict[str, GraphNode] = {}
    edges: list[GraphEdge] = []

    # (entity_id, entity_type, current_depth)
    queue: deque[tuple[UUID, str, int]] = deque()
    queue.append((start_entity_id, start_entity_type, 0))
    visited.add(str(start_entity_id))

    # 시작 노드 추가
    nodes_map[str(start_entity_id)] = GraphNode(
        id=str(start_entity_id),
        type=start_entity_type,
        label=f"{start_entity_type}:{str(start_entity_id)[:8]}",
    )

    while queue:
        current_id, current_type, current_depth = queue.popleft()

        if current_depth >= depth:
            continue

        relations = _fetch_relations(db, current_id)
        for rel in relations:
            src_id = str(rel.source_entity_id)
            tgt_id = str(rel.target_entity_id)

            # 엣지 추가 (중복 방지)
            edge = GraphEdge(
                source=src_id,
                target=tgt_id,
                relation_type=rel.relation_type,
                source_type=rel.source_type,
                confidence=rel.confidence,
            )
            if edge not in edges:
                edges.append(edge)

            # 인접 노드 처리
            for adj_id_str, adj_type in [
                (src_id, rel.source_entity_type),
                (tgt_id, rel.target_entity_type),
            ]:
                if adj_id_str not in nodes_map:
                    nodes_map[adj_id_str] = GraphNode(
                        id=adj_id_str,
                        type=adj_type,
                        label=f"{adj_type}:{adj_id_str[:8]}",
                    )
                if adj_id_str not in visited:
                    visited.add(adj_id_str)
                    try:
                        adj_uuid = UUID(adj_id_str)
                    except ValueError:
                        continue
                    queue.append((adj_uuid, adj_type, current_depth + 1))

    return list(nodes_map.values()), edges


# ── 엔드포인트 ─────────────────────────────────────────────────

@router.get("/graph/context", response_model=GraphContextResponse)
def get_graph_context(
    entity_type: str = Query(..., description="탐색 시작 엔티티 타입 (document/event/incident 등)"),
    entity_id: UUID = Query(..., description="탐색 시작 엔티티 UUID"),
    depth: int = Query(default=1, ge=1, le=3, description="BFS 탐색 깊이 (1~3)"),
    db: Session = Depends(get_db),
):
    """
    관계 그래프 탐색 API.
    entity_id를 시작점으로 depth 홉 이내의 DocumentRelation을 BFS 탐색합니다.
    """
    nodes, edges = _build_graph(db, entity_type, entity_id, depth)
    return GraphContextResponse(nodes=nodes, edges=edges)
