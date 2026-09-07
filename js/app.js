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
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
