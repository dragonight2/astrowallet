// Módulo: Início (aba central).
// Saldo do mês, quanto das receitas já foi gasto, gastos por área e avisos.

import { escapeHtml } from "../core/dom.js";
import { percent } from "../core/format.js";
import { getSummaryCards } from "../core/modules.js";
import { categoryUsage, monthTotals } from "../data/finance.js";
import { circleIcon, emptyState, money, progressBar, quickAddButtons, sectionTitle } from "../ui/components.js";
import { icon } from "../ui/icons.js";

function hero(ctx) {
  const totals = monthTotals(ctx.store.state, ctx.app.month);
  const spentPct = percent(totals.expense, totals.income);
  return `<div class="hero">
    <span class="hero-k">Saldo do mês</span>
    <div class="hero-v num ${totals.balance < 0 ? "neg" : ""}">${money(totals.balance)}</div>
    ${
      spentPct != null
        ? `<div class="spend"><i style="width:${Math.min(100, spentPct)}%"></i></div>
      <p class="spend-t">${spentPct}% das receitas já foram gastos</p>`
        : '<p class="spend-t">Sem receitas neste mês</p>'
    }
    <div class="stats">
      <div class="stat"><span>Receitas</span><b class="num">${money(totals.income)}</b><small class="num">Fixas ${money(totals.incomeFixed)} · Extras ${money(totals.incomeExtra)}</small></div>
      <div class="stat"><span>Despesas</span><b class="num">${money(totals.expense)}</b><small class="num">Fixas ${money(totals.expenseFixed)} · Parcelas ${money(totals.expenseInstallments)}</small></div>
    </div>
  </div>`;
}

function render(ctx) {
  const { store, app } = ctx;
  const totals = monthTotals(store.state, app.month);
  const usage = categoryUsage(store.state, app.month, totals)
    .filter((u) => u.spent > 0 || u.category.monthly_limit > 0)
    .sort((a, b) => (b.ratio ?? -1) - (a.ratio ?? -1) || b.spent - a.spent);
  const uncategorized = totals.byCat.__none || 0;
  const cards = getSummaryCards(ctx)
    .map((card) => card.html)
    .join("");

  const byArea =
    !usage.length && !uncategorized
      ? `<div class="card">${emptyState("pie", "Nenhum gasto neste mês", "Toque no + para lançar uma despesa.")}</div>`
      : `<div class="card list">${usage
          .map(
            (u) => `
      <div class="catrow">
        <div class="catrow-h">${circleIcon(u.category.icon, "sm")}<span class="n">${escapeHtml(u.category.name)}</span><span class="v num">${money(u.spent)}</span></div>
        ${u.category.monthly_limit ? `${progressBar(u.ratio, u.level)}<div class="sub num ${u.level === "over" ? "bad" : ""}">Limite ${money(u.category.monthly_limit)} · ${u.level === "over" ? `excedeu ${money(u.spent - u.category.monthly_limit)}` : `resta ${money(u.category.monthly_limit - u.spent)}`}</div>` : '<div class="sub">Sem limite definido</div>'}
      </div>`,
          )
          .join("")}
      ${uncategorized ? `<div class="catrow"><div class="catrow-h">${circleIcon("help", "sm")}<span class="n">Sem área</span><span class="v num">${money(uncategorized)}</span></div></div>` : ""}
    </div>`;

  return `${quickAddButtons()}
    ${cards}
    ${sectionTitle("Gastos por área", '<button class="link" data-action="tab:go" data-tab="limits">Definir limites</button>')}
    ${byArea}
    ${totals.expenseFixed ? `<p class="hint center">Contas fixas somam ${money(totals.expenseFixed)} neste mês.</p>` : ""}`;
}

export default {
  id: "summary",
  tab: { label: "Início", title: "Início", icon: "home", order: 30, home: true, hero, render },
  summaryCards(ctx) {
    return monthTotals(ctx.store.state, ctx.app.month).incomeFixed
      ? []
      : [
          {
            order: 10,
            html: `<div class="card cta">
        <div class="cta-ic">${icon("repeat")}</div>
        <div class="cta-m"><b>Cadastre seu salário</b><p>Ele entra sozinho todo mês. Ganhos eventuais você lança como “Ganho extra”.</p></div>
        <button class="btn sm" data-action="rec:new" data-kind="rec-income">Adicionar</button>
      </div>`,
          },
        ];
  },
};
