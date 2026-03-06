"use client";
import { useEffect, useRef, useCallback, useState } from "react";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";

export function useMarketWebSocket(
  onTick: (data: any) => void,
  symbols: string[] = []
) {
  const wsRef    = useRef<WebSocket | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout>>();
  const [connected, setConnected] = useState(false);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    try {
      const ws = new WebSocket(`${WS_URL}/ws/market`);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        symbols.forEach(sym => ws.send(JSON.stringify({ action: "subscribe", symbol: sym })));
      };

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === "tick") onTick(data);
        } catch {}
      };

      ws.onclose = () => {
        setConnected(false);
        retryRef.current = setTimeout(connect, 4000);
      };

      ws.onerror = () => ws.close();
    } catch {
      setConnected(false);
    }
  }, [symbols, onTick]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(retryRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { connected };
}
