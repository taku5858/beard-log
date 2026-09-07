// 画像の読み込み・回転補正・リサイズ・圧縮ユーティリティ
// iPhoneのHEIC/HEIFやEXIF Orientationを考慮し、常に正しい向きのJPEGに変換して保存する

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.85;

async function loadBitmap(file) {
  // Safari は createImageBitmap で HEIC のデコードと EXIF 回転補正に対応している
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch (e) {
      try {
        return await createImageBitmap(file);
      } catch (e2) {
        // fallthrough to <img> based decode
      }
    }
  }
  return loadViaImageElement(file);
}

function loadViaImageElement(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
    img._objectUrl = url;
  });
}

function drawToCanvas(source, srcW, srcH, mirror = false) {
  let w = srcW;
  let h = srcH;
  if (w > MAX_DIMENSION || h > MAX_DIMENSION) {
    if (w >= h) {
      h = Math.round((h * MAX_DIMENSION) / w);
      w = MAX_DIMENSION;
    } else {
      w = Math.round((w * MAX_DIMENSION) / h);
      h = MAX_DIMENSION;
    }
  }
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (mirror) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(source, 0, 0, w, h);
  return canvas;
}

function canvasToBlob(canvas, quality = JPEG_QUALITY) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
  });
}

// ファイル（撮影 or ライブラリ選択）を正しい向き・サイズのJPEG Blobに変換する
export async function fileToProcessedBlob(file) {
  const source = await loadBitmap(file);
  const srcW = source.width || source.naturalWidth;
  const srcH = source.height || source.naturalHeight;
  const canvas = drawToCanvas(source, srcW, srcH, false);
  if (source.close) source.close();
  if (source._objectUrl) URL.revokeObjectURL(source._objectUrl);
  return canvasToBlob(canvas);
}

// <video> の現在のフレームをキャプチャしてJPEG Blobに変換する（フロントカメラはミラー表示に合わせて反転）
export async function videoFrameToBlob(video, { mirror = true } = {}) {
  const w = video.videoWidth;
  const h = video.videoHeight;
  const canvas = drawToCanvas(video, w, h, mirror);
  return canvasToBlob(canvas);
}

export function blobToObjectURL(blob) {
  return URL.createObjectURL(blob);
}

export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function base64ToBlob(dataUrl) {
  const res = await fetch(dataUrl);
  return res.blob();
}
