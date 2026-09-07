import { videoFrameToBlob, fileToProcessedBlob, blobToObjectURL } from "./utils/image.js";
import { angleLabel } from "./constants.js";

const GUIDE_HINT = {
  front: "鼻下からあご下までを大きく写してください",
  left: "左頬〜あごのヒゲを大きく写してください",
  right: "右頬〜あごのヒゲを大きく写してください",
  chinUnder: "スマホを少し下げて、上を向いてください",
};

// このアプリは「顔写真」ではなく「ヒゲが生えている範囲」を毎回同じ倍率・位置で
// 記録することが目的。ガイドは細く半透明なマークのみとし、映像のヒゲが見えにくく
// ならないようにする。video要素の上に重ねるDOMオーバーレイなので、
// 撮影データ（Canvasに描画されるのはvideoフレームのみ）には一切焼き込まれない。
const GUIDE_STROKE = "rgba(230, 198, 142, 0.6)";
const GUIDE_STROKE_SOFT = "rgba(230, 198, 142, 0.35)";

function svgWrap(inner) {
  return `<svg class="camera-guide-svg" viewBox="0 0 300 500" preserveAspectRatio="xMidYMid slice" fill="none">${inner}</svg>`;
}

// 正面クローズアップ: 鼻の下端 / 口の位置（画面中央） / あごの下端 を薄いマークで示す
function frontGuide() {
  return svgWrap(`
    <path d="M124,58 Q150,74 176,58" stroke="${GUIDE_STROKE}" stroke-width="1.6" stroke-linecap="round" />
    <line x1="106" y1="250" x2="194" y2="250" stroke="${GUIDE_STROKE_SOFT}" stroke-width="1.4" stroke-dasharray="5 7" />
    <line x1="88" y1="432" x2="212" y2="432" stroke="${GUIDE_STROKE}" stroke-width="1.8" />
    <line x1="150" y1="58" x2="150" y2="432" stroke="${GUIDE_STROKE_SOFT}" stroke-width="1" stroke-dasharray="2 9" />
    <line x1="52" y1="100" x2="52" y2="400" stroke="${GUIDE_STROKE_SOFT}" stroke-width="1" stroke-dasharray="3 8" />
    <line x1="248" y1="100" x2="248" y2="400" stroke="${GUIDE_STROKE_SOFT}" stroke-width="1" stroke-dasharray="3 8" />
  `);
}

// 側面クローズアップ（頬〜口横〜あご〜フェイスライン）。右向きを基準に作り、左は水平反転して使う
function profileGuide(mirror) {
  const t = mirror ? ` transform="translate(300,0) scale(-1,1)"` : "";
  return svgWrap(`
    <g${t}>
      <path d="M204,54 C214,110 202,156 186,196 C174,226 168,236 158,258
               C148,282 148,314 144,346 C140,382 138,410 138,440"
        stroke="${GUIDE_STROKE}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
      <line x1="178" y1="60" x2="216" y2="60" stroke="${GUIDE_STROKE_SOFT}" stroke-width="1.2" stroke-dasharray="3 6" />
      <line x1="152" y1="240" x2="192" y2="240" stroke="${GUIDE_STROKE_SOFT}" stroke-width="1.2" stroke-dasharray="3 6" />
      <line x1="124" y1="410" x2="164" y2="410" stroke="${GUIDE_STROKE_SOFT}" stroke-width="1.2" stroke-dasharray="3 6" />
    </g>
  `);
}

// あご下（任意）: あご下の境界ライン ＋ フェイスラインの続き ＋ 首上部の目安
function chinUnderGuide() {
  return svgWrap(`
    <path d="M70,140 C70,192 106,224 150,224 C194,224 230,192 230,140"
      stroke="${GUIDE_STROKE}" stroke-width="1.6" />
    <line x1="150" y1="118" x2="150" y2="140" stroke="${GUIDE_STROKE_SOFT}" stroke-width="1.2" stroke-dasharray="2 6" />
    <line x1="104" y1="224" x2="104" y2="420" stroke="${GUIDE_STROKE_SOFT}" stroke-width="1.1" stroke-dasharray="3 7" />
    <line x1="196" y1="224" x2="196" y2="420" stroke="${GUIDE_STROKE_SOFT}" stroke-width="1.1" stroke-dasharray="3 7" />
    <line x1="90" y1="392" x2="210" y2="392" stroke="${GUIDE_STROKE_SOFT}" stroke-width="1.1" stroke-dasharray="3 7" />
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
