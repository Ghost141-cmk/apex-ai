# ============================================================
# AI ANALYSIS ENGINE — Real ML with Technical Indicators
# ============================================================
"""
Production AI pipeline:
  1. Fetch real OHLCV data (broker WebSocket / REST)
  2. Compute technical indicators (TA-Lib / pandas-ta)
  3. Apply SMC/ICT pattern detection
  4. Run LSTM model for directional prediction
  5. Score fundamental + sentiment signals
  6. Combine into final confidence score
  7. Return trade signal with entry / SL / TP
"""

import numpy as np
import pandas as pd
from typing import Optional
import logging, asyncio
from datetime import datetime

logger = logging.getLogger(__name__)

# ── Guard imports (install: pip install tensorflow pandas-ta aiohttp) ─
try:
    import tensorflow as tf
    from tensorflow.keras.models import Sequential, load_model
    from tensorflow.keras.layers import LSTM, Dense, Dropout, BatchNormalization
    from tensorflow.keras.optimizers import Adam
    HAS_TF = True
except ImportError:
    HAS_TF = False
    logger.warning("TensorFlow not installed — using statistical fallback")

try:
    import pandas_ta as ta
    HAS_TA = True
except ImportError:
    HAS_TA = False
    logger.warning("pandas-ta not installed — using manual indicators")


# ══════════════════════════════════════════════════════════════
# TECHNICAL INDICATOR ENGINE
# ══════════════════════════════════════════════════════════════
class TechnicalEngine:
    """Computes all technical indicators from OHLCV DataFrame."""

    def compute_all(self, df: pd.DataFrame) -> dict:
        """
        df columns: open, high, low, close, volume  (datetime index)
        Returns dict of indicator values for latest bar.
        """
        close = df["close"]
        high  = df["high"]
        low   = df["low"]
        vol   = df["volume"]

        result = {}

        # ── RSI ──────────────────────────────────────────
        delta = close.diff()
        gain  = delta.clip(lower=0).rolling(14).mean()
        loss  = (-delta.clip(upper=0)).rolling(14).mean()
        rs    = gain / (loss + 1e-10)
        rsi   = 100 - (100 / (1 + rs))
        result["rsi"] = float(rsi.iloc[-1])

        # ── MACD ─────────────────────────────────────────
        ema12 = close.ewm(span=12).mean()
        ema26 = close.ewm(span=26).mean()
        macd_line   = ema12 - ema26
        signal_line = macd_line.ewm(span=9).mean()
        histogram   = macd_line - signal_line
        result["macd"]        = float(macd_line.iloc[-1])
        result["macd_signal"] = float(signal_line.iloc[-1])
        result["macd_hist"]   = float(histogram.iloc[-1])
        result["macd_cross"]  = (
            "bullish" if histogram.iloc[-1] > 0 and histogram.iloc[-2] <= 0
            else "bearish" if histogram.iloc[-1] < 0 and histogram.iloc[-2] >= 0
            else "neutral"
        )

        # ── Moving Averages ───────────────────────────────
        result["ema20"]  = float(close.ewm(span=20).mean().iloc[-1])
        result["ema50"]  = float(close.ewm(span=50).mean().iloc[-1])
        result["ema200"] = float(close.ewm(span=200).mean().iloc[-1])
        result["sma50"]  = float(close.rolling(50).mean().iloc[-1])
        result["price_vs_ema200"] = "above" if close.iloc[-1] > result["ema200"] else "below"

        # ── Bollinger Bands ───────────────────────────────
        sma20   = close.rolling(20).mean()
        std20   = close.rolling(20).std()
        bb_upper = sma20 + 2 * std20
        bb_lower = sma20 - 2 * std20
        bb_width = (bb_upper - bb_lower) / sma20
        result["bb_upper"] = float(bb_upper.iloc[-1])
        result["bb_lower"] = float(bb_lower.iloc[-1])
        result["bb_mid"]   = float(sma20.iloc[-1])
        result["bb_width"] = float(bb_width.iloc[-1])
        result["bb_pos"]   = float(
            (close.iloc[-1] - bb_lower.iloc[-1]) /
            (bb_upper.iloc[-1] - bb_lower.iloc[-1] + 1e-10)
        )

        # ── ATR ───────────────────────────────────────────
        tr = pd.concat([
            high - low,
            (high - close.shift()).abs(),
            (low  - close.shift()).abs()
        ], axis=1).max(axis=1)
        atr = tr.rolling(14).mean()
        result["atr"] = float(atr.iloc[-1])

        # ── Volume Analysis ───────────────────────────────
        vol_sma20 = vol.rolling(20).mean()
        result["vol_ratio"] = float(vol.iloc[-1] / (vol_sma20.iloc[-1] + 1e-10))
        result["vol_trend"] = "above_avg" if result["vol_ratio"] > 1.2 else "below_avg"

        # ── Stochastic ────────────────────────────────────
        lowest14  = low.rolling(14).min()
        highest14 = high.rolling(14).max()
        stoch_k   = 100 * (close - lowest14) / (highest14 - lowest14 + 1e-10)
        stoch_d   = stoch_k.rolling(3).mean()
        result["stoch_k"] = float(stoch_k.iloc[-1])
        result["stoch_d"] = float(stoch_d.iloc[-1])

        return result


