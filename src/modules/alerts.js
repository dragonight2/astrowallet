// Módulo: Avisos.
//   1. Alerta de limite — pop-up quando uma área chega a 80% ou passa do limite do mês.
//      Cada área avisa uma vez por nível (perto / acima) em cada mês; se o gasto
//      voltar a ficar abaixo, ela pode avisar de novo.
//   2. Relatório do mês — quando o mês fecha, pop-up oferecendo baixar ou
//      compartilhar o relatório. No app instalado, também agenda uma notificação
//      no celular para o dia 1º às 9h, mesmo com o app fechado.
//
// Os pop-ups só aparecem com a carteira visível (nunca por cima da tela de
// bloqueio) e nunca por cima de um formulário aberto.

import { registerActions, runAction } from "../core/actions.js";
import { escapeHtml } from "../core/dom.js";
import { events } from "../core/events.js";
import { addMonths, currentMonth, monthName } from "../core/format.js";
import { categoryUsage, monthTotals } from "../data/finance.js";
import { circleIcon, money } from "../ui/components.js";
import { icon } from "../ui/icons.js";
import { isSheetOpen } from "../ui/sheet.js";

const MODULE_ID = "alerts";
const LEVEL_RANK = { none: 0, ok: 0, warn: 1, over: 2 };
const REMINDER_HOUR = 9;

let evaluating = false; // evita avaliar de novo enquanto um aviso está sendo preparado
let pendingReportMonth = null; // mês vindo de um toque na notificação

const settingsOf = (store) => store.moduleData(MODULE_ID);
const isOn = (value) => value !== false; // ligado por padrão

// ---------- Alerta de limite ----------

/** Áreas que subiram de nível (ok → perto → acima) desde o último aviso. */
function findLimitCrossings(store, months) {
  const data = settingsOf(store);
  const notified = { ...(data.notified || {}) };
  const crossings = [];
  let changed = false;

  for (const month of months) {
    const record = { ...(notified[month] || {}) };
    for (const usage of categoryUsage(store.state, month)) {
      const id = usage.category.id;
      const now = LEVEL_RANK[usage.level];
      const before = LEVEL_RANK[record[id]] || 0;
      if (now > before) crossings.push({ month, ...usage });
      if (now !== before) {
        if (now) record[id] = usage.level;
        else delete record[id];
        changed = true;
      }
    }
    notified[month] = record;
  }

  // Guarda só os meses recentes, para não crescer para sempre.
  const keep = new Set([addMonths(currentMonth(), -1), currentMonth(), ...months]);
  for (const month of Object.keys(notified)) if (!keep.has(month)) delete notified[month];

  return { crossings, notified, changed };
}

function limitPopup(ctx, crossings) {
  const anyOver = crossings.some((c) => c.level === "over");
  const sorted = [...crossings].sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level]);
  const otherMonth = crossings[0].month !== currentMonth() ? ` em ${monthName(crossings[0].month)}` : "";
  ctx.ui.openSheet(
    "Alerta de limite",
    `<div class="pop alert-pop">
      <div class="pop-ic ${anyOver ? "over" : "warn"}">${icon("alert")}</div>
      <h2>${anyOver ? "Você passou do limite" : "Você está perto do limite"}</h2>
      <p class="muted">${anyOver ? `Os gastos${otherMonth} já passaram do valor que você definiu.` : `Os gastos${otherMonth} já chegaram a 80% do valor que você definiu.`}</p>
      <div class="card pop-list">${sorted
        .map(
          (c) => `<div class="pop-row">${circleIcon(c.category.icon, "sm")}
          <div><b>${escapeHtml(c.category.name)}</b><p class="num ${c.level === "over" ? "bad" : ""}">${
            c.level === "over"
              ? `Passou ${money(c.spent - c.category.monthly_limit)} do limite de ${money(c.category.monthly_limit)}`
              : `Usou ${Math.round(c.ratio * 100)}% do limite de ${money(c.category.monthly_limit)}`
          }</p></div></div>`,
        )
        .join("")}</div>
      <div class="row2">
        <button class="btn soft" data-action="sheet:close">Entendi</button>
        <button class="btn" data-action="alerts:goto" data-tab="limits">Ver limites</button>
      </div>
    </div>`,
  );
}

// ---------- Relatório do mês ----------

function reportPopup(ctx, month) {
  const totals = monthTotals(ctx.store.state, month);
  ctx.ui.openSheet(
    "Relatório do mês",
    `<div class="pop alert-pop">
      <div class="pop-ic">${icon("chart")}</div>
      <h2>Relatório de ${monthName(month)} pronto</h2>
      <p class="muted">O mês fechou. Seu relatório em PDF já pode ser baixado ou compartilhado.</p>
      <div class="pop-stats">
        <div><span>Receitas</span><b class="num">${money(totals.income)}</b></div>
        <div><span>Despesas</span><b class="num">${money(totals.expense)}</b></div>
        <div><span>Saldo</span><b class="num ${totals.balance < 0 ? "bad" : ""}">${money(totals.balance)}</b></div>
      </div>
      <button class="btn" data-action="alerts:share-report" data-month="${month}">${icon("share")} Baixar ou compartilhar</button>
      <div class="row2">
        <button class="btn soft" data-action="sheet:close">Agora não</button>
        <button class="btn soft" data-action="alerts:open-report" data-month="${month}">Ver relatório</button>
      </div>
    </div>`,
  );
}

