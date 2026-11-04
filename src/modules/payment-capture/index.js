// Módulo: Captura automática de pagamentos (só no app Android).
//
// Quando a pessoa liga a opção e autoriza no Android, o celular entrega ao
// Astro Wallet as notificações dos apps de banco e carteira (lista em sources.js).
// O app reconhece o pagamento e mostra para revisão: nada é lançado sem a
// pessoa confirmar. Tudo acontece no aparelho, sem internet.
//
// Ligar/desligar: Ajustes → Captura automática. Desligar para a leitura na hora
// e apaga os avisos ainda não revisados. A permissão do Android pode ser
// removida pelo botão "Abrir configurações do Android".

import { registerActions } from "../../core/actions.js";
import { escapeHtml } from "../../core/dom.js";
import { events } from "../../core/events.js";
import { dayMonth, today } from "../../core/format.js";
import { chip, circleIcon, money } from "../../ui/components.js";
import { icon } from "../../ui/icons.js";
import { isSheetOpen } from "../../ui/sheet.js";
import { mergeDuplicates, merchantKey, parsePaymentNotification, suggestCategory } from "./parser.js";
import { PAYMENT_APPS } from "./sources.js";

const MODULE_ID = "payment-capture";
const PULL_INTERVAL_MS = 20000;
const MAX_PENDING = 200;
const AUTO_REVIEW_EVERY_MS = 4 * 60 * 60 * 1000; // abre a fila sozinha no máximo a cada 4 horas

let granted = false; // permissão do Android (consultada ao abrir e ao voltar para o app)
let awaitingPermission = false; // a pessoa foi para as configurações do Android
let lastPull = 0;
let pulling = false;

const dataOf = (store) => store.moduleData(MODULE_ID);
const pendingOf = (store) => dataOf(store).pending || [];

// ---------- Textos de ajuda ----------

const howToSteps = () => `
  <ol class="steps">
    <li>Toque em <b>Abrir configurações do Android</b>.</li>
    <li>Se aparecer uma lista, toque em <b>Astro Wallet</b>.</li>
    <li>Ative <b>Permitir acesso a notificações</b> e confirme.</li>
    <li>Volte para o Astro Wallet. Pronto: os próximos pagamentos aparecem aqui para você revisar.</li>
  </ol>
  <p class="hint">Apareceu <b>"Configuração restrita"</b>? Isso acontece com apps instalados fora da Play Store. Toque em <b>Abrir informações do app</b>, no menu <b>⋮</b> escolha <b>Permitir configurações restritas</b> e tente de novo.</p>`;

const privacyNote = () =>
  `<div class="note">${icon("shield")}<p>O Astro Wallet só lê avisos de bancos e carteiras digitais (<button class="inline-link" data-action="capture:apps">ver lista</button>), nunca de WhatsApp, e-mail ou outros apps. Nada sai do celular, e cada pagamento só é lançado depois que você confirma.</p></div>`;

// ---------- Busca dos avisos ----------

async function refreshPermission(ctx) {
  const capture = ctx.services.platform?.paymentCapture;
  if (!capture?.available) return;
  const before = granted;
  granted = await capture.isGranted();
  if (awaitingPermission && granted) {
    awaitingPermission = false;
    ctx.ui.closeSheet();
    ctx.ui.toast("Pronto! Os próximos pagamentos aparecem para você revisar");
  }
  if (before !== granted) ctx.app.render();
}

/** Busca os avisos guardados pelo Android, reconhece os pagamentos e põe na fila. */
async function pull(ctx, { force = false } = {}) {
  const { store, ui } = ctx;
  const capture = ctx.services.platform?.paymentCapture;
  if (!capture?.available || !dataOf(store).enabled || pulling) return;
  if (!force && Date.now() - lastPull < PULL_INTERVAL_MS) return;
  pulling = true;
  lastPull = Date.now();
  try {
    const raw = await capture.fetchPending();
    if (!raw.length) return;
    const parsed = raw.map(parsePaymentNotification).filter(Boolean);
    const before = pendingOf(store);
    const merged = mergeDuplicates([...before, ...parsed]).slice(-MAX_PENDING);
    const fresh = merged.length - before.length;
    if (merged.length !== before.length || parsed.length) store.setModuleData(MODULE_ID, { pending: merged });
    await capture.ack(raw.map((n) => n.id)); // apaga do lado do Android
    if (fresh <= 0) return;
    // A fila vai acumulando ao longo do dia. A revisão só abre sozinha de vez em
    // quando; no resto do tempo, um aviso discreto e o cartão no Início.
    const lastShown = dataOf(store).reviewShownAt || 0;
    if (!isSheetOpen() && Date.now() - lastShown > AUTO_REVIEW_EVERY_MS) showReview(ctx);
    else ui.toast(`${fresh === 1 ? "1 novo item" : `${fresh} novos itens`} na fila · ${merged.length} para revisar`);
  } catch (err) {
    console.warn("Captura de pagamentos falhou", err);
  } finally {
    pulling = false;
  }
}

