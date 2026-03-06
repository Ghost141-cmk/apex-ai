# ============================================================
# AUTH API — JWT + bcrypt + Email Verification + 2FA
# ============================================================
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, EmailStr
from datetime import datetime, timedelta
from typing import Optional
import bcrypt, jwt, pyotp, secrets, logging
from app.services.database import get_db
from app.services.email_service import send_verification_email
from app.models.db import User, Wallet, TradingAccount, PerformanceStat
from app.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

# ── Pydantic schemas ───────────────────────────────────────
class RegisterRequest(BaseModel):
    name: str
    email: EmailStr
    password: str

class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    totp_code: Optional[str] = None

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: dict

class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str

# ── Helpers ────────────────────────────────────────────────
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(12)).decode()

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())

def create_token(data: dict, expires_delta: timedelta) -> str:
    payload = {**data, "exp": datetime.utcnow() + expires_delta}
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)

def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db)
) -> User:
    payload = decode_token(token)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    user = await db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    return user

# ── Routes ─────────────────────────────────────────────────
@router.post("/register", status_code=201)
async def register(
    body: RegisterRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db)
):
    # Check duplicate email
    from sqlalchemy import select
    result = await db.execute(select(User).where(User.email == body.email))
    if result.scalar_one_or_none():
        raise HTTPException(400, "Email already registered")

    # Validate password strength
    if len(body.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")

    # Create user
    user = User(
        name=body.name,
        email=body.email,
        password_hash=hash_password(body.password),
    )
    db.add(user)
    await db.flush()

    # Create linked records
    db.add(Wallet(user_id=user.id))
    db.add(TradingAccount(user_id=user.id))
    db.add(PerformanceStat(user_id=user.id))
    await db.commit()

    # Send verification email (background)
    verification_token = create_token({"sub": user.id, "type": "verify"}, timedelta(hours=24))
    background_tasks.add_task(send_verification_email, user.email, user.name, verification_token)

    logger.info(f"New user registered: {user.email}")
    return {"message": "Registration successful. Check your email to verify your account."}


@router.post("/login", response_model=TokenResponse)
async def login(
    body: LoginRequest,
    db: AsyncSession = Depends(get_db)
):
    from sqlalchemy import select
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Invalid email or password")

    if not user.is_verified:
        raise HTTPException(403, "Please verify your email before logging in")

    # 2FA check
    if user.totp_secret:
        if not body.totp_code:
            raise HTTPException(403, "2FA code required")
        totp = pyotp.TOTP(user.totp_secret)
        if not totp.verify(body.totp_code):
            raise HTTPException(403, "Invalid 2FA code")

    access_token  = create_token({"sub": user.id, "email": user.email}, timedelta(hours=1))
    refresh_token = create_token({"sub": user.id, "type": "refresh"},   timedelta(days=30))

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user={"id": user.id, "name": user.name, "email": user.email, "role": user.role}
    )


@router.get("/verify-email")
async def verify_email(token: str, db: AsyncSession = Depends(get_db)):
    payload = decode_token(token)
    if payload.get("type") != "verify":
        raise HTTPException(400, "Invalid token type")
    user = await db.get(User, payload["sub"])
    if not user:
        raise HTTPException(404, "User not found")
    user.is_verified = True
    await db.commit()
    return {"message": "Email verified successfully. You can now log in."}


@router.post("/setup-2fa")
async def setup_2fa(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    secret = pyotp.random_base32()
    totp   = pyotp.TOTP(secret)
    uri    = totp.provisioning_uri(current_user.email, issuer_name="APEX AI Trading")
    # Store secret temporarily — user must confirm before saving
    return {"secret": secret, "qr_uri": uri}


@router.post("/confirm-2fa")
async def confirm_2fa(
    secret: str, code: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    totp = pyotp.TOTP(secret)
    if not totp.verify(code):
        raise HTTPException(400, "Invalid code. Please try again.")
    current_user.totp_secret = secret
    await db.commit()
    return {"message": "2FA enabled successfully"}


@router.post("/refresh")
async def refresh_token(refresh_token: str, db: AsyncSession = Depends(get_db)):
    payload = decode_token(refresh_token)
    if payload.get("type") != "refresh":
        raise HTTPException(400, "Invalid refresh token")
    user = await db.get(User, payload["sub"])
    if not user:
        raise HTTPException(404, "User not found")
    access_token = create_token({"sub": user.id, "email": user.email}, timedelta(hours=1))
    return {"access_token": access_token}


@router.post("/change-password")
async def change_password(
    body: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if not verify_password(body.old_password, current_user.password_hash):
        raise HTTPException(400, "Current password is incorrect")
    current_user.password_hash = hash_password(body.new_password)
    await db.commit()
    return {"message": "Password changed successfully"}


@router.get("/me")
async def get_me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "name": current_user.name,
        "email": current_user.email,
        "role": current_user.role,
        "is_verified": current_user.is_verified,
        "kyc_status": current_user.kyc_status,
    }
