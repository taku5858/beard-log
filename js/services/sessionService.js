// ビジネスロジック層 — 画面(js/views)はDB(js/db.js)を直接操作せず、必ずこの層を経由する。
// 将来サーバー保存やログイン機能を追加する際は、この層の内部実装だけを
// REST API呼び出しなどに差し替えれば、画面側のコードは変更せずに済む設計にしている。
import * as db from "../db.js";
import { AREAS, PHOTO_ANGLES, AREA_COLORS, areaLabel } from "../constants.js";
import { daysBetween, daysFromToday, todayISO } from "../utils/format.js";
import { blobToObjectURL } from "../utils/image.js";

function zeroAreas() {
  return Object.fromEntries(AREAS.map((a) => [a.key, 0]));
}

export async function getSessionsWithNumbers() {
  return db.getSessionsWithNumber();
}

export async function getSessionById(id) {
  const sessions = await getSessionsWithNumbers();
  return sessions.find((s) => s.id === id) || null;
}

// ホーム画面向けのサマリー情報を1つにまとめて返す
export async function getHomeSummary() {
  const sessions = await getSessionsWithNumbers();
  if (sessions.length === 0) {
    return { hasSessions: false, totalSessions: 0 };
  }
  const latest = sessions[sessions.length - 1];
  const daysSinceLast = daysBetween(latest.date, todayISO());
  const daysUntilNext = latest.nextAppointment ? daysFromToday(latest.nextAppointment) : null;

  const values = AREAS.map((a) => latest.areas?.[a.key] ?? 0);
  const overallChangePercent = Math.round(values.reduce((s, v) => s + v, 0) / values.length);
  const topArea = AREAS.map((a) => ({ ...a, value: latest.areas?.[a.key] ?? 0 })).sort((a, b) => b.value - a.value)[0];

  return {
    hasSessions: true,
    totalSessions: sessions.length,
    latest,
    daysSinceLast,
    daysUntilNext,
    overallChangePercent,
    topArea,
    recent: [...sessions].reverse().slice(0, 5),
  };
}

// 新規記録フォームの初期値（前回の部位別数値を引き継ぎ、入力の手間を減らす）
export async function getDefaultAreasForNewSession() {
  const sessions = await getSessionsWithNumbers();
  if (sessions.length === 0) return zeroAreas();
  const latest = sessions[sessions.length - 1];
  return { ...zeroAreas(), ...(latest.areas || {}) };
}

export async function getPhotosForSessionMap(sessionId) {
  const photos = await db.getPhotosForSession(sessionId);
  const map = {};
  PHOTO_ANGLES.forEach((a) => {
    const found = photos.find((p) => p.angle === a.key);
    map[a.key] = found || null;
  });
  return map;
}

function sanitizeSessionPayload(payload) {
  return {
    date: payload.date,
    clinic: (payload.clinic || "").trim(),
    device: (payload.device || "").trim(),
    laserType: payload.laserType || "",
    output: (payload.output || "").trim(),
    pain: payload.pain ?? null,
    redness: payload.redness ?? null,
    memo: (payload.memo || "").trim(),
    nextAppointment: payload.nextAppointment || "",
    areas: { ...zeroAreas(), ...(payload.areas || {}) },
  };
}

// photoChanges: { [angleKey]: { blob: Blob } | { remove: true } | undefined }
async function applyPhotoChanges(sessionId, photoChanges, existingMap) {
  for (const angle of PHOTO_ANGLES) {
    const change = photoChanges[angle.key];
    if (!change) continue;
    const existing = existingMap?.[angle.key];
    if (change.blob) {
      if (existing) await db.deletePhoto(existing.id);
      await db.addPhoto({ sessionId, angle: angle.key, blob: change.blob });
    } else if (change.remove && existing) {
      await db.deletePhoto(existing.id);
    }
  }
}

export async function createSession(payload, photoChanges = {}) {
  const saved = await db.addSession(sanitizeSessionPayload(payload));
  await applyPhotoChanges(saved.id, photoChanges, {});
  return saved;
}

export async function updateSessionById(id, payload, photoChanges = {}) {
  const existingMap = await getPhotosForSessionMap(id);
  const saved = { id, ...sanitizeSessionPayload(payload) };
  await db.updateSession(saved);
  await applyPhotoChanges(id, photoChanges, existingMap);
  return saved;
}

export async function deleteSessionById(id) {
  await db.deleteSession(id);
}

// 「経過」画面から、最新回の部位別・減少実感だけを更新する（他の項目は変更しない）
export async function updateLatestSessionAreas(areas) {
  const sessions = await getSessionsWithNumbers();
  if (sessions.length === 0) return null;
  const latest = sessions[sessions.length - 1];
  const { sessionNumber, ...rest } = latest;
  const updated = { ...rest, areas: { ...zeroAreas(), ...areas } };
  await db.updateSession(updated);
  return updated;
}

// 経過グラフ用の部位別シリーズデータ
export async function getProgressSeries() {
  const sessions = await getSessionsWithNumbers();
  const series = AREAS.map((a) => ({
    key: a.key,
    label: a.label,
    color: AREA_COLORS[a.key],
    points: sessions.map((s) => ({ x: s.sessionNumber, y: s.areas?.[a.key] ?? 0 })),
  }));
  const xTickLabels = sessions.map((s) => `${s.sessionNumber}回`);
  return { series, xTickLabels, sessions };
}

// 「どの部位が減りやすく、どの部位が残っているか」用の最新スナップショット
export async function getLatestAreaBreakdown() {
  const sessions = await getSessionsWithNumbers();
  if (sessions.length === 0) return [];
  const latest = sessions[sessions.length - 1];
  return AREAS.map((a) => ({
    label: a.label,
    key: a.key,
    value: latest.areas?.[a.key] ?? 0,
    color: AREA_COLORS[a.key],
  })).sort((a, b) => b.value - a.value);
}

export async function getStorageUsage() {
  const [sessions, photos, estimate] = await Promise.all([db.getAllSessions(), db.getAllPhotos(), db.estimateUsage()]);
  const photosBytes = photos.reduce((sum, p) => sum + (p.blob?.size || 0), 0);
  return {
    sessionCount: sessions.length,
    photoCount: photos.length,
    photosBytes,
    quota: estimate?.quota ?? null,
    usage: estimate?.usage ?? null,
  };
}

export async function clearAllData() {
  await db.clearAllData();
}

export { blobToObjectURL, areaLabel };
