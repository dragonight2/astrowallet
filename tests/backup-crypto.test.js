import assert from "node:assert/strict";
import { test } from "node:test";
import { WrongPasswordError, isProtectedBackup, openProtectedBackup, protectBackup } from "../src/data/backup-crypto.js";
import { createStore } from "../src/data/store.js";

test("backup protegido: só abre com a senha certa e não mostra os dados", async () => {
  const store = createStore({ save() {} });
  store.setProfile({ name: "Ana Lima", onboarded: true });
  store.addEntry({ type: "expense", description: "Farmácia Central", amount: 3210, category_id: "c4", date: "2026-11-04" });
  const plain = store.exportJSON();
  const file = await protectBackup(plain, "minha senha forte");
  assert.ok(isProtectedBackup(file));
  assert.ok(!isProtectedBackup(plain));
  assert.ok(!file.includes("Ana Lima") && !file.includes("Farmácia"));
  assert.equal(await openProtectedBackup(file, "minha senha forte"), plain);
  await assert.rejects(openProtectedBackup(file, "senha errada"), WrongPasswordError);
  // Arquivo alterado também é recusado.
  const f = JSON.parse(file);
  f.data = f.data.slice(0, -6) + (f.data.endsWith("AAAA==") ? "BBBB==" : "AAAA==");
  await assert.rejects(openProtectedBackup(JSON.stringify(f), "minha senha forte"));
  // Restaurar no app a partir do conteúdo aberto.
  const other = createStore({ save() {} });
  other.importJSON(await openProtectedBackup(file, "minha senha forte"));
  assert.equal(other.state.entries[0].description, "Farmácia Central");
});

test("cada backup usa sal e iv novos (dois arquivos da mesma senha são diferentes)", async () => {
  const a = JSON.parse(await protectBackup("{}", "12345678"));
  const b = JSON.parse(await protectBackup("{}", "12345678"));
  assert.notEqual(a.kdf.salt, b.kdf.salt);
  assert.notEqual(a.cipher.iv, b.cipher.iv);
  assert.equal(a.kdf.iterations, 600000);
});

test("recusa arquivo com número de repetições adulterado", async () => {
  const f = JSON.parse(await protectBackup("{}", "12345678"));
  f.kdf.iterations = 1;
  await assert.rejects(openProtectedBackup(JSON.stringify(f), "12345678"), /inválido/);
});
