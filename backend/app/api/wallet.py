# ============================================================
# WALLET ROUTER (app/api/wallet.py)
# ============================================================
from fastapi import APIRouter
from app.api.analysis import wallet_router, WithdrawRequest, DepositRequest

router = wallet_router   # re-export

# ============================================================
# WEBSOCKET ROUTER (app/api/ws.py)
# ============================================================
# app/api/ws.py — re-export ws_router
