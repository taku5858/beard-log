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
//
// 以前は viewBox="0 0 300 500" + preserveAspectRatio="slice" を使っていたが、
// 実機のカメラ画面の縦横比がその想定比率とずれると slice が上下を切り取ってしまい、
// 中央のマークしか見えなくなる不具合があった。そのため viewBox は 0-100 の割合空間にし、
// preserveAspectRatio="none" でコンテナに正確にフィットさせ、上下中央の3点が
// どんな画面サイズでも必ず同時に見えるようにしている（直線だけなので非均等スケールでも歪まない）。
const GUIDE_STROKE = "rgba(230, 198, 142, 0.68)";
const GUIDE_STROKE_SOFT = "rgba(230, 198, 142, 0.45)";

function svgWrap(inner) {
  return `<svg class="camera-guide-svg" viewBox="0 0 100 100" preserveAspectRatio="none" fill="none">${inner}</svg>`;
}

// ラベルはSVG内テキストではなくHTML要素で重ねる（非均等スケールで文字が歪まないようにするため）
function label(text, topPercent, leftPercent, align = "left") {
  return `<span class="camera-guide-label" style="top:${topPercent}%; left:${leftPercent}%; text-align:${align};">${text}</span>`;
}

// 正面クローズアップ: 鼻下（短い水平線）／口（小さな十字）／あご（短い水平線）の3点を常に同時表示
function frontGuide() {
  const svg = svgWrap(`
    <line x1="33" y1="13" x2="53" y2="13" stroke="${GUIDE_STROKE}" stroke-width="0.6" stroke-linecap="round" />
    <line x1="50" y1="47" x2="50" y2="53" stroke="${GUIDE_STROKE}" stroke-width="0.6" stroke-linecap="round" />
    <line x1="47" y1="50" x2="53" y2="50" stroke="${GUIDE_STROKE}" stroke-width="0.6" stroke-linecap="round" />
    <line x1="30" y1="87" x2="50" y2="87" stroke="${GUIDE_STROKE}" stroke-width="0.6" stroke-linecap="round" />
  `);
  return (
    svg +
    label("鼻下", 10.5, 56) +
    label("口", 47.5, 56) +
    label("あご", 84.5, 56)
  );
}

// 側面クローズアップ（頬〜口横〜あご〜フェイスライン）: 鼻先・口・あごの位置を示す小さな目印のみ
function profileGuide(mirror) {
  const t = mirror ? ` transform="translate(100,0) scale(-1,1)"` : "";
  const svg = svgWrap(`
    <g${t}>
      <line x1="61" y1="13" x2="71" y2="13" stroke="${GUIDE_STROKE}" stroke-width="0.55" stroke-linecap="round" />
      <line x1="53" y1="50" x2="63" y2="50" stroke="${GUIDE_STROKE_SOFT}" stroke-width="0.55" stroke-linecap="round" stroke-dasharray="1.4 2.4" />
      <line x1="47" y1="87" x2="57" y2="87" stroke="${GUIDE_STROKE}" stroke-width="0.55" stroke-linecap="round" />
    </g>
  `);
  const label1 = mirror ? label("鼻先", 10.5, 20, "right") : label("鼻先", 10.5, 74);
  const label2 = mirror ? label("口", 47.5, 30, "right") : label("口", 47.5, 66);
  const label3 = mirror ? label("あご", 84.5, 40, "right") : label("あご", 84.5, 60);
  return svg + label1 + label2 + label3;
}

// あご下（任意）: 「この範囲に」を示す薄いコーナーガイドのみ（輪郭線・楕円は使わない）
function chinUnderGuide() {
  const bracket = (x1, y1, dx, dy) => `
    <path d="M${x1},${y1 + dy} L${x1},${y1} L${x1 + dx},${y1}" stroke="${GUIDE_STROKE}" stroke-width="0.6" stroke-linecap="round" />
  `;
  const svg = svgWrap(`
    ${bracket(24, 28, 11, 8)}
    ${bracket(76, 28, -11, 8)}
    ${bracket(24, 74, 11, -8)}
    ${bracket(76, 74, -11, -8)}
  `);
  return svg + label("あご下・首", 22, 50, "center");
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
