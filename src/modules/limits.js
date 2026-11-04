// Módulo: Limites por área.
// Define quanto pode gastar por mês em cada área, cria/edita/exclui áreas
// e avisa no Início quando uma área chega a 80% ou passa do limite.

import { registerActions } from "../core/actions.js";
import { $, escapeHtml, setText } from "../core/dom.js";
import { moneyInputValue, parseMoney, percent } from "../core/format.js";
import { categoryUsage, monthTotals } from "../data/finance.js";
import { circleIcon, money, progressBar } from "../ui/components.js";
import { CATEGORY_ICONS, icon } from "../ui/icons.js";

let editing = null; // { id, icon } da área aberta no formulário

function render(ctx) {
  const { store, app } = ctx;
  const totals = monthTotals(store.state, app.month);
  const planned = store.state.categories.reduce((sum, c) => sum + (c.monthly_limit || 0), 0);
  const plannedPct = percent(planned, totals.income);
  return `
    <div class="card intro">
      <p>Defina quanto pode gastar por mês em cada área. O limite vale para todos os meses e o app avisa quando chegar a 80%.</p>
      ${planned ? `<div class="intro-total"><span>Total planejado</span><b class="num">${money(planned)}</b>${plannedPct != null ? `<small>${plannedPct}% das receitas do mês</small>` : ""}</div>` : ""}
    </div>
    ${categoryUsage(store.state, app.month, totals)
      .map(
        (u) => `
      <div class="card lim">
        <div class="lim-row">
          <button class="lim-who" data-action="cat:edit" data-id="${u.category.id}">
            ${circleIcon(u.category.icon)}
            <span><b>${escapeHtml(u.category.name)} ${icon("edit")}</b><small class="num ${u.level === "over" ? "bad" : ""}">Gasto no mês: ${money(u.spent)}</small></span>
          </button>
          <label class="limbox"><span>R$</span><input id="lim-${u.category.id}" data-change="limit:set" data-id="${u.category.id}" inputmode="numeric" data-money placeholder="sem limite" value="${moneyInputValue(u.category.monthly_limit)}" aria-label="Limite mensal de ${escapeHtml(u.category.name)}"></label>
        </div>
        ${u.category.monthly_limit ? progressBar(u.ratio, u.level) : ""}
      </div>`,
      )
      .join("")}
    <button class="btn soft" data-action="cat:edit" data-id="">${icon("plus")} Nova área</button>`;
}

function categoryForm(ctx) {
  const category = editing.id ? ctx.store.category(editing.id) : null;
  return `<div data-submit="cat:save" class="form">
    <label class="lab" for="c-name">Nome</label>
    <input id="c-name" class="field" placeholder="Ex.: Pets, Mercado, Filhos" value="${category ? escapeHtml(category.name) : ""}" autofocus>
    <div class="lab">Ícone</div>
    <div class="icons">${CATEGORY_ICONS.map((name) => `<button class="${name === editing.icon ? "on" : ""}" data-action="cat:icon" data-icon="${name}" aria-label="Ícone ${name}">${icon(name)}</button>`).join("")}</div>
    <p class="err" id="c-err" role="alert"></p>
    <button class="btn" data-action="cat:save">${icon("check")} Salvar</button>
    ${category ? `<button class="btn danger" data-action="cat:delete">${icon("trash")} Excluir área</button>` : ""}
  </div>`;
}

export default {
  id: "limits",
  tab: { label: "Limites", title: "Limites por área", icon: "gauge", order: 20, render },
  summaryCards(ctx) {
    return categoryUsage(ctx.store.state, ctx.app.month)
      .filter((u) => u.level === "over" || u.level === "warn")
      .map((u) => ({
        order: u.level === "over" ? 20 : 21,
        html: `<div class="alert ${u.level}">${icon("alert")}<p>${u.level === "over" ? `<b>${escapeHtml(u.category.name)}</b> passou ${money(u.spent - u.category.monthly_limit)} do limite.` : `<b>${escapeHtml(u.category.name)}</b> já usou ${Math.round(u.ratio * 100)}% do limite.`}</p></div>`,
      }));
  },
  init(ctx) {
    const { store, ui } = ctx;
    registerActions({
      "limit:set": (input) => {
        const category = store.category(input.dataset.id);
        const text = input.value.trim();
        const limit = text === "" ? 0 : parseMoney(text);
        if (category && Number.isFinite(limit) && limit >= 0) store.setCategoryLimit(category.id, limit);
        else ctx.app.render();
      },
      "cat:edit": (el) => {
        const category = el.dataset.id ? store.category(el.dataset.id) : null;
        editing = { id: category?.id || null, icon: category?.icon || "tag" };
        ui.openSheet(category ? "Editar área" : "Nova área", categoryForm(ctx));
      },
      "cat:icon": (el) => {
        editing.icon = el.dataset.icon;
        document.querySelectorAll('[data-action="cat:icon"]').forEach((b) => b.classList.toggle("on", b === el));
      },
      "cat:save": () => {
        const name = $("#c-name").value.trim();
        if (!name) return setText("c-err", "Dê um nome para a área.");
        ui.closeSheet();
        store.saveCategory({ id: editing.id, name, icon: editing.icon });
      },
      "cat:delete": () => {
        const id = editing.id;
        ui.confirmSheet({
          title: "Excluir área",
          text: "Os lançamentos dessa área continuam salvos, mas ficam como “Sem área”.",
          confirmLabel: "Excluir",
          onConfirm: () => store.deleteCategory(id),
        });
      },
    });
  },
};
