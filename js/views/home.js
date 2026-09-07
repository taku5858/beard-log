import { getHomeSummary } from "../services/sessionService.js";
import { formatDateJP } from "../utils/format.js";
import { navigate } from "../router.js";
import { el } from "../utils/ui.js";

export async function renderHome(root) {
  const summary = await getHomeSummary();

  root.innerHTML = `<div class="page page-home"></div>`;
  const page = root.querySelector(".page-home");

  if (!summary.hasSessions) {
    page.appendChild(
      el(`
      <div class="empty-hero">
        <div class="empty-hero-mark">
          <img src="icons/icon-192.png" alt="" width="56" height="56">
        </div>
        <h2>ヒゲ脱毛の変化を、残そう。</h2>
        <p>施術ごとに写真を残すだけ。<br>1回目と今の変化をいつでも比較できます。</p>
        <button type="button" class="btn btn-primary btn-large" data-nav="/record/new">＋ 1回目を記録</button>
      </div>
    `)
    );
    page.querySelector("[data-nav]").addEventListener("click", (e) => navigate(e.currentTarget.dataset.nav));
    return;
  }

  const { latest, totalSessions, daysSinceLast, daysUntilNext, overallChangePercent, topArea, recent } = summary;

  page.innerHTML = `
    <div class="stats-grid">
      <div class="stat-tile stat-tile-accent">
        <span class="stat-tile-label">現在</span>
        <span class="stat-tile-value">${totalSessions}<small>回目</small></span>
      </div>
      <div class="stat-tile">
        <span class="stat-tile-label">前回施術から</span>
        <span class="stat-tile-value">${daysSinceLast}<small>日</small></span>
        <span class="stat-tile-sub">${formatDateJP(latest.date)}</span>
      </div>
      <div class="stat-tile">
        <span class="stat-tile-label">開始時からの変化</span>
        <span class="stat-tile-value">${overallChangePercent}<small>%</small></span>
        <span class="stat-tile-sub">${topArea && topArea.value > 0 ? `${topArea.label}が最も減少` : "主観評価の平均"}</span>
      </div>
      <div class="stat-tile ${daysUntilNext !== null && daysUntilNext <= 3 ? "stat-tile-soon" : ""}">
        <span class="stat-tile-label">次回予約</span>
        ${
          latest.nextAppointment
            ? `<span class="stat-tile-value">${daysUntilNext > 0 ? daysUntilNext : 0}<small>日後</small></span><span class="stat-tile-sub">${formatDateJP(latest.nextAppointment)}</span>`
            : `<span class="stat-tile-value stat-tile-value-muted">未設定</span>`
        }
      </div>
    </div>

    <button type="button" class="btn btn-primary btn-large btn-cta" data-nav="/record/new">＋ 今回の施術を記録</button>

    <section class="section">
      <div class="section-head">
        <h3>直近の施術履歴</h3>
        <a href="#/history" class="link-more">すべて見る</a>
      </div>
      <div class="history-mini-list"></div>
    </section>
  `;

  const list = page.querySelector(".history-mini-list");
  recent.forEach((s) => {
    list.appendChild(
      el(`
      <button type="button" class="history-mini-item" data-id="${s.id}">
        <span class="history-mini-num">${s.sessionNumber}</span>
        <span class="history-mini-info">
          <span class="history-mini-date">${formatDateJP(s.date)}</span>
          <span class="history-mini-clinic">${s.clinic || "クリニック未記入"}</span>
        </span>
        <span class="chevron">›</span>
      </button>
    `)
    );
  });

  page.querySelectorAll("[data-nav]").forEach((b) => b.addEventListener("click", (e) => navigate(e.currentTarget.dataset.nav)));
  list.querySelectorAll("[data-id]").forEach((b) => b.addEventListener("click", () => navigate(`/record/${b.dataset.id}`)));
}
