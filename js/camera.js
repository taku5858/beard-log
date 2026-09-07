import { videoFrameToBlob, fileToProcessedBlob } from "./utils/image.js";
import { angleLabel } from "./constants.js";
import { openCropEditor } from "./crop.js";

const GUIDE_HINT = {
  front: "鼻下〜あごをガイドに合わせてください",
  left: "左頬〜あごのヒゲを大きく写してください",
  right: "右頬〜あごのヒゲを大きく写してください",
  chinUnder: "スマホを少し下げて、上を向いてください",
};

// このアプリは「顔写真」ではなく「ヒゲが生えている範囲」を毎回ほぼ同じ倍率・構図で
// 記録することが目的。顔全体の位置合わせや輪郭線・楕円は使わず、鼻下・口・あごなど
// ごく最小限の位置マークのみを薄く表示する。video要素の上に重ねるDOMオーバーレイ
// なので、撮影データ（Canvasに描画されるのはvideoフレームのみ）には焼き込まれない。
//
// viewBox は 0-100 の割合空間 + preserveAspectRatio="none" にし、画面サイズが
// 変わってもマークが上下に切れないようにしている（直線だけなので非均等スケールでも歪まない）。
//
// 3点（鼻下/口/あご）の間隔は、画面を均等3分割するのではなく実際の顔の比率
// （鼻下→口は短く、口→あごはその倍以上長い）に合わせ、画面高さの中央付近
// 30〜40%程度にコンパクトにまとめている。これにより通常の自撮り距離から
// 少し近づけるだけで3点を無理なく合わせられる。1mm単位の精密一致は不要で、
// マークは目安として小さく・薄く表示する。
const NOSE_Y = 33;
const MOUTH_Y = 43; // 鼻下→口: 全体の約29%
const CHIN_Y = 67; // 口→あご: 全体の約71%（span=34%は画面高さの30〜40%の範囲内）

const GUIDE_STROKE = "rgba(230, 198, 142, 0.6)";
const GUIDE_STROKE_SOFT = "rgba(230, 198, 142, 0.4)";

function svgWrap(inner) {
  return `<svg class="camera-guide-svg" viewBox="0 0 100 100" preserveAspectRatio="none" fill="none">${inner}</svg>`;
}

// ラベルはSVG内テキストではなくHTML要素で重ねる（非均等スケールで文字が歪まないようにするため）
function label(text, topPercent, leftPercent, align = "left") {
  return `<span class="camera-guide-label" style="top:${topPercent}%; left:${leftPercent}%; text-align:${align};">${text}</span>`;
}

// 正面クローズアップ: 鼻下（短い水平線）／口（小さな十字）／あご（短い水平線）の3点を
// 顔の実比率でコンパクトに配置。許容範囲を持たせるため、目印は小さく薄くする
function frontGuide() {
  const svg = svgWrap(`
    <line x1="43" y1="${NOSE_Y}" x2="57" y2="${NOSE_Y}" stroke="${GUIDE_STROKE}" stroke-width="0.55" stroke-linecap="round" />
    <line x1="50" y1="${MOUTH_Y - 2.2}" x2="50" y2="${MOUTH_Y + 2.2}" stroke="${GUIDE_STROKE_SOFT}" stroke-width="0.5" stroke-linecap="round" />
    <line x1="47" y1="${MOUTH_Y}" x2="53" y2="${MOUTH_Y}" stroke="${GUIDE_STROKE_SOFT}" stroke-width="0.5" stroke-linecap="round" />
    <line x1="41" y1="${CHIN_Y}" x2="59" y2="${CHIN_Y}" stroke="${GUIDE_STROKE}" stroke-width="0.55" stroke-linecap="round" />
  `);
  return svg + label("鼻下", NOSE_Y, 60) + label("口", MOUTH_Y, 60) + label("あご", CHIN_Y, 62);
}

