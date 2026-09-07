// バックアップ（エクスポート/インポート）を扱うサービス層
import { getAllSessions, getAllPhotos, clearAllData, putSessionRaw, putPhotoRaw } from "../db.js";
import { blobToBase64, base64ToBlob } from "../utils/image.js";

const BACKUP_VERSION = 1;

export async function buildBackup({ includePhotos = true } = {}) {
  const sessions = await getAllSessions();
  const photos = includePhotos ? await getAllPhotos() : [];
  const photoRecords = [];
  for (const p of photos) {
    const data = await blobToBase64(p.blob);
    photoRecords.push({
      id: p.id,
      sessionId: p.sessionId,
      angle: p.angle,
      createdAt: p.createdAt,
      mime: p.blob.type || "image/jpeg",
      data,
    });
  }
  return {
    app: "beard-log",
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    sessions,
    photos: photoRecords,
  };
}

export async function exportBackupFile({ includePhotos = true } = {}) {
  const backup = await buildBackup({ includePhotos });
  const json = JSON.stringify(backup);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = backup.exportedAt.slice(0, 10);
  a.href = url;
  a.download = `beardlog-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return backup;
}

export function readBackupFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const json = JSON.parse(reader.result);
        if (!json || json.app !== "beard-log" || !Array.isArray(json.sessions)) {
          reject(new Error("このファイルはBeard Logのバックアップ形式ではありません。"));
          return;
        }
        resolve(json);
      } catch (e) {
        reject(new Error("ファイルの読み込みに失敗しました。"));
      }
    };
    reader.onerror = () => reject(new Error("ファイルの読み込みに失敗しました。"));
    reader.readAsText(file);
  });
}

// 既存データを全て削除してから復元する
export async function restoreBackup(backup) {
  await clearAllData();
  for (const s of backup.sessions) {
    await putSessionRaw(s);
  }
  for (const p of backup.photos || []) {
    const blob = await base64ToBlob(p.data);
    await putPhotoRaw({
      id: p.id,
      sessionId: p.sessionId,
      angle: p.angle,
      createdAt: p.createdAt,
      blob,
    });
  }
}
