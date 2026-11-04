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
import { dayMonth } from "../../core/format.js";
import { circleIcon, money } from "../../ui/components.js";
import { icon } from "../../ui/icons.js";
import { isSheetOpen } from "../../ui/sheet.js";
import { mergeDuplicates, merchantKey, parsePaymentNotification, suggestCategory } from "./parser.js";
import { PAYMENT_APPS } from "./sources.js";

const MODULE_ID = "payment-capture";
const PULL_INTERVAL_MS = 20000;
const MAX_PENDING = 100;

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

/** Busca os avisos guardados pelo Android, reconhece os pagamentos e guarda para revisão. */
async function pull(ctx, { force = false } = {}) {
  const { store } = ctx;
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
    if (fresh > 0 && !isSheetOpen()) showPendingSheet(ctx);
  } catch (err) {
    console.warn("Captura de pagamentos falhou", err);
  } finally {
    pulling = false;
  }
}

// ---------- Revisão ----------

function pendingRow(p) {
  const isIncome = p.type === "income";
  return `<div class="pop-row">${circleIcon(isIncome ? "inc" : "card", isIncome ? "in sm" : "sm")}
    <div class="grow"><b>${escapeHtml(p.description)}</b><p>${escapeHtml(p.source)} · ${dayMonth(p.date)}</p></div>
    <b class="num ${isIncome ? "in" : "out"}">${isIncome ? "+" : "−"} ${money(p.amount)}</b>
  </div>
  <div class="row2 pop-actions">
    <button class="btn soft sm" data-action="capture:dismiss" data-id="${escapeHtml(p.id)}">Ignorar</button>
    <button class="btn sm" data-action="capture:review" data-id="${escapeHtml(p.id)}">${icon("check")} Lançar</button>
  </div>`;
}

function showPendingSheet(ctx) {
  const pending = [...pendingOf(ctx.store)].reverse(); // mais recentes primeiro
  if (!pending.length) return ctx.ui.closeSheet();
  const shown = pending.slice(0, 6);
  ctx.ui.openSheet(
    "Pagamentos detectados",
    `<div class="pop alert-pop">
      <div class="pop-ic">${icon("card")}</div>
      <h2>${pending.length === 1 ? "1 pagamento para revisar" : `${pending.length} pagamentos para revisar`}</h2>
      <p class="muted">Encontrados nas notificações do seu banco ou carteira. Confira e lance com um toque.</p>
      <div class="card pop-list">${shown.map(pendingRow).join("")}</div>
      ${pending.length > shown.length ? `<p class="hint center">E mais ${pending.length - shown.length}. Revise estes primeiro.</p>` : ""}
      <button class="btn soft" data-action="sheet:close">Revisar depois</button>
    </div>`,
  );
}

function removePending(store, id) {
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
      ${pendingCount ? `<button class="btn soft" data-action="capture:open-list">${icon("list")} Revisar ${pendingCount} pagamento(s) detectado(s)</button>` : ""}`
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
        <div class="cta-m"><b>${count === 1 ? "1 pagamento detectado" : `${count} pagamentos detectados`}</b><p>Vindos das notificações do banco ou da carteira. Revise para lançar.</p></div>
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
      "capture:open-list": () => showPendingSheet(ctx),
      "capture:dismiss": (button) => {
        removePending(store, button.dataset.id);
        showPendingSheet(ctx);
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