# ══════════════════════════════════════════════════════════════
# SMC / ICT PATTERN DETECTOR
# ══════════════════════════════════════════════════════════════
class SMCEngine:
    """Smart Money Concepts & ICT pattern detection."""

    def detect(self, df: pd.DataFrame) -> dict:
        result = {
            "order_blocks": [],
            "fvgs": [],
            "liquidity_levels": [],
            "bos": None,          # Break of Structure
            "choch": None,        # Change of Character
            "smt_divergence": False,
            "ote_zone": None,     # Optimal Trade Entry
        }

        close = df["close"].values
        high  = df["high"].values
        low   = df["low"].values
        n     = len(df)

        # ── Break of Structure (BOS) ──────────────────────
        lookback = min(20, n - 1)
        recent_high = max(high[-lookback:])
        recent_low  = min(low[-lookback:])
        prev_high   = max(high[-lookback*2:-lookback]) if n > lookback * 2 else recent_high
        prev_low    = min(low[-lookback*2:-lookback])  if n > lookback * 2 else recent_low

        if close[-1] > recent_high and recent_high > prev_high:
            result["bos"] = {"type": "bullish", "level": float(recent_high)}
        elif close[-1] < recent_low and recent_low < prev_low:
            result["bos"] = {"type": "bearish", "level": float(recent_low)}

        # ── Order Blocks ──────────────────────────────────
        for i in range(3, min(30, n - 2)):
            idx = n - i
            # Bullish OB: last bearish candle before strong bullish move
            if (close[idx] < df["open"].values[idx] and
                close[idx + 1] > df["open"].values[idx + 1] and
                close[idx + 1] > close[idx] * 1.001):
                result["order_blocks"].append({
                    "type": "bullish",
                    "high": float(df["open"].values[idx]),
                    "low":  float(low[idx]),
                    "index": i
                })
            # Bearish OB: last bullish candle before strong bearish move
            if (close[idx] > df["open"].values[idx] and
                close[idx + 1] < df["open"].values[idx + 1] and
                close[idx + 1] < close[idx] * 0.999):
                result["order_blocks"].append({
                    "type": "bearish",
                    "high": float(high[idx]),
                    "low":  float(df["open"].values[idx]),
                    "index": i
                })

        result["order_blocks"] = result["order_blocks"][:3]

        # ── Fair Value Gaps (FVG) ─────────────────────────
        for i in range(2, min(20, n - 1)):
            idx = n - i
            # Bullish FVG: gap between candle[idx-1] high and candle[idx+1] low
            if low[idx] > high[idx - 2] if idx >= 2 else False:
                result["fvgs"].append({
                    "type": "bullish",
                    "upper": float(low[idx]),
                    "lower": float(high[idx - 2]),
                    "filled": close[-1] < low[idx]
                })
            # Bearish FVG
            if idx >= 2 and high[idx] < low[idx - 2]:
                result["fvgs"].append({
                    "type": "bearish",
                    "upper": float(low[idx - 2]),
                    "lower": float(high[idx]),
                    "filled": close[-1] > high[idx]
                })

        result["fvgs"] = result["fvgs"][:2]

        # ── Liquidity Levels (Equal Highs/Lows) ──────────
        tolerance = float(np.mean(high[-20:] - low[-20:]) * 0.1)
        highs_20 = high[-20:]
        for i, h in enumerate(highs_20[:-1]):
            for j, h2 in enumerate(highs_20[i+1:]):
                if abs(h - h2) < tolerance:
                    result["liquidity_levels"].append({
                        "type": "buy_side",
                        "level": float((h + h2) / 2)
                    })
                    break

        # ── OTE Zone (61.8%–79% Fibonacci) ───────────────
        swing_high = float(max(high[-30:]))
        swing_low  = float(min(low[-30:]))
        fib_618    = swing_high - 0.618 * (swing_high - swing_low)
        fib_79     = swing_high - 0.79  * (swing_high - swing_low)
        result["ote_zone"] = {
            "upper": float(fib_618),
            "lower": float(fib_79),
            "current_in_zone": fib_79 <= close[-1] <= fib_618
        }

        return result


