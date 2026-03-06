"use client";
import { useState, useEffect, useCallback } from "react";
import { api } from "@/services/api";
import { useMarketWebSocket } from "@/hooks/useMarketWS";
import dynamic from "next/dynamic";

// Dynamically import chart (avoids SSR issues)
const ProChart = dynamic(() => import("./ProChart"), { ssr: false });

const SYMBOLS: Record<string, string[]> = {
  forex:     ["EUR/USD", "GBP/USD", "USD/JPY", "AUD/USD"],
  crypto:    ["BTC/USD", "ETH/USD", "SOL/USD", "BNB/USD"],
  stocks:    ["AAPL", "TSLA", "NVDA", "MSFT"],
  synthetic: ["Volatility 75", "Volatility 25", "Crash 500", "Boom 1000"],
};

const MODES = [
  { id: "scalp",      label: "Scalp",      tf: "1m–5m",  color: "#FF6B35" },
  { id: "intraday",   label: "Intraday",   tf: "15m–1h", color: "#0066FF" },
  { id: "swing",      label: "Swing",      tf: "4h–1D",  color: "#8B5CF6" },
  { id: "positional", label: "Positional", tf: "1W+",    color: "#00D4A8" },
];

const SCREENS = ["dashboard", "analysis", "history", "wallet", "settings"];

function generateDemoCandles(symbol: string, n = 120) {
  const base: Record<string, number> = { "EUR/USD": 1.085, "BTC/USD": 67000, "NVDA": 870, "Volatility 75": 12000 };
  let price = base[symbol] || 1.0;
  const now = Math.floor(Date.now() / 1000);
  return Array.from({ length: n }, (_, i) => {
    const open  = price;
    const move  = (Math.random() - 0.48) * price * 0.002;
    const close = Math.max(open + move, price * 0.9);
    const high  = Math.max(open, close) + Math.random() * price * 0.001;
    const low   = Math.min(open, close) - Math.random() * price * 0.001;
    price = close;
    return { time: now - (n - i) * 3600, open, high, low, close, volume: Math.random() * 5000 + 1000 };
  });
}

