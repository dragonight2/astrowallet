import assert from "node:assert/strict";
import { test } from "node:test";
import {
  categoryUsage,
  installmentInMonth,
  monthItems,
  monthTotals,
  remainingInstallments,
  splitInstallments,
} from "../src/data/finance.js";
import { emptyState } from "../src/data/schema.js";

test("parcelas somam o total e a sobra vai na primeira", () => {
  assert.deepEqual(splitInstallments(10000, 3), [3334, 3333, 3333]);
  for (const [total, count] of [[1, 2], [99999, 7], [123456789, 48]]) {
    const parts = splitInstallments(total, count);
    assert.equal(parts.length, count);
    assert.equal(parts.reduce((a, b) => a + b, 0), total);
  }
});

test("parcela do mês e quanto falta", () => {
  const p = { total_amount: 10000, count: 3, start_month: "2026-11", day: 10 };
  assert.equal(installmentInMonth(p, "2026-10"), null);
  assert.deepEqual(installmentInMonth(p, "2026-11"), { n: 1, amount: 3334 });
  assert.deepEqual(installmentInMonth(p, "2027-01"), { n: 3, amount: 3333 });
  assert.equal(installmentInMonth(p, "2027-02"), null);
  assert.deepEqual(remainingInstallments(p, "2026-12"), { count: 2, amount: 6666 });
});

test("fixo no dia 31 cai no último dia de fevereiro", () => {
  const s = emptyState();
  s.recurring.push({ id: "r", type: "income", description: "Salário", amount: 100, day: 31, category_id: null, start_month: "2026-01", end_month: null });
  assert.equal(monthItems(s, "2027-02")[0].date, "2027-02-28");
});

test("totais do mês separam fixos, extras e parcelas", () => {
  const s = emptyState();
  s.recurring.push({ id: "r1", type: "income", description: "Salário", amount: 500000, day: 5, category_id: null, start_month: "2026-01", end_month: null });
  s.recurring.push({ id: "r2", type: "expense", description: "Aluguel", amount: 150000, day: 5, category_id: "c2", start_month: "2026-01", end_month: "2026-10" });
  s.entries.push({ id: "e1", type: "income", description: "Freela", amount: 20000, category_id: null, date: "2026-11-03" });
  s.entries.push({ id: "e2", type: "expense", description: "Mercado", amount: 30000, category_id: "c0", date: "2026-11-04" });
  s.entries.push({ id: "e3", type: "expense", description: "?", amount: 1000, category_id: null, date: "2026-11-04" });
  s.installments.push({ id: "p1", description: "TV", total_amount: 300000, count: 3, category_id: "c7", start_month: "2026-11", day: 1 });
  const t = monthTotals(s, "2026-11");
  assert.equal(t.income, 520000);
  assert.equal(t.incomeFixed, 500000);
  assert.equal(t.incomeExtra, 20000);
  assert.equal(t.expense, 131000); // aluguel já encerrado em outubro
  assert.equal(t.expenseInstallments, 100000);
  assert.equal(t.byCat.__none, 1000);
  assert.equal(t.balance, 389000);
});

test("situação dos limites: ok, perto (80%) e acima", () => {
  const s = emptyState();
  s.categories[0].monthly_limit = 1000;
  s.categories[1].monthly_limit = 1000;
  s.categories[2].monthly_limit = 1000;
  for (const [cat, amount] of [["c0", 500], ["c1", 800], ["c2", 1001]])
    s.entries.push({ id: cat, type: "expense", description: "x", amount, category_id: cat, date: "2026-11-01" });
  const levels = categoryUsage(s, "2026-11").slice(0, 4).map((u) => u.level);
  assert.deepEqual(levels, ["ok", "warn", "over", "none"]);
});
