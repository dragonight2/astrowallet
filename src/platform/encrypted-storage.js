// Armazenamento seguro dos dados no celular.
//
// Como uma gravação nunca deixa os dados pela metade:
//   1. grava tudo cifrado num arquivo temporário (state.tmp);
//   2. lê de volta e confere se decifra igual ao que devia;
//   3. guarda o arquivo atual como cópia anterior (state.prev.enc);
//   4. só então troca o temporário pelo principal (state.enc).
// Se o celular desligar no meio, na próxima abertura o app tenta o temporário,
// o principal e a cópia anterior, nessa ordem, e usa o primeiro que abrir.
// Arquivos que não abrem nunca são apagados: vão para a pasta "quarantine".

import { decryptText, encryptText, newDataKey } from "./crypto.js";

export class DataUnreadableError extends Error {
  constructor(reason) {
    super(`Não foi possível abrir os dados: ${reason}`);
    this.name = "DataUnreadableError";
    this.reason = reason;
  }
}

const timestamp = () => new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");

export class EncryptedStorage {
  /**
   * @param fs        adaptador de arquivos { read, write, remove, rename, list }
   * @param keyStore  cofre da chave { get, set }
   */
  constructor({ fs, keyStore, dir = "astro-wallet", keepSnapshots = 5 }) {
    this.fs = fs;
    this.keyStore = keyStore;
    this.keepSnapshots = keepSnapshots;
    this.paths = {
      main: `${dir}/state.enc`,
      tmp: `${dir}/state.tmp`,
      prev: `${dir}/state.prev.enc`,
      snapshots: `${dir}/snapshots`,
      quarantine: `${dir}/quarantine`,
    };
    this.key = null;
    this.unreadable = false;
    this.recoveredFrom = null; // "tmp" ou "prev" quando o principal não abriu
    this.pending = null;
    this.writing = null;
  }

  async load() {
    const key = await this.keyStore.get();
    const found = [];
    for (const name of ["tmp", "main", "prev"]) {
      const content = await this.fs.read(this.paths[name]);
      if (content) found.push([name, content]);
    }
    if (!found.length) {
      this.key = key;
      return null; // carteira nova
    }
    if (!key) {
      this.unreadable = true;
      throw new DataUnreadableError("a chave de segurança deste aparelho não foi encontrada");
    }
    for (const [name, content] of found) {
      try {
        const data = JSON.parse(decryptText(content, key));
        this.key = key;
        this.recoveredFrom = name === "main" ? null : name;
        return data;
      } catch {}
    }
    this.unreadable = true;
    throw new DataUnreadableError("os arquivos estão danificados");
  }

  /** Salva o estado. Gravações seguidas são agrupadas: só a mais recente é escrita. */
  save(state) {
    this.pending = JSON.stringify(state);
    if (!this.writing) this.writing = this.#flush();
    return this.writing;
  }

  /** Cópia extra (por exemplo, antes de migrar para uma versão nova). Mantém as 5 mais recentes. */
  async snapshot(state, label) {
    const key = await this.#ensureKey();
    await this.fs.write(`${this.paths.snapshots}/${timestamp()}-${label}.enc`, encryptText(JSON.stringify(state), key));
    const files = (await this.fs.list(this.paths.snapshots)).sort();
    for (const old of files.slice(0, Math.max(0, files.length - this.keepSnapshots)))
      await this.fs.remove(`${this.paths.snapshots}/${old}`);
  }

  /** Move os arquivos que não abriram para a quarentena (nunca apaga). */
  async quarantine() {
    const stamp = timestamp();
    for (const name of ["tmp", "main", "prev"]) {
      if (await this.fs.read(this.paths[name]))
        await this.fs.rename(this.paths[name], `${this.paths.quarantine}/${stamp}-${this.paths[name].split("/").pop()}`);
    }
    this.unreadable = false;
  }

  async #flush() {
    try {
      while (this.pending) {
        const text = this.pending;
        this.pending = null;
        await this.#write(text);
      }
    } finally {
      this.writing = null;
    }
  }

  async #ensureKey() {
    if (this.key) return this.key;
    const stored = await this.keyStore.get();
    if (stored) {
      this.key = stored;
      return stored;
    }
    const key = newDataKey();
    await this.keyStore.set(key);
    this.key = key;
    return key;
  }

  async #write(text) {
    if (this.unreadable) await this.quarantine();
    const key = await this.#ensureKey();
    const encrypted = encryptText(text, key);
    await this.fs.write(this.paths.tmp, encrypted);
    const check = await this.fs.read(this.paths.tmp);
    if (decryptText(check, key) !== text) throw new Error("Conferência da gravação falhou");
    const hadMain = !!(await this.fs.read(this.paths.main));
    await this.fs.remove(this.paths.prev);
    if (hadMain) await this.fs.rename(this.paths.main, this.paths.prev);
    await this.fs.rename(this.paths.tmp, this.paths.main);
  }
}
