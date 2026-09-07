import { getSessionsWithNumbers, getPhotosForSessionMap } from "../services/sessionService.js";
import { PHOTO_ANGLES } from "../constants.js";
import { formatDateJP } from "../utils/format.js";
import { blobToObjectURL } from "../utils/image.js";
import { el } from "../utils/ui.js";
import { navigate } from "../router.js";

export async function renderCompare(root) {
  const sessions = await getSessionsWithNumbers();
  const objectUrls = [];

  root.innerHTML = `<div class="page page-compare"></div>`;
  const page = root.querySelector(".page-compare");

  const withPhotos = sessions; // 写真がない回も選択肢には出す（未撮影と分かるように）

  if (sessions.length === 0) {
    page.appendChild(
      el(`
      <div class="empty-hero">
        <div class="empty-hero-mark">📷</div>
        <h2>写真比較</h2>
        <p>施術のたびに写真を記録すると、Before/Afterで変化を見比べられます。</p>
        <button type="button" class="btn btn-primary btn-large" data-nav="/record/new">＋ 今回の施術を記録</button>
      </div>
    `)
    );
    page.querySelector("[data-nav]").addEventListener("click", (e) => navigate(e.currentTarget.dataset.nav));
    return;
  }

  page.innerHTML = `
    <h2 class="page-title">Before / After</h2>
    <p class="page-subtitle">回を選んで、写真の変化を見比べられます</p>

    <section class="card compare-controls">
      <div class="compare-selectors">
        <label class="field">
          <span>Before</span>
          <select data-role="before"></select>
        </label>
        <label class="field">
          <span>After</span>
          <select data-role="after"></select>
        </label>
      </div>
      <div class="angle-tabs"></div>
      <div class="compare-mode-toggle">
        <button type="button" class="mode-btn active" data-mode="slider">スライダー比較</button>
        <button type="button" class="mode-btn" data-mode="side">並べて比較</button>
      </div>
    </section>

    <div class="compare-stage card"></div>
  `;

  const beforeSelect = page.querySelector('[data-role="before"]');
  const afterSelect = page.querySelector('[data-role="after"]');
  withPhotos.forEach((s) => {
    const label = `${s.sessionNumber}回目・${formatDateJP(s.date)}`;
    beforeSelect.appendChild(el(`<option value="${s.id}">${label}</option>`));
    afterSelect.appendChild(el(`<option value="${s.id}">${label}</option>`));
  });
  beforeSelect.value = withPhotos[0].id;
  afterSelect.value = withPhotos[withPhotos.length - 1].id;

  const angleTabs = page.querySelector(".angle-tabs");
  let activeAngle = PHOTO_ANGLES[0].key;
  PHOTO_ANGLES.forEach((a) => {
    angleTabs.appendChild(el(`<button type="button" class="angle-tab ${a.key === activeAngle ? "active" : ""}" data-angle="${a.key}">${a.label}</button>`));
  });

  let mode = "slider";
  const stage = page.querySelector(".compare-stage");

  async function loadUrl(sessionId, angle) {
    const map = await getPhotosForSessionMap(sessionId);
    const photo = map[angle];
    if (!photo) return null;
    const url = blobToObjectURL(photo.blob);
    objectUrls.push(url);
    return url;
  }

  async function draw() {
    const beforeId = beforeSelect.value;
    const afterId = afterSelect.value;
    const beforeSession = withPhotos.find((s) => s.id === beforeId);
    const afterSession = withPhotos.find((s) => s.id === afterId);

    stage.innerHTML = `<div class="compare-loading">読み込み中…</div>`;
    const [beforeUrl, afterUrl] = await Promise.all([loadUrl(beforeId, activeAngle), loadUrl(afterId, activeAngle)]);

    if (!beforeUrl && !afterUrl) {
      stage.innerHTML = `<div class="compare-empty">この角度の写真がまだ記録されていません</div>`;
      return;
    }

    if (mode === "side") {
      stage.innerHTML = `
        <div class="compare-side">
          <div class="compare-side-item">
            <div class="compare-photo-box">${beforeUrl ? `<img src="${beforeUrl}">` : `<div class="compare-empty small">写真なし</div>`}</div>
            <span class="compare-tag">Before・${beforeSession.sessionNumber}回目</span>
            <span class="compare-tag-date">${formatDateJP(beforeSession.date)}</span>
          </div>
          <div class="compare-side-item">
            <div class="compare-photo-box">${afterUrl ? `<img src="${afterUrl}">` : `<div class="compare-empty small">写真なし</div>`}</div>
            <span class="compare-tag">After・${afterSession.sessionNumber}回目</span>
            <span class="compare-tag-date">${formatDateJP(afterSession.date)}</span>
          </div>
        </div>`;
    } else {
      if (!beforeUrl || !afterUrl) {
        stage.innerHTML = `<div class="compare-empty">スライダー比較には、どちらの回にもこの角度の写真が必要です</div>`;
        return;
      }
      stage.innerHTML = `
        <div class="compare-slider">
          <div class="compare-slider-tag compare-slider-tag-before">Before・${beforeSession.sessionNumber}回目</div>
          <div class="compare-slider-tag compare-slider-tag-after">After・${afterSession.sessionNumber}回目</div>
          <div class="compare-slider-frame">
            <img class="compare-slider-after" src="${afterUrl}">
            <div class="compare-slider-before-wrap">
              <img class="compare-slider-before" src="${beforeUrl}">
            </div>
            <div class="compare-slider-handle">
              <span class="compare-slider-knob">‹ ›</span>
            </div>
          </div>
          <input type="range" class="compare-slider-input" min="0" max="100" value="50">
        </div>`;
      setupSlider(stage);
    }
  }

  function setupSlider(container) {
    const frame = container.querySelector(".compare-slider-frame");
    const beforeWrap = container.querySelector(".compare-slider-before-wrap");
    const handle = container.querySelector(".compare-slider-handle");
    const input = container.querySelector(".compare-slider-input");

    function setPos(percent) {
      percent = Math.max(0, Math.min(100, percent));
      beforeWrap.style.width = percent + "%";
      handle.style.left = percent + "%";
      input.value = percent;
    }
    setPos(50);

    input.addEventListener("input", () => setPos(Number(input.value)));

    let dragging = false;
    function posFromEvent(e) {
      const rect = frame.getBoundingClientRect();
      const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
      return (x / rect.width) * 100;
    }
    handle.addEventListener("pointerdown", (e) => {
      dragging = true;
      handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      setPos(posFromEvent(e));
    });
    handle.addEventListener("pointerup", () => (dragging = false));
    frame.addEventListener("click", (e) => {
      if (e.target === handle || handle.contains(e.target)) return;
      setPos(posFromEvent(e));
    });
  }

  beforeSelect.addEventListener("change", draw);
  afterSelect.addEventListener("change", draw);
  angleTabs.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-angle]");
    if (!btn) return;
    activeAngle = btn.dataset.angle;
    angleTabs.querySelectorAll(".angle-tab").forEach((b) => b.classList.toggle("active", b === btn));
    draw();
  });
  page.querySelector(".compare-mode-toggle").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-mode]");
    if (!btn) return;
    mode = btn.dataset.mode;
    page.querySelectorAll(".mode-btn").forEach((b) => b.classList.toggle("active", b === btn));
    draw();
  });

  draw();

  return () => {
    objectUrls.forEach((u) => URL.revokeObjectURL(u));
  };
}
