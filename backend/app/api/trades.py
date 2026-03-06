# ============================================================
# TRADES API
# ============================================================
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import logging

from app.services.database import get_db
from app.api.auth import get_current_user
from app.models.db import User, Trade, TradingAccount, PerformanceStat, TradeStatus, TradingMode
from app.services.mt5_bridge import get_mt5_bridge, TradeRequest
from app.ml.ai_engine import get_ai_engine
from app.services.market_data import MarketDataService

logger = logging.getLogger(__name__)
router = APIRouter()

class ManualTradeRequest(BaseModel):
    symbol:      str
    direction:   str
    lot_size:    float
    entry:       float
    stop_loss:   float
    take_profit: float
    mode:        Optional[str] = "intraday"

class CloseTradeRequest(BaseModel):
    trade_id: str

class CopyableSetup(BaseModel):
    symbol:          str
    account_balance: float
    lot_size:        Optional[float] = None
    risk_percent:    Optional[float] = 2.0

# ── Get all trades ─────────────────────────────────────────
@router.get("/")
async def get_trades(
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Trade)
        .where(Trade.user_id == current_user.id)
        .order_by(desc(Trade.opened_at))
        .limit(limit)
    )
    trades = result.scalars().all()
    return [
        {
            "id":              t.id,
            "symbol":          t.symbol,
            "direction":       t.direction,
            "entry_price":     t.entry_price,
            "stop_loss":       t.stop_loss,
            "take_profit":     t.take_profit,
            "lot_size":        t.lot_size,
            "confidence_score": t.confidence_score,
            "risk_reward":     t.risk_reward,
            "status":          t.status,
            "pnl":             t.pnl,
            "pips":            t.pips,
            "mt5_ticket":      t.mt5_ticket,
            "opened_at":       t.opened_at.isoformat() if t.opened_at else None,
            "closed_at":       t.closed_at.isoformat() if t.closed_at else None,
        }
        for t in trades
    ]

# ── Get open positions ─────────────────────────────────────
@router.get("/positions")
async def get_positions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    bridge = get_mt5_bridge()
    mt5_positions = bridge.get_positions()

    db_result = await db.execute(
        select(Trade)
        .where(Trade.user_id == current_user.id, Trade.status == TradeStatus.OPEN)
    )
    db_trades = db_result.scalars().all()

    return {
        "mt5_positions": mt5_positions,
        "db_trades": [{"id": t.id, "symbol": t.symbol, "direction": t.direction, "pnl": t.pnl} for t in db_trades]
    }