// 側面クローズアップ（頬〜口横〜あご〜フェイスライン）: 鼻先・口・あごの位置を示す小さな目印のみ。
// 正面と同じ顔比率（鼻下→口は短く、口→あごは長い）でコンパクトにまとめる
function profileGuide(mirror) {
  const t = mirror ? ` transform="translate(100,0) scale(-1,1)"` : "";
  const svg = svgWrap(`
    <g${t}>
      <line x1="58" y1="${NOSE_Y}" x2="68" y2="${NOSE_Y}" stroke="${GUIDE_STROKE}" stroke-width="0.5" stroke-linecap="round" />
      <line x1="54" y1="${MOUTH_Y}" x2="64" y2="${MOUTH_Y}" stroke="${GUIDE_STROKE_SOFT}" stroke-width="0.5" stroke-linecap="round" stroke-dasharray="1.4 2.4" />
      <line x1="50" y1="${CHIN_Y}" x2="60" y2="${CHIN_Y}" stroke="${GUIDE_STROKE}" stroke-width="0.5" stroke-linecap="round" />
    </g>
  `);
  const label1 = mirror ? label("鼻先", NOSE_Y, 27, "right") : label("鼻先", NOSE_Y, 71);
  const label2 = mirror ? label("口", MOUTH_Y, 31, "right") : label("口", MOUTH_Y, 67);
  const label3 = mirror ? label("あご", CHIN_Y, 35, "right") : label("あご", CHIN_Y, 63);
  return svg + label1 + label2 + label3;
}

// あご下（任意）: 「この範囲に」を示す薄いコーナーガイドのみ。一人で前面カメラを
// 少し下げて構えたときに無理なく収まる、控えめなサイズ・位置にする
function chinUnderGuide() {
  const bracket = (x1, y1, dx, dy) => `
    <path d="M${x1},${y1 + dy} L${x1},${y1} L${x1 + dx},${y1}" stroke="${GUIDE_STROKE}" stroke-width="0.55" stroke-linecap="round" />
  `;
  const svg = svgWrap(`
    ${bracket(32, 32, 9, 7)}
    ${bracket(68, 32, -9, 7)}
    ${bracket(32, 60, 9, -7)}
    ${bracket(68, 60, -9, -7)}
  `);
  return svg + label("あご下・首", 25, 50, "center");
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
        <div class="camera-guide guide-${angle}">${GUIDE_SVG[angle] || ""}</div>
        <p class="camera-hint">${GUIDE_HINT[angle] || ""}</p>
        <p class="camera-error" hidden></p>
      </div>
      <div class="camera-controls">
        <button type="button" class="btn btn-ghost" data-act="library">ライブラリから選ぶ</button>
        <button type="button" class="shutter-btn" data-act="shutter" aria-label="撮影する"></button>
        <span class="camera-controls-spacer"></span>
      </div>
      <input type="file" accept="image/*" capture="user" class="file-input-capture" hidden />
      <input type="file" accept="image/*" class="file-input-library" hidden />
    `;
    document.body.appendChild(overlay);
    document.body.classList.add("no-scroll");

    const video = overlay.querySelector(".camera-video");
    const errorEl = overlay.querySelector(".camera-error");
    const fileInputCapture = overlay.querySelector(".file-input-capture");
    const fileInputLibrary = overlay.querySelector(".file-input-library");

    let stream = null;
    let facingMode = "user";
    let processing = false;

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
      const blob = await videoFrameToBlob(video, { mirror: facingMode === "user" });
      await handleCaptured(blob);
    }

    // 撮影 or ライブラリ選択の直後に必ずトリミング画面を挟み、ヒゲ部分だけを
    // 保存範囲に収める。キャンセルされたらライブのカメラ画面に戻って撮り直せる。
    async function handleCaptured(blob) {
      if (processing) return;
      processing = true;
      const cropped = await openCropEditor(blob, angle);
      processing = false;
      if (cropped) close(cropped);
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
    });

    fileInputCapture.addEventListener("change", async () => {
      const file = fileInputCapture.files[0];
      if (!file) return;
      const blob = await fileToProcessedBlob(file);
      await handleCaptured(blob);
      fileInputCapture.value = "";
    });

    fileInputLibrary.addEventListener("change", async () => {
      const file = fileInputLibrary.files[0];
      if (!file) return;
      const blob = await fileToProcessedBlob(file);
      await handleCaptured(blob);
      fileInputLibrary.value = "";
    });

    startStream();
  });
}
