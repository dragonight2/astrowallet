// Cálculos financeiros do mês. Funções puras: recebem os dados e devolvem
// números, sem tocar na tela nem no armazenamento (por isso têm testes).

import { addMonths, daysInMonth, monthsBetween, pad2 } from "../core/format.js";

export const MAX_INSTALLMENTS = 48;

/**
 * Divide um total em parcelas inteiras (centavos).
 * A sobra do arredondamento vai na 1ª parcela: 100,00 em 3x → 33,34 + 33,33 + 33,33.
 */
export function splitInstallments(total, count) {
  const each = Math.floor(total / count);
  const parts = Array(count).fill(each);
  parts[0] += total - each * count;
  return parts;
}

/** Qual parcela cai no mês (n e valor), ou null se a compra não tem parcela nele. */
export function installmentInMonth(purchase, month) {
  const n = monthsBetween(purchase.start_month, month) + 1;
  if (n < 1 || n > purchase.count) return null;
  return { n, amount: splitInstallments(purchase.total_amount, purchase.count)[n - 1] };
}

/** Mês da última parcela. */
export const lastInstallmentMonth = (purchase) => addMonths(purchase.start_month, purchase.count - 1);

/** Quantas parcelas e quanto falta pagar a partir do mês (incluindo a do mês). */
export function remainingInstallments(purchase, month) {
  const parts = splitInstallments(purchase.total_amount, purchase.count);
  const current = Math.max(1, monthsBetween(purchase.start_month, month) + 1);
  return {
    count: Math.max(0, purchase.count - current + 1),
    amount: parts.slice(current - 1).reduce((sum, v) => sum + v, 0),
  };
}

/**
 * Todos os itens do mês, já com fixos e parcelas calculados, do mais recente
 * para o mais antigo. Cada item tem uma `key` única: r_ (fixo), e_ (avulso), p_ (parcela).
 */
export function monthItems(state, month) {
  const lastDay = daysInMonth(month);

  const fixed = state.recurring
    .filter((r) => r.start_month <= month && (!r.end_month || r.end_month >= month))
    .map((r) => ({
      key: `r_${r.id}`,
      id: r.id,
      recurring: true,
      type: r.type,
      description: r.description,
      amount: r.amount,
      category_id: r.category_id,
      day: r.day,
      date: `${month}-${pad2(Math.min(r.day, lastDay))}`,
    }));

  const single = state.entries
    .filter((e) => e.date.startsWith(month))
    .map((e) => ({ ...e, key: `e_${e.id}`, recurring: false }));

  const parcels = (state.installments || [])
    .map((p) => {
      const part = installmentInMonth(p, month);
      return part
        ? {
            key: `p_${p.id}`,
            id: p.id,
            recurring: false,
            type: "expense",
            description: p.description,
            amount: part.amount,
            category_id: p.category_id,
            date: `${month}-${pad2(Math.min(p.day, lastDay))}`,
            installment: { n: part.n, count: p.count, total: p.total_amount },
          }
        : null;
    })
    .filter(Boolean);

  return [...fixed, ...single, ...parcels].sort((a, b) => b.date.localeCompare(a.date) || a.key.localeCompare(b.key));
}

/** Totais do mês: receitas, despesas, saldo e gasto por área (byCat; "__none" = sem área). */
export function monthTotals(state, month) {
  const items = monthItems(state, month);
  const totals = {
    items,
    income: 0,
    incomeFixed: 0,
    incomeExtra: 0,
    expense: 0,
    expenseFixed: 0,
    expenseInstallments: 0,
    byCat: {},
  };
  for (const item of items) {
    if (item.type === "income") {
      totals.income += item.amount;
      if (item.recurring) totals.incomeFixed += item.amount;
      else totals.incomeExtra += item.amount;
    } else {
      totals.expense += item.amount;
      if (item.recurring) totals.expenseFixed += item.amount;
      if (item.installment) totals.expenseInstallments += item.amount;
      const cat = item.category_id || "__none";
      totals.byCat[cat] = (totals.byCat[cat] || 0) + item.amount;
    }
  }
  totals.balance = totals.income - totals.expense;
  return totals;
}

/** Situação do limite: "none" (sem limite), "ok", "warn" (80% ou mais) ou "over" (passou). */
function limitStatus(spent, limit) {
  if (!limit) return { ratio: null, level: "none" };
  const ratio = spent / limit;
  return { ratio, level: ratio > 1 ? "over" : ratio >= 0.8 ? "warn" : "ok" };
}

/** Para cada área: quanto foi gasto no mês e a situação do limite. */
export function categoryUsage(state, month, totals = monthTotals(state, month)) {
  return state.categories.map((category) => {
    const spent = totals.byCat[category.id] || 0;
    return { category, spent, ...limitStatus(spent, category.monthly_limit) };
  });
}

/** Maiores despesas do mês. */
export function topExpenses(state, month, limit = 5) {
  return monthItems(state, month)
    .filter((item) => item.type === "expense")
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
}

/** Variação percentual de `previous` para `current`, ou null sem base. */
export function changePercent(current, previous) {
  return previous ? Math.round(((current - previous) / previous) * 100) : null;
}
