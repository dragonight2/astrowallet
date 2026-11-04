import assert from "node:assert/strict";
import { test } from "node:test";
import { decryptText, encryptText, newDataKey } from "../src/platform/crypto.js";
import { EncryptedStorage } from "../src/platform/encrypted-storage.js";

// Arquivos e cofre de mentira, em memória, para testar sem celular.
function memoryFs() {
  const files = new Map();
  return {
    files,
    async read(p) { return files.get(p) ?? null; },
    async write(p, d) { files.set(p, d); },
    async remove(p) { files.delete(p); },
    async rename(a, b) { files.set(b, files.get(a)); files.delete(a); },
    async list(dir) { return [...files.keys()].filter((k) => k.startsWith(dir + "/")).map((k) => k.slice(dir.length + 1)); },
  };
}
const memoryKeyStore = () => ({ key: null, async get() { return this.key; }, async set(k) { this.key = k; } });

test("cifra e decifra; chave errada ou arquivo alterado falham", () => {
  const key = newDataKey();
  const file = encryptText("segredo", key);
  assert.equal(decryptText(file, key), "segredo");
  assert.ok(!file.includes("segredo"));
  assert.throws(() => decryptText(file, newDataKey()));
  const tampered = JSON.parse(file);
  tampered.ct = tampered.ct.slice(0, -4) + (tampered.ct.endsWith("AAAA") ? "BBBB" : "AAAA");
  assert.throws(() => decryptText(JSON.stringify(tampered), key));
});

test("salva e carrega; nada fica legível no arquivo", async () => {
  const fs = memoryFs();
  const keyStore = memoryKeyStore();
  const a = new EncryptedStorage({ fs, keyStore });
  assert.equal(await a.load(), null);
  await a.save({ nome: "Ana", saldo: 123 });
  await a.save({ nome: "Ana", saldo: 456 });
  assert.ok(![...fs.files.values()].some((v) => v.includes("Ana")));
  const b = new EncryptedStorage({ fs, keyStore });
  assert.deepEqual(await b.load(), { nome: "Ana", saldo: 456 });
  assert.equal(b.recoveredFrom, null);
});

test("se o arquivo principal estragar, recupera a cópia anterior", async () => {
  const fs = memoryFs();
  const keyStore = memoryKeyStore();
  const s = new EncryptedStorage({ fs, keyStore });
  await s.save({ v: 1 });
  await s.save({ v: 2 });
  fs.files.set("astro-wallet/state.enc", "lixo");
  const again = new EncryptedStorage({ fs, keyStore });
  assert.deepEqual(await again.load(), { v: 1 });
  assert.equal(again.recoveredFrom, "prev");
});

test("sem a chave, avisa e não apaga nada; ao salvar de novo, move para a quarentena", async () => {
  const fs = memoryFs();
  const s = new EncryptedStorage({ fs, keyStore: memoryKeyStore() });
  await s.save({ v: 1 });
  const lost = new EncryptedStorage({ fs, keyStore: memoryKeyStore() });
  await assert.rejects(lost.load(), (err) => err.name === "DataUnreadableError");
  assert.ok(fs.files.has("astro-wallet/state.enc"));
  await lost.save({ v: "novo" });
  assert.ok([...fs.files.keys()].some((k) => k.startsWith("astro-wallet/quarantine/")));
});

test("cópias de segurança: guarda só as 5 mais recentes", async () => {
  const fs = memoryFs();
  const s = new EncryptedStorage({ fs, keyStore: memoryKeyStore() });
  for (let i = 0; i < 7; i++) {
    fs.files.set(`astro-wallet/snapshots/2026010${i}-000000-x.enc`, "x");
  }
  await s.snapshot({ v: 1 }, "teste");
  assert.equal((await fs.list("astro-wallet/snapshots")).length, 5);
});
