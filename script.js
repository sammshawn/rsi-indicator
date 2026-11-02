// ============================================
//  1-TICK RSI INDICATOR — Premium UI + Smooth RSI
//  RSI chart has 3 clearly separated lines
// ============================================

const WS_URL = `wss://api.derivws.com/trading/v1/options/ws/public`;

const MARKETS = {
  R_10: { decimals: 3, name: "V10" },
  R_25: { decimals: 3, name: "V25" },
  R_50: { decimals: 4, name: "V50" },
  R_75: { decimals: 4, name: "V75" },
  R_100: { decimals: 2, name: "V100" },
  "1HZ10V": { decimals: 2, name: "V10 1s" },
  "1HZ25V": { decimals: 2, name: "V25 1s" },
  "1HZ50V": { decimals: 2, name: "V50 1s" },
  "1HZ75V": { decimals: 2, name: "V75 1s" },
  "1HZ100V": { decimals: 2, name: "V100 1s" },
};

let ws = null;
let currentSymbol = "R_100";
let reqId = 1;
let pendingSubscribe = null;

let tickPrices = [];
let rsiValues = [];
let rsiPeriod = 14;
let overboughtLevel = 70;
let oversoldLevel = 30;

let avgGain = null;
let avgLoss = null;
let lastRsi = null;
let lastZone = "neutral";
let signalCooldown = 0;

const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
const marketSelect = document.getElementById("marketSelect");
const rsiPeriodInput = document.getElementById("rsiPeriod");
const overboughtInput = document.getElementById("overbought");
const oversoldInput = document.getElementById("oversold");
const resetBtn = document.getElementById("resetBtn");
const signalHero = document.getElementById("signalHero");
const signalIcon = document.getElementById("signalIcon");
const signalTitle = document.getElementById("signalTitle");
const signalSub = document.getElementById("signalSub");
const signalValue = document.getElementById("signalValue");
const tickChart = document.getElementById("tickChart");
const rsiChart = document.getElementById("rsiChart");
const currentRsiInline = document.getElementById("rsiInline");
const tickCount = document.getElementById("tickCount");
const rsiValue = document.getElementById("rsiValue");
const zoneValue = document.getElementById("zoneValue");
const lastSignal = document.getElementById("lastSignal");
const chartMarket = document.getElementById("chartMarket");

// ---- WEBSOCKET ----
function connect() {
  setStatus("connecting", "Connecting…");
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    setStatus("connected", "Live");
    doSubscribe(currentSymbol);
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.error) {
      console.warn("Deriv error:", data.error.message || data.error);
      return;
    }
    if (data.msg_type === "tick" && data.tick) {
      handleTick(data.tick);
    }
  };

  ws.onerror = () => setStatus("error", "Connection error");
  ws.onclose = () => {
    setStatus("error", "Disconnected — retrying…");
    setTimeout(connect, 3000);
  };
}

function doSubscribe(symbol) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ ticks: symbol, subscribe: 1, req_id: reqId++ }));
}

function switchMarket(symbol) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  resetData();
  currentSymbol = symbol;
  chartMarket.textContent = MARKETS[symbol].name;
  pendingSubscribe = symbol;
  ws.send(JSON.stringify({ forget_all: "ticks", req_id: reqId++ }));
  setTimeout(() => {
    if (pendingSubscribe) {
      const sym = pendingSubscribe;
      pendingSubscribe = null;
      doSubscribe(sym);
    }
  }, 500);
}

