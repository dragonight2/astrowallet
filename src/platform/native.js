// Plataforma "native": o app instalado no celular (Capacitor).
//   - dados cifrados em arquivos privados do app (EncryptedStorage)
//   - chave guardada no cofre do sistema (SecureStorage → Android Keystore)
//   - entrada com digital, rosto ou PIN do próprio celular (BiometricAuth)
//   - compartilhamento pelo menu nativo do sistema (Share)
//   - notificações locais agendadas no próprio celular (LocalNotifications)

import { BiometricAuth } from "@aparajita/capacitor-biometric-auth";
import { KeychainAccess, SecureStorage } from "@aparajita/capacitor-secure-storage";
import { App } from "@capacitor/app";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { LocalNotifications } from "@capacitor/local-notifications";
import { Share } from "@capacitor/share";
import { base64ToBytes, bytesToBase64 } from "./crypto.js";
import { EncryptedStorage } from "./encrypted-storage.js";

const DATA_DIR = Directory.Data; // pasta privada do app; outros apps não acessam
const KEY_NAME = "astro-wallet.data-key";
const SHARE_DIR = "compartilhar"; // arquivos temporários para compartilhar (no cache)

const files = {
  async read(path) {
    try {
      const result = await Filesystem.readFile({ path, directory: DATA_DIR, encoding: Encoding.UTF8 });
      return typeof result.data === "string" ? result.data : null;
    } catch {
      return null;
    }
  },
  async write(path, data) {
    await Filesystem.writeFile({ path, data, directory: DATA_DIR, encoding: Encoding.UTF8, recursive: true });
  },
  async remove(path) {
    try {
      await Filesystem.deleteFile({ path, directory: DATA_DIR });
    } catch {}
  },
  async rename(from, to) {
    try {
      await Filesystem.deleteFile({ path: to, directory: DATA_DIR });
    } catch {}
    const parent = to.split("/").slice(0, -1).join("/");
    if (parent) {
      try {
        await Filesystem.mkdir({ path: parent, directory: DATA_DIR, recursive: true });
      } catch {}
    }
    await Filesystem.rename({ from, to, directory: DATA_DIR, toDirectory: DATA_DIR });
  },
  async list(path) {
    try {
      return (await Filesystem.readdir({ path, directory: DATA_DIR })).files.map((f) =>
        typeof f === "string" ? f : f.name,
      );
    } catch {
      return [];
    }
  },
};

const keyStore = {
  async get() {
    const value = await SecureStorage.get(KEY_NAME);
    return typeof value === "string" && value ? base64ToBytes(value) : null;
  },
  async set(key) {
    // Só neste aparelho, só com ele desbloqueado, sem sincronizar com nuvem.
    await SecureStorage.set(KEY_NAME, bytesToBase64(key), false, false, KeychainAccess.whenUnlockedThisDeviceOnly);
  },
};

const nativeAuth = {
  kind: "native",
  async isAvailable() {
    try {
      const info = await BiometricAuth.checkBiometry();
      return !!(info.isAvailable || info.deviceIsSecure);
    } catch {
      return false;
    }
  },
  async authenticate(reason = "Entrar na Astro Wallet") {
    try {
      await BiometricAuth.authenticate({
        reason,
        cancelTitle: "Cancelar",
        allowDeviceCredential: true,
        iosFallbackTitle: "Usar código",
        androidTitle: "Astro Wallet",
        androidSubtitle: reason,
        androidConfirmationRequired: false,
      });
      return true;
    } catch {
      return false;
    }
  },
};

const nativeShare = {
  kind: "native",
  async share({ title, text, file }) {
    try {
      if (file) {
        const data = bytesToBase64(new Uint8Array(await file.arrayBuffer()));
        const { uri } = await Filesystem.writeFile({
          path: `${SHARE_DIR}/${file.name}`,
          data,
          directory: Directory.Cache,
          recursive: true,
        });
        await Share.share({ title, text, files: [uri], dialogTitle: title });
      } else {
        await Share.share({ title, text, dialogTitle: title });
      }
      return "shared";
    } catch (err) {
      return /cancel/i.test(String(err?.message || err)) ? "cancelled" : "unsupported";
    }
  },
};

// Salvar arquivo (ex.: relatório em PDF) na pasta Documentos do celular,
// onde a pessoa encontra pelo app "Arquivos". Só acontece quando ela toca em "Baixar".
const SAVE_DIR = "Astro Wallet";

const nativeFiles = {
  async save(blob, name) {
    try {
      const { publicStorage } = await Filesystem.checkPermissions();
      if (publicStorage !== "granted") {
        const asked = await Filesystem.requestPermissions();
        if (asked.publicStorage !== "granted") return { ok: false };
      }
      const data = bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
      await Filesystem.writeFile({ path: `${SAVE_DIR}/${name}`, data, directory: Directory.Documents, recursive: true });
      return { ok: true, where: `Documentos/${SAVE_DIR}` };
    } catch (err) {
      console.warn("Não foi possível salvar o arquivo", err);
      return { ok: false };
    }
  },
};

// Notificações locais: agendadas e mostradas pelo próprio celular, sem internet.
// Usamos ids fixos para poder trocar o agendamento sem duplicar avisos.
const MONTHLY_IDS = [1001, 1002, 1003];

const nativeNotifications = {
  kind: "native",
  /** Pede permissão só quando necessário (Android 13+ mostra a pergunta uma vez). */
  async ensurePermission() {
    try {
      let { display } = await LocalNotifications.checkPermissions();
      if (display === "prompt" || display === "prompt-with-rationale")
        ({ display } = await LocalNotifications.requestPermissions());
      return display === "granted";
    } catch {
      return false;
    }
  },
  /** Agenda os próximos avisos mensais: [{ at: Date, title, body, extra }]. */
  async scheduleMonthly(items) {
    await this.cancelMonthly();
    await LocalNotifications.schedule({
      notifications: items.slice(0, MONTHLY_IDS.length).map((item, i) => ({
        id: MONTHLY_IDS[i],
        title: item.title,
        body: item.body,
        schedule: { at: item.at, allowWhileIdle: true },
        extra: item.extra,
      })),
    });
  },
  async cancelMonthly() {
    try {
      await LocalNotifications.cancel({ notifications: MONTHLY_IDS.map((id) => ({ id })) });
    } catch {}
  },
  /** Chamado quando a pessoa toca numa notificação do app. */
  onOpen(callback) {
    LocalNotifications.addListener("localNotificationActionPerformed", ({ notification }) =>
      callback(notification?.extra || {}),
    );
  },
};

/** Apaga os arquivos temporários de compartilhamento (relatórios e backups). */
async function clearShareCache() {
  try {
    await Filesystem.rmdir({ path: SHARE_DIR, directory: Directory.Cache, recursive: true });
  } catch {}
}

export async function createNativePlatform() {
  await SecureStorage.setSynchronize(false);
  await clearShareCache();
  return {
    kind: "native",
    storage: new EncryptedStorage({ fs: files, keyStore }),
    auth: nativeAuth,
    share: nativeShare,
    files: nativeFiles,
    notifications: nativeNotifications,
    onBackground(callback) {
      App.addListener("appStateChange", ({ isActive }) => {
        if (!isActive) {
          callback();
          clearShareCache();
        }
      });
    },
  };
}
