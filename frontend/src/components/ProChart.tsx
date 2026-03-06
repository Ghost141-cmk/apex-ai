// ============================================================
// Professional Chart Component — TradingView Lightweight Charts
// src/components/ProChart.tsx
// Install: npm install lightweight-charts
// ============================================================
"use client";
import { useEffect, useRef, useCallback } from "react";
import {
  createChart,
  IChartApi,
  ISeriesApi,
  CandlestickData,
  LineData,
  ColorType,
  CrosshairMode,
  PriceScaleMode,
} from "lightweight-charts";

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

interface ChartZone {
  type: "ob" | "liq" | "fvg";
  high: number;
  low: number;
  color?: string;
  label?: string;
}

interface ChartLevels {
  entry?:  number;
  sl?:     number;
  tp?:     number;
}

interface ProChartProps {
  candles:   Candle[];
  zones?:    ChartZone[];
  levels?:   ChartLevels;
  symbol?:   string;
  onCrosshair?: (price: number, time: number) => void;
}

export default function ProChart({
  candles, zones = [], levels = {}, symbol = "", onCrosshair
}: ProChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef     = useRef<IChartApi | null>(null);
  const candleRef    = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volRef       = useRef<ISeriesApi<"Histogram"> | null>(null);

  // ── Init chart ─────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      width:  containerRef.current.clientWidth,
      height: 420,
      layout: {
        background:  { type: ColorType.Solid, color: "#0A0F1E" },
        textColor:   "#4A6FA5",
        fontFamily:  "JetBrains Mono, monospace",
        fontSize:    11,
      },
      grid: {
        vertLines:   { color: "#0D1B2A", style: 1 },
        horzLines:   { color: "#0D1B2A", style: 1 },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "#0066FF44", labelBackgroundColor: "#0066FF" },
        horzLine: { color: "#0066FF44", labelBackgroundColor: "#0066FF" },
      },
      rightPriceScale: {
        borderColor:  "#1A2744",
        mode:         PriceScaleMode.Normal,
        scaleMargins: { top: 0.05, bottom: 0.2 },
      },
      timeScale: {
        borderColor:     "#1A2744",
        timeVisible:     true,
        secondsVisible:  false,
        fixLeftEdge:     true,
      },
      handleScroll:  { mouseWheel: true, pressedMouseMove: true },
      handleScale:   { mouseWheel: true, axisPressedMouseMove: true },
    });

    // ── Candlestick series ─────────────────────────────
    const candleSeries = chart.addCandlestickSeries({
      upColor:          "#00D4A8",
      downColor:        "#FF4444",
      borderUpColor:    "#00D4A8",
      borderDownColor:  "#FF4444",
      wickUpColor:      "#00D4A880",
      wickDownColor:    "#FF444480",
    });

    // ── Volume histogram ───────────────────────────────
    const volumeSeries = chart.addHistogramSeries({
      color:      "#0066FF44",
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });
    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });

    // ── Crosshair subscription ─────────────────────────
    if (onCrosshair) {
      chart.subscribeCrosshairMove(param => {
        if (param.point && param.time) {
          const price = param.seriesData.get(candleSeries);
          if (price && "close" in price) {
            onCrosshair((price as CandlestickData).close, param.time as number);
          }
        }
      });
    }

    chartRef.current  = chart;
    candleRef.current = candleSeries;
    volRef.current    = volumeSeries;

    // Responsive resize
    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: containerRef.current?.clientWidth || 800 });
    });
    if (containerRef.current) ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, []);

  // ── Update candle data ──────────────────────────────────
  useEffect(() => {
    if (!candleRef.current || !volRef.current || !candles.length) return;

    const candleData: CandlestickData[] = candles.map(c => ({
      time:  c.time as any,
      open:  c.open,
      high:  c.high,
      low:   c.low,
      close: c.close,
    }));

    const volData = candles.map(c => ({
      time:  c.time as any,
      value: c.volume || 0,
      color: c.close >= c.open ? "#00D4A830" : "#FF444430",
    }));

    candleRef.current.setData(candleData);
    volRef.current.setData(volData);
  }, [candles]);

  // ── Draw zones & levels ─────────────────────────────────
  useEffect(() => {
    if (!chartRef.current || !candleRef.current) return;

    // Draw price lines for entry/SL/TP
    const lines: any[] = [];
    if (levels.entry) {
      lines.push(candleRef.current.createPriceLine({
        price: levels.entry, color: "#0066FF", lineWidth: 2,
        lineStyle: 0, axisLabelVisible: true, title: "Entry",
      }));
    }
    if (levels.sl) {
      lines.push(candleRef.current.createPriceLine({
        price: levels.sl, color: "#FF4444", lineWidth: 1,
        lineStyle: 2, axisLabelVisible: true, title: "SL",
      }));
    }
    if (levels.tp) {
      lines.push(candleRef.current.createPriceLine({
        price: levels.tp, color: "#00D4A8", lineWidth: 1,
        lineStyle: 2, axisLabelVisible: true, title: "TP",
      }));
    }

    return () => { lines.forEach(l => candleRef.current?.removePriceLine(l)); };
  }, [levels]);

  return (
    <div style={{ position: "relative", background: "#0A0F1E", borderRadius: 8, overflow: "hidden" }}>
      {/* Symbol watermark */}
      {symbol && (
        <div style={{
          position: "absolute", top: 12, left: 12, zIndex: 10,
          color: "#1A2744", fontSize: 28, fontWeight: 900,
          fontFamily: "monospace", userSelect: "none", pointerEvents: "none",
        }}>
          {symbol}
        </div>
      )}
      {/* Legend */}
      <div style={{
        position: "absolute", top: 12, right: 12, zIndex: 10,
        display: "flex", gap: 12, fontSize: 11, fontFamily: "monospace",
      }}>
        {levels.entry && <span style={{ color: "#0066FF" }}>E: {levels.entry.toFixed(5)}</span>}
        {levels.sl    && <span style={{ color: "#FF4444" }}>SL: {levels.sl.toFixed(5)}</span>}
        {levels.tp    && <span style={{ color: "#00D4A8" }}>TP: {levels.tp.toFixed(5)}</span>}
      </div>
      <div ref={containerRef} style={{ width: "100%" }} />
    </div>
  );
}
