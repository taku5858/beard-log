import {
  getSessionById,
  getSessionsWithNumbers,
  getDefaultAreasForNewSession,
  getPhotosForSessionMap,
  createSession,
  updateSessionById,
  deleteSessionById,
} from "../services/sessionService.js";
import { PHOTO_ANGLES, LASER_TYPES } from "../constants.js";
import { todayISO, formatDateJP } from "../utils/format.js";
import { navigate } from "../router.js";
import { el, showToast, showConfirm } from "../utils/ui.js";
import { openCameraCapture } from "../camera.js";
import { blobToObjectURL } from "../utils/image.js";

export async function renderRecord(root, params) {
  const isNew = !params.id || params.id === "new";
  let session = {
    date: todayISO(),
    clinic: "",
    device: "",
    laserType: "",
    output: "",
    pain: null,
    redness: null,
    memo: "",
    nextAppointment: "",
    areas: await getDefaultAreasForNewSession(),
  };

  if (!isNew) {
    const found = await getSessionById(params.id);
    if (!found) {
      navigate("/history");
      return;
    }
    session = { ...session, ...found, areas: { ...session.areas, ...(found.areas || {}) } };
  }

  const allSessions = await getSessionsWithNumbers();
  const previewNumber = isNew ? allSessions.length + 1 : allSessions.find((s) => s.id === session.id)?.sessionNumber ?? "-";

  const existingPhotos = isNew ? {} : await getPhotosForSessionMap(session.id);
  const photoState = {}; // angleKey -> { blob, url, existing, removed }
  PHOTO_ANGLES.forEach((a) => {
    const existing = existingPhotos[a.key] || null;
    photoState[a.key] = existing
      ? { blob: null, url: blobToObjectURL(existing.blob), existing, removed: false }
      : { blob: null, url: null, existing: null, removed: false };
  });

  root.innerHTML = `<div class="page page-record"></div>`;
  const page = root.querySelector(".page-record");

  page.innerHTML = `
    <div class="record-header">
      <button type="button" class="icon-btn" data-act="back" aria-label="戻る">‹</button>
      <h2>${isNew ? "施術を記録" : `${previewNumber}回目の記録`}</h2>
      <span class="record-badge">${previewNumber}回目</span>
    </div>
    <form class="record-form">
      <section class="card form-card">
        <div class="field-row">
          <label class="field">
            <span>施術日</span>
            <input type="date" name="date" required value="${session.date}">
          </label>
          <label class="field">
            <span>次回予約日（任意）</span>
            <input type="date" name="nextAppointment" value="${session.nextAppointment || ""}">
          </label>
        </div>
      </section>

      <section class="card form-card">
        <h4 class="form-section-title">写真</h4>
        <p class="form-hint">正面だけでもOK。毎回同じ位置・角度で撮ると比較しやすくなります</p>
        <div class="photo-grid"></div>
      </section>

      <details class="card form-card details-card">
        <summary>詳細を追加（クリニック・脱毛機・痛みなど）</summary>
        <div class="details-body">
          <label class="field">
            <span>クリニック名</span>
            <input type="text" name="clinic" placeholder="例）〇〇クリニック" value="${escapeAttr(session.clinic)}">
          </label>
          <label class="field">
            <span>使用した脱毛機</span>
            <input type="text" name="device" placeholder="例）ジェントルマックスプロ" value="${escapeAttr(session.device)}">
          </label>
          <label class="field">
            <span>レーザー種類</span>
            <select name="laserType">
              <option value="">選択しない</option>
              ${LASER_TYPES.map((t) => `<option value="${t}" ${session.laserType === t ? "selected" : ""}>${t}</option>`).join("")}
            </select>
          </label>
          <label class="field">
            <span>出力（わかる場合のみ）</span>
            <input type="text" name="output" placeholder="例）30J" value="${escapeAttr(session.output)}">
          </label>
          <div class="rating-field">
            <span>痛み</span>
            <div class="rating-dots" data-rating="pain">${ratingDots(session.pain)}</div>
          </div>
          <div class="rating-field">
            <span>赤み</span>
            <div class="rating-dots" data-rating="redness">${ratingDots(session.redness)}</div>
          </div>
          <label class="field">
            <span>メモ</span>
            <textarea name="memo" rows="3" placeholder="気づいたことなど自由に">${session.memo || ""}</textarea>
          </label>
        </div>
      </details>

      <div class="record-actions">
        <button type="submit" class="btn btn-primary btn-large">保存する</button>
        ${!isNew ? `<button type="button" class="btn btn-danger-outline" data-act="delete">この記録を削除</button>` : ""}
      </div>
    </form>
  `;

  // rating dots
  page.querySelectorAll(".rating-dots").forEach((wrap) => {
    if (wrap.querySelector(".rating-dot.active")) {
      wrap.dataset.current = wrap.querySelector(".rating-dot.active").dataset.val;
    }
    wrap.addEventListener("click", (e) => {
      const dot = e.target.closest("[data-val]");
      if (!dot) return;
      const val = Number(dot.dataset.val);
      const current = wrap.dataset.current ? Number(wrap.dataset.current) : null;
      const next = current === val ? null : val;
      wrap.dataset.current = next ?? "";
      wrap.querySelectorAll("[data-val]").forEach((d) => d.classList.toggle("active", next !== null && Number(d.dataset.val) <= next));
    });
  });

  // photos
  const photoGrid = page.querySelector(".photo-grid");
  PHOTO_ANGLES.forEach((a) => {
    photoGrid.appendChild(buildPhotoSlot(a));
  });

  function buildPhotoSlot(angle) {
    const state = photoState[angle.key];
    const slot = el(`
      <div class="photo-slot" data-angle="${angle.key}">
        <div class="photo-slot-preview ${state.url ? "has-photo" : ""}">
          ${state.url ? `<img src="${state.url}" alt="${angle.label}">` : `<span class="photo-slot-placeholder">＋</span>`}
        </div>
        <div class="photo-slot-foot">
          <span class="photo-slot-label">${angle.label}</span>
          ${state.url ? `<button type="button" class="photo-slot-remove" data-act="remove-photo" data-angle="${angle.key}">削除</button>` : ""}
        </div>
      </div>
    `);
    slot.querySelector(".photo-slot-preview").addEventListener("click", async () => {
      const blob = await openCameraCapture(angle.key);
      if (!blob) return;
      const st = photoState[angle.key];
      if (st.url && st.blob) URL.revokeObjectURL(st.url);
      st.blob = blob;
      st.url = blobToObjectURL(blob);
      st.removed = false;
      const newSlot = buildPhotoSlot(angle);
      slot.replaceWith(newSlot);
    });
    const removeBtn = slot.querySelector("[data-act=remove-photo]");
    if (removeBtn) {
      removeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const st = photoState[angle.key];
        st.removed = true;
        st.blob = null;
        st.url = null;
        const newSlot = buildPhotoSlot(angle);
        slot.replaceWith(newSlot);
      });
    }
    return slot;
  }

  page.querySelector("[data-act=back]").addEventListener("click", () => history.back());

  const deleteBtn = page.querySelector("[data-act=delete]");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", async () => {
      const ok = await showConfirm({
        title: "この記録を削除しますか？",
        message: `${formatDateJP(session.date)}の記録（写真を含む）を完全に削除します。この操作は取り消せません。`,
        okText: "削除する",
        danger: true,
      });
      if (!ok) return;
      await deleteSessionById(session.id);
      showToast("記録を削除しました");
      navigate("/history");
    });
  }

  page.querySelector(".record-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const painDots = page.querySelector('[data-rating="pain"]');
    const rednessDots = page.querySelector('[data-rating="redness"]');

    const data = {
      date: fd.get("date"),
      clinic: fd.get("clinic").trim(),
      device: fd.get("device").trim(),
      laserType: fd.get("laserType"),
      output: fd.get("output").trim(),
      pain: painDots.dataset.current ? Number(painDots.dataset.current) : null,
      redness: rednessDots.dataset.current ? Number(rednessDots.dataset.current) : null,
      memo: fd.get("memo").trim(),
      nextAppointment: fd.get("nextAppointment") || "",
      // 部位別の減少実感は「経過」画面でのみ編集する。ここでは既存値をそのまま引き継ぐ
      areas: session.areas,
    };

    const photoChanges = {};
    PHOTO_ANGLES.forEach((angle) => {
      const st = photoState[angle.key];
      if (st.blob) photoChanges[angle.key] = { blob: st.blob };
      else if (st.removed && st.existing) photoChanges[angle.key] = { remove: true };
    });

    if (isNew) {
      await createSession(data, photoChanges);
    } else {
      await updateSessionById(session.id, data, photoChanges);
    }

    showToast("記録を保存しました");
    navigate(isNew ? "/home" : "/history");
  });

  return () => {
    Object.values(photoState).forEach((st) => {
      if (st.url && st.blob) URL.revokeObjectURL(st.url);
    });
  };
}

function ratingDots(value) {
  return [1, 2, 3, 4, 5]
    .map((n) => `<button type="button" class="rating-dot ${value !== null && n <= value ? "active" : ""}" data-val="${n}">${n}</button>`)
    .join("");
}

function escapeAttr(str) {
  return (str || "").toString().replace(/"/g, "&quot;");
}
