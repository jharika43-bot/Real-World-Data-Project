import { useState, useEffect, useCallback } from "react";
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";

// ─── Synthetic market data generator ────────────────────────────────────────
function generatePriceHistory(basePrice, days, volatility, trend) {
  const data = [];
  let price = basePrice;
  const now = new Date("2025-06-01");
  for (let i = days; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const change = (Math.random() - 0.48 + trend) * volatility * price;
    price = Math.max(price + change, 1);
    const open = price * (1 + (Math.random() - 0.5) * 0.008);
    const high = Math.max(price, open) * (1 + Math.random() * 0.012);
    const low = Math.min(price, open) * (1 - Math.random() * 0.012);
    const volume = Math.floor(1e6 + Math.random() * 9e6);
    data.push({
      date: date.toISOString().split("T")[0],
      close: parseFloat(price.toFixed(2)),
      open: parseFloat(open.toFixed(2)),
      high: parseFloat(high.toFixed(2)),
      low: parseFloat(low.toFixed(2)),
      volume,
    });
  }
  return data;
}

const STOCKS = {
  AAPL: { name: "Apple Inc.", sector: "Technology", base: 172, vol: 0.015, trend: 0.0008, color: "#60A5FA" },
  MSFT: { name: "Microsoft Corp.", sector: "Technology", base: 415, vol: 0.013, trend: 0.001, color: "#34D399" },
  TSLA: { name: "Tesla Inc.", sector: "Automotive", base: 188, vol: 0.03, trend: 0.0003, color: "#F87171" },
  AMZN: { name: "Amazon.com Inc.", sector: "Consumer", base: 178, vol: 0.018, trend: 0.0007, color: "#FBBF24" },
  NVDA: { name: "NVIDIA Corp.", sector: "Technology", base: 490, vol: 0.028, trend: 0.0015, color: "#A78BFA" },
};

const ALL_HISTORY = Object.fromEntries(
  Object.entries(STOCKS).map(([ticker, meta]) => [
    ticker,
    generatePriceHistory(meta.base, 179, meta.vol, meta.trend),
  ])
);

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt = (n, dec = 2) => n?.toFixed(dec);
const fmtCurrency = (n) => "$" + parseFloat(n).toLocaleString("en-US", { minimumFractionDigits: 2 });
const fmtVol = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : (n / 1e3).toFixed(0) + "K");

function calcMetrics(history) {
  const prices = history.map((d) => d.close);
  const latest = prices[prices.length - 1];
  const prev = prices[prices.length - 2];
  const monthAgo = prices[prices.length - 31];
  const yearAgo = prices[0];
  const pctDay = ((latest - prev) / prev) * 100;
  const pct30d = ((latest - monthAgo) / monthAgo) * 100;
  const pct6m = ((latest - prices[Math.floor(prices.length / 2)]) / prices[Math.floor(prices.length / 2)]) * 100;

  const returns = prices.slice(1).map((p, i) => (p - prices[i]) / prices[i]);
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length;
  const volatility = Math.sqrt(variance * 252) * 100;

  const sma20 = history.slice(-20).reduce((s, d) => s + d.close, 0) / 20;
  const sma50 = history.slice(-50).reduce((s, d) => s + d.close, 0) / 50;

  const high52 = Math.max(...prices.slice(-252));
  const low52 = Math.min(...prices.slice(-252));

  return { latest, pctDay, pct30d, pct6m, volatility, sma20, sma50, high52, low52 };
}

