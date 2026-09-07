import { blobToObjectURL } from "./utils/image.js";

// 保存されるすべての写真の縦横比を統一し、Before/Afterで毎回ほぼ同じ大きさに
// ヒゲ部分が写るようにする（正面・左右・あご下すべて共通）
const CROP_ASPECT = 4 / 5; // width / height
const OUTPUT_HEIGHT = 1400;
const OUTPUT_WIDTH = Math.round(OUTPUT_HEIGHT * CROP_ASPECT);
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const JPEG_QUALITY = 0.85;

function loadImage(blob) {
  return new Promise((resolve, reject) => {
    const url = blobToObjectURL(blob);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

// 撮影・選択した写真をピンチ／ドラッグ／スライダーでトリミングし、
// 統一された縦横比のJPEG Blobを返す。キャンセル時はnull。
// iOSのSafariで問題が起きやすい <img> のドラッグ・長押しメニューを避けるため、
// 表示・切り出しともにCanvas描画のみで行う（ネイティブの画像コンテキストメニューを回避）。
export function openCropEditor(sourceBlob, angle) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "crop-overlay";
    overlay.innerHTML = `
      <div class="crop-top">
        <button type="button" class="btn btn-ghost crop-cancel" data-act="cancel">キャンセル</button>
        <span class="crop-title">範囲を調整</span>
        <span class="crop-top-spacer"></span>
      </div>
      <div class="crop-stage">
        <div class="crop-frame">
          <canvas class="crop-canvas"></canvas>
        </div>
        <p class="crop-hint">指で動かす・つまんで拡大縮小できます</p>
      </div>
      <div class="crop-controls">
        <div class="crop-zoom-row">
          <span class="crop-zoom-icon crop-zoom-icon-sm">−</span>
          <input type="range" class="crop-zoom-slider" min="${MIN_ZOOM * 100}" max="${MAX_ZOOM * 100}" value="100" step="1">
          <span class="crop-zoom-icon crop-zoom-icon-lg">＋</span>
        </div>
        <button type="button" class="btn btn-primary btn-large" data-act="save">この範囲で保存</button>
      </div>
    `;
    document.body.appendChild(overlay);
    document.body.classList.add("no-scroll");

    const frame = overlay.querySelector(".crop-frame");
    const canvas = overlay.querySelector(".crop-canvas");
    const slider = overlay.querySelector(".crop-zoom-slider");
    const ctx = canvas.getContext("2d");

    let objectUrl = null;
    let image = null;
    let naturalW = 0;
    let naturalH = 0;
    let baseScale = 1; // frameを覆う最小スケール（zoom=1相当）
    let zoom = 1;
    let offsetX = 0; // 表示中の元画像上の左上座標（元画像ピクセル基準）
    let offsetY = 0;
    let frameW = 0;
    let frameH = 0;
    let dpr = Math.max(1, window.devicePixelRatio || 1);
    let ready = false;

    function close(result) {
      document.body.classList.remove("no-scroll");
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      overlay.remove();
      resolve(result);
    }

    function displayScale() {
      return baseScale * zoom;
    }

    function clampOffset() {
      const s = displayScale();
      const srcW = frameW / s;
      const srcH = frameH / s;
      offsetX = Math.min(Math.max(offsetX, 0), Math.max(0, naturalW - srcW));
      offsetY = Math.min(Math.max(offsetY, 0), Math.max(0, naturalH - srcH));
    }

    function render() {
      if (!ready) return;
      const s = displayScale();
      const srcW = frameW / s;
      const srcH = frameH / s;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, offsetX, offsetY, srcW, srcH, 0, 0, canvas.width, canvas.height);
    }

    function setZoom(newZoom, focalX, focalY) {
      const s1 = displayScale();
      newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, newZoom));
      const srcFocalX = offsetX + focalX / s1;
      const srcFocalY = offsetY + focalY / s1;
      zoom = newZoom;
      const s2 = displayScale();
      offsetX = srcFocalX - focalX / s2;
      offsetY = srcFocalY - focalY / s2;
      clampOffset();
      slider.value = String(Math.round(zoom * 100));
      render();
    }

    function panBy(dxScreen, dyScreen) {
      const s = displayScale();
      offsetX -= dxScreen / s;
      offsetY -= dyScreen / s;
      clampOffset();
      render();
    }

    function setupCanvasSize() {
      const rect = frame.getBoundingClientRect();
      frameW = rect.width;
      frameH = rect.height;
      dpr = Math.max(1, window.devicePixelRatio || 1);
      canvas.width = Math.round(frameW * dpr);
      canvas.height = Math.round(frameH * dpr);
      canvas.style.width = frameW + "px";
      canvas.style.height = frameH + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    async function init() {
      try {
        const loaded = await loadImage(sourceBlob);
        image = loaded.img;
        objectUrl = loaded.url;
        naturalW = image.naturalWidth || image.width;
        naturalH = image.naturalHeight || image.height;
        setupCanvasSize();
        baseScale = Math.max(frameW / naturalW, frameH / naturalH);
        zoom = 1;
        const srcW = frameW / displayScale();
        const srcH = frameH / displayScale();
        offsetX = (naturalW - srcW) / 2;
        offsetY = (naturalH - srcH) / 2;
        ready = true;
        render();
      } catch (e) {
        close(null);
      }
    }

    // ---------- ジェスチャー（Pointer Eventsに統一。1本指=移動、2本指=ピンチ） ----------
    const activePointers = new Map();
    let pinchStartDist = 0;
    let pinchStartZoom = 1;
    let pinchStartMid = { x: 0, y: 0 };
    let pinchStartSrcMid = { x: 0, y: 0 };
    let panStart = null;

    function frameLocalPoint(clientX, clientY) {
      const rect = frame.getBoundingClientRect();
      return { x: clientX - rect.left, y: clientY - rect.top };
    }

    function pointersArray() {
      return Array.from(activePointers.values());
    }

    function distanceBetween(a, b) {
      return Math.hypot(a.x - b.x, a.y - b.y);
    }

    function midpointBetween(a, b) {
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }

    canvas.addEventListener("pointerdown", (e) => {
      if (!ready) return;
      // setPointerCaptureは失敗することがある（Safariの実装差異など）。
      // 失敗してもパン・ピンチの座標追跡自体は継続できるようにする
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch (err) {}
      const p = frameLocalPoint(e.clientX, e.clientY);
      activePointers.set(e.pointerId, p);

      if (activePointers.size === 1) {
        panStart = { offsetX, offsetY, point: p };
      } else if (activePointers.size === 2) {
        const [a, b] = pointersArray();
        pinchStartDist = distanceBetween(a, b);
        pinchStartZoom = zoom;
        pinchStartMid = midpointBetween(a, b);
        const s = displayScale();
        pinchStartSrcMid = { x: offsetX + pinchStartMid.x / s, y: offsetY + pinchStartMid.y / s };
        panStart = null;
      }
    });

    canvas.addEventListener("pointermove", (e) => {
      if (!activePointers.has(e.pointerId)) return;
      const p = frameLocalPoint(e.clientX, e.clientY);
      activePointers.set(e.pointerId, p);

      if (activePointers.size === 1 && panStart) {
        const dx = p.x - panStart.point.x;
        const dy = p.y - panStart.point.y;
        const s = displayScale();
        offsetX = panStart.offsetX - dx / s;
        offsetY = panStart.offsetY - dy / s;
        clampOffset();
        render();
      } else if (activePointers.size === 2) {
        const [a, b] = pointersArray();
        const dist = distanceBetween(a, b);
        if (pinchStartDist > 0) {
          const ratio = dist / pinchStartDist;
          const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, pinchStartZoom * ratio));
          const mid = midpointBetween(a, b);
          zoom = newZoom;
          const s2 = displayScale();
          offsetX = pinchStartSrcMid.x - mid.x / s2;
          offsetY = pinchStartSrcMid.y - mid.y / s2;
          clampOffset();
          slider.value = String(Math.round(zoom * 100));
          render();
        }
      }
    });

    function endPointer(e) {
      activePointers.delete(e.pointerId);
      if (activePointers.size === 1) {
        const [remaining] = pointersArray();
        panStart = { offsetX, offsetY, point: remaining };
      } else if (activePointers.size === 0) {
        panStart = null;
      }
    }
    canvas.addEventListener("pointerup", endPointer);
    canvas.addEventListener("pointercancel", endPointer);
    canvas.addEventListener("pointerleave", (e) => {
      if (e.pointerType === "mouse") endPointer(e);
    });

    // デスクトップ用: マウスホイールでズーム
    canvas.addEventListener(
      "wheel",
      (e) => {
        if (!ready) return;
        e.preventDefault();
        const p = frameLocalPoint(e.clientX, e.clientY);
        const delta = e.deltaY > 0 ? -0.15 : 0.15;
        setZoom(zoom + delta, p.x, p.y);
      },
      { passive: false }
    );

    slider.addEventListener("input", () => {
      if (!ready) return;
      const newZoom = Number(slider.value) / 100;
      setZoom(newZoom, frameW / 2, frameH / 2);
    });

    window.addEventListener("resize", () => {
      if (!ready) return;
      setupCanvasSize();
      clampOffset();
      render();
    });

    overlay.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-act]");
      if (!btn) return;
      if (btn.dataset.act === "cancel") close(null);
      else if (btn.dataset.act === "save") {
        const outCanvas = document.createElement("canvas");
        outCanvas.width = OUTPUT_WIDTH;
        outCanvas.height = OUTPUT_HEIGHT;
        const outCtx = outCanvas.getContext("2d");
        const s = displayScale();
        const srcW = frameW / s;
        const srcH = frameH / s;
        outCtx.drawImage(image, offsetX, offsetY, srcW, srcH, 0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
        outCanvas.toBlob((blob) => close(blob), "image/jpeg", JPEG_QUALITY);
      }
    });

    init();
  });
}