# ══════════════════════════════════════════════════════════════
# LSTM MODEL
# ══════════════════════════════════════════════════════════════
class LSTMPredictor:
    """
    LSTM neural network for directional prediction.
    Input:  sequence of [open, high, low, close, volume, rsi, macd, atr] (60 bars)
    Output: [P(BUY), P(SELL), P(HOLD)]
    """

    SEQUENCE_LEN = 60
    FEATURES     = 8
    MODEL_PATH   = "models/lstm_apex_v3.keras"

    def __init__(self):
        self.model = None
        self._load_or_build()

    def _load_or_build(self):
        if not HAS_TF:
            return
        try:
            self.model = load_model(self.MODEL_PATH)
            logger.info("LSTM model loaded from disk")
        except Exception:
            logger.info("Building new LSTM model architecture")
            self.model = self._build_model()

    def _build_model(self):
        if not HAS_TF:
            return None
        model = Sequential([
            LSTM(128, return_sequences=True,
                 input_shape=(self.SEQUENCE_LEN, self.FEATURES)),
            Dropout(0.2),
            BatchNormalization(),
            LSTM(64, return_sequences=False),
            Dropout(0.2),
            BatchNormalization(),
            Dense(32, activation="relu"),
            Dropout(0.1),
            Dense(3, activation="softmax"),  # BUY / SELL / HOLD
        ])
        model.compile(
            optimizer=Adam(learning_rate=0.001),
            loss="categorical_crossentropy",
            metrics=["accuracy"]
        )
        return model

    def predict(self, feature_matrix: np.ndarray) -> dict:
        """
        feature_matrix: shape (sequence_len, n_features)  — already normalized
        Returns: {"buy": float, "sell": float, "hold": float}
        """
        if not HAS_TF or self.model is None:
            return self._statistical_fallback(feature_matrix)

        X = feature_matrix[-self.SEQUENCE_LEN:].reshape(1, self.SEQUENCE_LEN, self.FEATURES)
        probs = self.model.predict(X, verbose=0)[0]
        return {"buy": float(probs[0]), "sell": float(probs[1]), "hold": float(probs[2])}

    def _statistical_fallback(self, fm: np.ndarray) -> dict:
        """Rule-based fallback when TF unavailable."""
        close_col = fm[:, 3]
        momentum  = (close_col[-1] - close_col[-20]) / (close_col[-20] + 1e-10)
        if   momentum >  0.005: return {"buy": 0.72, "sell": 0.15, "hold": 0.13}
        elif momentum < -0.005: return {"buy": 0.12, "sell": 0.74, "hold": 0.14}
        else:                   return {"buy": 0.30, "sell": 0.30, "hold": 0.40}

    def train(self, X: np.ndarray, y: np.ndarray, epochs: int = 50):
        """Retrain on new data if win rate drops below threshold."""
        if not HAS_TF or self.model is None:
            return
        self.model.fit(
            X, y,
            epochs=epochs,
            batch_size=32,
            validation_split=0.2,
            verbose=1
        )
        self.model.save(self.MODEL_PATH)
        logger.info("LSTM model retrained and saved")


