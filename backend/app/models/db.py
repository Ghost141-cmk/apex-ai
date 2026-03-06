# ============================================================
# DATABASE MODELS — SQLAlchemy ORM
# ============================================================
from sqlalchemy import (Column, String, Float, Boolean, Integer,
                        DateTime, ForeignKey, Text, Enum as SAEnum, JSON)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship, DeclarativeBase
from sqlalchemy.sql import func
import uuid, enum

class Base(DeclarativeBase):
    pass

def gen_uuid():
    return str(uuid.uuid4())

# ── Enums ──────────────────────────────────────────────────
class TradeDirection(str, enum.Enum):
    BUY  = "BUY"
    SELL = "SELL"

class TradeStatus(str, enum.Enum):
    PENDING = "PENDING"
    OPEN    = "OPEN"
    CLOSED  = "CLOSED"
    CANCELLED = "CANCELLED"

class TradingMode(str, enum.Enum):
    SCALP      = "scalp"
    INTRADAY   = "intraday"
    SWING      = "swing"
    POSITIONAL = "positional"

class TxType(str, enum.Enum):
    DEPOSIT  = "deposit"
    WITHDRAW = "withdraw"
    PROFIT   = "profit"
    LOSS     = "loss"
    FEE      = "fee"

class TxStatus(str, enum.Enum):
    PENDING   = "pending"
    COMPLETED = "completed"
    FAILED    = "failed"

# ── User ──────────────────────────────────────────────────
class User(Base):
    __tablename__ = "users"

    id              = Column(String, primary_key=True, default=gen_uuid)
    name            = Column(String(120), nullable=False)
    email           = Column(String(255), unique=True, nullable=False, index=True)
    password_hash   = Column(String(255), nullable=False)
    is_verified     = Column(Boolean, default=False)
    is_active       = Column(Boolean, default=True)
    role            = Column(String(20), default="user")   # user | admin
    totp_secret     = Column(String(64), nullable=True)    # 2FA
    kyc_status      = Column(String(20), default="pending")
    created_at      = Column(DateTime(timezone=True), server_default=func.now())
    updated_at      = Column(DateTime(timezone=True), onupdate=func.now())

    wallet          = relationship("Wallet",          back_populates="user", uselist=False)
    trading_account = relationship("TradingAccount",  back_populates="user", uselist=False)
    trades          = relationship("Trade",           back_populates="user")
    transactions    = relationship("Transaction",     back_populates="user")
    performance     = relationship("PerformanceStat", back_populates="user", uselist=False)

# ── Wallet ─────────────────────────────────────────────────
class Wallet(Base):
    __tablename__ = "wallets"

    id             = Column(String, primary_key=True, default=gen_uuid)
    user_id        = Column(String, ForeignKey("users.id"), unique=True)
    balance        = Column(Float, default=0.0)
    total_deposited = Column(Float, default=0.0)
    total_withdrawn = Column(Float, default=0.0)
    currency       = Column(String(10), default="USD")
    updated_at     = Column(DateTime(timezone=True), onupdate=func.now())

    user         = relationship("User", back_populates="wallet")
    transactions = relationship("Transaction", back_populates="wallet")

# ── Transaction ────────────────────────────────────────────
class Transaction(Base):
    __tablename__ = "transactions"

    id               = Column(String, primary_key=True, default=gen_uuid)
    user_id          = Column(String, ForeignKey("users.id"))
    wallet_id        = Column(String, ForeignKey("wallets.id"))
    type             = Column(SAEnum(TxType))
    amount           = Column(Float, nullable=False)
    status           = Column(SAEnum(TxStatus), default=TxStatus.PENDING)
    airtel_reference = Column(String(100), nullable=True)
    phone_number     = Column(String(20), nullable=True)
    metadata_json    = Column(JSON, nullable=True)
    created_at       = Column(DateTime(timezone=True), server_default=func.now())
    completed_at     = Column(DateTime(timezone=True), nullable=True)

    user   = relationship("User",   back_populates="transactions")
    wallet = relationship("Wallet", back_populates="transactions")

