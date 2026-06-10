from datetime import datetime
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin, get_current_user
from app.core.security import create_access_token, hash_password, verify_password, encrypt_password, decrypt_password
from app.db.session import get_db
from app.models.user import User
from app.models.user_mail_config import UserMailConfig

router = APIRouter()


# ── 스키마 ─────────────────────────────────────────────────────

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


class UserCreate(BaseModel):
    email: str
    password: str
    role: str = "user"


class UserResponse(BaseModel):
    id: str
    email: str
    role: str
    is_active: bool
    created_at: datetime


# ── 엔드포인트 ─────────────────────────────────────────────────

@router.post("/auth/login", response_model=TokenResponse)
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == form.username, User.is_active == True).first()
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="이메일 또는 비밀번호가 올바르지 않습니다")
    token = create_access_token({"sub": user.email, "role": user.role})
    return TokenResponse(access_token=token, user={"email": user.email, "role": user.role})


@router.get("/auth/me")
def me(current_user: User = Depends(get_current_user)):
    return {"email": current_user.email, "role": current_user.role}


@router.post("/auth/users", response_model=UserResponse)
def create_user(body: UserCreate, db: Session = Depends(get_db), _: User = Depends(get_current_admin)):
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status_code=409, detail="이미 존재하는 이메일입니다")
    if body.role not in ("admin", "user"):
        raise HTTPException(status_code=400, detail="role은 admin 또는 user여야 합니다")
    user = User(email=body.email, hashed_password=hash_password(body.password), role=body.role)
    db.add(user)
    db.commit()
    db.refresh(user)
    return UserResponse(id=str(user.id), email=user.email, role=user.role, is_active=user.is_active, created_at=user.created_at)


@router.get("/auth/users", response_model=list[UserResponse])
def list_users(db: Session = Depends(get_db), _: User = Depends(get_current_admin)):
    users = db.query(User).order_by(User.created_at).all()
    return [UserResponse(id=str(u.id), email=u.email, role=u.role, is_active=u.is_active, created_at=u.created_at) for u in users]


@router.delete("/auth/users/{user_id}", status_code=204)
def delete_user(user_id: UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_admin)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다")
    if user.email == current_user.email:
        raise HTTPException(status_code=400, detail="자기 자신은 삭제할 수 없습니다")
    db.delete(user)
    db.commit()


# ── 메일 계정 설정 ─────────────────────────────────────────────

class MailConfigRequest(BaseModel):
    host: str
    port: int = 110
    protocol: str = "pop3"
    username: str
    password: str
    use_ssl: bool = False


class MailConfigResponse(BaseModel):
    host: str
    port: int
    protocol: str
    username: str
    use_ssl: bool
    has_config: bool = True


@router.get("/auth/mail-config", response_model=MailConfigResponse | None)
def get_mail_config(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    cfg = db.query(UserMailConfig).filter(UserMailConfig.user_email == current_user.email).first()
    if not cfg:
        return None
    return MailConfigResponse(host=cfg.host, port=cfg.port, protocol=cfg.protocol,
                               username=cfg.username, use_ssl=cfg.use_ssl)


@router.put("/auth/mail-config", response_model=MailConfigResponse)
def save_mail_config(body: MailConfigRequest, db: Session = Depends(get_db),
                     current_user: User = Depends(get_current_user)):
    cfg = db.query(UserMailConfig).filter(UserMailConfig.user_email == current_user.email).first()
    encrypted = encrypt_password(body.password)
    if cfg:
        cfg.host = body.host
        cfg.port = body.port
        cfg.protocol = body.protocol
        cfg.username = body.username
        cfg.encrypted_password = encrypted
        cfg.use_ssl = body.use_ssl
    else:
        cfg = UserMailConfig(user_email=current_user.email, host=body.host, port=body.port,
                             protocol=body.protocol, username=body.username,
                             encrypted_password=encrypted, use_ssl=body.use_ssl)
        db.add(cfg)
    db.commit()
    db.refresh(cfg)
    return MailConfigResponse(host=cfg.host, port=cfg.port, protocol=cfg.protocol,
                               username=cfg.username, use_ssl=cfg.use_ssl)


@router.delete("/auth/mail-config", status_code=204)
def delete_mail_config(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    cfg = db.query(UserMailConfig).filter(UserMailConfig.user_email == current_user.email).first()
    if cfg:
        db.delete(cfg)
        db.commit()


@router.post("/auth/mail-config/test")
def test_mail_config(body: MailConfigRequest):
    """연결 테스트 — 실제로 로그인만 시도하고 바로 quit합니다."""
    import poplib
    try:
        if body.use_ssl:
            server = poplib.POP3_SSL(body.host, body.port)
        else:
            server = poplib.POP3(body.host, body.port)
        server.user(body.username)
        server.pass_(body.password)
        count = len(server.list()[1])
        server.quit()
        return {"ok": True, "message": f"연결 성공. 메일함에 {count}개의 메일이 있습니다."}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"연결 실패: {str(e)}")
