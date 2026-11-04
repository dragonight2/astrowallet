// Moldura do app: barra superior, título com o mês, conteúdo da aba e barra de abas.
// Ela não conhece nenhuma funcionalidade específica — pergunta ao registro de
// módulos quais abas, telas de bloqueio e botões existem e desenha o que receber.

import { registerActions, runAction } from "./actions.js";
import { escapeHtml } from "./dom.js";
import { events } from "./events.js";
import { addMonths, currentMonth, firstName, monthLabel, monthName } from "./format.js";
import { getNavActions, getTabs, initModules, renderGate } from "./modules.js";
import { brandLockup } from "../ui/brand.js";
import { icon } from "../ui/icons.js";
import { applyInputMask } from "../ui/input-masks.js";
import { closeSheet, confirmSheet, isSheetOpen, mountSheetLayer, openSheet, toast } from "../ui/sheet.js";

/**
 * Liga o app à página.
 * Devolve o "contexto" (ctx) que todos os módulos recebem:
 *   ctx.store     dados da carteira
 *   ctx.services  plataforma, autenticação, compartilhamento
 *   ctx.ui        openSheet, closeSheet, confirmSheet, toast
 *   ctx.app       mês e aba atuais, navegação e redesenho
 */
export function startApp({ store, root, layer, services }) {
  const view = { tab: null, month: currentMonth() };

  const ctx = {
    store,
    services,
    ui: { openSheet, closeSheet, confirmSheet, toast },
    app: {
      get month() {
        return view.month;
      },
      setMonth(month) {
        view.month = month;
        render();
      },
      get tab() {
        return view.tab;
      },
      go(tabId) {
        view.tab = tabId;
        render();
        window.scrollTo(0, 0);
      },
      render: () => render(),
    },
  };

  function header(tab) {
    const name = store.state.profile.name;
    const initials = name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word[0])
      .join("")
      .toUpperCase();
    const isCurrentMonth = view.month === currentMonth();
    const month = monthName(view.month);
    return `<header class="nav"><div class="wrap nav-in">
        ${brandLockup("sm")}
        <span class="nav-actions">
          ${getNavActions(ctx)
            .map((action) => action.html)
            .join("")}
          ${initials ? `<span class="avatar" title="Carteira de ${escapeHtml(name)}" aria-label="Carteira de ${escapeHtml(name)}">${escapeHtml(initials)}</span>` : ""}
        </span>
      </div></header>
      <section class="wrap titlebar">
        <div class="titlebar-row">
          <div class="titlebar-t">
            <span class="eyebrow">${escapeHtml(tab.title || tab.label)}${name ? ` · ${escapeHtml(firstName(name))}` : ""}</span>
            <h1 class="large">${month[0].toUpperCase()}${month.slice(1)} <em>${view.month.slice(0, 4)}</em></h1>
          </div>
          <div class="mnav">
            <button data-action="month:prev" aria-label="Mês anterior">${icon("left")}</button>
            <button data-action="month:next" aria-label="Próximo mês">${icon("right")}</button>
          </div>
        </div>
        ${isCurrentMonth ? "" : `<button class="today" data-action="month:today">Voltar para ${monthLabel(currentMonth()).toLowerCase()}</button>`}
        ${tab.hero ? tab.hero(ctx) : ""}
      </section>`;
  }

  function render() {
    const gate = renderGate(ctx);
    if (gate) {
      root.innerHTML = `<div class="gate"><div class="gate-in wrap">${gate}</div></div>`;
      const focus = root.querySelector("[autofocus]");
      if (focus) setTimeout(() => focus.focus(), 60);
      return;
    }

    const tabs = getTabs();
    const tab = tabs.find((t) => t.id === view.tab) || tabs.find((t) => t.home) || tabs[0];
    view.tab = tab.id;
    const primary = tab.primaryAction;

    root.classList.toggle("has-primary", !!primary);
    root.innerHTML = `${header(tab)}
      <main class="wrap content">${tab.render(ctx)}</main>
      ${
        primary
          ? `<div class="primary-wrap"><button class="primary-btn" data-action="${primary.action}" ${Object.entries(
              primary.data || {},
            )
              .map(([key, value]) => `data-${key}="${escapeHtml(value)}"`)
              .join(" ")}>${icon(primary.icon || "plus")}<span>${escapeHtml(primary.label)}</span></button></div>`
          : ""
      }
      <nav class="tabbar" aria-label="Seções"><div class="tabbar-in">
        ${tabs.map((t) => `<button class="${t.id === tab.id ? "on" : ""} ${t.home ? "home" : ""}" data-action="tab:go" data-tab="${t.id}" ${t.id === tab.id ? 'aria-current="page"' : ""}>${t.home ? `<span class="home-ic">${icon(t.icon)}</span>` : icon(t.icon)}<span>${escapeHtml(t.label)}</span></button>`).join("")}
      </div></nav>`;
  }

  registerActions({
    "tab:go": (el) => ctx.app.go(el.dataset.tab),
    "month:prev": () => ctx.app.setMonth(addMonths(view.month, -1)),
    "month:next": () => ctx.app.setMonth(addMonths(view.month, 1)),
    "month:today": () => ctx.app.setMonth(currentMonth()),
  });

  // Um único ouvinte para a página inteira: lê os atributos data-* e chama a ação.
  document.addEventListener("click", (event) => {
    const el = event.target.closest("[data-action]");
    if (!el || el.disabled) return;
    if (el.tagName !== "A") event.preventDefault();
    runAction(el.dataset.action, el, event);
  });
  document.addEventListener("input", (event) => {
    if (event.target.matches?.("[data-money], [data-name]")) applyInputMask(event.target);
    if (event.target.dataset?.input) runAction(event.target.dataset.input, event.target, event);
  });
  document.addEventListener("change", (event) => {
    const el = event.target.closest("[data-change]");
    if (el) runAction(el.dataset.change, el, event);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isSheetOpen()) closeSheet();
    if (event.key === "Enter" && event.target.tagName === "INPUT") {
      const form = event.target.closest("[data-submit]");
      if (form) {
        event.preventDefault();
        runAction(form.dataset.submit, form, event);
      } else if (event.target.dataset.change) event.target.blur();
    }
  });

  events.on("data:changed", () => render());
  mountSheetLayer(layer);
  initModules(ctx);
  render();
  return ctx;
}