# ── Trading Account ────────────────────────────────────────
class TradingAccount(Base):
    __tablename__ = "trading_accounts"

    id                  = Column(String, primary_key=True, default=gen_uuid)
    user_id             = Column(String, ForeignKey("users.id"), unique=True)
    broker_name         = Column(String(100), default="MT5")
    broker_api_key_enc  = Column(Text, nullable=True)     # AES-256 encrypted
    broker_secret_enc   = Column(Text, nullable=True)     # AES-256 encrypted
    mt5_login           = Column(String(50), nullable=True)
    mt5_server          = Column(String(100), nullable=True)
    account_balance     = Column(Float, default=0.0)
    leverage            = Column(Integer, default=100)
    trading_mode        = Column(SAEnum(TradingMode), default=TradingMode.INTRADAY)
    risk_percent        = Column(Float, default=2.0)
    daily_drawdown_limit = Column(Float, default=5.0)
    auto_trade_enabled  = Column(Boolean, default=False)
    confidence_threshold = Column(Float, default=85.0)
    is_emergency_stopped = Column(Boolean, default=False)
    updated_at          = Column(DateTime(timezone=True), onupdate=func.now())

    user = relationship("User", back_populates="trading_account")

# ── Trade ──────────────────────────────────────────────────
class Trade(Base):
    __tablename__ = "trades"

    id               = Column(String, primary_key=True, default=gen_uuid)
    user_id          = Column(String, ForeignKey("users.id"))
    symbol           = Column(String(30), nullable=False, index=True)
    market           = Column(String(20))                  # forex/crypto/stocks/synthetic
    direction        = Column(SAEnum(TradeDirection))
    trading_mode     = Column(SAEnum(TradingMode))
    entry_price      = Column(Float, nullable=False)
    stop_loss        = Column(Float, nullable=False)
    take_profit      = Column(Float, nullable=False)
    lot_size         = Column(Float, nullable=False)
    confidence_score = Column(Float)
    risk_reward      = Column(Float)
    status           = Column(SAEnum(TradeStatus), default=TradeStatus.PENDING)
    close_price      = Column(Float, nullable=True)
    pnl              = Column(Float, nullable=True)
    pips             = Column(Float, nullable=True)
    mt5_ticket       = Column(String(50), nullable=True)
    ai_analysis_id   = Column(String, ForeignKey("ai_analysis_logs.id"), nullable=True)
    opened_at        = Column(DateTime(timezone=True), server_default=func.now())
    closed_at        = Column(DateTime(timezone=True), nullable=True)

    user        = relationship("User",          back_populates="trades")
    ai_analysis = relationship("AIAnalysisLog", back_populates="trades")

# ── AI Analysis Log ────────────────────────────────────────
class AIAnalysisLog(Base):
    __tablename__ = "ai_analysis_logs"

    id                  = Column(String, primary_key=True, default=gen_uuid)
    symbol              = Column(String(30), index=True)
    trading_mode        = Column(SAEnum(TradingMode))
    timeframe           = Column(String(10))
    technical_score     = Column(Float)
    fundamental_score   = Column(Float)
    sentiment_score     = Column(Float)
    smc_score           = Column(Float)
    final_confidence    = Column(Float)
    signal              = Column(String(10))           # BUY / SELL / HOLD
    entry_price         = Column(Float)
    stop_loss           = Column(Float)
    take_profit         = Column(Float)
    risk_reward         = Column(Float)
    reasoning           = Column(Text)
    indicators_snapshot = Column(JSON)                 # RSI, MACD, BB, etc.
    executed            = Column(Boolean, default=False)
    created_at          = Column(DateTime(timezone=True), server_default=func.now())

    trades = relationship("Trade", back_populates="ai_analysis")

# ── Performance Stats ──────────────────────────────────────
class PerformanceStat(Base):
    __tablename__ = "performance_stats"

    id             = Column(String, primary_key=True, default=gen_uuid)
    user_id        = Column(String, ForeignKey("users.id"), unique=True)
    total_trades   = Column(Integer, default=0)
    winning_trades = Column(Integer, default=0)
    losing_trades  = Column(Integer, default=0)
    win_rate       = Column(Float, default=0.0)
    total_pnl      = Column(Float, default=0.0)
    max_drawdown   = Column(Float, default=0.0)
    sharpe_ratio   = Column(Float, default=0.0)
    profit_factor  = Column(Float, default=0.0)
    monthly_return = Column(Float, default=0.0)
    updated_at     = Column(DateTime(timezone=True), onupdate=func.now())

    user = relationship("User", back_populates="performance")