// ---- WILDER RSI ----
function updateRSI(price) {
  tickPrices.push(price);
  if (tickPrices.length < 2) return;

  const change = tickPrices[tickPrices.length - 1] - tickPrices[tickPrices.length - 2];
  const gain = change > 0 ? change : 0;
  const loss = change < 0 ? -change : 0;

  if (tickPrices.length <= rsiPeriod) {
    if (tickPrices.length === 2) {
      avgGain = gain;
      avgLoss = loss;
    } else {
      avgGain = (avgGain * (tickPrices.length - 2) + gain) / (tickPrices.length - 1);
      avgLoss = (avgLoss * (tickPrices.length - 2) + loss) / (tickPrices.length - 1);
    }
    return;
  }

  const alpha = 1 / rsiPeriod;
  avgGain = gain * alpha + avgGain * (1 - alpha);
  avgLoss = loss * alpha + avgLoss * (1 - alpha);

  let rsi;
  if (avgLoss === 0) rsi = 100;
  else if (avgGain === 0) rsi = 0;
  else {
    const rs = avgGain / avgLoss;
    rsi = 100 - 100 / (1 + rs);
  }

  lastRsi = rsi;
  rsiValues.push(rsi);
  if (rsiValues.length > 500) rsiValues.shift();
}

// ---- TICK ----
function handleTick(tick) {
  const quoteNum = parseFloat(tick.quote);
  if (!Number.isFinite(quoteNum)) return;

  updateRSI(quoteNum);

  if (tickPrices.length < rsiPeriod + 2 || lastRsi === null) {
    updateUI();
    return;
  }

  let zone = "neutral";
  if (lastRsi >= overboughtLevel) zone = "overbought";
  else if (lastRsi <= oversoldLevel) zone = "oversold";

  const enteredOB = zone === "overbought" && lastZone !== "overbought";
  const enteredOS = zone === "oversold" && lastZone !== "oversold";

  if (signalCooldown > 0) signalCooldown--;
  else if (enteredOB) triggerSignal("under", lastRsi);
  else if (enteredOS) triggerSignal("over", lastRsi);

  lastZone = zone;
  updateUI();
}

function triggerSignal(type, rsi) {
  signalCooldown = 10;

  signalHero.classList.remove("over", "under");
  signalHero.classList.add(type);

  if (type === "under") {
    signalIcon.textContent = "🔻";
    signalTitle.textContent = "UNDER Signal";
    signalSub.textContent = `RSI ${rsi.toFixed(1)} overbought — expect reversal down`;
    signalValue.textContent = "UNDER";
  } else {
    signalIcon.textContent = "🔺";
    signalTitle.textContent = "OVER Signal";
    signalSub.textContent = `RSI ${rsi.toFixed(1)} oversold — expect reversal up`;
    signalValue.textContent = "OVER";
  }

  lastSignal.textContent = type.toUpperCase();
  lastSignal.className = `stat-tile-value ${type}`;
}

// ---- UI ----
function updateUI() {
  tickCount.textContent = tickPrices.length;
  rsiValue.textContent = lastRsi !== null ? lastRsi.toFixed(1) : "—";
  currentRsiInline.textContent = lastRsi !== null ? lastRsi.toFixed(1) : "—";

  let zoneText = "Neutral";
  let zoneClass = "";
  if (lastRsi !== null) {
    if (lastRsi >= overboughtLevel) { zoneText = "Overbought"; zoneClass = "over"; }
    else if (lastRsi <= oversoldLevel) { zoneText = "Oversold"; zoneClass = "under"; }
  }
  zoneValue.textContent = zoneText;
  zoneValue.className = `stat-tile-value ${zoneClass}`;

  drawTickChart();
  drawRsiChart();
}

