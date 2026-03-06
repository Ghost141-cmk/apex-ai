# ============================================================
# MT5 TRADE EXECUTION BRIDGE
# ============================================================
"""
Connects to MetaTrader 5 via the official Python API.
Install: pip install MetaTrader5

Handles:
  - Open / close / modify trades
  - Account info
  - Position monitoring
  - Magic number management
"""

import logging, asyncio
from typing import Optional, Tuple
from datetime import datetime
from dataclasses import dataclass

logger = logging.getLogger(__name__)

try:
    import MetaTrader5 as mt5
    HAS_MT5 = True
except ImportError:
    HAS_MT5 = False
    logger.warning("MetaTrader5 not installed — trade execution in SIMULATION mode")


@dataclass
class TradeRequest:
    symbol:     str
    direction:  str          # "BUY" or "SELL"
    lot_size:   float
    entry:      float
    stop_loss:  float
    take_profit: float
    comment:    str = "APEX_AI"
    magic:      int = 20250101


@dataclass
class TradeResult:
    success:    bool
    ticket:     Optional[int]
    open_price: Optional[float]
    error:      Optional[str]


class MT5Bridge:
    """
    Production MT5 bridge. Requires MetaTrader5 installed
    and a running MT5 terminal on the same machine OR
    a VPS with MT5 + Python.
    """

    MAGIC_NUMBER = 20250101

    def __init__(self):
        self.connected = False
        self._simulated_tickets = 1000

    # ── Connection ─────────────────────────────────────────
    def connect(self, login: int, password: str, server: str) -> bool:
        if not HAS_MT5:
            logger.info("MT5 simulation mode active")
            self.connected = True
            return True

        if not mt5.initialize():
            logger.error(f"MT5 initialize() failed: {mt5.last_error()}")
            return False

        authorized = mt5.login(login, password=password, server=server)
        if not authorized:
            logger.error(f"MT5 login failed: {mt5.last_error()}")
            mt5.shutdown()
            return False

        info = mt5.account_info()
        logger.info(f"MT5 connected — {info.name} | Balance: {info.balance} {info.currency}")
        self.connected = True
        return True

    def disconnect(self):
        if HAS_MT5 and self.connected:
            mt5.shutdown()
        self.connected = False

    # ── Account Info ───────────────────────────────────────
    def get_account_info(self) -> dict:
        if not HAS_MT5 or not self.connected:
            return {"balance": 10000.0, "equity": 10200.0, "margin_free": 9800.0, "leverage": 100, "currency": "USD", "mode": "simulation"}

        info = mt5.account_info()
        return {
            "balance":     info.balance,
            "equity":      info.equity,
            "margin":      info.margin,
            "margin_free": info.margin_free,
            "profit":      info.profit,
            "leverage":    info.leverage,
            "currency":    info.currency,
        }

    # ── Symbol Normalization ────────────────────────────────
    def _mt5_symbol(self, symbol: str) -> str:
        """Convert display symbol to MT5 format."""
        mapping = {
            "EUR/USD": "EURUSD", "GBP/USD": "GBPUSD",
            "USD/JPY": "USDJPY", "AUD/USD": "AUDUSD",
            "BTC/USD": "BTCUSD", "ETH/USD": "ETHUSD",
            "Volatility 75": "Volatility 75 Index",
            "Crash 500":     "Crash 500 Index",
            "Boom 1000":     "Boom 1000 Index",
        }
        return mapping.get(symbol, symbol.replace("/", ""))

    # ── Place Trade ────────────────────────────────────────
    async def place_trade(self, req: TradeRequest) -> TradeResult:
        if not HAS_MT5 or not self.connected:
            return self._simulate_trade(req)

        sym = self._mt5_symbol(req.symbol)

        # Ensure symbol is in Market Watch
        if not mt5.symbol_select(sym, True):
            return TradeResult(False, None, None, f"Symbol {sym} not found")

        # Get current price
        tick = mt5.symbol_info_tick(sym)
        if tick is None:
            return TradeResult(False, None, None, "Failed to get tick data")

        order_type = mt5.ORDER_TYPE_BUY  if req.direction == "BUY" else mt5.ORDER_TYPE_SELL
        price      = tick.ask             if req.direction == "BUY" else tick.bid

        request = {
            "action":        mt5.TRADE_ACTION_DEAL,
            "symbol":        sym,
            "volume":        req.lot_size,
            "type":          order_type,
            "price":         price,
            "sl":            req.stop_loss,
            "tp":            req.take_profit,
            "deviation":     20,
            "magic":         req.magic,
            "comment":       req.comment,
            "type_time":     mt5.ORDER_TIME_GTC,
            "type_filling":  mt5.ORDER_FILLING_IOC,
        }

        result = mt5.order_send(request)

        if result.retcode != mt5.TRADE_RETCODE_DONE:
            err = f"MT5 error {result.retcode}: {result.comment}"
            logger.error(err)
            return TradeResult(False, None, None, err)

        logger.info(f"Trade placed: ticket={result.order} {req.direction} {req.symbol} @ {result.price}")
        return TradeResult(True, result.order, result.price, None)

    # ── Close Trade ────────────────────────────────────────
    async def close_trade(self, ticket: int, symbol: str, direction: str, lot_size: float) -> TradeResult:
        if not HAS_MT5 or not self.connected:
            return TradeResult(True, ticket, None, None)

        sym        = self._mt5_symbol(symbol)
        tick       = mt5.symbol_info_tick(sym)
        close_type = mt5.ORDER_TYPE_SELL if direction == "BUY" else mt5.ORDER_TYPE_BUY
        price      = tick.bid             if direction == "BUY" else tick.ask

        request = {
            "action":    mt5.TRADE_ACTION_DEAL,
            "symbol":    sym,
            "volume":    lot_size,
            "type":      close_type,
            "position":  ticket,
            "price":     price,
            "deviation": 20,
            "magic":     self.MAGIC_NUMBER,
            "comment":   "APEX_AI_CLOSE",
        }
        result = mt5.order_send(request)
        if result.retcode != mt5.TRADE_RETCODE_DONE:
            return TradeResult(False, None, None, f"Close error: {result.comment}")
        return TradeResult(True, ticket, price, None)

    # ── Modify SL/TP ───────────────────────────────────────
    async def modify_trade(self, ticket: int, symbol: str, new_sl: float, new_tp: float) -> bool:
        if not HAS_MT5 or not self.connected:
            return True
        request = {
            "action":   mt5.TRADE_ACTION_SLTP,
            "position": ticket,
            "symbol":   self._mt5_symbol(symbol),
            "sl":       new_sl,
            "tp":       new_tp,
        }
        result = mt5.order_send(request)
        return result.retcode == mt5.TRADE_RETCODE_DONE

    # ── Get Open Positions ─────────────────────────────────
    def get_positions(self) -> list:
        if not HAS_MT5 or not self.connected:
            return []
        positions = mt5.positions_get()
        if positions is None:
            return []
        return [
            {
                "ticket":     p.ticket,
                "symbol":     p.symbol,
                "type":       "BUY" if p.type == 0 else "SELL",
                "volume":     p.volume,
                "open_price": p.price_open,
                "current":    p.price_current,
                "sl":         p.sl,
                "tp":         p.tp,
                "profit":     p.profit,
                "pips":       abs(p.price_current - p.price_open) * 10000,
                "time":       datetime.utcfromtimestamp(p.time).isoformat(),
            }
            for p in positions if p.magic == self.MAGIC_NUMBER
        ]

    # ── Simulation Mode ────────────────────────────────────
    def _simulate_trade(self, req: TradeRequest) -> TradeResult:
        self._simulated_tickets += 1
        logger.info(f"[SIMULATION] {req.direction} {req.lot_size} {req.symbol} @ {req.entry}")
        return TradeResult(
            success=True,
            ticket=self._simulated_tickets,
            open_price=req.entry,
            error=None
        )

    # ── Trailing Stop ──────────────────────────────────────
    async def apply_trailing_stop(self, ticket: int, symbol: str, direction: str, trail_pips: float = 20):
        if not HAS_MT5 or not self.connected:
            return
        positions = mt5.positions_get(ticket=ticket)
        if not positions:
            return
        p         = positions[0]
        pip       = 0.0001
        current   = p.price_current
        new_sl    = (current - trail_pips * pip) if direction == "BUY" else (current + trail_pips * pip)

        if direction == "BUY"  and new_sl > p.sl:
            await self.modify_trade(ticket, symbol, new_sl, p.tp)
        elif direction == "SELL" and new_sl < p.sl:
            await self.modify_trade(ticket, symbol, new_sl, p.tp)


# ── Singleton ─────────────────────────────────────────────
_mt5_bridge: Optional[MT5Bridge] = None

def get_mt5_bridge() -> MT5Bridge:
    global _mt5_bridge
    if _mt5_bridge is None:
        _mt5_bridge = MT5Bridge()
    return _mt5_bridge