/** O mês anterior fechou, tem lançamentos e ainda não foi avisado? */
function reportToAnnounce(store) {
  const data = settingsOf(store);
  if (!isOn(data.reportReminder)) return null;
  const closed = addMonths(currentMonth(), -1);
  if (data.reportAnnounced && data.reportAnnounced >= closed) return null;
  return monthTotals(store.state, closed).items.length ? closed : null;
}

// ---------- Notificação no celular ----------

async function syncReminders(ctx) {
  const notifications = ctx.services.platform?.notifications;
  if (!notifications || notifications.kind === "none") return;
  if (!ctx.store.state.profile.onboarded) return;
  if (!isOn(settingsOf(ctx.store).reportReminder)) return notifications.cancelMonthly();
  if (!(await notifications.ensurePermission())) return;
  const [y, m] = currentMonth().split("-").map(Number);
  const items = [1, 2, 3].map((k) => {
    const at = new Date(y, m - 1 + k, 1, REMINDER_HOUR, 0, 0);
    const month = addMonths(currentMonth(), k - 1);
    // Sem valores na notificação: ela aparece na tela de bloqueio do celular.
    return {
      at,
      title: `Relatório de ${monthName(month)} pronto`,
      body: "O mês fechou. Toque para baixar ou compartilhar seu relatório na Astro Wallet.",
      extra: { month },
    };
  });
  try {
    await notifications.scheduleMonthly(items);
  } catch (err) {
    console.warn("Não foi possível agendar o aviso mensal", err);
  }
}

// ---------- Avaliação ----------

function evaluate(ctx) {
  const { store, app } = ctx;
  if (evaluating || isSheetOpen() || !store.state.profile.onboarded) return;
  evaluating = true;
  try {
    // Veio de um toque na notificação: abre o relatório daquele mês.
    if (pendingReportMonth) {
      const month = pendingReportMonth;
      pendingReportMonth = null;
      store.setModuleData(MODULE_ID, { reportAnnounced: month });
      app.setMonth(month);
      app.go("reports");
      reportPopup(ctx, month);
      return;
    }

    const closed = reportToAnnounce(store);
    if (closed) {
      store.setModuleData(MODULE_ID, { reportAnnounced: closed });
      reportPopup(ctx, closed);
      return;
    }

    // Limites: mês atual e, se estiver olhando um mês futuro, ele também.
    const months = [...new Set([currentMonth(), app.month])].filter((m) => m >= currentMonth());
    const { crossings, notified, changed } = findLimitCrossings(store, months);
    if (changed) store.setModuleData(MODULE_ID, { notified });
    if (crossings.length && isOn(settingsOf(store).limitPopups)) limitPopup(ctx, crossings);
  } finally {
    evaluating = false;
  }
}

const switchRow = (key, iconName, title, text, on) => `<div class="setrow">
    <span class="ci">${icon(iconName)}</span>
    <span class="setrow-m"><b>${title}</b><span>${text}</span></span>
    <button class="switch ${on ? "on" : ""}" role="switch" aria-checked="${on}" data-action="alerts:toggle" data-key="${key}" aria-label="${title}"></button>
  </div>`;

export default {
  id: MODULE_ID,
  settings: {
    title: "Avisos",
    order: 25,
    render(ctx) {
      const data = settingsOf(ctx.store);
      const native = ctx.services.platform?.notifications?.kind === "native";
      return `<div class="card list">
        ${switchRow("limitPopups", "alert", "Alerta de limite", "Aviso na tela quando uma área chega a 80% ou passa do limite", isOn(data.limitPopups))}
        ${switchRow("reportReminder", "chart", "Relatório do mês", native ? "Aviso quando o mês fecha e notificação no celular no dia 1º, às 9h" : "Aviso quando o mês fecha (no app instalado, também notificação no celular)", isOn(data.reportReminder))}
      </div>`;
    },
  },
  init(ctx) {
    const { store, app, ui, services } = ctx;

    events.on("view:rendered", () => evaluate(ctx));
    events.on("profile:changed", (patch) => {
      if (patch?.onboarded) syncReminders(ctx);
    });
    services.platform?.notifications?.onOpen(({ month }) => {
      if (!month) return;
      pendingReportMonth = month;
      app.render();
    });
    syncReminders(ctx);

    registerActions({
      "alerts:goto": (button) => {
        ui.closeSheet();
        app.go(button.dataset.tab);
      },
      "alerts:open-report": (button) => {
        ui.closeSheet();
        app.setMonth(button.dataset.month);
        app.go("reports");
      },
      "alerts:share-report": (button) => {
        ui.closeSheet(); // fecha antes: no navegador o relatório pode abrir a própria folha
        runAction("report:share", button);
      },
      "alerts:toggle": (button) => {
        const key = button.dataset.key;
        const turnOn = !isOn(settingsOf(store)[key]);
        store.setModuleData(MODULE_ID, { [key]: turnOn });
        if (key === "reportReminder") syncReminders(ctx);
        ui.toast(turnOn ? "Aviso ligado" : "Aviso desligado");
      },
    });
  },
};
