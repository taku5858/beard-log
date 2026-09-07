import { getStorageUsage, clearAllData } from "../services/sessionService.js";
import { exportBackupFile, readBackupFile, restoreBackup } from "../services/backupService.js";
import { formatBytes } from "../utils/format.js";
import { showToast, showConfirm } from "../utils/ui.js";

export async function renderSettings(root) {
  const usage = await getStorageUsage();

  root.innerHTML = `<div class="page page-settings"></div>`;
  const page = root.querySelector(".page-settings");

  page.innerHTML = `
    <h2 class="page-title">設定</h2>

    <section class="card">
      <h4 class="form-section-title">データ使用量</h4>
      <div class="usage-rows">
        <div class="usage-row"><span>記録数</span><strong>${usage.sessionCount}件</strong></div>
        <div class="usage-row"><span>写真数</span><strong>${usage.photoCount}枚</strong></div>
        <div class="usage-row"><span>写真の合計サイズ</span><strong>${formatBytes(usage.photosBytes)}</strong></div>
        ${
          usage.quota
            ? `<div class="usage-bar"><div class="usage-bar-fill" style="width:${Math.min(100, ((usage.usage || 0) / usage.quota) * 100)}%"></div></div>
               <div class="usage-row usage-row-sub"><span>端末の空き容量のうち使用中</span><strong>${formatBytes(usage.usage)} / ${formatBytes(usage.quota)}</strong></div>`
            : ""
        }
      </div>
    </section>

    <section class="card">
      <h4 class="form-section-title">バックアップ</h4>
      <p class="form-hint">写真を含む全データを1つのファイルに書き出します。機種変更前や、念のための保存におすすめです。</p>
      <button type="button" class="btn btn-secondary" data-act="export">バックアップを書き出す</button>
    </section>

    <section class="card">
      <h4 class="form-section-title">復元</h4>
      <p class="form-hint">バックアップファイルから復元します。復元すると、現在端末に保存されているデータはすべて置き換えられます。</p>
      <button type="button" class="btn btn-secondary" data-act="import">バックアップから復元</button>
      <input type="file" accept="application/json" class="restore-input" hidden>
    </section>

    <section class="card">
      <h4 class="form-section-title">データの削除</h4>
      <p class="form-hint">記録・写真をすべて削除し、初期状態に戻します。削除前にバックアップをおすすめします。</p>
      <button type="button" class="btn btn-danger-outline" data-act="clear">すべてのデータを削除</button>
    </section>

    <section class="card about-card">
      <div class="about-mark"><img src="icons/icon-96.png" width="40" height="40" alt=""></div>
      <h4 class="about-name">ヒゲ脱毛ログ</h4>
      <p class="about-subname">Beard Log</p>
      <p class="about-desc">ヒゲ脱毛の経過を、写真と部位別の実感で記録・振り返りできる個人用アプリです。すべてのデータはこの端末内にのみ保存され、外部サーバーへ送信されることはありません。</p>
      <p class="disclaimer">本アプリは医療診断や効果を保証するものではありません。減少率などの数値はご自身による主観的な記録として扱われます。</p>
    </section>
  `;

  page.querySelector('[data-act="export"]').addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = "書き出し中…";
    try {
      await exportBackupFile();
      showToast("バックアップを書き出しました");
    } catch (err) {
      showToast("書き出しに失敗しました");
    } finally {
      btn.disabled = false;
      btn.textContent = "バックアップを書き出す";
    }
  });

  const restoreInput = page.querySelector(".restore-input");
  page.querySelector('[data-act="import"]').addEventListener("click", () => restoreInput.click());
  restoreInput.addEventListener("change", async () => {
    const file = restoreInput.files[0];
    restoreInput.value = "";
    if (!file) return;
    try {
      const backup = await readBackupFile(file);
      const ok = await showConfirm({
        title: "バックアップから復元しますか？",
        message: `現在端末に保存されている記録・写真はすべて削除され、バックアップの内容（記録${backup.sessions.length}件）に置き換わります。この操作は取り消せません。`,
        okText: "復元する",
        danger: true,
      });
      if (!ok) return;
      await restoreBackup(backup);
      showToast("復元しました");
      location.reload();
    } catch (err) {
      showToast(err.message || "復元に失敗しました");
    }
  });

  page.querySelector('[data-act="clear"]').addEventListener("click", async () => {
    const ok = await showConfirm({
      title: "すべてのデータを削除しますか？",
      message: "記録・写真を含むすべてのデータを完全に削除します。この操作は取り消せません。",
      okText: "完全に削除する",
      danger: true,
    });
    if (!ok) return;
    await clearAllData();
    showToast("すべてのデータを削除しました");
    location.hash = "#/home";
    location.reload();
  });
}
