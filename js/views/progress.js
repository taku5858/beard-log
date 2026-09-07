import { getProgressSeries, getLatestAreaBreakdown, updateLatestSessionAreas } from "../services/sessionService.js";
import { AREAS } from "../constants.js";
import { renderLineChart, renderBarChart } from "../charts.js";
import { el, showToast } from "../utils/ui.js";
import { navigate } from "../router.js";

export async function renderProgress(root) {
  const { series, xTickLabels, sessions } = await getProgressSeries();
  const breakdown = await getLatestAreaBreakdown();

  root.innerHTML = `<div class="page page-progress"></div>`;
  const page = root.querySelector(".page-progress");

  if (sessions.length === 0) {
    page.appendChild(
      el(`
      <div class="empty-hero">
        <div class="empty-hero-mark">📈</div>
        <h2>経過グラフ</h2>
        <p>記録を追加すると、部位ごとの減少実感がグラフで確認できるようになります。</p>
        <button type="button" class="btn btn-primary btn-large" data-nav="/record/new">＋ 今回の施術を記録</button>
      </div>
    `)
    );
    page.querySelector("[data-nav]").addEventListener("click", (e) => navigate(e.currentTarget.dataset.nav));
    return;
  }

  page.innerHTML = `
    <h2 class="page-title">経過</h2>
    <p class="page-subtitle">${sessions.length}回分の記録から、部位別の減少実感を振り返れます</p>

    <section class="card">
      <h4 class="form-section-title">部位別の推移</h4>
      <div class="chart-wrap"><canvas class="line-chart"></canvas></div>
      <div class="legend"></div>
    </section>

    <section class="card">
      <h4 class="form-section-title">今の部位別状況</h4>
      <p class="form-hint">最新（${sessions[sessions.length - 1].sessionNumber}回目）時点の減少実感。数値が高いほど減ったと感じている部位です。</p>
      <div class="bar-chart-wrap"><canvas class="bar-chart"></canvas></div>
    </section>

    <details class="card form-card details-card">
      <summary>変化を記録・更新する</summary>
      <div class="details-body">
        <p class="form-hint">開始時と比べてどのくらい減ったと感じるか、気が向いたときに更新してください</p>
        <div class="area-sliders"></div>
        <button type="button" class="btn btn-secondary" data-act="save-areas">この内容で更新する</button>
      </div>
    </details>

    <p class="disclaimer">※ 数値はご自身の主観による記録です。効果を保証するものではなく、医学的な判定は行いません。</p>
  `;

  const latestAreas = sessions[sessions.length - 1].areas || {};
  const areaWrap = page.querySelector(".area-sliders");
  AREAS.forEach((a) => {
    const v = latestAreas[a.key] ?? 0;
    areaWrap.appendChild(
      el(`
      <div class="area-slider-row">
        <div class="area-slider-head">
          <span>${a.label}</span>
          <span class="area-slider-value" data-value-for="${a.key}">${v}%</span>
        </div>
        <input type="range" min="0" max="100" step="5" value="${v}" data-area="${a.key}" class="slider">
      </div>
    `)
    );
  });
  areaWrap.querySelectorAll("input[type=range]").forEach((input) => {
    input.addEventListener("input", () => {
      page.querySelector(`[data-value-for="${input.dataset.area}"]`).textContent = input.value + "%";
    });
  });

  page.querySelector('[data-act="save-areas"]').addEventListener("click", async () => {
    const areas = {};
    AREAS.forEach((a) => {
      areas[a.key] = Number(page.querySelector(`[data-area="${a.key}"]`).value);
    });
    await updateLatestSessionAreas(areas);
    showToast("変化を記録しました");
    navigate("/progress");
  });

  const legend = page.querySelector(".legend");
  const activeKeys = new Set(series.map((s) => s.key));
  series.forEach((s) => {
    legend.appendChild(
      el(`
      <button type="button" class="legend-chip active" data-key="${s.key}" style="--chip-color:${s.color}">
        <span class="legend-dot"></span>${s.label}
      </button>
    `)
    );
  });

  const lineCanvas = page.querySelector(".line-chart");
  function drawLine() {
    renderLineChart(lineCanvas, {
      series: series.filter((s) => activeKeys.has(s.key)),
      xTickLabels,
      yMax: 100,
    });
  }
  drawLine();

  legend.querySelectorAll(".legend-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const key = chip.dataset.key;
      if (activeKeys.has(key)) {
        if (activeKeys.size === 1) return;
        activeKeys.delete(key);
        chip.classList.remove("active");
      } else {
        activeKeys.add(key);
        chip.classList.add("active");
      }
      drawLine();
    });
  });

  renderBarChart(page.querySelector(".bar-chart"), breakdown);

  const onResize = () => {
    drawLine();
    renderBarChart(page.querySelector(".bar-chart"), breakdown);
  };
  window.addEventListener("resize", onResize);
  return () => window.removeEventListener("resize", onResize);
}
