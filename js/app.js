import { registerRoute, initRouter } from "./router.js";
import { renderHome } from "./views/home.js";
import { renderRecord } from "./views/record.js";
import { renderProgress } from "./views/progress.js";
import { renderCompare } from "./views/compare.js";
import { renderHistory } from "./views/history.js";
import { renderSettings } from "./views/settings.js";

registerRoute("/home", renderHome);
registerRoute("/record/:id", renderRecord);
registerRoute("/progress", renderProgress);
registerRoute("/compare", renderCompare);
registerRoute("/history", renderHistory);
registerRoute("/settings", renderSettings);

initRouter(document.getElementById("view-root"));

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    // updateViaCache:"none" を指定し、sw.js自体のHTTPキャッシュを常に無視して
    // 更新チェックを行う（これがないとホスティング側のキャッシュ次第で
    // 数時間〜1日、更新が検知されないことがある）
    navigator.serviceWorker
      .register("sw.js", { updateViaCache: "none" })
      .then((reg) => reg.update().catch(() => {}))
      .catch(() => {});
  });
  // 新しいService Workerが有効になったら1回だけ自動で再読み込みし、
  // 更新後も古いキャッシュ（写真撮影ガイドなど）が表示され続けないようにする
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });
}
