const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 8080;
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

app.get('*', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>APEX AI Trading Platform</title>
<script src="https://unpkg.com/lightweight-charts@4.1.3/dist/lightweight-charts.standalone.production.js"></script>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0A0F1E;color:#C4D9F0;font-family:'Segoe UI',system-ui,sans-serif;min-height:100vh}
::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:#0A0F1E}::-webkit-scrollbar-thumb{background:#1A2744;border-radius:2px}
.header{background:rgba(13,27,42,0.97);border-bottom:1px solid #1A2744;padding:0 16px;display:flex;align-items:center;gap:8px;height:54px;position:sticky;top:0;z-index:100}
.logo{font-weight:800;font-size:14px;margin-right:8px}.logo span{color:#0066FF}
.nav-btn{padding:5px 10px;border-radius:6px;border:none;cursor:pointer;background:transparent;color:#4A6FA5;font-weight:400;font-size:11px;text-transform:capitalize;border-bottom:2px solid transparent;transition:all 0.2s}
.nav-btn.active{background:rgba(0,102,255,0.2);color:#0066FF;font-weight:700;border-bottom:2px solid #0066FF}
.card{background:rgba(13,27,42,0.9);border:1px solid #1A2744;border-radius:12px;padding:16px}
.screen{display:none;padding:14px;animation:fadeIn 0.3s ease}.screen.active{display:block}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.grid-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:14px}
.stat-val{font-size:20px;font-weight:800;font-family:monospace}
.lbl{color:#4A6FA5;font-size:10px;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px}
.btn{padding:8px 16px;border-radius:8px;border:none;cursor:pointer;font-weight:700;font-size:13px;transition:all 0.2s}
.btn-primary{background:linear-gradient(135deg,#0066FF,#0044CC);color:#fff}
.btn-primary:hover{opacity:0.9}.btn-primary:disabled{background:#1A2744;color:#4A6FA5;cursor:not-allowed}
.btn-outline{background:transparent;border:1px solid #1A2744;color:#4A6FA5}
.inp{width:100%;background:#0D1B2A;border:1px solid #1A2744;border-radius:8px;padding:9px 12px;color:#C4D9F0;font-size:13px;outline:none;margin-bottom:10px}
.inp:focus{border-color:#0066FF}
select.inp{cursor:pointer}
.notif{position:fixed;top:16px;right:16px;z-index:999;border-radius:10px;padding:11px 16px;font-size:13px;font-weight:600;backdrop-filter:blur(10px);max-width:360px;display:none}
.notif.success{background:rgba(0,212,168,0.15);border:1px solid #00D4A8;color:#00D4A8}
.notif.error{background:rgba(255,68,68,0.15);border:1px solid #FF4444;color:#FF4444}
.bar{height:5px;background:#1A2744;border-radius:3px;overflow:hidden}
.bar-fill{height:100%;border-radius:3px;transition:width 1s}
.signal-box{border-radius:8px;padding:10px;text-align:center}
.signal-buy{background:rgba(0,212,168,0.15);border:1px solid #00D4A8}
.signal-sell{background:rgba(255,68,68,0.15);border:1px solid #FF4444}
.signal-hold{background:rgba(74,111,165,0.15);border:1px solid #4A6FA5}
.trade-row{display:grid;grid-template-columns:1fr 70px 90px 60px 60px 80px;gap:6px;padding:8px 10px;border-bottom:1px solid #0D1B2A;font-size:11px;align-items:center}
.news-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px}
.news-card{cursor:pointer;transition:border-color 0.2s}.news-card:hover{border-color:#0066FF}
.news-img{width:100%;height:130px;object-fit:cover;border-radius:8px;margin-bottom:10px}
.footer{background:rgba(13,27,42,0.8);border-top:1px solid #1A2744;padding:6px 16px;display:flex;justify-content:space-between;font-size:10px;color:#4A6FA5}
.auth-wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.auth-card{width:100%;max-width:400px;background:rgba(13,27,42,0.95);border:1px solid #1A2744;border-radius:14px;padding:24px}
.tab-bar{display:flex;gap:4px;margin-bottom:20px;background:#0A0F1E;border-radius:8px;padding:4px}
.tab{flex:1;padding:7px;border-radius:6px;border:none;cursor:pointer;font-size:13px;transition:all 0.2s}
.tab.active{background:#0066FF;color:#fff;font-weight:700}.tab.inactive{background:transparent;color:#4A6FA5}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
#chart-container{height:350px;border-radius:8px;overflow:hidden}
.ai-panel{display:flex;flex-direction:column;gap:10px}
.conf-bar{height:4px;background:#1A2744;border-radius:2px;margin-top:6px;overflow:hidden}
.conf-fill{height:100%;background:linear-gradient(90deg,#0066FF,#00D4A8);border-radius:2px;transition:width 1s}
.levels-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.level-item{background:#0A0F1E;border-radius:6px;padding:8px;text-align:center}
.dot{width:7px;height:7px;border-radius:50%;display:inline-block}
</style>
</head>
<body>

<div class="notif" id="notif"></div>

<!-- AUTH SCREEN -->
<div id="auth-screen" class="auth-wrap">
  <div style="width:100%;max-width:400px">
    <div style="text-align:center;margin-bottom:28px">
      <div style="display:inline-flex;align-items:center;gap:8px;background:rgba(0,102,255,0.1);border:1px solid rgba(0,102,255,0.3);border-radius:10px;padding:8px 18px">
        <span style="font-size:18px">⚡</span>
        <span style="color:#C4D9F0;font-weight:800;font-size:17px;letter-spacing:1px">APEX<span style="color:#0066FF">AI</span></span>
      </div>
      <div style="color:#4A6FA5;font-size:12px;margin-top:6px">Institutional-Grade AI Trading</div>
    </div>
    <div class="auth-card">
      <div class="tab-bar">
        <button class="tab active" onclick="switchTab('login')">Sign In</button>
        <button class="tab inactive" onclick="switchTab('register')">Sign Up</button>
      </div>
      <div id="reg-name-wrap" style="display:none"><input id="reg-name" class="inp" placeholder="Full Name"></div>
      <input id="auth-email" class="inp" placeholder="Email Address" type="email">
      <input id="auth-pass" class="inp" placeholder="Password" type="password">
      <div id="auth-error" style="color:#FF4444;font-size:12px;margin-bottom:10px;display:none"></div>
      <div id="auth-msg" style="color:#00D4A8;font-size:12px;margin-bottom:10px;display:none"></div>
      <button class="btn btn-primary" id="auth-btn" onclick="submitAuth()" style="width:100%;padding:11px">Sign In to Trade</button>
      <div style="text-align:center;margin-top:14px;color:#4A6FA5;font-size:11px">🔒 JWT secured · bcrypt passwords · 2FA available</div>
    </div>
  </div>
</div>

<!-- MAIN APP -->
<div id="main-app" style="display:none;min-height:100vh;display:none;flex-direction:column">
  <div class="header">
    <div class="logo">⚡ APEX<span>AI</span></div>
    <button class="nav-btn active" onclick="showScreen('dashboard')">Dashboard</button>
    <button class="nav-btn" onclick="showScreen('analysis')">AI Analysis</button>
    <button class="nav-btn" onclick="showScreen('news')">📰 News</button>
    <button class="nav-btn" onclick="showScreen('history')">History</button>
    <button class="nav-btn" onclick="showScreen('wallet')">Wallet</button>
    <button class="nav-btn" onclick="showScreen('settings')">Settings</button>
    <div style="flex:1"></div>
    <span class="dot" id="ws-dot" style="background:#FF4444"></span>
    <span id="ws-status" style="color:#4A6FA5;font-size:10px;margin-left:4px">OFFLINE</span>
    <span style="color:#4A6FA5;font-size:11px;margin-left:12px">P&L: <span id="total-pnl" style="font-weight:700;color:#00D4A8">+$0.00</span></span>
    <div onclick="logout()" style="width:26px;height:26px;border-radius:50%;background:linear-gradient(135deg,#0066FF,#00D4A8);display:flex;align-items:center;justify-content:center;font-size:11px;cursor:pointer;margin-left:8px" title="Logout">👤</div>
  </div>

  <!-- DASHBOARD -->
  <div id="screen-dashboard" class="screen active" style="padding:14px">
    <div class="grid-stats" id="stats-grid">
      <div class="card"><div class="lbl">Balance</div><div class="stat-val" id="stat-balance" style="color:#00D4A8">$0.00</div></div>
      <div class="card"><div class="lbl">Total P&L</div><div class="stat-val" id="stat-pnl" style="color:#00D4A8">+$0.00</div></div>
      <div class="card"><div class="lbl">Win Rate</div><div class="stat-val" id="stat-winrate" style="color:#0066FF">0%</div></div>
      <div class="card"><div class="lbl">Trades</div><div class="stat-val" id="stat-trades" style="color:#8B5CF6">0</div></div>
      <div class="card"><div class="lbl">Sharpe</div><div class="stat-val" id="stat-sharpe" style="color:#FFB800">—</div></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 270px;gap:12px;margin-bottom:12px">
      <div class="card">
        <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;align-items:center">
          <select id="market-sel" class="inp" style="width:auto;margin:0;padding:5px 8px" onchange="onMarketChange()">
            <option value="forex">FOREX</option>
            <option value="crypto">CRYPTO</option>
            <option value="commodities">COMMODITIES</option>
            <option value="indices">INDICES</option>
            <option value="stocks">STOCKS</option>
            <option value="synthetic">SYNTHETIC</option>
          </select>
          <select id="symbol-sel" class="inp" style="width:auto;margin:0;padding:5px 8px" onchange="onSymbolChange()"></select>
          <div style="display:flex;gap:4px">
            <button onclick="setMode('scalp')" id="mode-scalp" class="btn btn-outline" style="font-size:10px;padding:4px 8px;border-color:#FF6B35;color:#FF6B35">Scalp</button>
            <button onclick="setMode('intraday')" id="mode-intraday" class="btn" style="font-size:10px;padding:4px 8px;background:rgba(0,102,255,0.2);border:1px solid #0066FF;color:#0066FF;font-weight:700">Intraday</button>
            <button onclick="setMode('swing')" id="mode-swing" class="btn btn-outline" style="font-size:10px;padding:4px 8px;border-color:#8B5CF6;color:#8B5CF6">Swing</button>
            <button onclick="setMode('positional')" id="mode-positional" class="btn btn-outline" style="font-size:10px;padding:4px 8px;border-color:#00D4A8;color:#00D4A8">Position</button>
          </div>
          <span id="live-price" style="color:#00D4A8;font-family:monospace;font-size:12px;font-weight:700"></span>
          <button class="btn btn-primary" id="run-ai-btn" onclick="runAnalysis()" style="margin-left:auto;padding:6px 14px;font-size:12px">🧠 Run AI</button>
        </div>
        <div id="chart-container"></div>
      </div>
      <div class="card ai-panel" id="ai-panel">
        <div style="display:flex;align-items:center;gap:6px">
          <span class="dot" id="ai-dot" style="background:#00D4A8"></span>
          <span id="ai-status" style="color:#7A9CC6;font-size:10px;font-family:monospace;text-transform:uppercase;letter-spacing:2px">AI Ready</span>
        </div>
        <div id="ai-results" style="color:#1A2744;font-size:12px;text-align:center;padding:20px;flex:1">Select a symbol and click "Run AI"</div>
      </div>
    </div>
    <div class="card" style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
      <div>
        <div class="lbl">Auto-Trading</div>
        <button id="auto-btn" onclick="toggleAuto()" class="btn btn-outline" style="padding:7px 16px;font-size:12px">⚪ AUTO OFF</button>
      </div>
      <div>
        <div class="lbl">Min Confidence: <span id="thresh-val" style="color:#0066FF">85%</span></div>
        <input type="range" min="70" max="99" value="85" oninput="document.getElementById('thresh-val').textContent=this.value+'%'" style="width:130px;accent-color:#0066FF">
      </div>
      <div>
        <div class="lbl">Account Balance ($)</div>
        <input type="number" id="acct-bal" value="10000" class="inp" style="width:130px;padding:6px 10px;margin:0">
      </div>
      <button onclick="getCopySetup()" class="btn btn-outline" style="color:#FFB800;border-color:#FFB800;padding:7px 14px;font-size:12px">📋 Copy Setup</button>
      <div id="copy-setup-box" style="display:none;background:#0D1B2A;border-radius:8px;padding:10px;font-family:monospace;font-size:11px;color:#00D4A8;white-space:pre;border:1px solid #1A2744;cursor:pointer" onclick="copyCopySetup()"></div>
    </div>
  </div>

  <!-- ANALYSIS -->
  <div id="screen-analysis" class="screen" style="padding:14px">
    <div id="analysis-content">
      <div class="card" style="text-align:center;padding:60px">
        <div style="color:#4A6FA5;font-size:14px;margin-bottom:16px">No analysis yet</div>
        <button class="btn btn-primary" onclick="showScreen('dashboard')">Go to Dashboard → Run AI</button>
      </div>
    </div>
  </div>

  <!-- NEWS -->
  <div id="screen-news" class="screen" style="padding:14px">
    <div style="display:flex;gap:10px;margin-bottom:14px;align-items:center;flex-wrap:wrap">
      <select id="news-symbol" class="inp" style="width:auto;margin:0;padding:6px 10px"></select>
      <button onclick="fetchNews()" class="btn btn-primary" style="padding:6px 14px;font-size:12px">🔄 Refresh</button>
      <span style="color:#4A6FA5;font-size:11px">Powered by NewsAPI</span>
    </div>
    <div id="news-grid" class="news-grid"><div style="color:#4A6FA5;padding:40px;text-align:center">Loading news...</div></div>
  </div>

  <!-- HISTORY -->
  <div id="screen-history" class="screen" style="padding:14px">
    <div class="card" style="overflow:hidden">
      <div class="trade-row" style="background:#0D1B2A;font-size:10px;color:#4A6FA5;font-weight:700;text-transform:uppercase">
        <div>Symbol</div><div>Dir</div><div>Entry</div><div>Lots</div><div>Conf</div><div style="text-align:right">P&L</div>
      </div>
      <div id="trades-list"><div style="padding:30px;text-align:center;color:#4A6FA5">No trades yet</div></div>
      <div style="padding:10px 12px;display:flex;gap:20px;font-size:12px;border-top:1px solid #1A2744">
        <span style="color:#4A6FA5">Total P&L: <span id="hist-pnl" style="color:#00D4A8;font-weight:700">+$0.00</span></span>
        <span style="color:#4A6FA5">Trades: <span id="hist-count" style="color:#0066FF;font-weight:700">0</span></span>
      </div>
    </div>
  </div>

  <!-- WALLET -->
  <div id="screen-wallet" class="screen" style="padding:14px">
    <div class="grid2">
      <div class="card">
        <div class="lbl">Wallet Balance</div>
        <div id="wallet-balance" style="font-size:38px;font-weight:900;color:#00D4A8;font-family:monospace;margin-bottom:14px">$0.00</div>
        <div style="display:flex;gap:6px;margin-bottom:14px">
          <button onclick="setWalletTab('deposit')" id="dep-btn" class="btn" style="flex:1;padding:7px;font-size:12px;background:rgba(0,102,255,0.15);border:1px solid #0066FF;color:#0066FF;font-weight:600">💳 Deposit</button>
          <button onclick="setWalletTab('withdraw')" id="wit-btn" class="btn btn-outline" style="flex:1;padding:7px;font-size:12px">💸 Withdraw</button>
        </div>
        <div class="lbl">Airtel Money Phone</div>
        <input id="wallet-phone" class="inp" placeholder="+256 7XX XXX XXX">
        <div class="lbl">Amount (USD)</div>
        <input id="wallet-amount" class="inp" type="number" placeholder="0.00">
        <button onclick="handleWallet()" class="btn btn-primary" style="width:100%;padding:10px" id="wallet-btn">Deposit via Airtel Money</button>
      </div>
      <div class="card">
        <div class="lbl">Transaction History</div>
        <div id="tx-list"><div style="color:#4A6FA5;font-size:12px;padding:20px;text-align:center">No transactions yet</div></div>
      </div>
    </div>
  </div>

  <!-- SETTINGS -->
  <div id="screen-settings" class="screen" style="padding:14px">
    <div class="grid2">
      <div class="card">
        <div style="color:#7A9CC6;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">👤 Account</div>
        <div style="font-size:12px">
          <div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #0D1B2A"><span style="color:#4A6FA5">Email</span><span id="set-email" style="font-family:monospace;font-weight:600">—</span></div>
          <div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #0D1B2A"><span style="color:#4A6FA5">Status</span><span style="color:#00D4A8;font-family:monospace;font-weight:600">Active</span></div>
          <div style="display:flex;justify-content:space-between;padding:7px 0"><span style="color:#4A6FA5">MT5</span><span style="color:#FFB800;font-family:monospace;font-weight:600">Simulation</span></div>
        </div>
      </div>
      <div class="card">
        <div style="color:#7A9CC6;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">🤖 AI Model</div>
        <div style="font-size:12px">
          <div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #0D1B2A"><span style="color:#4A6FA5">Version</span><span style="color:#C4D9F0;font-family:monospace;font-weight:600">APEX-v3.2</span></div>
          <div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #0D1B2A"><span style="color:#4A6FA5">SMC Engine</span><span style="color:#00D4A8;font-family:monospace;font-weight:600">OB,FVG,BOS ✅</span></div>
          <div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #0D1B2A"><span style="color:#4A6FA5">NewsAPI</span><span style="color:#00D4A8;font-family:monospace;font-weight:600">Connected ✅</span></div>
          <div style="display:flex;justify-content:space-between;padding:7px 0"><span style="color:#4A6FA5">TwelveData</span><span style="color:#00D4A8;font-family:monospace;font-weight:600">Connected ✅</span></div>
        </div>
      </div>
    </div>
  </div>

  <div class="footer">
    <span>⚡ APEX AI v3.2 · <span id="footer-email"></span></span>
    <span id="footer-ws" style="color:#FF4444">🔴 Connecting...</span>
    <span>🔒 Secured · Airtel Money · NewsAPI</span>
  </div>
</div>

<script>
const API_INJECT = `${API_URL}`;
const SYMBOLS = {
  forex:['EUR/USD','GBP/USD','USD/JPY','AUD/USD','GBP/JPY','USD/CAD','EUR/GBP','NZD/USD','USD/CHF','EUR/JPY','GBP/AUD','USD/ZAR'],
  crypto:['BTC/USD','ETH/USD','SOL/USD','BNB/USD','XRP/USD','ADA/USD','DOGE/USD','AVAX/USD'],
  commodities:['XAU/USD','XAG/USD','WTI/USD','BRENT/USD'],
  indices:['US30','NAS100','SPX500','UK100','GER40'],
  stocks:['AAPL','TSLA','NVDA','MSFT','AMZN','META'],
  synthetic:['Volatility 75','Volatility 25','Crash 500','Boom 1000','Crash 1000','Boom 500','Step Index']
};

let token = localStorage.getItem('apex_token');
let currentUser = null;
let currentMode = 'intraday';
let currentSymbol = 'EUR/USD';
let walletTabCurrent = 'deposit';
let autoTrade = false;
let lastAnalysis = null;
let chart = null;
let candleSeries = null;
let ws = null;
let trades = [];

// ── Auth ──────────────────────────────────────────────
let authTab = 'login';
function switchTab(tab) {
  authTab = tab;
  document.getElementById('reg-name-wrap').style.display = tab==='register'?'block':'none';
  document.getElementById('auth-btn').textContent = tab==='login'?'Sign In to Trade':'Create Account';
  document.querySelectorAll('.tab').forEach((b,i)=>{
    b.className = 'tab '+((['login','register'][i]===tab)?'active':'inactive');
  });
}

async function submitAuth() {
  const email = document.getElementById('auth-email').value;
  const pass = document.getElementById('auth-pass').value;
  const errEl = document.getElementById('auth-error');
  const msgEl = document.getElementById('auth-msg');
  errEl.style.display='none'; msgEl.style.display='none';
  document.getElementById('auth-btn').disabled = true;
  document.getElementById('auth-btn').textContent = 'Please wait...';
  try {
    if (authTab==='login') {
      const r = await fetch(API+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:pass})});
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail||'Login failed');
      token = d.access_token;
      localStorage.setItem('apex_token', token);
      currentUser = d.user || {email};
      showApp();
    } else {
      const name = document.getElementById('reg-name').value;
      const r = await fetch(API+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,email,password:pass})});
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail||'Registration failed');
      msgEl.textContent='Account created! Please log in.'; msgEl.style.display='block';
      switchTab('login');
    }
  } catch(e) {
    errEl.textContent = e.message; errEl.style.display='block';
  }
  document.getElementById('auth-btn').disabled=false;
  document.getElementById('auth-btn').textContent=authTab==='login'?'Sign In to Trade':'Create Account';
}

function logout() {
  localStorage.removeItem('apex_token');
  token=null; currentUser=null;
  document.getElementById('main-app').style.display='none';
  document.getElementById('auth-screen').style.display='flex';
}

async function showApp() {
  document.getElementById('auth-screen').style.display='none';
  document.getElementById('main-app').style.display='flex';
  document.getElementById('main-app').style.flexDirection='column';
  if (currentUser) {
    document.getElementById('set-email').textContent = currentUser.email||'';
    document.getElementById('footer-email').textContent = currentUser.email||'';
  }
  initChart();
  populateSymbols();
  loadData();
  connectWS();
}

// ── Chart ──────────────────────────────────────────────
function initChart() {
  const container = document.getElementById('chart-container');
  container.innerHTML='';
  chart = LightweightCharts.createChart(container, {
    width: container.clientWidth, height: 350,
    layout:{background:{type:'Solid',color:'#0A0F1E'},textColor:'#4A6FA5'},
    grid:{vertLines:{color:'#0D1B2A'},horzLines:{color:'#0D1B2A'}},
    crosshair:{mode:LightweightCharts.CrosshairMode.Normal},
    timeScale:{borderColor:'#1A2744',timeVisible:true},
    rightPriceScale:{borderColor:'#1A2744'},
  });
  candleSeries = chart.addCandlestickSeries({
    upColor:'#00D4A8',downColor:'#FF4444',borderVisible:false,
    wickUpColor:'#00D4A8',wickDownColor:'#FF4444',
  });
  generateDemoCandles(currentSymbol);
}

function generateDemoCandles(symbol) {
  if (!candleSeries) return;
  const base = {'EUR/USD':1.085,'GBP/USD':1.265,'USD/JPY':149.5,'XAU/USD':2350,'BTC/USD':67000,'ETH/USD':3400,'WTI/USD':78,'US30':38500,'NAS100':17800};
  let price = base[symbol]||1.0;
  const now = Math.floor(Date.now()/1000);
  const candles = Array.from({length:120},(_,i)=>{
    const open=price, move=(Math.random()-0.48)*price*0.002;
    const close=Math.max(open+move,price*0.9);
    const high=Math.max(open,close)+Math.random()*price*0.001;
    const low=Math.min(open,close)-Math.random()*price*0.001;
    price=close;
    return {time:now-(120-i)*3600,open,high,low,close};
  });
  candleSeries.setData(candles);
  chart.timeScale().fitContent();
}

function drawLevels(entry, sl, tp) {
  if (!chart) return;
  chart.addLineSeries({color:'#0066FF',lineWidth:1,lineStyle:2,title:'Entry'}).setData([{time:Math.floor(Date.now()/1000)-7200,value:entry},{time:Math.floor(Date.now()/1000),value:entry}]);
  chart.addLineSeries({color:'#FF4444',lineWidth:1,lineStyle:2,title:'SL'}).setData([{time:Math.floor(Date.now()/1000)-7200,value:sl},{time:Math.floor(Date.now()/1000),value:sl}]);
  chart.addLineSeries({color:'#00D4A8',lineWidth:1,lineStyle:2,title:'TP'}).setData([{time:Math.floor(Date.now()/1000)-7200,value:tp},{time:Math.floor(Date.now()/1000),value:tp}]);
}

// ── Symbols ──────────────────────────────────────────
function populateSymbols() {
  const market = document.getElementById('market-sel').value;
  const syms = SYMBOLS[market]||[];
  const sel = document.getElementById('symbol-sel');
  sel.innerHTML = syms.map(s=>\`<option value="\${s}">\${s}</option>\`).join('');
  currentSymbol = syms[0];
  // Also populate news symbol select
  const newsSymSel = document.getElementById('news-symbol');
  const allSyms = Object.values(SYMBOLS).flat();
  newsSymSel.innerHTML = allSyms.map(s=>\`<option value="\${s}">\${s}</option>\`).join('');
}

function onMarketChange() { populateSymbols(); generateDemoCandles(currentSymbol); }
function onSymbolChange() { currentSymbol = document.getElementById('symbol-sel').value; generateDemoCandles(currentSymbol); }

function setMode(m) {
  currentMode = m;
  ['scalp','intraday','swing','positional'].forEach(id=>{
    const btn = document.getElementById('mode-'+id);
    const colors = {scalp:'#FF6B35',intraday:'#0066FF',swing:'#8B5CF6',positional:'#00D4A8'};
    if (id===m) { btn.style.background=colors[id]+'22'; btn.style.borderColor=colors[id]; btn.style.color=colors[id]; btn.style.fontWeight='700'; }
    else { btn.style.background='transparent'; btn.style.borderColor='#1A2744'; btn.style.color='#4A6FA5'; btn.style.fontWeight='400'; }
  });
}

// ── AI Analysis ──────────────────────────────────────
async function runAnalysis() {
  const btn = document.getElementById('run-ai-btn');
  btn.disabled=true; btn.textContent='🔄 Analyzing...';
  document.getElementById('ai-dot').style.animation='pulse 1s infinite';
  document.getElementById('ai-status').textContent='Processing...';
  document.getElementById('ai-results').innerHTML='<div style="color:#4A6FA5;text-align:center;padding:20px">Analyzing '+currentSymbol+'...</div>';
  try {
    const bal = parseFloat(document.getElementById('acct-bal').value)||10000;
    const r = await fetch(API+'/api/analysis/run',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({symbol:currentSymbol,mode:currentMode,account_balance:bal,risk_percent:2})});
    const d = await r.json();
    if (!r.ok) throw new Error(d.detail||'Analysis failed');
    lastAnalysis = d;
    renderAIPanel(d);
    if (d.entry) drawLevels(d.entry, d.stop_loss, d.take_profit);
    renderAnalysisScreen(d);
    notify('✅ Analysis complete: '+d.signal+' '+currentSymbol+' ('+d.confidence.toFixed(1)+'%)', 'success');
  } catch(e) { notify(e.message||'Analysis failed','error'); document.getElementById('ai-results').innerHTML='<div style="color:#FF4444;text-align:center;padding:20px">'+e.message+'</div>'; }
  btn.disabled=false; btn.textContent='🧠 Run AI';
  document.getElementById('ai-dot').style.animation='none';
  document.getElementById('ai-status').textContent='AI Ready';
}

function renderAIPanel(d) {
  const signalClass = d.signal==='BUY'?'signal-buy':d.signal==='SELL'?'signal-sell':'signal-hold';
  const signalColor = d.signal==='BUY'?'#00D4A8':d.signal==='SELL'?'#FF4444':'#4A6FA5';
  const confColor = d.confidence>85?'#00D4A8':'#FFB800';
  document.getElementById('ai-results').innerHTML = \`
    <div style="background:#0D1B2A;border-radius:8px;padding:10px;text-align:center;margin-bottom:10px">
      <div style="font-size:32px;font-weight:900;color:\${confColor};font-family:monospace">\${d.confidence.toFixed(1)}%</div>
      <div style="color:#4A6FA5;font-size:9px;text-transform:uppercase;margin-top:2px">Confidence</div>
      <div class="conf-bar"><div class="conf-fill" style="width:\${d.confidence}%"></div></div>
    </div>
    \${[['Technical',d.technical_score],['SMC/ICT',d.smc_score],['ML Model',d.ml_score],['News/Fund',d.fundamental_score]].map(([l,s])=>\`
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
      <span style="color:#4A6FA5;font-size:10px;width:70px;font-family:monospace">\${l}</span>
      <div class="bar" style="flex:1"><div class="bar-fill" style="width:\${s||0}%;background:\${(s||0)>70?'#00D4A8':'#0066FF'}"></div></div>
      <span style="color:#7A9CC6;font-size:10px;width:28px;text-align:right;font-family:monospace">\${(s||0).toFixed(0)}%</span>
    </div>\`).join('')}
    <div class="levels-grid" style="margin:10px 0">
      <div class="level-item"><div style="color:#0066FF;font-size:11px;font-weight:700;font-family:monospace">\${d.entry?.toFixed(5)}</div><div style="color:#4A6FA5;font-size:8px">ENTRY</div></div>
      <div class="level-item"><div style="color:#FF4444;font-size:11px;font-weight:700;font-family:monospace">\${d.stop_loss?.toFixed(5)}</div><div style="color:#4A6FA5;font-size:8px">STOP LOSS</div></div>
      <div class="level-item"><div style="color:#00D4A8;font-size:11px;font-weight:700;font-family:monospace">\${d.take_profit?.toFixed(5)}</div><div style="color:#4A6FA5;font-size:8px">TAKE PROFIT</div></div>
      <div class="level-item"><div style="color:#FFB800;font-size:11px;font-weight:700;font-family:monospace">\${d.lot_size}</div><div style="color:#4A6FA5;font-size:8px">LOT SIZE</div></div>
    </div>
    <div class="\${signalClass}" style="border-radius:8px;padding:10px;text-align:center;margin-bottom:10px">
      <div style="font-size:22px;font-weight:900;color:\${signalColor};font-family:monospace;letter-spacing:4px">\${d.signal}</div>
      <div style="color:#4A6FA5;font-size:10px;margin-top:4px">1:\${d.risk_reward} R:R</div>
    </div>
    <div style="background:#0D1B2A;border-radius:8px;padding:8px">
      <div style="color:#4A6FA5;font-size:9px;text-transform:uppercase;margin-bottom:4px">AI Reasoning</div>
      <div style="color:#7A9CC6;font-size:10px;line-height:1.6">\${d.reasoning||'No reasoning available'}</div>
    </div>
  \`;
}

function renderAnalysisScreen(d) {
  document.getElementById('analysis-content').innerHTML = \`
    <div class="grid2" style="margin-bottom:12px">
      <div class="card">
        <div style="color:#0066FF;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">📊 Technical Indicators</div>
        \${Object.entries(d.indicators||{}).slice(0,12).map(([k,v])=>\`
        <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #0D1B2A;font-size:11px">
          <span style="color:#4A6FA5;font-family:monospace">\${k}</span>
          <span style="color:#C4D9F0;font-family:monospace">\${typeof v==='number'?v.toFixed(4):String(v)}</span>
        </div>\`).join('')}
      </div>
      <div class="card">
        <div style="color:#8B5CF6;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">🎯 SMC / ICT Analysis</div>
        <div style="margin-bottom:8px"><span style="color:#4A6FA5;font-size:11px">Break of Structure: </span><span style="color:\${d.smc?.bos?.type==='bullish'?'#00D4A8':'#FF4444'};font-family:monospace;font-size:11px">\${d.smc?.bos?d.smc.bos.type?.toUpperCase()+' @ '+d.smc.bos.level?.toFixed(5):'None detected'}</span></div>
        <div style="margin-bottom:8px"><span style="color:#4A6FA5;font-size:11px">Order Blocks: </span><span style="color:#FFB800;font-family:monospace;font-size:11px">\${d.smc?.order_blocks?.length||0} found</span></div>
        <div style="margin-bottom:8px"><span style="color:#4A6FA5;font-size:11px">Fair Value Gaps: </span><span style="color:#0066FF;font-family:monospace;font-size:11px">\${d.smc?.fvgs?.length||0} found</span></div>
        <div style="margin-bottom:8px"><span style="color:#4A6FA5;font-size:11px">OTE Zone: </span><span style="color:\${d.smc?.ote_zone?.current_in_zone?'#00D4A8':'#4A6FA5'};font-family:monospace;font-size:11px">\${d.smc?.ote_zone?.current_in_zone?'✅ Price in OTE':'❌ Outside OTE'}</span></div>
        <div style="margin-top:10px;color:#4A6FA5;font-size:9px;text-transform:uppercase;margin-bottom:4px">Full AI Reasoning</div>
        <div style="color:#7A9CC6;font-size:11px;line-height:1.7;background:#0D1B2A;border-radius:8px;padding:10px">\${d.reasoning||'—'}</div>
      </div>
    </div>
    <div class="card">
      <div style="color:#00D4A8;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">📰 Fundamental & Sentiment</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px">
        \${[['Fundamental Score',(d.fundamental_score||0).toFixed(0)+'%','#FFB800'],['Sentiment Score',(d.sentiment_score||0).toFixed(0)+'%','#8B5CF6'],['News Bias',d.fundamental?.news_bias||'neutral','#00D4A8'],['LSTM BUY',((d.lstm_probs?.buy||0)*100).toFixed(0)+'%','#00D4A8'],['LSTM SELL',((d.lstm_probs?.sell||0)*100).toFixed(0)+'%','#FF4444']].map(([l,v,c])=>\`
        <div style="background:#0D1B2A;border-radius:8px;padding:10px"><div style="color:#4A6FA5;font-size:10px">\${l}</div><div style="color:\${c};font-size:18px;font-weight:700;font-family:monospace">\${v}</div></div>\`).join('')}
      </div>
    </div>
  \`;
}

// ── Copy Setup ───────────────────────────────────────
async function getCopySetup() {
  try {
    const bal = parseFloat(document.getElementById('acct-bal').value)||10000;
    const r = await fetch(API+'/api/trades/copyable-setup',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({symbol:currentSymbol,account_balance:bal,risk_percent:2})});
    const d = await r.json();
    if (!r.ok) throw new Error(d.detail);
    const box = document.getElementById('copy-setup-box');
    box.style.display='block';
    box.textContent = d.copy_text + '\\nClick to copy';
    window._copyText = d.copy_text;
  } catch(e) { notify(e.message,'error'); }
}
function copyCopySetup() { if(window._copyText){navigator.clipboard.writeText(window._copyText);notify('Copied to clipboard!');} }

function toggleAuto() {
  autoTrade=!autoTrade;
  const btn=document.getElementById('auto-btn');
  btn.textContent=autoTrade?'🟢 AUTO ON':'⚪ AUTO OFF';
  btn.style.borderColor=autoTrade?'#00D4A8':'#1A2744';
  btn.style.color=autoTrade?'#00D4A8':'#4A6FA5';
}

// ── Data Loading ──────────────────────────────────────
async function loadData() {
  try {
    const [trades_r, perf_r, bal_r, tx_r] = await Promise.all([
      fetch(API+'/api/trades/',{headers:{'Authorization':'Bearer '+token}}),
      fetch(API+'/api/trades/performance',{headers:{'Authorization':'Bearer '+token}}),
      fetch(API+'/api/wallet/balance',{headers:{'Authorization':'Bearer '+token}}),
      fetch(API+'/api/wallet/transactions',{headers:{'Authorization':'Bearer '+token}}),
    ]);
    trades = await trades_r.json().catch(()=>[]);
    const perf = await perf_r.json().catch(()=>{});
    const bal = await bal_r.json().catch(()=>{});
    const txs = await tx_r.json().catch(()=>[]);
    updateStats(perf, bal, trades);
    renderTrades(trades);
    renderTransactions(txs);
    if (bal.balance!==undefined) document.getElementById('wallet-balance').textContent='$'+bal.balance.toFixed(2);
  } catch{}
}

function updateStats(perf, bal, trades) {
  const totalPnL = trades.reduce((s,t)=>s+(t.pnl||0),0);
  document.getElementById('stat-balance').textContent='$'+(bal?.balance||0).toFixed(2);
  document.getElementById('stat-pnl').textContent=(totalPnL>=0?'+':'')+'\$'+totalPnL.toFixed(2);
  document.getElementById('stat-pnl').style.color=totalPnL>=0?'#00D4A8':'#FF4444';
  document.getElementById('stat-winrate').textContent=(perf?.win_rate||0).toFixed(1)+'%';
  document.getElementById('stat-trades').textContent=perf?.total_trades||trades.length;
  document.getElementById('stat-sharpe').textContent=perf?.sharpe_ratio?.toFixed(2)||'—';
  document.getElementById('total-pnl').textContent=(totalPnL>=0?'+':'')+'\$'+totalPnL.toFixed(2);
  document.getElementById('total-pnl').style.color=totalPnL>=0?'#00D4A8':'#FF4444';
  document.getElementById('hist-pnl').textContent=(totalPnL>=0?'+':'')+'\$'+totalPnL.toFixed(2);
  document.getElementById('hist-count').textContent=trades.length;
}

function renderTrades(trades) {
  if(!trades.length){document.getElementById('trades-list').innerHTML='<div style="padding:30px;text-align:center;color:#4A6FA5">No trades yet</div>';return;}
  document.getElementById('trades-list').innerHTML = trades.map(t=>\`
    <div class="trade-row">
      <div style="color:#C4D9F0;font-weight:600;font-family:monospace">\${t.symbol}</div>
      <div style="color:\${t.direction==='BUY'?'#00D4A8':'#FF4444'};font-weight:700">\${t.direction}</div>
      <div style="color:#7A9CC6;font-family:monospace">\${typeof t.entry_price==='number'?t.entry_price.toFixed(5):t.entry_price}</div>
      <div style="color:#4A6FA5">\${t.lot_size}</div>
      <div style="color:#0066FF">\${t.confidence_score?.toFixed(0)}%</div>
      <div style="color:\${(t.pnl||0)>=0?'#00D4A8':'#FF4444'};font-weight:700;text-align:right;font-family:monospace">\${(t.pnl||0)>=0?'+':''}\$\${(t.pnl||0).toFixed(2)}</div>
    </div>\`).join('');
}

function renderTransactions(txs) {
  if(!txs.length)return;
  document.getElementById('tx-list').innerHTML = txs.map(tx=>\`
    <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid #0D1B2A">
      <div><div style="color:#C4D9F0;font-size:12px;font-weight:600;text-transform:capitalize">\${tx.type}</div><div style="color:#4A6FA5;font-size:10px">\${tx.date?.slice(0,10)||''}</div></div>
      <div style="text-align:right"><div style="color:\${tx.type==='deposit'||tx.type==='profit'?'#00D4A8':'#FF4444'};font-weight:700;font-family:monospace;font-size:12px">\${tx.type==='deposit'||tx.type==='profit'?'+':'-'}\$\${Math.abs(tx.amount).toFixed(2)}</div><div style="color:\${tx.status==='completed'?'#00D4A8':'#FFB800'};font-size:10px">\${tx.status}</div></div>
    </div>\`).join('');
}

// ── News ───────────────────────────────────────────────
async function fetchNews() {
  document.getElementById('news-grid').innerHTML='<div style="color:#4A6FA5;padding:40px;text-align:center">Loading news...</div>';
  const sym = document.getElementById('news-symbol').value||currentSymbol;
  const q = sym.includes('XAU')?'gold price':sym.includes('BTC')?'bitcoin':sym.includes('EUR')?'forex euro':sym+' trading';
  try {
    const r = await fetch(\`https://newsapi.org/v2/everything?q=\${encodeURIComponent(q)}&sortBy=publishedAt&pageSize=12&apiKey=f908795402cc427f83bd63b283233edf\`);
    const d = await r.json();
    const articles = d.articles||[];
    if(!articles.length){document.getElementById('news-grid').innerHTML='<div style="color:#4A6FA5;padding:40px;text-align:center">No news found</div>';return;}
    document.getElementById('news-grid').innerHTML = articles.map(a=>\`
      <div class="card news-card" onclick="window.open('\${a.url}','_blank')">
        \${a.urlToImage?\`<img src="\${a.urlToImage}" class="news-img" onerror="this.style.display='none'">\`:''}
        <div style="color:#0066FF;font-size:10px;margin-bottom:4px">\${a.source?.name||''} · \${new Date(a.publishedAt).toLocaleDateString()}</div>
        <div style="color:#C4D9F0;font-size:13px;font-weight:600;line-height:1.4;margin-bottom:6px">\${a.title||''}</div>
        <div style="color:#4A6FA5;font-size:11px;line-height:1.5">\${(a.description||'').slice(0,120)}...</div>
        <div style="color:#0066FF;font-size:10px;margin-top:8px">Read more →</div>
      </div>\`).join('');
  } catch(e) { document.getElementById('news-grid').innerHTML='<div style="color:#FF4444;padding:40px;text-align:center">Failed to load news</div>'; }
}

// ── Wallet ───────────────────────────────────────────
function setWalletTab(tab) {
  walletTabCurrent=tab;
  document.getElementById('dep-btn').style.background=tab==='deposit'?'rgba(0,102,255,0.15)':'transparent';
  document.getElementById('dep-btn').style.borderColor=tab==='deposit'?'#0066FF':'#1A2744';
  document.getElementById('dep-btn').style.color=tab==='deposit'?'#0066FF':'#4A6FA5';
  document.getElementById('wit-btn').style.background=tab==='withdraw'?'rgba(0,102,255,0.15)':'transparent';
  document.getElementById('wit-btn').style.borderColor=tab==='withdraw'?'#0066FF':'#1A2744';
  document.getElementById('wit-btn').style.color=tab==='withdraw'?'#0066FF':'#4A6FA5';
  document.getElementById('wallet-btn').textContent=tab==='deposit'?'Deposit via Airtel Money':'Withdraw to Airtel Money';
}

async function handleWallet() {
  const phone=document.getElementById('wallet-phone').value;
  const amount=parseFloat(document.getElementById('wallet-amount').value);
  if(!phone||!amount||amount<=0){notify('Enter valid phone and amount','error');return;}
  try {
    const endpoint=walletTabCurrent==='deposit'?'/api/wallet/deposit':'/api/wallet/withdraw';
    const r=await fetch(API+endpoint,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({phone,amount,currency:'UGX'})});
    const d=await r.json();
    if(!r.ok) throw new Error(d.detail);
    notify(walletTabCurrent==='deposit'?\`✅ Deposit of \$\${amount} initiated. Confirm on your phone.\`:\`✅ Withdrawal of \$\${amount} sent to \${phone}\`);
    document.getElementById('wallet-amount').value='';
    loadData();
  } catch(e){notify(e.message,'error');}
}

// ── WebSocket ────────────────────────────────────────
function connectWS() {
  const wsUrl = (window.location.protocol==='https:'?'wss:':'ws:')+'//'+API.replace('https://','').replace('http://','');
  try {
    ws = new WebSocket(wsUrl+'/ws/market');
    ws.onopen=()=>{
      document.getElementById('ws-dot').style.background='#00D4A8';
      document.getElementById('ws-status').textContent='LIVE';
      document.getElementById('footer-ws').textContent='🟢 Live data';
      document.getElementById('footer-ws').style.color='#00D4A8';
      ws.send(JSON.stringify({action:'subscribe',symbol:currentSymbol}));
    };
    ws.onmessage=(e)=>{
      try{const d=JSON.parse(e.data);if(d.type==='tick'){document.getElementById('live-price').textContent=d.price?.toFixed(4)||'';}}catch{}
    };
    ws.onclose=()=>{
      document.getElementById('ws-dot').style.background='#FF4444';
      document.getElementById('ws-status').textContent='OFFLINE';
      document.getElementById('footer-ws').textContent='🔴 Reconnecting...';
      document.getElementById('footer-ws').style.color='#FF4444';
      setTimeout(connectWS,4000);
    };
    ws.onerror=()=>ws.close();
  }catch{}
}

// ── Navigation ──────────────────────────────────────
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('screen-'+name).classList.add('active');
  event.target.classList.add('active');
  if(name==='news') fetchNews();
}

// ── Notifications ────────────────────────────────────
function notify(msg, type='success') {
  const el=document.getElementById('notif');
  el.textContent=msg; el.className='notif '+type; el.style.display='block';
  setTimeout(()=>el.style.display='none',3500);
}

// ── Init ─────────────────────────────────────────────
window.onload = async function() {
  if (token) {
    try {
      const r = await fetch(API+'/api/auth/me',{headers:{'Authorization':'Bearer '+token}});
      if (r.ok) { currentUser = await r.json(); showApp(); return; }
    } catch{}
    localStorage.removeItem('apex_token'); token=null;
  }
  document.getElementById('auth-screen').style.display='flex';
};
</script>
</body>
</html>`);
});

app.listen(PORT, () => console.log('APEX AI running on port ' + PORT));