// ---- DRAW: PRICE CHART ----
function drawTickChart() {
  const canvas = tickChart;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;
  if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  if (tickPrices.length < 2) return;

  const visible = tickPrices.slice(-80);
  const min = Math.min(...visible);
  const max = Math.max(...visible);
  const range = max - min || 1;

  const padL = 12, padR = 12, padT = 16, padB = 16;
  const chartW = w - padL - padR;
  const chartH = h - padT - padB;

  // Grid
  ctx.strokeStyle = "rgba(60, 90, 130, 0.15)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padT + (i / 4) * chartH;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(w - padR, y);
    ctx.stroke();
  }

  const points = visible.map((p, i) => ({
    x: padL + (i / (visible.length - 1)) * chartW,
    y: padT + (1 - (p - min) / range) * chartH,
  }));

  // Gradient fill
  const grad = ctx.createLinearGradient(0, padT, 0, h - padB);
  grad.addColorStop(0, "rgba(34, 211, 238, 0.25)");
  grad.addColorStop(1, "rgba(34, 211, 238, 0)");
  ctx.beginPath();
  ctx.moveTo(points[0].x, h - padB);
  points.forEach((pt) => ctx.lineTo(pt.x, pt.y));
  ctx.lineTo(points[points.length - 1].x, h - padB);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Glow line
  ctx.beginPath();
  ctx.strokeStyle = "rgba(34, 211, 238, 0.4)";
  ctx.lineWidth = 6;
  ctx.lineJoin = "round";
  points.forEach((pt, i) => {
    if (i === 0) ctx.moveTo(pt.x, pt.y);
    else ctx.lineTo(pt.x, pt.y);
  });
  ctx.stroke();

  // Main line
  ctx.beginPath();
  ctx.strokeStyle = "#22d3ee";
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  points.forEach((pt, i) => {
    if (i === 0) ctx.moveTo(pt.x, pt.y);
    else ctx.lineTo(pt.x, pt.y);
  });
  ctx.stroke();

  // Tick candles
  for (let i = 0; i < visible.length - 1; i++) {
    const x = padL + (i / (visible.length - 1)) * chartW;
    const y = padT + (1 - (visible[i] - min) / range) * chartH;
    const isUp = visible[i + 1] > visible[i];
    ctx.beginPath();
    ctx.strokeStyle = isUp ? "#10b981" : "#ef4444";
    ctx.lineWidth = 2;
    ctx.moveTo(x, y - 5);
    ctx.lineTo(x, y + 5);
    ctx.stroke();
  }

  // Last dot
  const last = points[points.length - 1];
  ctx.beginPath();
  ctx.arc(last.x, last.y, 5, 0, Math.PI * 2);
  ctx.fillStyle = "#22d3ee";
  ctx.shadowColor = "#22d3ee";
  ctx.shadowBlur = 15;
  ctx.fill();
  ctx.shadowBlur = 0;
}

