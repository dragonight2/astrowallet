// Versão em texto do relatório (para copiar quando o compartilhamento não abre).

import { dayMonth, firstName, formatMoney } from "../../core/format.js";

export const reportTitle = (report) => `Astro Wallet · Relatório de ${report.label.toLowerCase()}`;
export const reportFileName = (report) => `astro-wallet-relatorio-${report.month}.pdf`;

const signedPct = (value) => (value == null ? "" : `${value > 0 ? "+" : ""}${value}%`);

export function reportText(r) {
  const lines = [];
  lines.push(`Relatório de ${r.label.toLowerCase()}`);
  if (r.owner) lines.push(`Carteira de ${r.owner}`);
  if (!r.closed) lines.push("(mês em andamento — números parciais)");
  lines.push("");
  lines.push(`Receitas: ${formatMoney(r.income)}  (fixas ${formatMoney(r.incomeFixed)} · extras ${formatMoney(r.incomeExtra)})`);
  lines.push(
    `Despesas: ${formatMoney(r.expense)}  (contas fixas ${formatMoney(r.expenseFixed)} · parcelas ${formatMoney(r.expenseInstallments)})`,
  );
  lines.push(
    `Saldo: ${formatMoney(r.balance)}${r.savedPct != null ? `  (${r.savedPct}% da renda ${r.balance >= 0 ? "guardada" : "acima do que entrou"})` : ""}`,
  );
  if (r.prev.hasData) {
    lines.push("");
    lines.push(`Comparado a ${r.prev.label.toLowerCase()}:`);
    lines.push(
      `  Receitas ${signedPct(r.changes.income) || "sem comparação"}  ·  Despesas ${signedPct(r.changes.expense) || "sem comparação"}`,
    );
  }
  if (r.categories.length || r.uncategorized) {
    lines.push("");
    lines.push("Gastos por área:");
    for (const c of r.categories) {
      const limit = c.limit
        ? `  de ${formatMoney(c.limit)} (${Math.round((c.spent / c.limit) * 100)}%)${c.level === "over" ? " — ACIMA DO LIMITE" : ""}`
        : "";
      lines.push(`  • ${c.name}: ${formatMoney(c.spent)}${limit}`);
    }
    if (r.uncategorized) lines.push(`  • Sem área: ${formatMoney(r.uncategorized)}`);
  }
  if (r.top.length) {
    lines.push("");
    lines.push("Maiores gastos:");
    r.top.forEach((t, i) =>
      lines.push(`  ${i + 1}. ${t.description} — ${formatMoney(t.amount)} (${dayMonth(t.date)}, ${t.category})`),
    );
  }
  lines.push("");
  lines.push(`Gerado pela Astro Wallet${r.owner ? ` para ${firstName(r.owner)}` : ""}. Os dados ficam só no seu celular.`);
  return lines.join("\n");
}
