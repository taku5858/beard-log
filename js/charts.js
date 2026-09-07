// 外部ライブラリを使わないシンプルなCanvasグラフ描画

function setupHiDPI(canvas, cssWidth, cssHeight) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);
  canvas.style.width = cssWidth + "px";
  canvas.style.height = cssHeight + "px";
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

// series: [{ key, label, color, points: [{x:number, y:number}] }]
export function renderLineChart(canvas, { series, xTickLabels, yMax = 100 }) {
  const cssWidth = canvas.parentElement.clientWidth;
  const cssHeight = 220;
  const ctx = setupHiDPI(canvas, cssWidth, cssHeight);
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  const padL = 30;
  const padR = 12;
  const padT = 14;
  const padB = 26;
  const w = cssWidth - padL - padR;
  const h = cssHeight - padT - padB;

  const maxX = Math.max(1, ...series.flatMap((s) => s.points.map((p) => p.x)), xTickLabels.length - 1 || 1);

  const styles = getComputedStyle(document.documentElement);
  const gridColor = styles.getPropertyValue("--border").trim() || "#333";
  const textColor = styles.getPropertyValue("--text-dim").trim() || "#999";

  ctx.strokeStyle = gridColor;
  ctx.fillStyle = textColor;
  ctx.font = "10px -apple-system, sans-serif";
  ctx.lineWidth = 1;

  // 横グリッド線 (0,25,50,75,100)
  [0, 25, 50, 75, 100].forEach((v) => {
    const y = padT + h - (v / yMax) * h;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + w, y);
    ctx.globalAlpha = v === 0 ? 0.5 : 0.18;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillText(v + "%", 2, y + 3);
  });

  // X軸ラベル
  ctx.textAlign = "center";
  xTickLabels.forEach((label, i) => {
    const x = padL + (maxX === 0 ? 0 : (i / maxX) * w);
    ctx.fillText(label, x, cssHeight - 8);
  });
  ctx.textAlign = "left";

  const toX = (x) => padL + (maxX === 0 ? 0 : (x / maxX) * w);
  const toY = (y) => padT + h - (y / yMax) * h;

  series.forEach((s) => {
    if (s.points.length === 0) return;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    s.points.forEach((p, i) => {
      const x = toX(p.x);
      const y = toY(p.y);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.fillStyle = s.color;
    s.points.forEach((p) => {
      ctx.beginPath();
      ctx.arc(toX(p.x), toY(p.y), 3, 0, Math.PI * 2);
      ctx.fill();
    });
  });
}

// items: [{ label, value(0-100), color }]
export function renderBarChart(canvas, items) {
  const cssWidth = canvas.parentElement.clientWidth;
  const rowH = 30;
  const cssHeight = items.length * rowH + 8;
  const ctx = setupHiDPI(canvas, cssWidth, cssHeight);
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  const labelW = 58;
  const valueW = 40;
  const barMaxW = cssWidth - labelW - valueW - 8;

  const styles = getComputedStyle(document.documentElement);
  const trackColor = styles.getPropertyValue("--border").trim() || "#333";
  const textColor = styles.getPropertyValue("--text").trim() || "#eee";

  ctx.font = "12px -apple-system, sans-serif";
  ctx.textBaseline = "middle";

  items.forEach((item, i) => {
    const y = i * rowH + rowH / 2 + 4;
    ctx.fillStyle = textColor;
    ctx.textAlign = "left";
    ctx.fillText(item.label, 0, y);

    const barY = y - 6;
    ctx.fillStyle = trackColor;
    roundRect(ctx, labelW, barY, barMaxW, 12, 6);
    ctx.fill();

    const bw = Math.max(0, Math.min(1, item.value / 100)) * barMaxW;
    if (bw > 0) {
      ctx.fillStyle = item.color;
      roundRect(ctx, labelW, barY, bw, 12, 6);
      ctx.fill();
    }

    ctx.fillStyle = textColor;
    ctx.textAlign = "right";
    ctx.fillText(Math.round(item.value) + "%", cssWidth, y);
  });
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  if (w <= 0) return;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