// ─── Tooltip ─────────────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#0F172A", border: "1px solid #1E293B", borderRadius: 8, padding: "10px 14px" }}>
      <p style={{ color: "#94A3B8", fontSize: 11, margin: "0 0 6px" }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color, fontSize: 13, margin: "2px 0", fontFamily: "monospace" }}>
          {p.name}: {typeof p.value === "number" && p.name?.toLowerCase().includes("vol")
            ? fmtVol(p.value)
            : "$" + parseFloat(p.value).toFixed(2)}
        </p>
      ))}
    </div>
  );
};

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function StockDashboard() {
  const [activeTicker, setActiveTicker] = useState("AAPL");
  const [range, setRange] = useState(90);
  const [compareMode, setCompareMode] = useState(false);
  const [compareList, setCompareList] = useState(["AAPL", "MSFT"]);
  const [aiInsight, setAiInsight] = useState("");
  const [loadingAI, setLoadingAI] = useState(false);
  const [activeTab, setActiveTab] = useState("chart");

  const stock = STOCKS[activeTicker];
  const history = ALL_HISTORY[activeTicker].slice(-range);
  const metrics = calcMetrics(ALL_HISTORY[activeTicker]);

  // Normalized comparison data
  const comparisonData = (() => {
    if (!compareMode) return [];
    const dates = ALL_HISTORY[compareList[0]].slice(-range).map((d) => d.date);
    return dates.map((date, i) => {
      const row = { date };
      compareList.forEach((ticker) => {
        const slice = ALL_HISTORY[ticker].slice(-range);
        const base = slice[0]?.close || 1;
        row[ticker] = parseFloat(((slice[i]?.close / base - 1) * 100).toFixed(2));
      });
      return row;
    });
  })();

  // Volume bar data
  const volumeData = history.slice(-30).map((d) => ({
    date: d.date.slice(5),
    volume: d.volume,
    color: d.close >= d.open ? "#34D399" : "#F87171",
  }));

  // Bollinger bands
  const bollingerData = history.map((d, i, arr) => {
    if (i < 19) return { date: d.date.slice(5), close: d.close };
    const window = arr.slice(i - 19, i + 1).map((x) => x.close);
    const sma = window.reduce((a, b) => a + b, 0) / 20;
    const std = Math.sqrt(window.reduce((a, b) => a + (b - sma) ** 2, 0) / 20);
    return {
      date: d.date.slice(5),
      close: d.close,
      upper: parseFloat((sma + 2 * std).toFixed(2)),
      lower: parseFloat((sma - 2 * std).toFixed(2)),
      sma: parseFloat(sma.toFixed(2)),
    };
  });

  const fetchAIInsight = useCallback(async () => {
    setLoadingAI(true);
    setAiInsight("");
    const m = metrics;
    const prompt = `You are a concise financial analyst. Given this data for ${activeTicker} (${stock.name}):
- Current price: $${fmt(m.latest)}
- Day change: ${fmt(m.pctDay)}%
- 30-day return: ${fmt(m.pct30d)}%
- 6-month return: ${fmt(m.pct6m)}%
- Annualized volatility: ${fmt(m.volatility)}%
- 20-day SMA: $${fmt(m.sma20)} | 50-day SMA: $${fmt(m.sma50)}
- 52-week range: $${fmt(m.low52)} – $${fmt(m.high52)}

Write a sharp 3–4 sentence analyst note covering: trend direction, key risk, and one actionable observation. Be specific and numerical. No disclaimers.`;

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      const data = await res.json();
      const text = data.content?.map((b) => b.text || "").join("") || "No insight available.";
      setAiInsight(text);
    } catch {
      setAiInsight("Unable to load AI insight at this time.");
    } finally {
      setLoadingAI(false);
    }
  }, [activeTicker, metrics]);

  useEffect(() => { fetchAIInsight(); }, [activeTicker]);

  const isPositive = metrics.pctDay >= 0;

  // ─── Styles ────────────────────────────────────────────────────────────────
  const S = {
    root: { fontFamily: "'Inter', 'SF Pro Display', system-ui, sans-serif", background: "#020817", minHeight: "100vh", color: "#E2E8F0", padding: "20px 24px" },
    header: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 },
    brand: { fontSize: 11, letterSpacing: "0.15em", color: "#475569", textTransform: "uppercase", marginBottom: 4 },
    title: { fontSize: 26, fontWeight: 700, color: "#F1F5F9", margin: 0, letterSpacing: "-0.02em" },
    subtitle: { fontSize: 13, color: "#64748B", marginTop: 2 },
    tickerBar: { display: "flex", gap: 6, flexWrap: "wrap" },
    tickerBtn: (t) => ({
      padding: "7px 14px", borderRadius: 8, border: `1px solid ${activeTicker === t ? STOCKS[t].color : "#1E293B"}`,
      background: activeTicker === t ? STOCKS[t].color + "22" : "transparent",
      color: activeTicker === t ? STOCKS[t].color : "#64748B",
      cursor: "pointer", fontSize: 13, fontWeight: activeTicker === t ? 700 : 400,
      transition: "all 0.15s",
    }),
    heroRow: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 20 },
    card: { background: "#0F172A", borderRadius: 12, padding: "16px 18px", border: "1px solid #1E293B" },
    cardLabel: { fontSize: 11, color: "#475569", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 },
    bigNum: { fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", color: "#F1F5F9" },
    badge: (pos) => ({
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "3px 8px", borderRadius: 6,
      background: pos ? "#064E3B" : "#7F1D1D",
      color: pos ? "#34D399" : "#F87171",
      fontSize: 13, fontWeight: 600,
    }),
    tabRow: { display: "flex", gap: 4, marginBottom: 16, background: "#0F172A", padding: 4, borderRadius: 10, width: "fit-content" },
    tab: (active) => ({
      padding: "6px 16px", borderRadius: 7, fontSize: 13, cursor: "pointer",
      background: active ? "#1E293B" : "transparent",
      color: active ? "#F1F5F9" : "#64748B",
      border: "none", transition: "all 0.15s",
    }),
    rangeRow: { display: "flex", gap: 4, marginLeft: "auto" },
    rangeBtn: (r) => ({
      padding: "5px 11px", borderRadius: 6, fontSize: 12, cursor: "pointer",
      background: range === r ? "#1E40AF" : "transparent",
      color: range === r ? "#93C5FD" : "#475569",
      border: `1px solid ${range === r ? "#1E40AF" : "#1E293B"}`,
    }),
    chartCard: { background: "#0F172A", borderRadius: 14, padding: "20px", border: "1px solid #1E293B", marginBottom: 16 },
    insightCard: { background: "#0F172A", borderRadius: 14, padding: "20px 22px", border: "1px solid #1E293B", marginBottom: 16 },
    insightHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
    insightTitle: { fontSize: 12, color: "#60A5FA", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600 },
    insightText: { fontSize: 14, lineHeight: 1.7, color: "#CBD5E1" },
    refreshBtn: {
      background: "transparent", border: "1px solid #1E3A5F", color: "#60A5FA",
      borderRadius: 7, padding: "5px 12px", fontSize: 12, cursor: "pointer",
    },
    statsGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 },
    statRow: { display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #1E293B" },
    statLabel: { fontSize: 12, color: "#64748B" },
    statVal: { fontSize: 13, fontWeight: 600, color: "#E2E8F0", fontFamily: "monospace" },
    sectionTitle: { fontSize: 12, color: "#475569", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 14, fontWeight: 600 },
    twoCol: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 },
    pulse: { display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#60A5FA", marginRight: 8, animation: "pulse 2s infinite" },
  };

  const chartData = history.map((d) => ({ ...d, date: d.date.slice(5) }));

  return (
    <div style={S.root}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(1.3)} }
        @keyframes shimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
        button:hover { opacity:0.85 }
        * { box-sizing:border-box }
        ::-webkit-scrollbar { width:4px } ::-webkit-scrollbar-track { background:#0F172A }
        ::-webkit-scrollbar-thumb { background:#1E293B; border-radius:4px }
      `}</style>

      {/* Header */}
      <div style={S.header}>
        <div>
          <p style={S.brand}>Market Analytics</p>
          <h1 style={S.title}>Stock Dashboard</h1>
          <p style={S.subtitle}>6-month rolling window · Synthetic demo data · Powered by Claude</p>
        </div>
        <div style={S.tickerBar}>
          {Object.keys(STOCKS).map((t) => (
            <button key={t} style={S.tickerBtn(t)} onClick={() => setActiveTicker(t)}>{t}</button>
          ))}
        </div>
      </div>

      {/* Hero metrics */}
      <div style={S.heroRow}>
        <div style={S.card}>
          <p style={S.cardLabel}>Current Price</p>
          <div style={S.bigNum}>{fmtCurrency(metrics.latest)}</div>
          <div style={{ marginTop: 8 }}>
            <span style={S.badge(isPositive)}>
              {isPositive ? "▲" : "▼"} {Math.abs(metrics.pctDay).toFixed(2)}%
            </span>
            <span style={{ fontSize: 11, color: "#475569", marginLeft: 8 }}>today</span>
          </div>
        </div>
        <div style={S.card}>
          <p style={S.cardLabel}>30-Day Return</p>
          <div style={{ ...S.bigNum, color: metrics.pct30d >= 0 ? "#34D399" : "#F87171" }}>
            {metrics.pct30d >= 0 ? "+" : ""}{fmt(metrics.pct30d)}%
          </div>
          <p style={{ fontSize: 12, color: "#475569", marginTop: 8 }}>{stock.sector}</p>
        </div>
        <div style={S.card}>
          <p style={S.cardLabel}>Volatility (Ann.)</p>
          <div style={S.bigNum}>{fmt(metrics.volatility)}%</div>
          <p style={{ fontSize: 12, color: metrics.volatility > 30 ? "#FBBF24" : "#34D399", marginTop: 8 }}>
            {metrics.volatility > 40 ? "High Risk" : metrics.volatility > 25 ? "Moderate" : "Low Risk"}
          </p>
        </div>
        <div style={S.card}>
          <p style={S.cardLabel}>52-Week Range</p>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#F1F5F9", marginTop: 4 }}>
            ${fmt(metrics.low52)} – ${fmt(metrics.high52)}
          </div>
          <div style={{ marginTop: 10, height: 4, background: "#1E293B", borderRadius: 4, position: "relative" }}>
            <div style={{
              position: "absolute", left: 0, top: 0, height: "100%", borderRadius: 4,
              width: `${((metrics.latest - metrics.low52) / (metrics.high52 - metrics.low52)) * 100}%`,
              background: stock.color,
            }} />
          </div>
        </div>
        <div style={S.card}>
          <p style={S.cardLabel}>Moving Averages</p>
          <div style={{ marginTop: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: "#64748B" }}>SMA-20</span>
              <span style={{ fontSize: 13, fontFamily: "monospace", color: metrics.latest > metrics.sma20 ? "#34D399" : "#F87171" }}>${fmt(metrics.sma20)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 12, color: "#64748B" }}>SMA-50</span>
              <span style={{ fontSize: 13, fontFamily: "monospace", color: metrics.latest > metrics.sma50 ? "#34D399" : "#F87171" }}>${fmt(metrics.sma50)}</span>
            </div>
          </div>
          <p style={{ fontSize: 11, color: metrics.sma20 > metrics.sma50 ? "#34D399" : "#F87171", marginTop: 10 }}>
            {metrics.sma20 > metrics.sma50 ? "✓ Bullish crossover" : "✗ Bearish crossover"}
          </p>
        </div>
      </div>

      {/* Tab + Range Controls */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div style={S.tabRow}>
          {["chart", "bollinger", "volume", "compare"].map((t) => (
            <button key={t} style={S.tab(activeTab === t)} onClick={() => { setActiveTab(t); if (t === "compare") setCompareMode(true); else setCompareMode(false); }}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <div style={S.rangeRow}>
          {[30, 60, 90, 120, 179].map((r) => (
            <button key={r} style={S.rangeBtn(r)} onClick={() => setRange(r)}>
              {r === 179 ? "6M" : r === 120 ? "4M" : r === 90 ? "3M" : r === 60 ? "2M" : "1M"}
            </button>
          ))}
        </div>
      </div>

      {/* Main Chart */}
      <div style={S.chartCard}>
        <p style={S.sectionTitle}>
          {activeTab === "chart" && `${activeTicker} — Price History`}
          {activeTab === "bollinger" && `${activeTicker} — Bollinger Bands (20-day, 2σ)`}
          {activeTab === "volume" && `${activeTicker} — 30-Day Volume`}
          {activeTab === "compare" && "Normalized Performance Comparison (%)"}
        </p>

        {/* Price Chart */}
        {activeTab === "chart" && (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorClose" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={stock.color} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={stock.color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
              <XAxis dataKey="date" tick={{ fill: "#475569", fontSize: 10 }} tickLine={false} axisLine={false} interval={Math.floor(history.length / 6)} />
              <YAxis tick={{ fill: "#475569", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => "$" + v} domain={["auto", "auto"]} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="close" name="Close" stroke={stock.color} strokeWidth={2} fill="url(#colorClose)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}

        {/* Bollinger Bands */}
        {activeTab === "bollinger" && (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={bollingerData.slice(-range)} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
              <XAxis dataKey="date" tick={{ fill: "#475569", fontSize: 10 }} tickLine={false} axisLine={false} interval={Math.floor(range / 6)} />
              <YAxis tick={{ fill: "#475569", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => "$" + v} domain={["auto", "auto"]} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="upper" name="Upper Band" stroke="#F87171" strokeWidth={1} dot={false} strokeDasharray="4 2" />
              <Line type="monotone" dataKey="lower" name="Lower Band" stroke="#34D399" strokeWidth={1} dot={false} strokeDasharray="4 2" />
              <Line type="monotone" dataKey="sma" name="SMA-20" stroke="#FBBF24" strokeWidth={1.5} dot={false} />
              <Line type="monotone" dataKey="close" name="Close" stroke={stock.color} strokeWidth={2} dot={false} />
              <Legend wrapperStyle={{ fontSize: 11, color: "#64748B" }} />
            </LineChart>
          </ResponsiveContainer>
        )}

        {/* Volume */}
        {activeTab === "volume" && (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={volumeData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
              <XAxis dataKey="date" tick={{ fill: "#475569", fontSize: 10 }} tickLine={false} axisLine={false} interval={3} />
              <YAxis tick={{ fill: "#475569", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={fmtVol} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="volume" name="Volume" fill={stock.color} radius={[3, 3, 0, 0]} opacity={0.8} />
            </BarChart>
          </ResponsiveContainer>
        )}

        {/* Compare */}
        {activeTab === "compare" && (
          <>
            <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
              {Object.keys(STOCKS).map((t) => (
                <button key={t} onClick={() => setCompareList((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t])}
                  style={{ padding: "4px 12px", borderRadius: 6, fontSize: 12, cursor: "pointer", border: `1px solid ${compareList.includes(t) ? STOCKS[t].color : "#1E293B"}`, background: compareList.includes(t) ? STOCKS[t].color + "22" : "transparent", color: compareList.includes(t) ? STOCKS[t].color : "#64748B" }}>
                  {t}
                </button>
              ))}
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={comparisonData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                <XAxis dataKey="date" tick={{ fill: "#475569", fontSize: 10 }} tickLine={false} axisLine={false} interval={Math.floor(range / 6)} />
                <YAxis tick={{ fill: "#475569", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => v + "%"} />
                <Tooltip formatter={(v) => v.toFixed(2) + "%"} contentStyle={{ background: "#0F172A", border: "1px solid #1E293B", borderRadius: 8 }} labelStyle={{ color: "#94A3B8", fontSize: 11 }} />
                <Legend wrapperStyle={{ fontSize: 11, color: "#64748B" }} />
                {compareList.map((t) => (
                  <Line key={t} type="monotone" dataKey={t} stroke={STOCKS[t].color} strokeWidth={2} dot={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </>
        )}
      </div>

      {/* Bottom row: AI Insight + Stats */}
      <div style={S.twoCol}>
        {/* AI Insight */}
        <div style={S.insightCard}>
          <div style={S.insightHeader}>
            <span style={S.insightTitle}>
              <span style={S.pulse} />
              AI Analyst Note — {activeTicker}
            </span>
            <button style={S.refreshBtn} onClick={fetchAIInsight} disabled={loadingAI}>
              {loadingAI ? "Loading…" : "↻ Refresh"}
            </button>
          </div>
          {loadingAI ? (
            <div style={{ background: "linear-gradient(90deg,#1E293B 25%,#2D3F56 50%,#1E293B 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.5s infinite", borderRadius: 8, height: 80 }} />
          ) : (
            <p style={S.insightText}>{aiInsight || "Click refresh to generate an AI analyst note."}</p>
          )}
          <p style={{ fontSize: 10, color: "#334155", marginTop: 12 }}>Generated by Claude · For educational purposes only · Not financial advice</p>
        </div>

        {/* Stats table */}
        <div style={S.insightCard}>
          <p style={S.insightTitle}>Key Statistics</p>
          {[
            ["Company", stock.name],
            ["Sector", stock.sector],
            ["Current Price", fmtCurrency(metrics.latest)],
            ["Day Change", `${isPositive ? "+" : ""}${fmt(metrics.pctDay)}%`],
            ["30D Return", `${metrics.pct30d >= 0 ? "+" : ""}${fmt(metrics.pct30d)}%`],
            ["6M Return", `${metrics.pct6m >= 0 ? "+" : ""}${fmt(metrics.pct6m)}%`],
            ["Ann. Volatility", `${fmt(metrics.volatility)}%`],
            ["52W High", fmtCurrency(metrics.high52)],
            ["52W Low", fmtCurrency(metrics.low52)],
            ["SMA-20", fmtCurrency(metrics.sma20)],
            ["SMA-50", fmtCurrency(metrics.sma50)],
          ].map(([label, val]) => (
            <div key={label} style={S.statRow}>
              <span style={S.statLabel}>{label}</span>
              <span style={{ ...S.statVal, color: val?.includes("+") ? "#34D399" : val?.startsWith("-") ? "#F87171" : "#E2E8F0" }}>{val}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
