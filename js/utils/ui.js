// トースト通知・確認ダイアログなど、共通UIユーティリティ

let toastTimer = null;
export function showToast(message) {
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2400);
}

export function showConfirm({ title, message, okText = "OK", cancelText = "キャンセル", danger = false }) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal-card" role="alertdialog" aria-modal="true">
        <h3 class="modal-title">${title}</h3>
        <p class="modal-message">${message}</p>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" data-act="cancel">${cancelText}</button>
          <button type="button" class="btn ${danger ? "btn-danger" : "btn-primary"}" data-act="ok">${okText}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("show"));

    function close(result) {
      overlay.classList.remove("show");
      setTimeout(() => overlay.remove(), 180);
      resolve(result);
    }
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close(false);
      const act = e.target.closest("[data-act]");
      if (act) close(act.dataset.act === "ok");
    });
  });
}

export function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}
