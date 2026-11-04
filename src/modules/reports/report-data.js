// Monta os números do relatório de um mês (usados na tela, no texto e no PDF).

import { addMonths, currentMonth, monthLabel, percent } from "../../core/format.js";
import { categoryUsage, changePercent, monthTotals, topExpenses } from "../../data/finance.js";

export function buildReport(state, month) {
  const totals = monthTotals(state, month);
  const prevMonth = addMonths(month, -1);
  const prev = monthTotals(state, prevMonth);
  const usage = categoryUsage(state, month, totals);
  const withLimit = usage.filter((u) => u.category.monthly_limit > 0);
  const categoryName = (id) => state.categories.find((c) => c.id === id)?.name || "Sem área";

  return {
    month,
    label: monthLabel(month),
    owner: state.profile.name,
    closed: month < currentMonth(),
    empty: totals.items.length === 0,
    income: totals.income,
    incomeFixed: totals.incomeFixed,
    incomeExtra: totals.incomeExtra,
    expense: totals.expense,
    expenseFixed: totals.expenseFixed,
    expenseInstallments: totals.expenseInstallments,
    balance: totals.balance,
    savedPct: totals.income > 0 ? Math.round((totals.balance / totals.income) * 100) : null,
    prev: {
      month: prevMonth,
      label: monthLabel(prevMonth),
      income: prev.income,
      expense: prev.expense,
      balance: prev.balance,
      hasData: prev.items.length > 0,
    },
    changes: {
      income: changePercent(totals.income, prev.income),
      expense: changePercent(totals.expense, prev.expense),
    },
    categories: usage
      .filter((u) => u.spent > 0)
      .sort((a, b) => b.spent - a.spent)
      .map((u) => ({
        id: u.category.id,
        name: u.category.name,
        icon: u.category.icon,
        spent: u.spent,
        limit: u.category.monthly_limit,
        level: u.level,
        share: percent(u.spent, totals.expense),
      })),
    uncategorized: totals.byCat.__none || 0,
    limits: {
      total: withLimit.length,
      over: withLimit.filter((u) => u.level === "over").length,
      warn: withLimit.filter((u) => u.level === "warn").length,
    },
    top: topExpenses(state, month, 5).map((item) => ({
      description: item.installment
        ? `${item.description} (${item.installment.n}/${item.installment.count})`
        : item.description,
      amount: item.amount,
      date: item.date,
      category: categoryName(item.category_id),
      recurring: item.recurring,
    })),
  };
}
