// Peças de tela reaproveitadas por vários módulos.

import { escapeHtml } from "../core/dom.js";
import { dayMonth, formatMoney } from "../core/format.js";
import { icon } from "./icons.js";

/**
 * Valor em dinheiro que respeita o modo "esconder valores":
 * o CSS mostra um ou outro conforme a classe .hide-values no <html>.
 */
export const money = (cents) =>
  `<span class="mv"><span class="mv-v">${formatMoney(cents)}</span><span class="mv-h" aria-label="valor escondido">${cents < 0 ? "-" : ""}R$ ••••••</span></span>`;

/** Ícone dentro de um círculo. Variações: "sm", "in". */
export const circleIcon = (name, variant = "") => `<span class="ci ${variant}">${icon(name)}</span>`;

/** Barra de progresso. ratio 0..1; level "ok" | "warn" | "over". */
export function progressBar(ratio, level = "ok") {
  const width = Math.max(0, Math.min(1, ratio ?? 0)) * 100;
  return `<div class="bar" role="progressbar" aria-valuenow="${Math.round((ratio ?? 0) * 100)}" aria-valuemin="0" aria-valuemax="100"><i class="${level}" style="width:${width}%"></i></div>`;
}

/** Título de seção, com HTML opcional à direita. */
export const sectionTitle = (title, extraHtml = "") =>
  `<div class="sec"><h2>${escapeHtml(title)}</h2>${extraHtml}</div>`;

/** Estado vazio: ícone, título e explicação. */
export const emptyState = (iconName, title, text = "") =>
  `<div class="empty">${icon(iconName)}<b>${escapeHtml(title)}</b>${text ? `<span>${escapeHtml(text)}</span>` : ""}</div>`;

/** Botão-pílula selecionável. */
export const chip = ({ label, icon: iconName, active, action, data = {} }) =>
  `<button class="chip ${active ? "on" : ""}" data-action="${action}" ${Object.entries(data)
    .map(([key, value]) => `data-${key}="${escapeHtml(value)}"`)
    .join(" ")}>${iconName ? icon(iconName) : ""}${escapeHtml(label)}</button>`;

/** Uma linha de lançamento na lista do mês. */
export function transactionRow(item, category) {
  const isIncome = item.type === "income";
  const meta = [
    isIncome ? (item.recurring ? "Receita fixa" : "Ganho extra") : category ? category.name : "Sem área",
    dayMonth(item.date),
    item.recurring && !isIncome ? "conta fixa" : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return `<button class="tx" data-action="entry:open" data-key="${item.key}">
    ${circleIcon(isIncome ? "inc" : category ? category.icon : "tag", isIncome ? "in" : "")}
    <span class="tx-m"><b>${escapeHtml(item.description)}${item.recurring ? icon("repeat") : ""}${item.installment ? `<em class="badge num">${item.installment.n}/${item.installment.count}</em>` : ""}</b><span>${escapeHtml(meta)}</span></span>
    <span class="tx-v num ${isIncome ? "in" : "out"}">${isIncome ? "+" : "−"} ${money(item.amount)}</span></button>`;
}

/** Botões grandes de lançamento rápido (Despesa / Ganho e, completos, Parcelada / fixos). */
export function quickAddButtons({ full = false } = {}) {
  const button = (kind, iconName, title, subtitle, main) => `<button class="qa ${main ? "main" : ""}" data-action="entry:new" data-kind="${kind}">
      <span class="qa-ic">${icon(iconName)}</span><span class="qa-t"><b>${title}</b><small>${subtitle}</small></span></button>`;
  return `<div class="quickadd">
    ${button("expense", "minus", "Despesa", "Gastei", true)}
    ${button("income", "plus", "Ganho", "Recebi", true)}
  </div>
  ${full ? `<div class="quickadd sm">${button("installment", "card", "Parcelada", "Até 48x", false)}${button("rec-expense", "cal", "Conta fixa", "Todo mês", false)}${button("rec-income", "repeat", "Receita fixa", "Todo mês", false)}</div>` : ""}`;
}