// ============================================
//  ⭐ RSI CHART — 3 CLEARLY SEPARATED LINES
//  Overbought (red), Middle 50 (dashed grey), Oversold (green)
// ============================================
function drawRsiChart() {
  const canvas = rsiChart;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;
  if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  if (rsiValues.length < 2) return;

  const visible = rsiValues.slice(-80);
  // Use bigger padding top/bottom so lines don't hug the edges
  const padL = 40, padR = 20, padT = 20, padB = 20;
  const chartW = w - padL - padR;
  const chartH = h - padT - padB;

  // Map RSI value to y-position (0 → bottom, 100 → top)
  const yFor = (v) => padT + (1 - v / 100) * chartH;

  // ---- ZONES (soft background tint) ----
  // Overbought zone: from OB line up to top
  ctx.fillStyle = "rgba(239, 68, 68, 0.10)";
  ctx.fillRect(padL, padT, chartW, yFor(overboughtLevel) - padT);

  // Oversold zone: from OS line down to bottom
  ctx.fillStyle = "rgba(16, 185, 129, 0.10)";
  ctx.fillRect(padL, yFor(oversoldLevel), chartW, padT + chartH - yFor(oversoldLevel));

  // ---- GRID LINES at 25, 50, 75 ----
  ctx.strokeStyle = "rgba(60, 90, 130, 0.18)";
  ctx.lineWidth = 1;
  [25, 50, 75].forEach((v) => {
    const y = yFor(v);
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(w - padR, y);
    ctx.stroke();
  });

  // ---- THREE MAIN LINES (fully labelled) ----
  // 1) OVERBOUGHT LINE (red, solid, thicker)
  const obY = yFor(overboughtLevel);
  ctx.beginPath();
  ctx.strokeStyle = "rgba(239, 68, 68, 0.9)";
  ctx.lineWidth = 2;
  ctx.moveTo(padL, obY);
  ctx.lineTo(w - padR, obY);
  ctx.stroke();
  // Label on left
  ctx.font = "600 10px 'Inter', sans-serif";
  ctx.fillStyle = "rgba(239, 68, 68, 1)";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillText(`OB ${overboughtLevel}`, padL - 6, obY);

  // 2) MIDDLE LINE (50 — dashed grey, subtle)
  const midY = yFor(50);
  ctx.beginPath();
  ctx.strokeStyle = "rgba(150, 170, 200, 0.5)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  ctx.moveTo(padL, midY);
  ctx.lineTo(w - padR, midY);
  ctx.stroke();
  ctx.setLineDash([]);
  // Label on left
  ctx.fillStyle = "rgba(150, 170, 200, 0.8)";
  ctx.fillText("50", padL - 6, midY);

  // 3) OVERSOLD LINE (green, solid, thicker)
  const osY = yFor(oversoldLevel);
  ctx.beginPath();
  ctx.strokeStyle = "rgba(16, 185, 129, 0.9)";
  ctx.lineWidth = 2;
  ctx.moveTo(padL, osY);
  ctx.lineTo(w - padR, osY);
  ctx.stroke();
  // Label on left
  ctx.fillStyle = "rgba(16, 185, 129, 1)";
  ctx.fillText(`OS ${oversoldLevel}`, padL - 6, osY);

  // ---- RSI LINE (glow + main) ----
  // Glow
  ctx.beginPath();
  ctx.strokeStyle = "rgba(167, 139, 250, 0.45)";
  ctx.lineWidth = 6;
  ctx.lineJoin = "round";
  visible.forEach((v, i) => {
    const x = padL + (i / (visible.length - 1)) * chartW;
    const y = yFor(v);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Main RSI line
  ctx.beginPath();
  ctx.strokeStyle = "#a78bfa";
  ctx.lineWidth = 2.2;
  ctx.lineJoin = "round";
  visible.forEach((v, i) => {
    const x = padL + (i / (visible.length - 1)) * chartW;
    const y = yFor(v);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Last RSI dot
  const lastX = padL + chartW;
  const lastY = yFor(visible[visible.length - 1]);
  ctx.beginPath();
  ctx.arc(lastX, lastY, 5, 0, Math.PI * 2);
  ctx.fillStyle = "#a78bfa";
  ctx.shadowColor = "#a78bfa";
  ctx.shadowBlur = 15;
  ctx.fill();
  ctx.shadowBlur = 0;

  // Right-side last value label
  ctx.font = "700 10px 'Inter', sans-serif";
  ctx.fillStyle = "#a78bfa";
  ctx.textAlign = "left";
  ctx.fillText(visible[visible.length - 1].toFixed(1), lastX + 6, lastY);
}

// ---- CONTROLS ----
marketSelect.addEventListener("change", () => {
  switchMarket(marketSelect.value);
});
rsiPeriodInput.addEventListener("change", () => {
  rsiPeriod = parseInt(rsiPeriodInput.value, 10) || 14;
  resetData();
});
overboughtInput.addEventListener("change", () => {
  overboughtLevel = parseInt(overboughtInput.value, 10) || 70;
  updateUI();
});
oversoldInput.addEventListener("change", () => {
  oversoldLevel = parseInt(oversoldInput.value, 10) || 30;
  updateUI();
});
resetBtn.addEventListener("click", () => {
  resetData();
  updateUI();
});

function resetData() {
  tickPrices = [];
  rsiValues = [];
  avgGain = null;
  avgLoss = null;
  lastRsi = null;
  lastZone = "neutral";
  signalCooldown = 0;

  signalHero.classList.remove("over", "under");
  signalIcon.textContent = "⏳";
  signalTitle.textContent = "Waiting for data";
  signalSub.textContent = "Collecting ticks to calculate RSI…";
  signalValue.textContent = "—";

  lastSignal.textContent = "—";
  lastSignal.className = "stat-tile-value";
}

function setStatus(stateName, text) {
  statusText.textContent = text;
  statusDot.classList.remove("connected", "error");
  if (stateName === "connected") statusDot.classList.add("connected");
  if (stateName === "error") statusDot.classList.add("error");
}

// ---- RESIZE ----
let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    drawTickChart();
    drawRsiChart();
  }, 150);
});

// ---- BOOT ----
chartMarket.textContent = MARKETS[currentSymbol].name;
connect();