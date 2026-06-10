'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { apiFetch } from '@/lib/apiFetch';

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false });

interface GraphNode {
  id: string;
  type: string;
  label: string;
}

interface GraphLink {
  source: string;
  target: string;
  relation_type: string;
  source_type: string;
  confidence: number;
}

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

const NODE_COLORS: Record<string, string> = {
  document: '#0ea5e9',
  event:    '#f97316',
  incident: '#ef4444',
};

const EDGE_COLORS: Record<string, string> = {
  metadata: '#64748b',
  manual:   '#2563eb',
  auto:     '#16a34a',
  external: '#9333ea',
};

const ENTITY_TYPES = [
  { label: '문서', value: 'document' },
  { label: '이벤트', value: 'event' },
  { label: '장애사례', value: 'incident' },
];

export default function GraphPage() {
  const [entityType, setEntityType] = useState('document');
  const [entityId, setEntityId] = useState('');
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleExplore = async () => {
    if (!entityId.trim()) return;
    setLoading(true);
    setHasSearched(true);
    setSelectedNode(null);
    try {
      const res = await apiFetch(
        `/api/v1/graph/context?entity_type=${encodeURIComponent(entityType)}&entity_id=${encodeURIComponent(entityId.trim())}&depth=2`
      );
      const data = await res.json();
      setGraphData({
        nodes: Array.isArray(data.nodes) ? data.nodes : [],
        links: Array.isArray(data.links) ? data.links : (Array.isArray(data.edges) ? data.edges : []),
      });
    } catch {
      setGraphData({ nodes: [], links: [] });
    } finally {
      setLoading(false);
    }
  };

  const nodeColor = (node: object) => NODE_COLORS[(node as GraphNode).type] ?? '#6b7280';
  const linkColor = (link: object) => EDGE_COLORS[(link as GraphLink).source_type] ?? '#94a3b8';

  const inputCls = "px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-700 focus:outline-none focus:border-sky-400 transition-all";

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="px-6 py-3.5 border-b border-slate-300 bg-white shrink-0" style={{boxShadow: '0 1px 4px rgba(0,0,0,0.04)'}}>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-500 shrink-0">엔터티 유형</label>
            <select value={entityType} onChange={e => setEntityType(e.target.value)} className={inputCls}>
              {ENTITY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-500 shrink-0">ID</label>
            <input
              type="text"
              placeholder="엔터티 ID 입력..."
              value={entityId}
              onChange={e => setEntityId(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleExplore()}
              className={`${inputCls} w-64`}
            />
          </div>

          <button
            onClick={handleExplore}
            disabled={loading}
            className="px-5 py-1.5 text-white rounded-lg text-sm font-semibold transition-all disabled:opacity-50"
            style={{
              background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
              boxShadow: '0 2px 8px rgba(14,165,233,0.28)',
            }}
          >
            {loading ? '탐색 중...' : '탐색'}
          </button>
        </div>

        {/* Legend */}
        <div className="flex gap-5 mt-3 text-xs flex-wrap items-center">
          <span className="text-slate-500 font-semibold">노드:</span>
          {Object.entries(NODE_COLORS).map(([type, color]) => (
            <span key={type} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: color, boxShadow: `0 0 4px ${color}88` }} />
              <span className="text-slate-800">{type}</span>
            </span>
          ))}
          <span className="text-slate-300">|</span>
          <span className="text-slate-500 font-semibold">엣지:</span>
          {Object.entries(EDGE_COLORS).map(([type, color]) => (
            <span key={type} className="flex items-center gap-1.5">
              <span className="w-4 h-0.5 inline-block rounded" style={{ backgroundColor: color }} />
              <span className="text-slate-800">{type}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden relative">
        {/* Graph area */}
        <div className="flex-1 relative bg-slate-100">
          {!hasSearched && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl font-bold"
                  style={{
                    background: 'linear-gradient(135deg, rgba(14,165,233,0.15) 0%, rgba(56,189,248,0.08) 100%)',
                    boxShadow: '0 0 0 1px rgba(14,165,233,0.2), 0 4px 20px rgba(14,165,233,0.1)',
                  }}
                >
                  🕸
                </div>
                <p className="text-slate-500 text-sm">문서나 이벤트 ID를 입력하고 탐색 버튼을 클릭하세요.</p>
              </div>
            </div>
          )}
          {hasSearched && !loading && graphData.nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-slate-500 text-sm">관계 데이터가 없습니다.</p>
            </div>
          )}
          {graphData.nodes.length > 0 && (
            <ForceGraph2D
              graphData={graphData}
              nodeLabel="label"
              nodeColor={nodeColor}
              linkColor={linkColor}
              onNodeClick={(node) => setSelectedNode(node as GraphNode)}
              width={undefined}
              height={undefined}
              backgroundColor="#f1f5f9"
              nodeRelSize={6}
              linkDirectionalArrowLength={4}
              linkDirectionalArrowRelPos={1}
              linkWidth={2}
            />
          )}
        </div>

        {/* Node info panel */}
        {selectedNode && (
          <div
            className="w-72 shrink-0 border-l border-slate-300 bg-white p-5 overflow-y-auto"
            style={{boxShadow: '-2px 0 12px rgba(0,0,0,0.06)'}}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-800">선택된 노드</h3>
              <button onClick={() => setSelectedNode(null)} className="text-slate-500 hover:text-slate-800 text-xs">닫기</button>
            </div>
            <div className="space-y-4">
              <div>
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">레이블</span>
                <p className="text-sm font-medium text-slate-800 mt-1 break-words">{selectedNode.label}</p>
              </div>
              <div>
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">유형</span>
                <p className="mt-1">
                  <span
                    className="px-2.5 py-1 rounded-lg text-xs font-bold text-white"
                    style={{
                      backgroundColor: NODE_COLORS[selectedNode.type] ?? '#6b7280',
                      boxShadow: `0 2px 8px ${(NODE_COLORS[selectedNode.type] ?? '#6b7280')}44`,
                    }}
                  >
                    {selectedNode.type}
                  </span>
                </p>
              </div>
              <div>
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">ID</span>
                <p className="text-xs text-slate-500 mt-1 break-all font-mono">{selectedNode.id}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
