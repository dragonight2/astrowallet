// Plataforma "native": o app instalado no celular (Capacitor).
//   - dados cifrados em arquivos privados do app (EncryptedStorage)
//   - chave guardada no cofre do sistema (SecureStorage → Android Keystore)
//   - entrada com digital, rosto ou PIN do próprio celular (BiometricAuth)
//   - compartilhamento pelo menu nativo do sistema (Share)

import { BiometricAuth } from "@aparajita/capacitor-biometric-auth";
import { KeychainAccess, SecureStorage } from "@aparajita/capacitor-secure-storage";
import { App } from "@capacitor/app";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
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