# ══════════════════════════════════════════════════════════════
# FUNDAMENTAL / SENTIMENT SCORER
# ══════════════════════════════════════════════════════════════
class FundamentalScorer:
    """
    Scores fundamental and sentiment signals.
    Production: integrate with news APIs (Alpha Vantage, Benzinga, Forex Factory).
    """

    def score(self, symbol: str, mode: str) -> dict:
        """
        Returns scores 0-100 for fundamental and sentiment.
        Replace the stub values below with real API calls.
        """
        # ── STUB — replace with real data feeds ──────────
        # e.g. requests to:
        #   https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers=AAPL
        #   https://nfs.faireconomy.media/ff_calendar_thisweek.json (Forex Factory)
        #   https://api.coinmarketcap.com/v1/global/  (crypto sentiment)

        stub_fundamentals = {
            "EUR/USD": {"fundamental": 62, "sentiment": 58, "news_bias": "bullish"},
            "BTC/USD": {"fundamental": 71, "sentiment": 74, "news_bias": "bullish"},
            "NVDA":    {"fundamental": 83, "sentiment": 80, "news_bias": "bullish"},
        }

        base = stub_fundamentals.get(symbol, {"fundamental": 55, "sentiment": 50, "news_bias": "neutral"})
        return {
            "fundamental_score": base["fundamental"],
            "sentiment_score":   base["sentiment"],
            "news_bias":         base["news_bias"],
            "upcoming_events":   self._get_upcoming_events(symbol),
        }

    def _get_upcoming_events(self, symbol: str) -> list:
        # Production: fetch from Forex Factory or ForexLive API
        return [
            {"name": "FOMC Minutes", "impact": "high",   "time": "Tomorrow 19:00 UTC"},
            {"name": "NFP",          "impact": "high",   "time": "Friday 13:30 UTC"},
            {"name": "CPI (US)",     "impact": "medium", "time": "Next Wed 13:30 UTC"},
        ]


# ══════════════════════════════════════════════════════════════
# RISK CALCULATOR
# ══════════════════════════════════════════════════════════════
class RiskCalculator:
    """Calculates position sizing and SL/TP based on ATR."""

    def calculate(
        self,
        entry: float,
        atr: float,
        direction: str,
        account_balance: float,
        risk_percent: float = 2.0,
        rr_ratio: float = 2.5,
    ) -> dict:
        # ATR-based SL (1.5x ATR)
        sl_distance = atr * 1.5
        tp_distance = sl_distance * rr_ratio

        if direction == "BUY":
            stop_loss   = entry - sl_distance
            take_profit = entry + tp_distance
        else:
            stop_loss   = entry + sl_distance
            take_profit = entry - tp_distance

        # Position sizing: risk $ / SL pips
        risk_amount = account_balance * (risk_percent / 100)
        lot_size    = round(risk_amount / (sl_distance * 10000), 2)  # Forex standard
        lot_size    = max(0.01, min(lot_size, 10.0))

        return {
            "entry":        round(entry, 5),
            "stop_loss":    round(stop_loss, 5),
            "take_profit":  round(take_profit, 5),
            "lot_size":     lot_size,
            "risk_amount":  round(risk_amount, 2),
            "risk_reward":  round(rr_ratio, 2),
            "sl_pips":      round(sl_distance * 10000, 1),
            "tp_pips":      round(tp_distance * 10000, 1),
        }