export default function Dashboard({ user, onLogout }: { user: any; onLogout: () => void }) {
  const [screen,       setScreen]       = useState("dashboard");
  const [market,       setMarket]       = useState("forex");
  const [symbol,       setSymbol]       = useState("EUR/USD");
  const [mode,         setMode]         = useState("intraday");
  const [candles,      setCandles]      = useState(() => generateDemoCandles("EUR/USD"));
  const [analysis,     setAnalysis]     = useState<any>(null);
  const [isAnalyzing,  setIsAnalyzing]  = useState(false);
  const [autoTrade,    setAutoTrade]    = useState(false);
  const [threshold,    setThreshold]    = useState(85);
  const [trades,       setTrades]       = useState<any[]>([]);
  const [performance,  setPerformance]  = useState<any>(null);
  const [balance,      setBalance]      = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [notif,        setNotif]        = useState<any>(null);
  const [livePrice,    setLivePrice]    = useState<Record<string, number>>({});
  const [phone,        setPhone]        = useState("");
  const [amount,       setAmount]       = useState("");
  const [walletTab,    setWalletTab]    = useState<"deposit"|"withdraw">("deposit");
  const [copySetup,    setCopySetup]    = useState<any>(null);
  const [acctBal,      setAcctBal]      = useState(10000);

  const notify = (msg: string, type: "success"|"error" = "success") => {
    setNotif({ msg, type });
    setTimeout(() => setNotif(null), 3500);
  };

  // WebSocket live prices
  const onTick = useCallback((data: any) => {
    setLivePrice(prev => ({ ...prev, [data.symbol]: data.price }));
    // Update last candle close price
    setCandles(prev => {
      if (!prev.length || data.symbol !== symbol) return prev;
      const updated = [...prev];
      const last = { ...updated[updated.length - 1] };
      last.close  = data.price;
      last.high   = Math.max(last.high, data.price);
      last.low    = Math.min(last.low,  data.price);
      updated[updated.length - 1] = last;
      return updated;
    });
  }, [symbol]);

  const { connected } = useMarketWebSocket(onTick, [symbol]);

  // Load initial data
  useEffect(() => {
    api.getTrades().then(setTrades).catch(() => {});
    api.getPerformance().then(setPerformance).catch(() => {});
    api.getBalance().then(setBalance).catch(() => {});
    api.getTransactions().then(setTransactions).catch(() => {});
  }, []);

  useEffect(() => {
    setCandles(generateDemoCandles(symbol));
  }, [symbol]);

  const runAnalysis = async () => {
    setIsAnalyzing(true); setAnalysis(null);
    try {
      const result = await api.runAnalysis(symbol, mode, acctBal, 2);
      setAnalysis(result);
      setCandles(generateDemoCandles(symbol)); // refresh chart
      if (autoTrade && result.confidence >= threshold && result.signal !== "HOLD") {
        await api.placeTrade({
          symbol, direction: result.signal,
          lot_size: result.lot_size,
          entry: result.entry, stop_loss: result.stop_loss, take_profit: result.take_profit,
          mode,
        });
        notify(`🤖 Auto trade: ${result.signal} ${symbol} @ ${result.entry} | Conf: ${result.confidence.toFixed(1)}%`);
        const updated = await api.getTrades();
        setTrades(updated);
      }
    } catch (e: any) {
      notify(e.message || "Analysis failed", "error");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const getCopySetup = async () => {
    try {
      const setup = await api.getCopyableSetup(symbol, acctBal, undefined, 2);
      setCopySetup(setup);
    } catch (e: any) { notify(e.message, "error"); }
  };

  const handleWallet = async () => {
    const amt = parseFloat(amount);
    if (!phone || !amt || amt <= 0) return notify("Enter valid phone and amount", "error");
    try {
      if (walletTab === "deposit") {
        await api.deposit(phone, amt);
        notify(`✅ Deposit of $${amt} initiated via Airtel Money. Confirm on your phone.`);
      } else {
        await api.withdraw(phone, amt);
        notify(`✅ Withdrawal of $${amt} sent to ${phone}`);
      }
      setAmount("");
      const b = await api.getBalance();
      setBalance(b);
      const tx = await api.getTransactions();
      setTransactions(tx);
    } catch (e: any) { notify(e.message, "error"); }
  };

  const levels = analysis ? { entry: analysis.entry, sl: analysis.stop_loss, tp: analysis.take_profit } : {};
  const totalPnL = trades.reduce((s, t) => s + (t.pnl || 0), 0);

  // ── Styles ─────────────────────────────────────────────
  const card: React.CSSProperties = { background: "rgba(13,27,42,0.9)", border: "1px solid #1A2744", borderRadius: 12, padding: 16 };
  const label: React.CSSProperties = { color: "#4A6FA5", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 };
  const inp: React.CSSProperties = { width: "100%", background: "#0D1B2A", border: "1px solid #1A2744", borderRadius: 8, padding: "9px 12px", color: "#C4D9F0", fontSize: 13, outline: "none" };

  return (
    <div style={{ minHeight: "100vh", background: "#0A0F1E", display: "flex", flexDirection: "column" }}>
      <style>{`@keyframes fadeIn{from{opacity:0}to{opacity:1}} * { box-sizing:border-box; }`}</style>

      {/* Notification */}
      {notif && (
        <div style={{ position: "fixed", top: 16, right: 16, zIndex: 999, background: notif.type === "success" ? "rgba(0,212,168,0.15)" : "rgba(255,68,68,0.15)", border: `1px solid ${notif.type === "success" ? "#00D4A8" : "#FF4444"}`, borderRadius: 10, padding: "11px 16px", color: notif.type === "success" ? "#00D4A8" : "#FF4444", fontSize: 13, fontWeight: 600, animation: "fadeIn 0.3s ease", backdropFilter: "blur(10px)", maxWidth: 360 }}>
          {notif.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ background: "rgba(13,27,42,0.97)", borderBottom: "1px solid #1A2744", padding: "0 16px", display: "flex", alignItems: "center", gap: 12, height: 54, position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginRight: 12 }}>
          <span style={{ fontSize: 16 }}>⚡</span>
          <span style={{ fontWeight: 800, fontSize: 14 }}>APEX<span style={{ color: "#0066FF" }}>AI</span></span>
        </div>
        {SCREENS.map(s => (
          <button key={s} onClick={() => setScreen(s)} style={{ padding: "5px 12px", borderRadius: 6, border: "none", cursor: "pointer", background: screen === s ? "rgba(0,102,255,0.2)" : "transparent", color: screen === s ? "#0066FF" : "#4A6FA5", fontWeight: screen === s ? 700 : 400, fontSize: 12, textTransform: "capitalize", borderBottom: screen === s ? "2px solid #0066FF" : "2px solid transparent" }}>
            {s === "analysis" ? "AI Analysis" : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: connected ? "#00D4A8" : "#FF4444" }} />
          <span style={{ color: "#4A6FA5", fontSize: 10 }}>{connected ? "LIVE" : "OFFLINE"}</span>
        </div>
        <span style={{ color: "#4A6FA5", fontSize: 11 }}>P&L: <span style={{ color: totalPnL >= 0 ? "#00D4A8" : "#FF4444", fontWeight: 700 }}>{totalPnL >= 0 ? "+" : ""}${totalPnL.toFixed(2)}</span></span>
        <div style={{ width: 26, height: 26, borderRadius: "50%", background: "linear-gradient(135deg,#0066FF,#00D4A8)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, cursor: "pointer" }} onClick={onLogout} title="Logout">👤</div>
      </div>

      <div style={{ flex: 1, padding: 14, overflow: "auto" }}>

        {/* ── DASHBOARD ── */}
        {screen === "dashboard" && (
          <div style={{ animation: "fadeIn 0.3s ease" }}>
            {/* Stat cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginBottom: 14 }}>
              {[
                { label: "Balance",  value: `$${(balance?.balance || 0).toFixed(2)}`,      color: "#00D4A8" },
                { label: "Total P&L", value: `${totalPnL >= 0 ? "+" : ""}$${totalPnL.toFixed(2)}`, color: totalPnL >= 0 ? "#00D4A8" : "#FF4444" },
                { label: "Win Rate", value: `${performance?.win_rate?.toFixed(1) || 0}%`,  color: "#0066FF" },
                { label: "Trades",   value: performance?.total_trades || trades.length,      color: "#8B5CF6" },
                { label: "Sharpe",   value: performance?.sharpe_ratio?.toFixed(2) || "—",   color: "#FFB800" },
              ].map(({ label, value, color }) => (
                <div key={label} style={card}>
                  <div style={label as any}>{label}</div>
                  <div style={{ color, fontSize: 20, fontWeight: 800, fontFamily: "monospace" }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Chart + AI Panel */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 270px", gap: 12, marginBottom: 12 }}>
              <div style={card}>
                {/* Controls */}
                <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <select value={market} onChange={e => { setMarket(e.target.value); setSymbol(SYMBOLS[e.target.value][0]); }}
                    style={{ background: "#0D1B2A", border: "1px solid #1A2744", borderRadius: 6, padding: "5px 8px", color: "#C4D9F0", fontSize: 12 }}>
                    {Object.keys(SYMBOLS).map(m => <option key={m} value={m}>{m.toUpperCase()}</option>)}
                  </select>
                  <select value={symbol} onChange={e => setSymbol(e.target.value)}
                    style={{ background: "#0D1B2A", border: "1px solid #1A2744", borderRadius: 6, padding: "5px 8px", color: "#C4D9F0", fontSize: 12 }}>
                    {SYMBOLS[market].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  {MODES.map(m => (
                    <button key={m.id} onClick={() => setMode(m.id)} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${mode === m.id ? m.color : "#1A2744"}`, cursor: "pointer", background: mode === m.id ? `${m.color}22` : "transparent", color: mode === m.id ? m.color : "#4A6FA5", fontSize: 11, fontWeight: mode === m.id ? 700 : 400 }}>
                      {m.label}
                    </button>
                  ))}
                  <button onClick={runAnalysis} disabled={isAnalyzing} style={{ marginLeft: "auto", padding: "6px 16px", borderRadius: 6, border: "none", cursor: "pointer", background: isAnalyzing ? "#1A2744" : "linear-gradient(135deg,#0066FF,#0044CC)", color: isAnalyzing ? "#4A6FA5" : "#fff", fontWeight: 700, fontSize: 12 }}>
                    {isAnalyzing ? "🔄 Analyzing..." : "🧠 Run AI"}
                  </button>
                </div>
                <ProChart candles={candles} levels={levels} symbol={symbol} />
              </div>

              {/* AI Panel */}
              <div style={{ ...card, display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: isAnalyzing ? "#0066FF" : "#00D4A8", animation: isAnalyzing ? "pulse 1s infinite" : "none" }} />
                  <span style={{ color: "#7A9CC6", fontSize: 10, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: 2 }}>
                    AI Engine {isAnalyzing ? "Processing..." : "Ready"}
                  </span>
                </div>

                {analysis ? (
                  <>
                    <div style={{ background: "#0D1B2A", borderRadius: 8, padding: 10, textAlign: "center" }}>
                      <div style={{ fontSize: 32, fontWeight: 900, color: analysis.confidence > 85 ? "#00D4A8" : "#FFB800", fontFamily: "monospace" }}>
                        {analysis.confidence.toFixed(1)}%
                      </div>
                      <div style={{ color: "#4A6FA5", fontSize: 9, textTransform: "uppercase", marginTop: 2 }}>Confidence</div>
                      <div style={{ height: 4, background: "#1A2744", borderRadius: 2, marginTop: 6 }}>
                        <div style={{ height: "100%", width: `${analysis.confidence}%`, background: "linear-gradient(90deg,#0066FF,#00D4A8)", borderRadius: 2, transition: "width 1s" }} />
                      </div>
                    </div>

                    {[
                      { label: "Technical",    score: analysis.technical_score },
                      { label: "SMC/ICT",      score: analysis.smc_score },
                      { label: "ML Model",     score: analysis.ml_score },
                      { label: "Fundamental",  score: analysis.fundamental_score },
                    ].map(({ label, score }) => (
                      <div key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ color: "#4A6FA5", fontSize: 10, width: 80, fontFamily: "monospace" }}>{label}</span>
                        <div style={{ flex: 1, height: 5, background: "#1A2744", borderRadius: 3 }}>
                          <div style={{ height: "100%", width: `${score}%`, background: score > 70 ? "#00D4A8" : "#0066FF", borderRadius: 3 }} />
                        </div>
                        <span style={{ color: "#7A9CC6", fontSize: 10, width: 30, textAlign: "right", fontFamily: "monospace" }}>{score?.toFixed(0)}%</span>
                      </div>
                    ))}

                    <div style={{ background: "#0D1B2A", borderRadius: 8, padding: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ color: "#00D4A8", fontSize: 16, fontWeight: 700, fontFamily: "monospace" }}>1:{analysis.risk_reward}</div>
                        <div style={{ color: "#4A6FA5", fontSize: 8 }}>RISK/REWARD</div>
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ color: "#0066FF", fontSize: 16, fontWeight: 700, fontFamily: "monospace" }}>{analysis.lot_size}</div>
                        <div style={{ color: "#4A6FA5", fontSize: 8 }}>LOT SIZE</div>
                      </div>
                    </div>

                    <div style={{ background: "#0D1B2A", borderRadius: 8, padding: 8 }}>
                      <div style={{ color: "#4A6FA5", fontSize: 9, textTransform: "uppercase", marginBottom: 4 }}>Entry Levels</div>
                      {[
                        { label: "Entry", val: analysis.entry?.toFixed(5), color: "#0066FF" },
                        { label: "SL",    val: analysis.stop_loss?.toFixed(5), color: "#FF4444" },
                        { label: "TP",    val: analysis.take_profit?.toFixed(5), color: "#00D4A8" },
                      ].map(({ label, val, color }) => (
                        <div key={label} style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                          <span style={{ color: "#4A6FA5", fontSize: 10 }}>{label}</span>
                          <span style={{ color, fontFamily: "monospace", fontSize: 11, fontWeight: 700 }}>{val}</span>
                        </div>
                      ))}
                    </div>

                    <div style={{ borderRadius: 8, padding: 10, textAlign: "center", background: analysis.signal === "BUY" ? "rgba(0,212,168,0.15)" : analysis.signal === "SELL" ? "rgba(255,68,68,0.15)" : "rgba(74,111,165,0.15)", border: `1px solid ${analysis.signal === "BUY" ? "#00D4A8" : analysis.signal === "SELL" ? "#FF4444" : "#4A6FA5"}` }}>
                      <div style={{ fontSize: 20, fontWeight: 900, color: analysis.signal === "BUY" ? "#00D4A8" : analysis.signal === "SELL" ? "#FF4444" : "#4A6FA5", fontFamily: "monospace", letterSpacing: 4 }}>
                        {analysis.signal}
                      </div>
                    </div>
                  </>
                ) : (
                  <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#1A2744", fontSize: 12, textAlign: "center" }}>
                    Click "Run AI" to start analysis
                  </div>
                )}
              </div>
            </div>

            {/* Auto-trade + Copy Setup */}
            <div style={{ ...card, display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
              <div>
                <div style={label as any}>Auto-Trading</div>
                <button onClick={() => setAutoTrade(!autoTrade)} style={{ padding: "7px 16px", borderRadius: 7, border: `1px solid ${autoTrade ? "#00D4A8" : "#1A2744"}`, cursor: "pointer", background: autoTrade ? "rgba(0,212,168,0.15)" : "#0D1B2A", color: autoTrade ? "#00D4A8" : "#4A6FA5", fontWeight: 700, fontSize: 12 }}>
                  {autoTrade ? "🟢 AUTO ON" : "⚪ AUTO OFF"}
                </button>
              </div>
              <div>
                <div style={label as any}>Confidence Threshold: <span style={{ color: "#0066FF" }}>{threshold}%</span></div>
                <input type="range" min={70} max={99} value={threshold} onChange={e => setThreshold(+e.target.value)} style={{ width: 140, accentColor: "#0066FF" }} />
              </div>
              <div>
                <div style={label as any}>Account Balance ($)</div>
                <input type="number" value={acctBal} onChange={e => setAcctBal(+e.target.value)} style={{ ...inp, width: 130, padding: "6px 10px" }} />
              </div>
              <button onClick={getCopySetup} style={{ padding: "7px 14px", borderRadius: 7, border: "1px solid #1A2744", cursor: "pointer", background: "#0D1B2A", color: "#FFB800", fontWeight: 600, fontSize: 12 }}>
                📋 Copy Trade Setup
              </button>
              {copySetup && (
                <div style={{ background: "#0D1B2A", borderRadius: 8, padding: 10, fontFamily: "monospace", fontSize: 11, color: "#00D4A8", whiteSpace: "pre", border: "1px solid #1A2744", cursor: "pointer" }}
                  onClick={() => { navigator.clipboard.writeText(copySetup.copy_text); notify("Trade setup copied to clipboard!"); }}>
                  {copySetup.copy_text}
                  <div style={{ color: "#4A6FA5", fontSize: 10, marginTop: 4 }}>Click to copy</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── ANALYSIS ── */}
        {screen === "analysis" && (
          <div style={{ animation: "fadeIn 0.3s ease" }}>
            {analysis ? (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                  <div style={card}>
                    <div style={{ color: "#0066FF", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>📊 Technical Indicators</div>
                    {Object.entries(analysis.indicators || {}).slice(0, 12).map(([k, v]) => (
                      <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid #0D1B2A", fontSize: 11 }}>
                        <span style={{ color: "#4A6FA5", fontFamily: "monospace" }}>{k}</span>
                        <span style={{ color: "#C4D9F0", fontFamily: "monospace" }}>{typeof v === "number" ? v.toFixed(4) : String(v)}</span>
                      </div>
                    ))}
                  </div>
                  <div style={card}>
                    <div style={{ color: "#8B5CF6", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>🎯 SMC / ICT Analysis</div>
                    <div style={{ marginBottom: 8 }}>
                      <span style={{ color: "#4A6FA5", fontSize: 11 }}>Break of Structure: </span>
                      <span style={{ color: analysis.smc?.bos?.type === "bullish" ? "#00D4A8" : "#FF4444", fontFamily: "monospace", fontSize: 11 }}>
                        {analysis.smc?.bos ? `${analysis.smc.bos.type.toUpperCase()} @ ${analysis.smc.bos.level?.toFixed(5)}` : "None detected"}
                      </span>
                    </div>
                    <div style={{ marginBottom: 8 }}>
                      <span style={{ color: "#4A6FA5", fontSize: 11 }}>Order Blocks: </span>
                      <span style={{ color: "#FFB800", fontFamily: "monospace", fontSize: 11 }}>{analysis.smc?.order_blocks?.length || 0} found</span>
                    </div>
                    <div style={{ marginBottom: 8 }}>
                      <span style={{ color: "#4A6FA5", fontSize: 11 }}>Fair Value Gaps: </span>
                      <span style={{ color: "#0066FF", fontFamily: "monospace", fontSize: 11 }}>{analysis.smc?.fvgs?.length || 0} found</span>
                    </div>
                    <div style={{ marginBottom: 8 }}>
                      <span style={{ color: "#4A6FA5", fontSize: 11 }}>OTE Zone: </span>
                      <span style={{ color: analysis.smc?.ote_zone?.current_in_zone ? "#00D4A8" : "#4A6FA5", fontFamily: "monospace", fontSize: 11 }}>
                        {analysis.smc?.ote_zone?.current_in_zone ? "✅ Price in OTE zone" : "❌ Outside OTE"}
                      </span>
                    </div>
                    <div style={{ marginTop: 12, color: "#4A6FA5", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>AI Reasoning</div>
                    <div style={{ color: "#7A9CC6", fontSize: 11, lineHeight: 1.7, background: "#0D1B2A", borderRadius: 8, padding: 10 }}>
                      {analysis.reasoning}
                    </div>
                  </div>
                </div>
                <div style={card}>
                  <div style={{ color: "#00D4A8", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>📰 Fundamental &amp; Sentiment</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10 }}>
                    {[
                      { label: "Fundamental Score", val: `${analysis.fundamental_score?.toFixed(0)}%`, color: "#FFB800" },
                      { label: "Sentiment Score",   val: `${analysis.sentiment_score?.toFixed(0)}%`,   color: "#8B5CF6" },
                      { label: "News Bias",         val: analysis.fundamental?.news_bias || "neutral",  color: "#00D4A8" },
                      { label: "LSTM BUY Prob",     val: `${(analysis.lstm_probs?.buy * 100)?.toFixed(0)}%`, color: "#00D4A8" },
                      { label: "LSTM SELL Prob",    val: `${(analysis.lstm_probs?.sell * 100)?.toFixed(0)}%`, color: "#FF4444" },
                    ].map(({ label, val, color }) => (
                      <div key={label} style={{ background: "#0D1B2A", borderRadius: 8, padding: 10 }}>
                        <div style={{ color: "#4A6FA5", fontSize: 10 }}>{label}</div>
                        <div style={{ color, fontSize: 16, fontWeight: 700, fontFamily: "monospace" }}>{val}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div style={{ ...card, textAlign: "center", padding: 60 }}>
                <div style={{ color: "#4A6FA5", fontSize: 14 }}>Run AI Analysis from the Dashboard first</div>
              </div>
            )}
          </div>
        )}

        {/* ── HISTORY ── */}
        {screen === "history" && (
          <div style={{ ...card, animation: "fadeIn 0.3s ease", overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 90px 70px 70px 80px", gap: 6, padding: "8px 10px", background: "#0D1B2A", fontSize: 10, color: "#4A6FA5", fontWeight: 700, textTransform: "uppercase" }}>
              <div>Symbol</div><div>Dir</div><div>Entry</div><div>Lots</div><div>Conf</div><div style={{ textAlign: "right" }}>P&L</div>
            </div>
            {trades.length === 0 && <div style={{ padding: 30, textAlign: "center", color: "#4A6FA5" }}>No trades yet</div>}
            {trades.map((t, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 80px 90px 70px 70px 80px", gap: 6, padding: "8px 10px", borderBottom: "1px solid #0D1B2A", fontSize: 11, alignItems: "center" }}>
                <div style={{ color: "#C4D9F0", fontWeight: 600, fontFamily: "monospace" }}>{t.symbol}</div>
                <div style={{ color: t.direction === "BUY" ? "#00D4A8" : "#FF4444", fontWeight: 700 }}>{t.direction}</div>
                <div style={{ color: "#7A9CC6", fontFamily: "monospace" }}>{typeof t.entry_price === "number" ? t.entry_price.toFixed(5) : t.entry_price}</div>
                <div style={{ color: "#4A6FA5" }}>{t.lot_size}</div>
                <div style={{ color: "#0066FF" }}>{t.confidence_score?.toFixed(0)}%</div>
                <div style={{ color: (t.pnl || 0) >= 0 ? "#00D4A8" : "#FF4444", fontWeight: 700, textAlign: "right", fontFamily: "monospace" }}>
                  {(t.pnl || 0) >= 0 ? "+" : ""}${(t.pnl || 0).toFixed(2)}
                </div>
              </div>
            ))}
            <div style={{ padding: "10px 12px", display: "flex", gap: 20, fontSize: 12, borderTop: "1px solid #1A2744" }}>
              <span style={{ color: "#4A6FA5" }}>Total P&L: <span style={{ color: totalPnL >= 0 ? "#00D4A8" : "#FF4444", fontWeight: 700 }}>{totalPnL >= 0 ? "+" : ""}${totalPnL.toFixed(2)}</span></span>
              <span style={{ color: "#4A6FA5" }}>Trades: <span style={{ color: "#0066FF", fontWeight: 700 }}>{trades.length}</span></span>
            </div>
          </div>
        )}

        {/* ── WALLET ── */}
        {screen === "wallet" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, animation: "fadeIn 0.3s ease" }}>
            <div style={card}>
              <div style={label as any}>Wallet Balance</div>
              <div style={{ fontSize: 38, fontWeight: 900, color: "#00D4A8", fontFamily: "monospace" }}>${(balance?.balance || 0).toFixed(2)}</div>
              <div style={{ display: "flex", gap: 6, marginTop: 14, marginBottom: 14 }}>
                {(["deposit","withdraw"] as const).map(t => (
                  <button key={t} onClick={() => setWalletTab(t)} style={{ flex: 1, padding: "7px", borderRadius: 7, border: `1px solid ${walletTab === t ? "#0066FF" : "#1A2744"}`, cursor: "pointer", background: walletTab === t ? "rgba(0,102,255,0.15)" : "transparent", color: walletTab === t ? "#0066FF" : "#4A6FA5", fontWeight: 600, fontSize: 12, textTransform: "capitalize" }}>
                    {t === "deposit" ? "💳 Deposit" : "💸 Withdraw"}
                  </button>
                ))}
              </div>
              <div style={label as any}>Airtel Money Phone</div>
              <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+256 7XX XXX XXX" style={{ ...inp, marginBottom: 10 }} />
              <div style={label as any}>Amount (USD)</div>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" style={{ ...inp, marginBottom: 12 }} />
              <button onClick={handleWallet} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "none", cursor: "pointer", background: "linear-gradient(135deg,#0066FF,#0044CC)", color: "#fff", fontWeight: 700, fontSize: 13 }}>
                {walletTab === "deposit" ? "Deposit via Airtel Money" : "Withdraw to Airtel Money"}
              </button>
            </div>
            <div style={card}>
              <div style={label as any}>Transaction History</div>
              {transactions.length === 0 && <div style={{ color: "#4A6FA5", fontSize: 12, padding: 20, textAlign: "center" }}>No transactions yet</div>}
              {transactions.map((tx, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: "1px solid #0D1B2A" }}>
                  <div>
                    <div style={{ color: "#C4D9F0", fontSize: 12, fontWeight: 600, textTransform: "capitalize" }}>{tx.type}</div>
                    <div style={{ color: "#4A6FA5", fontSize: 10 }}>{tx.airtel_ref} · {tx.date?.slice(0, 10)}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ color: tx.type === "deposit" || tx.type === "profit" ? "#00D4A8" : "#FF4444", fontWeight: 700, fontFamily: "monospace", fontSize: 12 }}>
                      {tx.type === "deposit" || tx.type === "profit" ? "+" : "-"}${Math.abs(tx.amount).toFixed(2)}
                    </div>
                    <div style={{ color: tx.status === "completed" ? "#00D4A8" : "#FFB800", fontSize: 10 }}>{tx.status}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── SETTINGS ── */}
        {screen === "settings" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, animation: "fadeIn 0.3s ease" }}>
            {[
              { title: "👤 Account", items: [
                { label: "Name",   val: user?.name || "—" },
                { label: "Email",  val: user?.email || "—" },
                { label: "Role",   val: user?.role || "user" },
                { label: "KYC",    val: user?.kyc_status || "pending", color: "#FFB800" },
                { label: "Verified", val: user?.is_verified ? "✅ Yes" : "❌ No", color: user?.is_verified ? "#00D4A8" : "#FF4444" },
              ]},
              { title: "🔐 Security", items: [
                { label: "Password",    val: "bcrypt hashed",     color: "#00D4A8" },
                { label: "2FA",         val: "Enable in account settings" },
                { label: "JWT Tokens",  val: "1hr access / 30d refresh", color: "#0066FF" },
                { label: "API Encryption", val: "AES-256",        color: "#00D4A8" },
                { label: "Session",     val: "Secure, HttpOnly" },
              ]},
              { title: "⚙️ Trading", items: [
                { label: "Mode",          val: mode.charAt(0).toUpperCase() + mode.slice(1) },
                { label: "Auto Trade",    val: autoTrade ? "Enabled" : "Disabled", color: autoTrade ? "#00D4A8" : "#4A6FA5" },
                { label: "Threshold",     val: `${threshold}%`,  color: "#0066FF" },
                { label: "Max Risk",      val: "2% per trade" },
                { label: "MT5 Status",    val: "Simulation mode (ChromeOS)", color: "#FFB800" },
              ]},
              { title: "🤖 AI Model", items: [
                { label: "Version",       val: "APEX-v3.2" },
                { label: "LSTM",          val: "Statistical fallback active", color: "#FFB800" },
                { label: "Indicators",    val: "RSI, MACD, BB, ATR, Stoch" },
                { label: "SMC Engine",    val: "OB, FVG, BOS, OTE ✅", color: "#00D4A8" },
                { label: "Retrain",       val: "Auto if win rate < 80%" },
              ]},
            ].map(({ title, items }) => (
              <div key={title} style={card}>
                <div style={{ color: "#7A9CC6", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>{title}</div>
                {items.map(({ label: l, val, color }: any) => (
                  <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #0D1B2A", fontSize: 12 }}>
                    <span style={{ color: "#4A6FA5" }}>{l}</span>
                    <span style={{ color: color || "#C4D9F0", fontFamily: "monospace", fontWeight: 600 }}>{val}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ background: "rgba(13,27,42,0.8)", borderTop: "1px solid #1A2744", padding: "6px 16px", display: "flex", justifyContent: "space-between", fontSize: 10, color: "#4A6FA5" }}>
        <span>⚡ APEX AI v3.2 · {user?.email}</span>
        <span style={{ color: connected ? "#00D4A8" : "#FF4444" }}>{connected ? "🟢 Live data connected" : "🔴 Connecting..."}</span>
        <span>🔒 Secured · MT5 Bridge · Airtel Money</span>
      </div>
    </div>
  );
}
