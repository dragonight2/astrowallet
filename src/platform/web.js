// Plataforma "web": a prévia que roda no navegador (GitHub Pages).
// ATENÇÃO: aqui a digital é SIMULADA e os dados ficam sem criptografia no
// navegador. Serve só para ver e testar o app — dados reais, só no app instalado.

const STORAGE_KEY = "astro-wallet:v2";
const LEGACY_KEYS = ["axell-wallet:v2"]; // nome antigo do app

class LocalStorageAdapter {
  constructor(key, legacyKeys = []) {
    this.key = key;
    this.legacyKeys = legacyKeys;
  }

  load() {
    try {
      for (const key of [this.key, ...this.legacyKeys]) {
        const raw = localStorage.getItem(key);
        if (raw) return JSON.parse(raw);
      }
      return null;
    } catch {
      return null;
    }
  }

  save(state) {
    localStorage.setItem(this.key, JSON.stringify(state));
  }

  snapshot(state, label) {
    try {
      localStorage.setItem(`${this.key}:copia:${label}`, JSON.stringify(state));
    } catch {}
  }
}

const simulatedAuth = {
  kind: "simulated",
  async authenticate() {
    await new Promise((resolve) => setTimeout(resolve, 500));
    return true;
  },
};

/** Compartilhamento pelo navegador (menu do sistema quando existe). */
export const webShare = {
  kind: "web",
  async share({ title, text, file }) {
    if (typeof navigator === "undefined" || !navigator.share) return "unsupported";
    try {
      if (file && navigator.canShare?.({ files: [file] })) await navigator.share({ title, text, files: [file] });
      else await navigator.share({ title, text });
      return "shared";
    } catch (err) {
      return err?.name === "AbortError" ? "cancelled" : "unsupported";
    }
  },
};

/** Baixa um arquivo pelo navegador (vai para a pasta de downloads). */
const webFiles = {
  async save(blob, name) {
    const url = URL.createObjectURL(blob);
    const link = Object.assign(document.createElement("a"), { href: url, download: name, rel: "noopener" });
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return { ok: true, where: "Downloads" };
  },
};

/** O navegador não agenda notificações com o app fechado; os avisos ficam só dentro do app. */
const noNotifications = {
  kind: "none",
  async ensurePermission() {
    return false;
  },
  async scheduleMonthly() {},
  async cancelMonthly() {},
  onOpen() {},
};

export async function createWebPlatform() {
  return {
    kind: "web",
    storage: new LocalStorageAdapter(STORAGE_KEY, LEGACY_KEYS),
    auth: simulatedAuth,
    share: webShare,
    files: webFiles,
    notifications: noNotifications,
    onBackground(callback) {
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) callback();
      });
    },
  };
}
