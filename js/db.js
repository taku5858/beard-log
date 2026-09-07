// IndexedDBラッパー — Beard Logのすべてのデータは端末内にのみ保存される
const DB_NAME = "beardlog";
const DB_VERSION = 1;

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      if (!db.objectStoreNames.contains("sessions")) {
        const store = db.createObjectStore("sessions", { keyPath: "id" });
        store.createIndex("date", "date");
      }
      if (!db.objectStoreNames.contains("photos")) {
        const store = db.createObjectStore("photos", { keyPath: "id" });
        store.createIndex("sessionId", "sessionId");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(storeNames, mode) {
  return openDB().then((db) => db.transaction(storeNames, mode));
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return "id-" + Date.now() + "-" + Math.random().toString(16).slice(2);
}

// ---------- Sessions ----------

export async function addSession(session) {
  const t = await tx(["sessions"], "readwrite");
  const record = { id: uuid(), createdAt: Date.now(), ...session };
  await reqToPromise(t.objectStore("sessions").add(record));
  return record;
}

export async function updateSession(session) {
  const t = await tx(["sessions"], "readwrite");
  await reqToPromise(t.objectStore("sessions").put(session));
  return session;
}

export async function getSession(id) {
  const t = await tx(["sessions"], "readonly");
  return reqToPromise(t.objectStore("sessions").get(id));
}

export async function getAllSessions() {
  const t = await tx(["sessions"], "readonly");
  const all = await reqToPromise(t.objectStore("sessions").getAll());
  return all.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export async function deleteSession(id) {
  const photos = await getPhotosForSession(id);
  const t = await tx(["sessions", "photos"], "readwrite");
  t.objectStore("sessions").delete(id);
  for (const p of photos) t.objectStore("photos").delete(p.id);
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

// ---------- Photos ----------

export async function addPhoto(photo) {
  const t = await tx(["photos"], "readwrite");
  const record = { id: uuid(), createdAt: Date.now(), ...photo };
  await reqToPromise(t.objectStore("photos").add(record));
  return record;
}

export async function deletePhoto(id) {
  const t = await tx(["photos"], "readwrite");
  await reqToPromise(t.objectStore("photos").delete(id));
}

export async function getPhotosForSession(sessionId) {
  const t = await tx(["photos"], "readonly");
  const idx = t.objectStore("photos").index("sessionId");
  return reqToPromise(idx.getAll(sessionId));
}

export async function getAllPhotos() {
  const t = await tx(["photos"], "readonly");
  return reqToPromise(t.objectStore("photos").getAll());
}

export async function getPhoto(id) {
  const t = await tx(["photos"], "readonly");
  return reqToPromise(t.objectStore("photos").get(id));
}

// ---------- Bulk / maintenance ----------

export async function clearAllData() {
  const t = await tx(["sessions", "photos"], "readwrite");
  t.objectStore("sessions").clear();
  t.objectStore("photos").clear();
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function putSessionRaw(session) {
  const t = await tx(["sessions"], "readwrite");
  await reqToPromise(t.objectStore("sessions").put(session));
}

export async function putPhotoRaw(photo) {
  const t = await tx(["photos"], "readwrite");
  await reqToPromise(t.objectStore("photos").put(photo));
}

export async function estimateUsage() {
  if (navigator.storage && navigator.storage.estimate) {
    try {
      return await navigator.storage.estimate();
    } catch (e) {
      return null;
    }
  }
  return null;
}

// 回数(何回目)を含めたセッション一覧を返す（日付昇順 + 連番）
export async function getSessionsWithNumber() {
  const sessions = await getAllSessions();
  return sessions.map((s, i) => ({ ...s, sessionNumber: i + 1 }));
}