// ---------- Revisão (fila) ----------

// Área escolhida para cada item enquanto a fila está aberta (começa com a sugestão).
const chosenArea = new Map();

const areaFor = (store, item) => {
  if (item.type === "income") return null;
  if (!chosenArea.has(item.id))
    chosenArea.set(item.id, suggestCategory(item.description, store.state.categories, dataOf(store).learned));
  return chosenArea.get(item.id);
};

function dayLabel(date) {
  const now = today();
  if (date === now) return "Hoje";
  const y = new Date();
  y.setDate(y.getDate() - 1);
  const yesterday = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, "0")}-${String(y.getDate()).padStart(2, "0")}`;
  return date === yesterday ? "Ontem" : dayMonth(date);
}

const clock = (ms) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

function reviewItem(store, item) {
  const isIncome = item.type === "income";
  const area = areaFor(store, item);
  return `<div class="rv" data-item="${escapeHtml(item.id)}">
    <div class="pop-row">${circleIcon(isIncome ? "inc" : "card", isIncome ? "in sm" : "sm")}
      <div class="grow"><b>${escapeHtml(item.description)}</b><p>${isIncome ? "Recebimento" : "Pagamento"} · ${escapeHtml(item.source)} · ${clock(item.time)}</p></div>
      <b class="num ${isIncome ? "in" : "out"}">${isIncome ? "+" : "−"} ${money(item.amount)}</b>
    </div>
    ${
      isIncome
        ? '<p class="rv-note">Entra como ganho extra.</p>'
        : `<div class="chips scroll rv-areas">${[...store.state.categories]
            .sort((a, b) => (b.id === area) - (a.id === area)) // a escolhida aparece primeiro
            .map((c) => chip({ label: c.name, icon: c.icon, active: area === c.id, action: "capture:area", data: { id: item.id, cat: c.id } }))
            .join("")}</div>${area ? "" : '<p class="rv-note warn">Escolha a área para lançar.</p>'}`
    }
    <div class="rv-actions">
      <button class="btn soft sm" data-action="capture:dismiss" data-id="${escapeHtml(item.id)}">Ignorar</button>
      <button class="btn soft sm" data-action="capture:review" data-id="${escapeHtml(item.id)}">${icon("edit")} Editar</button>
      <button class="btn sm" data-action="capture:quick" data-id="${escapeHtml(item.id)}" ${isIncome || area ? "" : "disabled"}>${icon("check")} Lançar</button>
    </div>
  </div>`;
}

function reviewHtml(store) {
  const pending = [...pendingOf(store)].sort((a, b) => b.time - a.time); // mais recentes primeiro
  const out = pending.filter((p) => p.type === "expense").reduce((s, p) => s + p.amount, 0);
  const inc = pending.filter((p) => p.type === "income").reduce((s, p) => s + p.amount, 0);
  const ready = pending.filter((p) => p.type === "income" || areaFor(store, p)).length;
  const days = [];
  for (const p of pending) {
    const label = dayLabel(p.date);
    if (!days.length || days[days.length - 1].label !== label) days.push({ label, items: [] });
    days[days.length - 1].items.push(p);
  }
  return `<div class="pop alert-pop review">
      <h2>${pending.length === 1 ? "1 item para revisar" : `${pending.length} itens para revisar`}</h2>
      <p class="muted">Pagamentos e recebimentos das notificações do seu banco e da sua carteira.</p>
      <div class="pop-stats two">
        <div><span>Saídas</span><b class="num">${money(out)}</b></div>
        <div><span>Entradas</span><b class="num">${money(inc)}</b></div>
      </div>
      ${days
        .map(
          (d) => `<div class="rv-day"><span>${d.label}</span><span>${d.items.length}</span></div>
      <div class="card pop-list">${d.items.map((p) => reviewItem(store, p)).join("")}</div>`,
        )
        .join("")}
      <button class="btn" data-action="capture:all" ${ready ? "" : "disabled"}>${icon("check")} Lançar ${ready === pending.length ? "todos" : `os ${ready} prontos`} (${ready})</button>
      ${ready < pending.length ? `<p class="hint center">${pending.length - ready} sem área ficam na fila até você escolher.</p>` : ""}
      <button class="btn soft" data-action="sheet:close">Revisar depois</button>
    </div>`;
}

/** Abre (ou redesenha, mantendo a rolagem) a revisão da fila. */
function showReview(ctx, { keepScroll = false } = {}) {
  const { store, ui } = ctx;
  if (!pendingOf(store).length) {
    ui.closeSheet();
    return;
  }
  const sheet = document.querySelector(".sheet");
  const scroll = keepScroll && sheet ? sheet.scrollTop : 0;
  ui.openSheet("Fila para revisar", reviewHtml(store));
  if (scroll) document.querySelector(".sheet").scrollTop = scroll;
  store.setModuleData(MODULE_ID, { reviewShownAt: Date.now() });
}

/** Lança direto, sem abrir o formulário. Devolve true se lançou. */
function quickSave(ctx, item) {
  const { store } = ctx;
  const category_id = areaFor(store, item);
  if (item.type === "expense" && !category_id) return false;
  store.addEntry({ type: item.type, description: item.description, amount: item.amount, category_id, date: item.date });
  const learned = { ...(dataOf(store).learned || {}) };
  if (category_id) learned[merchantKey(item.description)] = category_id;
  store.setModuleData(MODULE_ID, { pending: pendingOf(store).filter((p) => p.id !== item.id), learned });
  chosenArea.delete(item.id);
  return true;
}

/** "3 pagamentos e 1 recebimento" */
function queueSummary(store) {
  const pending = pendingOf(store);
  const pays = pending.filter((p) => p.type === "expense").length;
  const gets = pending.length - pays;
  const parts = [];
  if (pays) parts.push(pays === 1 ? "1 pagamento" : `${pays} pagamentos`);
  if (gets) parts.push(gets === 1 ? "1 recebimento" : `${gets} recebimentos`);
  return parts.join(" e ");
}

function removePending(store, id) {
  chosenArea.delete(id);
  store.setModuleData(MODULE_ID, { pending: pendingOf(store).filter((p) => p.id !== id) });
}

// ---------- Ajustes ----------

function settingsHtml(ctx) {
  const capture = ctx.services.platform?.paymentCapture;
  const data = dataOf(ctx.store);
  if (!capture?.available)
    return `<div class="card">
      <div class="setrow">
        <span class="ci">${icon("card")}</span>
        <span class="setrow-m"><b>Lançar pagamentos das notificações</b><span>Quando você paga com Google Pay, Samsung Pay ou cartão, o app prepara o lançamento sozinho.</span></span>
        <button class="switch" role="switch" aria-checked="false" disabled aria-label="Lançar pagamentos das notificações"></button>
      </div>
      <div class="note">${icon("help")}<p>Disponível no app Android instalado. O navegador não consegue ler notificações do celular.</p></div>
    </div>`;

  const on = !!data.enabled;
  const pendingCount = pendingOf(ctx.store).length;
  return `<div class="card">
    <div class="setrow">
      <span class="ci">${icon("card")}</span>
      <span class="setrow-m"><b>Lançar pagamentos das notificações</b><span>Quando você paga com Google Pay, Samsung Pay ou cartão, o app prepara o lançamento para você revisar</span></span>
      <button class="switch ${on ? "on" : ""}" role="switch" aria-checked="${on}" data-action="capture:toggle" aria-label="Lançar pagamentos das notificações"></button>
    </div>
    ${
      on
        ? `<div class="capture-status ${granted ? "ok" : "warn"}">${icon(granted ? "check" : "alert")}<span>${granted ? "Autorizado no Android. Funcionando." : "Falta autorizar no Android."}</span></div>
      ${granted ? "" : howToSteps()}
      <button class="btn ${granted ? "soft" : ""}" data-action="capture:open-settings">${icon("gear")} ${granted ? "Gerenciar permissão no Android" : "Abrir configurações do Android"}</button>
      ${granted ? "" : `<button class="btn soft" data-action="capture:open-app-info">${icon("help")} Abrir informações do app</button>`}
      ${pendingCount ? `<button class="btn soft" data-action="capture:open-list">${icon("list")} Revisar a fila (${pendingCount})</button>` : ""}`
        : ""
    }
    ${privacyNote()}
  </div>`;
}

function explainSheet(ctx) {
  ctx.ui.openSheet(
    "Captura automática",
    `<div class="pop">
      <div class="pop-ic">${icon("card")}</div>
      <h2>Falta só autorizar no Android</h2>
      <p class="muted">Para ver os avisos de pagamento do seu banco e da sua carteira digital, o Android pede a sua autorização uma única vez.</p>
      <div class="card steps-card">${howToSteps()}</div>
      <button class="btn" data-action="capture:open-settings">${icon("gear")} Abrir configurações do Android</button>
      <button class="btn soft" data-action="capture:open-app-info">${icon("help")} Abrir informações do app</button>
      <button class="skip" data-action="sheet:close">Agora não</button>
    </div>`,
  );
}

export default {
  id: MODULE_ID,
  settings: { title: "Captura automática", order: 27, render: settingsHtml },
  summaryCards(ctx) {
    const count = pendingOf(ctx.store).length;
    if (!count || !dataOf(ctx.store).enabled) return [];
    return [
      {
        order: 5,
        html: `<div class="card cta">
        <div class="cta-ic">${icon("card")}</div>
        <div class="cta-m"><b>${count === 1 ? "1 item na fila" : `${count} itens na fila`}</b><p>${queueSummary(ctx.store)}. Revise quando quiser para lançar.</p></div>
        <button class="btn sm" data-action="capture:open-list">Revisar</button>
      </div>`,
      },
    ];
  },
  init(ctx) {
    const { store, ui, services } = ctx;
    const capture = services.platform?.paymentCapture;
    if (capture?.available) {
      // O lado Android precisa saber se está ligado e quais apps ler.
      capture.setEnabled(!!dataOf(store).enabled, PAYMENT_APPS.map((a) => a.pkg)).catch(() => {});
      refreshPermission(ctx);
      events.on("view:rendered", () => pull(ctx));
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) return;
        refreshPermission(ctx);
        pull(ctx, { force: true });
      });
    }
    // Apagar todos os dados também desliga a captura no Android.
    events.on("store:reset", () => capture?.available && capture.setEnabled(false, []).catch(() => {}));

    registerActions({
      "capture:toggle": async () => {
        const turnOn = !dataOf(store).enabled;
        store.setModuleData(MODULE_ID, { enabled: turnOn, ...(turnOn ? {} : { pending: [] }) });
        await capture.setEnabled(turnOn, PAYMENT_APPS.map((a) => a.pkg));
        if (!turnOn) {
          ui.openSheet(
            "Captura desligada",
            `<div class="pop">
              <div class="pop-ic">${icon("check")}</div>
              <h2>Captura desligada</h2>
              <p class="muted">O Astro Wallet parou de ler as notificações e apagou os avisos que ainda não tinham sido revisados.</p>
              <p class="hint center">Se quiser remover também a autorização do Android:</p>
              <button class="btn soft" data-action="capture:open-settings">${icon("gear")} Abrir configurações do Android</button>
              <button class="btn" data-action="sheet:close">Ok</button>
            </div>`,
          );
          return;
        }
        await refreshPermission(ctx);
        if (granted) ui.toast("Captura ligada");
        else explainSheet(ctx);
      },
      "capture:open-settings": async () => {
        awaitingPermission = !!dataOf(store).enabled && !granted;
        await capture.openSettings();
      },
      "capture:open-app-info": async () => {
        awaitingPermission = !!dataOf(store).enabled && !granted;
        await capture.openAppInfo?.();
      },
      "capture:apps": () =>
        ui.openSheet(
          "Apps que o Astro Wallet lê",
          `<div class="form"><p class="muted">Somente avisos destes apps de banco e carteira digital. Qualquer outro app é ignorado pelo próprio Android antes de chegar aqui.</p>
          <div class="card list">${PAYMENT_APPS.map((a) => `<div class="setrow"><span class="ci sm">${icon(a.wallet ? "card" : "piggy")}</span><span class="setrow-m"><b>${escapeHtml(a.name)}</b></span></div>`).join("")}</div></div>`,
        ),
      "capture:open-list": () => showReview(ctx),
      "capture:dismiss": (button) => {
        removePending(store, button.dataset.id);
        showReview(ctx, { keepScroll: true });
      },
      "capture:area": (button) => {
        chosenArea.set(button.dataset.id, button.dataset.cat);
        showReview(ctx, { keepScroll: true });
      },
      "capture:quick": (button) => {
        const item = pendingOf(store).find((p) => p.id === button.dataset.id);
        if (!item || !quickSave(ctx, item)) return;
        ui.toast(item.type === "income" ? "Recebimento lançado" : "Pagamento lançado");
        showReview(ctx, { keepScroll: true });
      },
      "capture:all": () => {
        let count = 0;
        for (const item of [...pendingOf(store)]) if (quickSave(ctx, item)) count += 1;
        showReview(ctx);
        ui.toast(count === 1 ? "1 item lançado" : `${count} itens lançados`);
      },
      "capture:review": (button) => {
        const item = pendingOf(store).find((p) => p.id === button.dataset.id);
        if (!item) return;
        ui.closeSheet();
        const isIncome = item.type === "income";
        ui.openEntryForm(isIncome ? "income" : "expense", null, {
          title: "Confirmar pagamento",
          amount: item.amount,
          description: item.description,
          date: item.date,
          category_id: isIncome ? null : suggestCategory(item.description, store.state.categories, dataOf(store).learned),
          // Chamado pelo formulário depois de salvar: tira da fila e aprende a área da loja.
          onSaved(entry) {
            const learned = { ...(dataOf(store).learned || {}) };
            if (entry?.category_id) learned[merchantKey(item.description)] = entry.category_id;
            store.setModuleData(MODULE_ID, {
              pending: pendingOf(store).filter((p) => p.id !== item.id),
              learned,
            });
          },
        });
      },
    });
  },
};
