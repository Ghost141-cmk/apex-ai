// ============================================================
// Frontend API Client (src/services/api.ts)
// ============================================================
const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

class APIClient {
  private token: string | null = null;

  setToken(t: string) {
    this.token = t;
    if (typeof window !== "undefined") localStorage.setItem("apex_token", t);
  }

  getToken(): string | null {
    if (this.token) return this.token;
    if (typeof window !== "undefined") {
      this.token = localStorage.getItem("apex_token");
    }
    return this.token;
  }

  private async req(path: string, options: RequestInit = {}) {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string> || {}),
    };
    const token = this.getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(`${BASE}${path}`, { ...options, headers });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Unknown error" }));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }
    return res.json();
  }

  // ── Auth ──────────────────────────────────────────────
  async login(email: string, password: string, totp?: string) {
    const data = await this.req("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password, totp_code: totp }),
    });
    this.setToken(data.access_token);
    return data;
  }

  async register(name: string, email: string, password: string) {
    return this.req("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    });
  }

  async getMe() { return this.req("/api/auth/me"); }

  // ── AI Analysis ───────────────────────────────────────
  async runAnalysis(symbol: string, mode: string, balance = 10000, risk = 2) {
    return this.req("/api/analysis/run", {
      method: "POST",
      body: JSON.stringify({
        symbol, mode,
        account_balance: balance,
        risk_percent: risk,
      }),
    });
  }

  async getAnalysisHistory() { return this.req("/api/analysis/history"); }

  // ── Trades ────────────────────────────────────────────
  async getTrades(limit = 50)    { return this.req(`/api/trades/?limit=${limit}`); }
  async getPositions()           { return this.req("/api/trades/positions"); }
  async getPerformance()         { return this.req("/api/trades/performance"); }

  async placeTrade(body: {
    symbol: string; direction: string; lot_size: number;
    entry: number; stop_loss: number; take_profit: number; mode?: string;
  }) {
    return this.req("/api/trades/place", { method: "POST", body: JSON.stringify(body) });
  }

  async closeTrade(tradeId: string) {
    return this.req("/api/trades/close", {
      method: "POST", body: JSON.stringify({ trade_id: tradeId }),
    });
  }

  async getCopyableSetup(symbol: string, balance: number, lotSize?: number, risk = 2) {
    return this.req("/api/trades/copyable-setup", {
      method: "POST",
      body: JSON.stringify({ symbol, account_balance: balance, lot_size: lotSize, risk_percent: risk }),
    });
  }

  // ── Wallet ────────────────────────────────────────────
  async getBalance()      { return this.req("/api/wallet/balance"); }
  async getTransactions() { return this.req("/api/wallet/transactions"); }

  async deposit(phone: string, amount: number, currency = "UGX") {
    return this.req("/api/wallet/deposit", {
      method: "POST", body: JSON.stringify({ phone, amount, currency }),
    });
  }

  async withdraw(phone: string, amount: number, currency = "UGX") {
    return this.req("/api/wallet/withdraw", {
      method: "POST", body: JSON.stringify({ phone, amount, currency }),
    });
  }
}

export const api = new APIClient();


// ============================================================
// useMarketWebSocket Hook (src/hooks/useMarketWS.ts)
// ============================================================
import { useEffect, useRef, useCallback, useState } from "react";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";

export function useMarketWebSocket(
  onTick: (data: any) => void,
  symbols: string[] = []
) {
  const wsRef      = useRef<WebSocket | null>(null);
  const retryRef   = useRef<ReturnType<typeof setTimeout>>();
  const [connected, setConnected] = useState(false);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(`${WS_URL}/ws/market`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      // Subscribe to symbols
      symbols.forEach(sym => {
        ws.send(JSON.stringify({ action: "subscribe", symbol: sym }));
      });
    };

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "tick") onTick(data);
      } catch {}
    };

    ws.onclose = () => {
      setConnected(false);
      retryRef.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => ws.close();
  }, [symbols, onTick]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(retryRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const subscribe = useCallback((symbol: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: "subscribe", symbol }));
    }
  }, []);

  return { connected, subscribe };
}
