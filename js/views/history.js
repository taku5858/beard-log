import { getSessionsWithNumbers, getPhotosForSessionMap } from "../services/sessionService.js";
import { blobToObjectURL } from "../utils/image.js";
import { formatDateJP, weekdayJP } from "../utils/format.js";
import { el } from "../utils/ui.js";
import { navigate } from "../router.js";

export async function renderHistory(root) {
  const sessions = (await getSessionsWithNumbers()).reverse();
  const objectUrls = [];

  root.innerHTML = `<div class="page page-history"></div>`;
  const page = root.querySelector(".page-history");

  if (sessions.length === 0) {
    page.appendChild(
      el(`
      <div class="empty-hero">
        <div class="empty-hero-mark">🗓️</div>
        <h2>施術履歴</h2>
        <p>記録した施術がここにタイムラインで並びます。</p>
        <button type="button" class="btn btn-primary btn-large" data-nav="/record/new">＋ 今回の施術を記録</button>
      </div>
    `)
    );
    page.querySelector("[data-nav]").addEventListener("click", (e) => navigate(e.currentTarget.dataset.nav));
    return;
  }

  page.innerHTML = `
    <h2 class="page-title">施術履歴</h2>
    <p class="page-subtitle">全${sessions.length}回。タップすると詳細の確認・編集ができます</p>
    <div class="timeline"></div>
  `;

  const timeline = page.querySelector(".timeline");

  for (const s of sessions) {
    const map = await getPhotosForSessionMap(s.id);
    const thumbPhoto = map.front || Object.values(map).find(Boolean);
    let thumbUrl = "";
    if (thumbPhoto) {
      thumbUrl = blobToObjectURL(thumbPhoto.blob);
      objectUrls.push(thumbUrl);
    }

    timeline.appendChild(
      el(`
      <button type="button" class="timeline-item" data-id="${s.id}">
        <div class="timeline-marker">
          <span class="timeline-num">${s.sessionNumber}</span>
          <span class="timeline-line"></span>
        </div>
        <div class="timeline-thumb">
          ${thumbUrl ? `<img src="${thumbUrl}" alt="">` : `<span class="timeline-thumb-empty">✂︎</span>`}
        </div>
        <div class="timeline-body">
          <span class="timeline-date">${formatDateJP(s.date)}（${weekdayJP(s.date)}）</span>
          <span class="timeline-clinic">${s.clinic || "クリニック未記入"}</span>
          <div class="timeline-meta">
            ${s.pain ? `<span class="meta-chip">痛み ${s.pain}/5</span>` : ""}
            ${s.redness ? `<span class="meta-chip">赤み ${s.redness}/5</span>` : ""}
          </div>
        </div>
        <span class="chevron">›</span>
      </button>
    `)
    );
  }

  timeline.querySelectorAll("[data-id]").forEach((b) => b.addEventListener("click", () => navigate(`/record/${b.dataset.id}`)));

  return () => objectUrls.forEach((u) => URL.revokeObjectURL(u));
}
