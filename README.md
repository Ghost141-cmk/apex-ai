# ⚡ APEX AI Trading Platform — Production Architecture

## Stack Overview

```
┌─────────────────────────────────────────────────────────────┐
│  FRONTEND (Next.js + React)                                 │
│  ├── Lightweight Charts (professional candlesticks)         │
│  ├── WebSocket client (real-time ticks)                     │
│  └── API client (JWT auth, all endpoints)                   │
├─────────────────────────────────────────────────────────────┤
│  BACKEND (FastAPI + Python)                                 │
│  ├── Auth:      JWT + bcrypt + 2FA (TOTP) + Email verify   │
│  ├── AI Engine: LSTM + Technical + SMC/ICT + Fundamental   │
│  ├── Execution: MT5 Python bridge (real or simulation)      │
│  ├── Payments:  Airtel Money API v2 (UG/Africa)            │
│  └── WebSocket: Real-time tick broadcasting                 │
├─────────────────────────────────────────────────────────────┤
│  DATA LAYER                                                 │
│  ├── PostgreSQL (users, trades, wallet, AI logs, perf)     │
│  ├── Redis (sessions, pub/sub, rate limiting)               │
│  └── Candle cache (in-memory OHLCV, 500 bars/symbol/TF)   │
├─────────────────────────────────────────────────────────────┤
│  MARKET DATA                                                │
│  ├── Binance WebSocket → Crypto ticks                      │
│  ├── Deriv WebSocket   → Forex + Synthetic Indices         │
│  └── TwelveData REST   → Historical OHLCV fallback         │
└─────────────────────────────────────────────────────────────┘
```

---

## Quick Start

### 1. Clone and configure
```bash
git clone https://github.com/yourname/apex-ai.git
cd apex-ai
cp .env.example .env
# Edit .env with your real API keys
```

### 2. Launch with Docker Compose
```bash
docker-compose up -d
```
This starts: PostgreSQL, Redis, FastAPI backend, Next.js frontend, Nginx.

### 3. Or run locally (development)

**Backend:**
```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
alembic upgrade head             # Run DB migrations
uvicorn app.main:app --reload --port 8000
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev                      # http://localhost:3000
```

---

## AI Analysis Engine

### Pipeline (per trade signal)
```
OHLCV Data (200 bars)
    │
    ▼
TechnicalEngine          ← RSI, MACD, BB, ATR, Stochastic, EMAs
    │
SMCEngine                ← Order Blocks, FVGs, BOS, CHOCH, OTE Zone
    │
LSTMPredictor            ← 60-bar sequence → [P(BUY), P(SELL), P(HOLD)]
    │
FundamentalScorer        ← CPI, NFP, FOMC, Rate decisions
    │
Weighted Combination:
  Technical   35%
  SMC/ICT     25%
  LSTM ML     20%
  Fundamental 10%
  Sentiment   10%
    │
    ▼
Final Confidence Score + Trade Signal + Entry/SL/TP
```

### Train the LSTM model
```python
# train_model.py
from app.ml.ai_engine import LSTMPredictor
import numpy as np

predictor = LSTMPredictor()

# Load your historical labeled data
# X shape: (n_samples, 60, 8) — sequences
# y shape: (n_samples, 3)     — one-hot [BUY, SELL, HOLD]
X = np.load("data/X_train.npy")
y = np.load("data/y_train.npy")

predictor.train(X, y, epochs=100)
# Model saved to: models/lstm_apex_v3.keras
```

---

## MT5 Integration

### Requirements
- MetaTrader 5 terminal installed (Windows or VPS)
- `pip install MetaTrader5`
- Broker account with API access

### Connect via API
```python
from app.services.mt5_bridge import get_mt5_bridge

bridge = get_mt5_bridge()
bridge.connect(
    login=12345678,
    password="your_mt5_password",
    server="BrokerName-Live"
)
```

### User-facing: Store encrypted credentials
MT5 credentials are stored per-user in `trading_accounts` table,
encrypted with AES-256 using the app's master key.

