import { videoFrameToBlob, fileToProcessedBlob, blobToObjectURL } from "./utils/image.js";
import { angleLabel } from "./constants.js";

const GUIDE_HINT = {
  front: "鼻下・口・あごをガイドに合わせてください",
  left: "左頬〜あごのヒゲを大きく写してください",
  right: "右頬〜あごのヒゲを大きく写してください",
  chinUnder: "スマホを少し下げて、上を向いてください",
};

// このアプリは「顔写真」ではなく「ヒゲが生えている範囲」を毎回ほぼ同じ倍率・構図で
// 記録することが目的。顔全体の位置合わせや輪郭線・楕円は使わず、鼻下・口・あごなど
// ごく最小限の位置マークのみを薄く表示する。video要素の上に重ねるDOMオーバーレイ
// なので、撮影データ（Canvasに描画されるのはvideoフレームのみ）には焼き込まれない。
const GUIDE_STROKE = "rgba(230, 198, 142, 0.55)";
const GUIDE_STROKE_SOFT = "rgba(230, 198, 142, 0.32)";

function svgWrap(inner) {
  return `<svg class="camera-guide-svg" viewBox="0 0 300 500" preserveAspectRatio="xMidYMid slice" fill="none">${inner}</svg>`;
}

// 正面クローズアップ: 鼻下（短い水平ライン）／口（中央の小さな目印）／あご（短い水平ライン）の3点だけ
function frontGuide() {
  return svgWrap(`
    <line x1="128" y1="66" x2="172" y2="66" stroke="${GUIDE_STROKE}" stroke-width="1.8" stroke-linecap="round" />
    <line x1="142" y1="250" x2="158" y2="250" stroke="${GUIDE_STROKE_SOFT}" stroke-width="1.8" stroke-linecap="round" stroke-dasharray="2 5" />
    <line x1="118" y1="432" x2="182" y2="432" stroke="${GUIDE_STROKE}" stroke-width="1.8" stroke-linecap="round" />
  `);
}

// 側面クローズアップ（頬〜口横〜あご〜フェイスライン）: 鼻先・口・あごの位置を示す小さな目印のみ
function profileGuide(mirror) {
  const t = mirror ? ` transform="translate(300,0) scale(-1,1)"` : "";
  return svgWrap(`
    <g${t}>
      <line x1="184" y1="66" x2="212" y2="66" stroke="${GUIDE_STROKE}" stroke-width="1.5" stroke-linecap="round" />
      <line x1="160" y1="242" x2="192" y2="242" stroke="${GUIDE_STROKE_SOFT}" stroke-width="1.3" stroke-dasharray="4 6" />
      <line x1="140" y1="416" x2="172" y2="416" stroke="${GUIDE_STROKE}" stroke-width="1.5" stroke-linecap="round" />
    </g>
  `);
}

// あご下（任意）: 「この範囲に」を示す薄いコーナーガイドのみ（輪郭線・楕円は使わない）
function chinUnderGuide() {
  const bracket = (x1, y1, dx, dy) => `
    <path d="M${x1},${y1 + dy} L${x1},${y1} L${x1 + dx},${y1}" stroke="${GUIDE_STROKE}" stroke-width="1.6" stroke-linecap="round" />
  `;
  return svgWrap(`
    ${bracket(76, 150, 34, 34)}
    ${bracket(224, 150, -34, 34)}
    ${bracket(76, 372, 34, -34)}
    ${bracket(224, 372, -34, -34)}
  `);
}

const GUIDE_SVG = {
  front: frontGuide(),
  left: profileGuide(true),
  right: profileGuide(false),
  chinUnder: chinUnderGuide(),
};

