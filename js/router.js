// 簡易ハッシュルーター
const routes = [];
let rootEl = null;
let currentCleanup = null;

export function registerRoute(pattern, render) {
  const keys = [];
  const regex = new RegExp(
    "^" +
      pattern.replace(/:[^/]+/g, (m) => {
        keys.push(m.slice(1));
        return "([^/]+)";
      }) +
      "$"
  );
  routes.push({ regex, keys, render });
}

export function initRouter(root) {
  rootEl = root;
  window.addEventListener("hashchange", handleRoute);
  handleRoute();
}

export function navigate(path) {
  if (location.hash === "#" + path) {
    handleRoute();
  } else {
    location.hash = path;
  }
}

async function handleRoute() {
  const hash = location.hash.replace(/^#/, "") || "/home";
  const path = hash.split("?")[0];
  const query = Object.fromEntries(new URLSearchParams(hash.split("?")[1] || ""));

  for (const route of routes) {
    const m = path.match(route.regex);
    if (m) {
      const params = {};
      route.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      if (typeof currentCleanup === "function") {
        try {
          currentCleanup();
        } catch (e) {}
        currentCleanup = null;
      }
      rootEl.scrollTop = 0;
      updateNav(path);
      const result = await route.render(rootEl, params, query);
      if (typeof result === "function") currentCleanup = result;
      return;
    }
  }
  navigate("/home");
}

function updateNav(path) {
  document.querySelectorAll(".nav-item").forEach((a) => {
    const target = a.getAttribute("href").replace(/^#/, "");
    const base = "/" + path.split("/")[1];
    a.classList.toggle("active", base === target);
  });
}