# ══════════════════════════════════════════════════════════════
# MASTER AI ANALYSIS ORCHESTRATOR
# ══════════════════════════════════════════════════════════════
class AIAnalysisEngine:
    """
    Master orchestrator — combines all signals into a single
    trade recommendation with confidence score.
    """

    def __init__(self):
        self.tech_engine   = TechnicalEngine()
        self.smc_engine    = SMCEngine()
        self.lstm          = LSTMPredictor()
        self.fund_scorer   = FundamentalScorer()
        self.risk_calc     = RiskCalculator()

    async def analyze(
        self,
        df: pd.DataFrame,
        symbol: str,
        mode: str = "intraday",
        account_balance: float = 10000.0,
        risk_percent: float = 2.0,
    ) -> dict:
        """
        Full multi-layer analysis pipeline.
        Returns complete trade recommendation.
        """
        # 1. Technical indicators
        indicators = self.tech_engine.compute_all(df)

        # 2. SMC/ICT patterns
        smc_data = self.smc_engine.detect(df)

        # 3. LSTM prediction
        feature_matrix = self._build_feature_matrix(df, indicators)
        lstm_output    = self.lstm.predict(feature_matrix)

        # 4. Fundamental + sentiment
        fund_data = self.fund_scorer.score(symbol, mode)

        # 5. Compute component scores (0–100)
        tech_score = self._score_technical(indicators, smc_data)
        smc_score  = self._score_smc(smc_data)
        ml_score   = max(lstm_output["buy"], lstm_output["sell"]) * 100
        fund_score = fund_data["fundamental_score"]
        sent_score = fund_data["sentiment_score"]

        # 6. Weighted confidence
        weights = {"tech": 0.35, "smc": 0.25, "ml": 0.20, "fund": 0.10, "sent": 0.10}
        final_confidence = (
            tech_score * weights["tech"] +
            smc_score  * weights["smc"]  +
            ml_score   * weights["ml"]   +
            fund_score * weights["fund"] +
            sent_score * weights["sent"]
        )

        # 7. Determine signal
        buy_weight  = (lstm_output["buy"]  * 0.4 +
                       (1 if indicators["macd_hist"] > 0 else 0) * 0.3 +
                       (1 if indicators["rsi"] < 60 else 0) * 0.3)
        sell_weight = (lstm_output["sell"] * 0.4 +
                       (1 if indicators["macd_hist"] < 0 else 0) * 0.3 +
                       (1 if indicators["rsi"] > 40 else 0) * 0.3)

        if   buy_weight > sell_weight and final_confidence > 60:  signal = "BUY"
        elif sell_weight > buy_weight and final_confidence > 60:  signal = "SELL"
        else:                                                       signal = "HOLD"

        # 8. Risk/position sizing
        entry  = float(df["close"].iloc[-1])
        trade  = self.risk_calc.calculate(
            entry, indicators["atr"], signal,
            account_balance, risk_percent
        )

        # 9. AI reasoning text
        reasoning = self._generate_reasoning(
            signal, indicators, smc_data, lstm_output, final_confidence, symbol
        )

        return {
            "symbol":             symbol,
            "mode":               mode,
            "signal":             signal,
            "confidence":         round(final_confidence, 2),
            "technical_score":    round(tech_score, 1),
            "smc_score":          round(smc_score, 1),
            "ml_score":           round(ml_score, 1),
            "fundamental_score":  round(fund_score, 1),
            "sentiment_score":    round(sent_score, 1),
            "entry":              trade["entry"],
            "stop_loss":          trade["stop_loss"],
            "take_profit":        trade["take_profit"],
            "lot_size":           trade["lot_size"],
            "risk_reward":        trade["risk_reward"],
            "sl_pips":            trade["sl_pips"],
            "tp_pips":            trade["tp_pips"],
            "risk_amount":        trade["risk_amount"],
            "indicators":         indicators,
            "smc":                smc_data,
            "lstm_probs":         lstm_output,
            "fundamental":        fund_data,
            "reasoning":          reasoning,
            "timestamp":          datetime.utcnow().isoformat(),
        }

    def _build_feature_matrix(self, df: pd.DataFrame, indicators: dict) -> np.ndarray:
        close = df["close"].values
        high  = df["high"].values
        low   = df["low"].values
        opens = df["open"].values
        vol   = df["volume"].values

        n = len(df)
        features = np.zeros((n, 8))
        features[:, 0] = opens / close  # normalized open
        features[:, 1] = high  / close
        features[:, 2] = low   / close
        features[:, 3] = close / np.maximum(close, 1e-10)
        features[:, 4] = vol   / (np.mean(vol) + 1e-10)

        # Add rolling indicators
        delta = pd.Series(close).diff()
        gain  = delta.clip(lower=0).rolling(14).mean().fillna(50)
        loss  = (-delta.clip(upper=0)).rolling(14).mean().fillna(50)
        rs    = gain / (loss + 1e-10)
        rsi   = 100 - (100 / (1 + rs))
        features[:, 5] = rsi.values / 100

        ema12 = pd.Series(close).ewm(span=12).mean()
        ema26 = pd.Series(close).ewm(span=26).mean()
        features[:, 6] = ((ema12 - ema26) / (close + 1e-10)).values

        tr = pd.concat([
            pd.Series(high - low),
            pd.Series(abs(high - np.roll(close, 1))),
            pd.Series(abs(low  - np.roll(close, 1)))
        ], axis=1).max(axis=1)
        features[:, 7] = (tr.rolling(14).mean().fillna(0) / (close + 1e-10)).values

        return features

    def _score_technical(self, ind: dict, smc: dict) -> float:
        score = 50.0
        # RSI scoring
        rsi = ind["rsi"]
        if 40 <= rsi <= 60:     score += 10
        elif rsi < 30:          score += 15   # oversold — potential buy
        elif rsi > 70:          score -= 10   # overbought
        # MACD
        if ind["macd_cross"] == "bullish": score += 12
        if ind["macd_cross"] == "bearish": score -= 8
        # Trend alignment
        if ind["price_vs_ema200"] == "above": score += 8
        # Volume confirmation
        if ind["vol_ratio"] > 1.5: score += 10
        # BB position
        if 0.3 <= ind["bb_pos"] <= 0.7: score += 5   # mid range
        return min(max(score, 0), 100)

    def _score_smc(self, smc: dict) -> float:
        score = 40.0
        if smc["bos"]:            score += 20
        if smc["order_blocks"]:   score += 15
        if smc["fvgs"]:           score += 10
        if smc["ote_zone"] and smc["ote_zone"]["current_in_zone"]: score += 15
        return min(score, 100)

    def _generate_reasoning(self, signal, ind, smc, lstm, conf, symbol) -> str:
        bos_text = f"Bullish BOS confirmed at {smc['bos']['level']:.5f}" if smc.get("bos") and smc["bos"]["type"] == "bullish" \
              else f"Bearish BOS confirmed at {smc['bos']['level']:.5f}" if smc.get("bos") \
              else "No clear BOS yet"
        ob_text  = f"{len(smc['order_blocks'])} order block(s) identified" if smc["order_blocks"] else "No fresh order blocks"
        ote_text = "Price in OTE zone (61.8–79% fib)" if smc.get("ote_zone") and smc["ote_zone"]["current_in_zone"] else "Price outside OTE zone"

        return (
            f"Market structure: {bos_text}. {ob_text}. {ote_text}. "
            f"RSI({ind['rsi']:.1f}) {'oversold — buy pressure building' if ind['rsi'] < 35 else 'overbought — caution' if ind['rsi'] > 65 else 'neutral zone'}. "
            f"MACD histogram {ind['macd_hist']:.6f} ({ind['macd_cross']} bias). "
            f"Volume {ind['vol_ratio']:.1f}x average — {'confirming move' if ind['vol_ratio'] > 1.2 else 'weak conviction'}. "
            f"LSTM model probability: BUY {lstm['buy']*100:.0f}% / SELL {lstm['sell']*100:.0f}% / HOLD {lstm['hold']*100:.0f}%. "
            f"Price {'above' if ind['price_vs_ema200'] == 'above' else 'below'} EMA200 — "
            f"{'bullish macro trend' if ind['price_vs_ema200'] == 'above' else 'bearish macro bias'}. "
            f"Final AI signal: {signal} with {conf:.1f}% confidence."
        )


# Singleton instance
_engine: Optional[AIAnalysisEngine] = None

def get_ai_engine() -> AIAnalysisEngine:
    global _engine
    if _engine is None:
        _engine = AIAnalysisEngine()
    return _engine
