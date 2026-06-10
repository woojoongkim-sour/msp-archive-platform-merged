from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.customer import Customer, CustomerAlias

router = APIRouter(prefix="/customers", tags=["customers"])


class CustomerCreate(BaseModel):
    name: str
    code: str
    description: str | None = None


class CustomerUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    is_active: bool | None = None


class AliasCreate(BaseModel):
    alias: str


@router.get("")
def list_customers(db: Session = Depends(get_db)):
    customers = db.query(Customer).order_by(Customer.name).all()
    return {"success": True, "data": [_to_dict(c) for c in customers]}


@router.post("")
def create_customer(req: CustomerCreate, db: Session = Depends(get_db)):
    if db.query(Customer).filter_by(code=req.code.upper()).first():
        raise HTTPException(400, f"코드 '{req.code}' 는 이미 사용 중입니다.")
    c = Customer(name=req.name, code=req.code.upper(), description=req.description)
    db.add(c)
    db.commit()
    db.refresh(c)
    return {"success": True, "data": _to_dict(c)}


@router.get("/{cid}")
def get_customer(cid: int, db: Session = Depends(get_db)):
    c = db.get(Customer, cid)
    if not c:
        raise HTTPException(404, "고객사를 찾을 수 없습니다.")
    return {"success": True, "data": _to_dict(c)}


@router.patch("/{cid}")
def update_customer(cid: int, req: CustomerUpdate, db: Session = Depends(get_db)):
    c = db.get(Customer, cid)
    if not c:
        raise HTTPException(404, "고객사를 찾을 수 없습니다.")
    if req.name is not None:
        c.name = req.name
    if req.description is not None:
        c.description = req.description
    if req.is_active is not None:
        c.is_active = req.is_active
    db.commit()
    db.refresh(c)
    return {"success": True, "data": _to_dict(c)}


@router.delete("/{cid}")
def delete_customer(cid: int, db: Session = Depends(get_db)):
    c = db.get(Customer, cid)
    if not c:
        raise HTTPException(404, "고객사를 찾을 수 없습니다.")
    db.delete(c)
    db.commit()
    return {"success": True, "data": {"message": "삭제되었습니다."}}


@router.post("/{cid}/aliases")
def add_alias(cid: int, req: AliasCreate, db: Session = Depends(get_db)):
    c = db.get(Customer, cid)
    if not c:
        raise HTTPException(404, "고객사를 찾을 수 없습니다.")
    if db.query(CustomerAlias).filter_by(alias=req.alias).first():
        raise HTTPException(400, f"별칭 '{req.alias}' 는 이미 존재합니다.")
    alias = CustomerAlias(customer_id=cid, alias=req.alias)
    db.add(alias)
    db.commit()
    return {"success": True, "data": {"alias": req.alias}}


@router.delete("/{cid}/aliases/{alias_id}")
def delete_alias(cid: int, alias_id: int, db: Session = Depends(get_db)):
    a = db.get(CustomerAlias, alias_id)
    if not a or a.customer_id != cid:
        raise HTTPException(404, "별칭을 찾을 수 없습니다.")
    db.delete(a)
    db.commit()
    return {"success": True}


def _to_dict(c: Customer) -> dict:
    return {
        "id": c.id,
        "name": c.name,
        "code": c.code,
        "description": c.description,
        "is_active": c.is_active,
        "aliases": [a.alias for a in (c.aliases or [])],
        "created_at": c.created_at.isoformat() if c.created_at else None,
    }