---

## Airtel Money

### Deposit flow
```
User enters phone + amount
    │
POST /api/wallet/deposit
    │
AirtelMoneyService.initiate_deposit()
    │
Airtel sends USSD push to user's phone
    │
User confirms on phone → Airtel calls our webhook
    │
POST /api/wallet/airtel-webhook
    │
Wallet balance credited ✅
```

### Supported countries
Uganda (UG/UGX) — default. Change `X-Country` and `X-Currency`
headers in `airtel_money.py` for other African markets.

---

## Database Schema

| Table              | Key Fields                                          |
|--------------------|-----------------------------------------------------|
| users              | id, email, password_hash, totp_secret, kyc_status  |
| wallets            | user_id, balance, total_deposited, total_withdrawn  |
| transactions       | type, amount, airtel_reference, status              |
| trading_accounts   | broker_api_key_enc, mt5_login, auto_trade_enabled   |
| trades             | symbol, direction, entry, sl, tp, pnl, confidence  |
| ai_analysis_logs   | scores, signal, reasoning, indicators_snapshot      |
| performance_stats  | win_rate, drawdown, sharpe_ratio, monthly_return    |

---

## API Endpoints

| Method | Path                         | Description                    |
|--------|------------------------------|--------------------------------|
| POST   | /api/auth/register           | Register new user              |
| POST   | /api/auth/login              | Login → JWT tokens             |
| GET    | /api/auth/verify-email       | Verify email token             |
| POST   | /api/auth/setup-2fa          | Generate TOTP secret + QR      |
| POST   | /api/analysis/run            | Run full AI analysis           |
| GET    | /api/analysis/history        | Past AI analysis logs          |
| GET    | /api/trades/                 | Get trade history              |
| POST   | /api/trades/place            | Place trade via MT5            |
| POST   | /api/trades/close            | Close open trade               |
| POST   | /api/trades/copyable-setup   | Get copy-paste trade params    |
| GET    | /api/trades/performance      | Win rate, PnL, Sharpe ratio    |
| GET    | /api/wallet/balance          | Get wallet balance             |
| POST   | /api/wallet/deposit          | Airtel Money deposit           |
| POST   | /api/wallet/withdraw         | Airtel Money withdrawal        |
| POST   | /api/wallet/airtel-webhook   | Airtel payment confirmation    |
| WS     | /ws/market                   | Real-time tick stream          |

---

## Production Deployment (AWS / DigitalOcean)

```bash
# 1. Provision Ubuntu 22.04 server (min 4GB RAM for ML)
# 2. Install Docker + Docker Compose
curl -fsSL https://get.docker.com | sh

# 3. Set environment variables
cp .env.example .env
nano .env   # fill in all values

# 4. Deploy
docker-compose -f docker-compose.yml up -d

# 5. SSL with Let's Encrypt
certbot --nginx -d yourdomain.com

# 6. Set up cron for model retraining (weekly)
0 2 * * 0 cd /app && python scripts/retrain_model.py
```

---

## Security Checklist

- [x] Passwords: bcrypt with 12 rounds
- [x] Sessions: JWT (1hr access + 30d refresh)
- [x] 2FA: TOTP (Google Authenticator compatible)
- [x] Email: verification required before login
- [x] API keys: AES-256 encrypted at rest
- [x] Webhooks: HMAC-SHA256 signature verification
- [x] SQL: SQLAlchemy ORM (no raw queries)
- [x] CORS: configured per environment
- [ ] Rate limiting: add slowapi middleware
- [ ] KYC: integrate Smile Identity or Jumio

---

## Monetization

| Plan     | Price      | Features                                      |
|----------|------------|-----------------------------------------------|
| Free     | $0/mo      | Demo only, paper trading, 3 AI signals/day    |
| Pro      | $29/mo     | Live data, unlimited signals, manual trading  |
| Elite    | $99/mo     | Auto-trading, priority execution, full AI     |
| Signals  | Per signal | AI signal marketplace (coming soon)           |
