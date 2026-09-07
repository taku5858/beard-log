// アプリ全体で使う定数
export const AREAS = [
  { key: "noseUnder", label: "鼻下" },
  { key: "chin", label: "あご" },
  { key: "chinUnder", label: "あご下" },
  { key: "cheek", label: "頬" },
  { key: "sideburn", label: "もみあげ" },
  { key: "neck", label: "首" },
];

export const PHOTO_ANGLES = [
  { key: "front", label: "正面" },
  { key: "left", label: "左" },
  { key: "right", label: "右" },
  { key: "chinUnder", label: "あご下" },
];

export const LASER_TYPES = ["アレキサンドライト", "ヤグ", "ダイオード", "不明", "その他"];

export const AREA_COLORS = {
  noseUnder: "#c99b5a",
  chin: "#7fb3c9",
  chinUnder: "#9a8fd6",
  cheek: "#d68c8c",
  sideburn: "#8fc99b",
  neck: "#c9c05a",
};

export function areaLabel(key) {
  const a = AREAS.find((a) => a.key === key);
  return a ? a.label : key;
}

export function angleLabel(key) {
  const a = PHOTO_ANGLES.find((a) => a.key === key);
  return a ? a.label : key;
}
