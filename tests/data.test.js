import assert from "node:assert/strict";
import { test } from "node:test";
import { sanitizeBackup } from "../src/data/sanitize.js";
import { SCHEMA_VERSION, emptyState, migrate, needsMigration } from "../src/data/schema.js";
import { createStore } from "../src/data/store.js";

const memoryStorage = () => ({ saved: null, save(s) { this.saved = JSON.parse(JSON.stringify(s)); } });

test("migração da versão 1 preserva todos os dados", () => {
  const v1 = {
    version: 1,
    name: "Carlos Souza",
    onboarded: true,
    lock: true,
    categories: [{ id: "c0", name: "Alimentação", icon: "food", monthly_limit: 500, sort: 0 }],
    recurring: [{ id: "r1", type: "income", description: "Salário", amount: 1, day: 5, category_id: null, start_month: "2026-01", end_month: null }],
    entries: [{ id: "e1", type: "expense", description: "Feira", amount: 2, category_id: "c0", date: "2026-11-02" }],
  };
  assert.ok(needsMigration(v1));
  const m = migrate(v1);
  assert.equal(m.version, SCHEMA_VERSION);
  assert.deepEqual(m.profile, { name: "Carlos Souza", onboarded: true });
  assert.equal(m.settings.lock, true);
  assert.deepEqual(m.entries, v1.entries);
  assert.deepEqual(m.recurring, v1.recurring);
  assert.deepEqual(m.installments, []);
  assert.equal(v1.name, "Carlos Souza", "não altera o objeto original");
});

test("dados da versão atual não precisam de migração", () => {
  assert.equal(needsMigration(emptyState()), false);
  assert.equal(migrate({ nada: 1 }), null);
});

test("backup: limpa textos, descarta inválidos e conta os ignorados", () => {
  const { data, skipped } = sanitizeBackup({
    categories: [{ id: "c0<x>", name: "  Comida\u0000 ", icon: "fo od!", monthly_limit: -5 }, { id: "", name: "sem id" }],
    recurring: [{ id: "r1", amount: "abc", start_month: "2026-01" }],
    entries: [
      { id: "e1", type: "hack", description: "x".repeat(500), amount: 10.4, date: "2026-11-01" },
      { id: "e2", amount: 1, date: "ontem" },
    ],
  });
  assert.equal(data.categories.length, 1);
  assert.equal(data.categories[0].id, "c0x");
  assert.equal(data.categories[0].name, "Comida");
  assert.equal(data.categories[0].icon, "food");
  assert.equal(data.categories[0].monthly_limit, 0);
  assert.equal(data.entries.length, 1);
  assert.equal(data.entries[0].type, "expense");
  assert.equal(data.entries[0].description.length, 140);
  assert.equal(data.entries[0].amount, 10);
  assert.equal(skipped, 2);
  assert.throws(() => sanitizeBackup({ categories: Array(50001).fill({}), recurring: [], entries: [] }), /grande demais/);
});

test("exportar e restaurar um backup devolve os mesmos dados", () => {
  const a = createStore(memoryStorage());
  a.setProfile({ name: "Ana Lima", onboarded: true });
  a.addEntry({ type: "expense", description: "Café", amount: 750, category_id: "c0", date: "2026-11-04" });
  a.addInstallment({ description: "TV", total_amount: 300000, count: 10, category_id: "c7", start_month: "2026-11", day: 3 });
  const b = createStore(memoryStorage());
  b.importJSON(a.exportJSON());
  assert.deepEqual(b.state.entries, a.state.entries);
  assert.deepEqual(b.state.installments, a.state.installments);
  assert.equal(b.state.profile.name, "Ana Lima");
});

test("restaurar recusa backup de versão mais nova ou de outro app", () => {
  const s = createStore(memoryStorage());
  assert.throws(() => s.importJSON(JSON.stringify({ app: "outro" })), /inválido/);
  assert.throws(() => s.importJSON(JSON.stringify({ app: "astro-wallet", data: { ...emptyState(), version: 99 } })), /mais nova/);
  assert.throws(() => s.importJSON("x".repeat(5 * 1024 * 1024 + 1)), /grande demais/);
});

test("editar um fixo no meio do caminho não muda os meses anteriores", () => {
  const s = createStore(memoryStorage());
  const r = s.addRecurring({ type: "expense", description: "Aluguel", amount: 1000, day: 5, category_id: "c2", start_month: "2026-01" });
  s.editRecurring(r.id, { amount: 1200 }, "2026-06");
  const [old, next] = s.state.recurring;
  assert.equal(old.amount, 1000);
  assert.equal(old.end_month, "2026-05");
  assert.equal(next.amount, 1200);
  assert.equal(next.start_month, "2026-06");
  s.endRecurring(next.id, "2026-09");
  assert.equal(s.state.recurring[1].end_month, "2026-08");
});

test("toda alteração é salva no armazenamento", () => {
  const storage = memoryStorage();
  const s = createStore(storage);
  s.setCategoryLimit("c0", 5000);
  assert.equal(storage.saved.categories[0].monthly_limit, 5000);
  s.deleteCategory("c0");
  assert.equal(storage.saved.categories.some((c) => c.id === "c0"), false);
});
