import numpy as np

def convert_numpy(obj):
    if isinstance(obj, dict):
        return {k: convert_numpy(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [convert_numpy(i) for i in obj]
    elif isinstance(obj, (np.bool_, np.bool8)):
        return bool(obj)
    elif isinstance(obj, (np.integer,)):
        return int(obj)
    elif isinstance(obj, (np.floating,)):
        return float(obj)
    elif isinstance(obj, np.ndarray):
        return obj.tolist()
    return obj

# ============================================================
# AI ANALYSIS API
# ============================================================
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional

from app.services.database import get_db
from app.api.auth import get_current_user
from app.models.db import User, AIAnalysisLog, TradingAccount, TradingMode
from app.ml.ai_engine import get_ai_engine
from app.services.market_data import MarketDataService

router = APIRouter()
_market = MarketDataService()

class AnalysisRequest(BaseModel):
    symbol:          str
    mode:            Optional[str] = "intraday"
    timeframe:       Optional[str] = "1h"
    account_balance: Optional[float] = 10000.0
    risk_percent:    Optional[float] = 2.0

@router.post("/run")
async def run_analysis(
    body: AnalysisRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    tf_map = {"scalp": "5m", "intraday": "1h", "swing": "4h", "positional": "1d"}
    tf     = body.timeframe or tf_map.get(body.mode, "1h")

    # Get market data
    df = _market.get_candles(body.symbol, tf, 200)
    if df is None or len(df) < 50:
        raise HTTPException(400, f"Insufficient data for {body.symbol}")

    # Run AI engine
    engine   = get_ai_engine()
    analysis = await engine.analyze(
        df=df,
        symbol=body.symbol,
        mode=body.mode,
        account_balance=body.account_balance,
        risk_percent=body.risk_percent,
    )

    # Log to DB
    log = AIAnalysisLog(
        symbol=body.symbol,
        trading_mode=TradingMode(body.mode) if body.mode in TradingMode._value2member_map_ else TradingMode.INTRADAY,
        timeframe=tf,
        technical_score=analysis["technical_score"],
        fundamental_score=analysis["fundamental_score"],
        sentiment_score=analysis["sentiment_score"],
        smc_score=analysis["smc_score"],
        final_confidence=analysis["confidence"],
        signal=analysis["signal"],
        entry_price=analysis["entry"],
        stop_loss=analysis["stop_loss"],
        take_profit=analysis["take_profit"],
        risk_reward=analysis["risk_reward"],
        reasoning=analysis["reasoning"],
        indicators_snapshot=analysis["indicators"],
    )
    db.add(log)
    await db.commit()

    return {**analysis, "analysis_id": log.id}

@router.get("/history")
async def get_analysis_history(
    limit: int = 20,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    from sqlalchemy import desc
    result = await db.execute(
        select(AIAnalysisLog).order_by(desc(AIAnalysisLog.created_at)).limit(limit)
    )
    logs = result.scalars().all()
    return [
        {
            "id": l.id, "symbol": l.symbol, "mode": l.trading_mode,
            "signal": l.signal, "confidence": l.final_confidence,
            "entry": l.entry_price, "sl": l.stop_loss, "tp": l.take_profit,
            "rr": l.risk_reward, "executed": l.executed,
            "timestamp": l.created_at.isoformat() if l.created_at else None,
        }
        for l in logs
    ]


# ============================================================
# WALLET API
# ============================================================
from fastapi import APIRouter as WalletRouter, Request
from app.models.db import Wallet, Transaction, TxType, TxStatus
from app.services.airtel_money import get_airtel_service
from datetime import datetime

wallet_router = WalletRouter()

class DepositRequest(BaseModel):
    phone:    str
    amount:   float
    currency: Optional[str] = "UGX"

class WithdrawRequest(BaseModel):
    phone:    str
    amount:   float
    currency: Optional[str] = "UGX"

@wallet_router.get("/balance")
async def get_balance(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Wallet).where(Wallet.user_id == current_user.id))
    wallet = result.scalar_one_or_none()
    if not wallet:
        raise HTTPException(404, "Wallet not found")
    return {
        "balance":         wallet.balance,
        "total_deposited": wallet.total_deposited,
        "total_withdrawn": wallet.total_withdrawn,
        "currency":        wallet.currency,
    }

@wallet_router.post("/deposit")
async def deposit(
    body: DepositRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if body.amount <= 0:
        raise HTTPException(400, "Amount must be positive")

    airtel  = get_airtel_service()
    ref     = f"APEX-DEP-{current_user.id[:8].upper()}"
    result  = await airtel.initiate_deposit(body.phone, body.amount, ref, current_user.id, body.currency)

    # Create pending transaction
    wallet_res = await db.execute(select(Wallet).where(Wallet.user_id == current_user.id))
    wallet     = wallet_res.scalar_one_or_none()

    tx = Transaction(
        user_id=current_user.id,
        wallet_id=wallet.id if wallet else None,
        type=TxType.DEPOSIT,
        amount=body.amount,
        status=TxStatus.PENDING if result["success"] else TxStatus.FAILED,
        airtel_reference=result.get("airtel_ref"),
        phone_number=body.phone,
        metadata_json={"currency": body.currency, "tx_id": result.get("tx_id")},
    )
    db.add(tx)
    await db.commit()

    return {
        "success":  result["success"],
        "tx_id":    result["tx_id"],
        "message":  result["message"],
        "status":   result["status"],
        "ref":      ref,
    }

@wallet_router.post("/withdraw")
async def withdraw(
    body: WithdrawRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    wallet_res = await db.execute(select(Wallet).where(Wallet.user_id == current_user.id))
    wallet     = wallet_res.scalar_one_or_none()
    if not wallet or wallet.balance < body.amount:
        raise HTTPException(400, "Insufficient balance")

    airtel = get_airtel_service()
    ref    = f"APEX-WD-{current_user.id[:8].upper()}"
    result = await airtel.initiate_withdrawal(body.phone, body.amount, ref, body.currency)

    if result["success"]:
        wallet.balance        -= body.amount
        wallet.total_withdrawn += body.amount

    tx = Transaction(
        user_id=current_user.id,
        wallet_id=wallet.id,
        type=TxType.WITHDRAW,
        amount=body.amount,
        status=TxStatus.COMPLETED if result["success"] else TxStatus.FAILED,
        airtel_reference=result.get("airtel_ref"),
        phone_number=body.phone,
        completed_at=datetime.utcnow() if result["success"] else None,
    )
    db.add(tx)
    await db.commit()
    return convert_numpy(result)

@wallet_router.post("/airtel-webhook")
async def airtel_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """Airtel calls this URL when deposit is confirmed by user."""
    body      = await request.body()
    signature = request.headers.get("X-Airtel-Signature", "")
    airtel    = get_airtel_service()

    if not airtel.verify_webhook(body, signature):
        raise HTTPException(401, "Invalid webhook signature")

    data     = await request.json()
    parsed   = airtel.parse_webhook(data)
    airtel_ref = parsed["airtel_ref"]

    # Find pending transaction
    result = await db.execute(
        select(Transaction).where(Transaction.airtel_reference == airtel_ref)
    )
    tx = result.scalar_one_or_none()
    if not tx:
        return {"status": "ok", "message": "Transaction not found"}

    if parsed["status"] == "completed" and tx.status == TxStatus.PENDING:
        tx.status       = TxStatus.COMPLETED
        tx.completed_at = datetime.utcnow()

        # Credit wallet
        wallet_res = await db.execute(select(Wallet).where(Wallet.wallet_id == tx.wallet_id))
        wallet     = wallet_res.scalar_one_or_none()
        if wallet:
            wallet.balance          += tx.amount
            wallet.total_deposited  += tx.amount
    else:
        tx.status = TxStatus.FAILED

    await db.commit()
    return {"status": "ok"}

@wallet_router.get("/transactions")
async def get_transactions(
    limit: int = 30,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    from sqlalchemy import desc
    result = await db.execute(
        select(Transaction)
        .where(Transaction.user_id == current_user.id)
        .order_by(desc(Transaction.created_at))
        .limit(limit)
    )
    txs = result.scalars().all()
    return [
        {
            "id":         t.id,
            "type":       t.type,
            "amount":     t.amount,
            "status":     t.status,
            "airtel_ref": t.airtel_reference,
            "phone":      t.phone_number,
            "date":       t.created_at.isoformat() if t.created_at else None,
        }
        for t in txs
    ]


# ============================================================
# WEBSOCKET ROUTER
# ============================================================
from fastapi import WebSocket, WebSocketDisconnect
from app.services.connection_manager import ConnectionManager

ws_router = APIRouter()
_ws_manager = ConnectionManager()

@ws_router.websocket("/market")
async def websocket_market(websocket: WebSocket):
    await _ws_manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            # Handle client messages (subscribe to symbol, etc.)
            import json as _json
            msg = _json.loads(data)
            if msg.get("action") == "subscribe":
                await websocket.send_text(_json.dumps({
                    "type":    "subscribed",
                    "symbol":  msg.get("symbol"),
                    "message": f"Subscribed to {msg.get('symbol')} feed"
                }))
    except WebSocketDisconnect:
        _ws_manager.disconnect(websocket)