# ── Place manual trade ─────────────────────────────────────
@router.post("/place")
async def place_trade(
    body: ManualTradeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Get trading account
    acct_res = await db.execute(select(TradingAccount).where(TradingAccount.user_id == current_user.id))
    account  = acct_res.scalar_one_or_none()
    if not account:
        raise HTTPException(400, "No trading account linked")

    # Execute via MT5
    bridge = get_mt5_bridge()
    req    = TradeRequest(
        symbol=body.symbol, direction=body.direction, lot_size=body.lot_size,
        entry=body.entry, stop_loss=body.stop_loss, take_profit=body.take_profit
    )
    result = await bridge.place_trade(req)

    if not result.success:
        raise HTTPException(400, result.error)

    # Save to DB
    trade = Trade(
        user_id=current_user.id,
        symbol=body.symbol,
        direction=body.direction,
        trading_mode=TradingMode(body.mode),
        entry_price=result.open_price or body.entry,
        stop_loss=body.stop_loss,
        take_profit=body.take_profit,
        lot_size=body.lot_size,
        status=TradeStatus.OPEN,
        mt5_ticket=str(result.ticket) if result.ticket else None,
    )
    db.add(trade)
    await db.commit()
    return {"success": True, "trade_id": trade.id, "ticket": result.ticket, "entry": result.open_price}

# ── Close trade ────────────────────────────────────────────
@router.post("/close")
async def close_trade(
    body: CloseTradeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    trade = await db.get(Trade, body.trade_id)
    if not trade or trade.user_id != current_user.id:
        raise HTTPException(404, "Trade not found")
    if trade.status != TradeStatus.OPEN:
        raise HTTPException(400, "Trade is not open")

    bridge = get_mt5_bridge()
    result = await bridge.close_trade(
        int(trade.mt5_ticket or 0), trade.symbol, trade.direction, trade.lot_size
    )
    if not result.success:
        raise HTTPException(400, result.error)

    close_price     = result.open_price or trade.entry_price
    multiplier      = 1 if trade.direction == "BUY" else -1
    pnl             = multiplier * (close_price - trade.entry_price) * trade.lot_size * 100000
    trade.status    = TradeStatus.CLOSED
    trade.close_price = close_price
    trade.closed_at  = datetime.utcnow()
    trade.pnl        = round(pnl, 2)

    # Update performance stats
    perf_res = await db.execute(select(PerformanceStat).where(PerformanceStat.user_id == current_user.id))
    perf     = perf_res.scalar_one_or_none()
    if perf:
        perf.total_trades  += 1
        perf.total_pnl     += trade.pnl
        if trade.pnl > 0: perf.winning_trades += 1
        else:              perf.losing_trades  += 1
        perf.win_rate = (perf.winning_trades / perf.total_trades) * 100 if perf.total_trades > 0 else 0

    await db.commit()
    return {"success": True, "pnl": trade.pnl, "close_price": close_price}

# ── Copyable trade setup ────────────────────────────────────
@router.post("/copyable-setup")
async def get_copyable_setup(
    body: CopyableSetup,
    current_user: User = Depends(get_current_user),
):
    """Returns full trade parameters that user can copy directly into their broker."""
    # Use AI to get current analysis for the symbol
    from app.services.market_data import MarketDataService
    svc    = MarketDataService()
    df     = svc.get_candles(body.symbol, "1h", 200)
    engine = get_ai_engine()

    analysis = await engine.analyze(
        df=df, symbol=body.symbol,
        account_balance=body.account_balance,
        risk_percent=body.risk_percent or 2.0
    )

    lot = body.lot_size or analysis["lot_size"]

    return {
        "symbol":      body.symbol,
        "action":      analysis["signal"],
        "entry":       analysis["entry"],
        "stop_loss":   analysis["stop_loss"],
        "take_profit": analysis["take_profit"],
        "lot_size":    lot,
        "sl_pips":     analysis["sl_pips"],
        "tp_pips":     analysis["tp_pips"],
        "risk_amount": round(body.account_balance * (body.risk_percent or 2.0) / 100, 2),
        "risk_reward": analysis["risk_reward"],
        "confidence":  analysis["confidence"],
        # Copy-paste friendly
        "copy_text":   (
            f"Symbol: {body.symbol}\n"
            f"Action: {analysis['signal']}\n"
            f"Entry:  {analysis['entry']}\n"
            f"SL:     {analysis['stop_loss']}\n"
            f"TP:     {analysis['take_profit']}\n"
            f"Lots:   {lot}\n"
            f"R:R     1:{analysis['risk_reward']}\n"
            f"AI Confidence: {analysis['confidence']}%"
        )
    }

# ── Performance stats ───────────────────────────────────────
@router.get("/performance")
async def get_performance(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(PerformanceStat).where(PerformanceStat.user_id == current_user.id))
    perf   = result.scalar_one_or_none()
    if not perf:
        return {"total_trades": 0, "win_rate": 0, "total_pnl": 0}
    return {
        "total_trades":   perf.total_trades,
        "winning_trades": perf.winning_trades,
        "losing_trades":  perf.losing_trades,
        "win_rate":       round(perf.win_rate, 2),
        "total_pnl":      round(perf.total_pnl, 2),
        "max_drawdown":   round(perf.max_drawdown, 2),
        "sharpe_ratio":   round(perf.sharpe_ratio, 2),
        "monthly_return": round(perf.monthly_return, 2),
    }
