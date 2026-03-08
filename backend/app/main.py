# ============================================================
# APEX AI TRADING PLATFORM — FastAPI Backend
# ============================================================
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer
import asyncio, json, logging
from contextlib import asynccontextmanager

from app.api import auth, trades, wallet, analysis, ws
from app.services.market_data import MarketDataService
from app.services.connection_manager import ConnectionManager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

manager = ConnectionManager()
market_service = MarketDataService()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting APEX AI Trading Platform...")
    asyncio.create_task(market_service.start_streaming(manager))
    yield
    # Shutdown
    logger.info("Shutting down...")
    await market_service.stop()

app = FastAPI(
    title="APEX AI Trading Platform",
    version="3.2.0",
    description="Institutional-grade AI trading platform",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"]  # CORS fix,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth.router,     prefix="/api/auth",     tags=["Auth"])
app.include_router(trades.router,   prefix="/api/trades",   tags=["Trades"])
app.include_router(wallet.router,   prefix="/api/wallet",   tags=["Wallet"])
app.include_router(analysis.router, prefix="/api/analysis", tags=["AI Analysis"])
app.include_router(ws.router,       prefix="/ws",           tags=["WebSocket"])

@app.get("/health")
async def health():
    return {"status": "ok", "version": "3.2.0"}