// カメラで撮影 or ライブラリから選択して、処理済みJPEG Blobを返す。キャンセル時はnull。
export function openCameraCapture(angle) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "camera-overlay";
    overlay.innerHTML = `
      <div class="camera-top">
        <button type="button" class="icon-btn" data-act="close" aria-label="閉じる">✕</button>
        <span class="camera-title">${angleLabel(angle)}を撮影</span>
        <button type="button" class="icon-btn" data-act="switch" aria-label="カメラ切替" title="カメラ切替">⟲</button>
      </div>
      <div class="camera-stage">
        <video class="camera-video" playsinline autoplay muted></video>
        <canvas class="camera-preview-canvas" hidden></canvas>
        <div class="camera-guide guide-${angle}">${GUIDE_SVG[angle] || ""}</div>
        <p class="camera-hint">${GUIDE_HINT[angle] || ""}</p>
        <p class="camera-error" hidden></p>
      </div>
      <div class="camera-controls">
        <button type="button" class="btn btn-ghost" data-act="library">ライブラリから選ぶ</button>
        <button type="button" class="shutter-btn" data-act="shutter" aria-label="撮影する"></button>
        <span class="camera-controls-spacer"></span>
      </div>
      <div class="camera-review" hidden>
        <div class="camera-review-actions">
          <button type="button" class="btn btn-ghost" data-act="retake">撮り直す</button>
          <button type="button" class="btn btn-primary" data-act="use">この写真を使う</button>
        </div>
      </div>
      <input type="file" accept="image/*" capture="user" class="file-input-capture" hidden />
      <input type="file" accept="image/*" class="file-input-library" hidden />
    `;
    document.body.appendChild(overlay);
    document.body.classList.add("no-scroll");

    const video = overlay.querySelector(".camera-video");
    const previewCanvas = overlay.querySelector(".camera-preview-canvas");
    const errorEl = overlay.querySelector(".camera-error");
    const stage = overlay.querySelector(".camera-stage");
    const controls = overlay.querySelector(".camera-controls");
    const review = overlay.querySelector(".camera-review");
    const fileInputCapture = overlay.querySelector(".file-input-capture");
    const fileInputLibrary = overlay.querySelector(".file-input-library");

    let stream = null;
    let facingMode = "user";
    let capturedBlob = null;

    async function startStream() {
      errorEl.hidden = true;
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showFallback("このブラウザではカメラのライブプレビューが利用できません。下のボタンから撮影してください。");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode, width: { ideal: 1280 }, height: { ideal: 1280 } },
          audio: false,
        });
        video.srcObject = stream;
        video.style.transform = facingMode === "user" ? "scaleX(-1)" : "none";
        video.hidden = false;
      } catch (e) {
        showFallback("カメラを起動できませんでした。下のボタンから撮影・選択してください。");
      }
    }

    function showFallback(msg) {
      errorEl.textContent = msg;
      errorEl.hidden = false;
      video.hidden = true;
    }

    function stopStream() {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
        stream = null;
      }
    }

    function close(result) {
      stopStream();
      document.body.classList.remove("no-scroll");
      overlay.remove();
      resolve(result);
    }

    async function doCapture() {
      if (!stream) {
        fileInputCapture.click();
        return;
      }
      capturedBlob = await videoFrameToBlob(video, { mirror: facingMode === "user" });
      showReview(capturedBlob);
    }

    function showReview(blob) {
      const url = blobToObjectURL(blob);
      previewCanvas.hidden = false;
      stage.querySelector(".camera-guide")?.classList.add("hidden");
      video.hidden = true;
      const img = new Image();
      img.onload = () => {
        previewCanvas.width = img.width;
        previewCanvas.height = img.height;
        previewCanvas.getContext("2d").drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
      };
      img.src = url;
      controls.hidden = true;
      review.hidden = false;
    }

    function backToLive() {
      previewCanvas.hidden = true;
      stage.querySelector(".camera-guide")?.classList.remove("hidden");
      video.hidden = false;
      controls.hidden = false;
      review.hidden = true;
      capturedBlob = null;
    }

    overlay.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-act]");
      if (!btn) return;
      const act = btn.dataset.act;
      if (act === "close") close(null);
      else if (act === "switch") {
        facingMode = facingMode === "user" ? "environment" : "user";
        stopStream();
        startStream();
      } else if (act === "shutter") doCapture();
      else if (act === "library") fileInputLibrary.click();
      else if (act === "retake") backToLive();
      else if (act === "use") close(capturedBlob);
    });

    fileInputCapture.addEventListener("change", async () => {
      const file = fileInputCapture.files[0];
      if (!file) return;
      const blob = await fileToProcessedBlob(file);
      close(blob);
    });

    fileInputLibrary.addEventListener("change", async () => {
      const file = fileInputLibrary.files[0];
      if (!file) return;
      const blob = await fileToProcessedBlob(file);
      close(blob);
    });

    startStream();
  });
}
