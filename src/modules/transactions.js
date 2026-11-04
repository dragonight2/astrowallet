// Módulo: Lançamentos.
// Lista do mês com filtros, formulário de lançamento (despesa, ganho extra,
// compra parcelada, receita fixa, conta fixa) e o bloco "Receitas e contas
// fixas" em Ajustes.

import { registerActions } from "../core/actions.js";
import { $, escapeHtml, setText } from "../core/dom.js";
import {
  clampDay,
  currentMonth,
  formatMoney,
  monthLabel,
  moneyInputValue,
  parseMoney,
  shortMonth,
  today,
} from "../core/format.js";
import {
  MAX_INSTALLMENTS,
  installmentInMonth,
  lastInstallmentMonth,
  monthItems,
  remainingInstallments,
  splitInstallments,
} from "../data/finance.js";
import { chip, circleIcon, emptyState, money, quickAddButtons, sectionTitle, transactionRow } from "../ui/components.js";
import { icon } from "../ui/icons.js";

// Tipos de lançamento no formulário.
const KINDS = [
  { id: "expense", label: "Despesa", icon: "tag" },
  { id: "income", label: "Ganho extra", icon: "plus" },
  { id: "rec-income", label: "Receita fixa", icon: "repeat" },
  { id: "rec-expense", label: "Conta fixa", icon: "cal" },
];
const PLACEHOLDERS = {
  expense: "Ex.: Mercado, Uber, farmácia",
  income: "Ex.: Freela, venda, 13º",
  "rec-income": "Ex.: Salário",
  "rec-expense": "Ex.: Aluguel, internet, academia",
};
const DEFAULT_DESCRIPTION = {
  expense: "Despesa",
  income: "Ganho extra",
  "rec-income": "Salário",
  "rec-expense": "Conta fixa",
};
const INSTALLMENT_CHOICES = [2, 3, 4, 5, 6, 10, 12, 18, 24, 36, 48];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const isRecurringKind = (kind) => kind.startsWith("rec");
const isExpenseKind = (kind) => kind === "expense" || kind === "rec-expense";
const kindOfItem = (item) => (item.recurring ? (item.type === "income" ? "rec-income" : "rec-expense") : item.type);

// Filtros da lista (ficam enquanto o app estiver aberto).
const listFilter = { filter: "all", cat: null };

// Estado do formulário aberto.
//   kind       tipo escolhido   item  item do mês sendo editado (ou null)
//   src        registro original (entrada, fixo ou compra parcelada)
//   cat        área escolhida   mode  "once" (à vista) | "parcel" (parcelado)
//   valueMode  "total" | "each" (valor da parcela)   count  número de parcelas
let form = null;

/** Lê os campos de parcelamento do formulário. */
function readInstallmentFields() {
  const amount = parseMoney($("#f-amount")?.value);
  const count = parseInt($("#f-count")?.value, 10);
  const date = $("#f-date")?.value || "";
  const okCount = count >= 2 && count <= MAX_INSTALLMENTS;
  const total = !(amount > 0) || !okCount ? 0 : form.valueMode === "each" ? amount * count : amount;
  return { amount, count, okCount, total, date, start: date.slice(0, 7) };
}

/** Prévia "3x de R$ 33,33 · Total …" que atualiza enquanto a pessoa digita. */
function installmentPreview() {
  const f = readInstallmentFields();
  if (!f.okCount) return `<b>Escolha de 2 a ${MAX_INSTALLMENTS} parcelas</b>`;
  if (!f.total) return `<b>${f.count}x</b><span>Digite o valor para ver as parcelas</span>`;
  const parts = splitInstallments(f.total, f.count);
  const rounding = parts[0] !== parts[1] ? `<span>1ª parcela ${formatMoney(parts[0])} (arredondamento)</span>` : "";
  const period = /^\d{4}-\d{2}$/.test(f.start)
    ? ` · ${shortMonth(f.start)} a ${shortMonth(lastInstallmentMonth({ start_month: f.start, count: f.count }))}`
    : "";
  return `<b class="num">${f.count}x de ${formatMoney(parts[parts.length - 1])}</b><span class="num">Total ${formatMoney(f.total)}${period}</span>${rounding}`;
}

function installmentCountFields() {
  return `
    <div class="lab">Quantas parcelas?</div>
    <div class="chips parc">${INSTALLMENT_CHOICES.map((n) => `<button class="chip ${form.count === n ? "on" : ""}" data-action="entry:count" data-n="${n}">${n}x</button>`).join("")}</div>
    <div class="countrow">
      <label for="f-count">Ou digite a quantidade</label>
      <span class="countbox"><input id="f-count" class="num" inputmode="numeric" maxlength="2" value="${form.count || ""}" placeholder="—" data-input="entry:count-typed"><i>x</i></span>
    </div>
    <div class="parc-preview" id="f-preview" aria-live="polite">${installmentPreview()}</div>`;
}

function formHtml(ctx) {
  const { store, app } = ctx;
  const { kind, src, item } = form;
  const editing = !!item;
  const parcel = kind === "expense" && form.mode === "parcel";
  const defaultDate = app.month === currentMonth() ? today() : `${app.month}-01`;

  return `
    ${editing ? "" : `<div class="seg">${KINDS.map((k) => `<button class="${k.id === kind ? "on" : ""}" data-action="entry:kind" data-kind="${k.id}">${icon(k.icon)}<span>${k.label}</span></button>`).join("")}</div>`}
    <div data-submit="entry:save" class="form">
      ${
        kind === "expense" && (!editing || parcel)
          ? `<div class="seg flat mode" role="tablist">
        <button class="${parcel ? "" : "on"}" ${editing ? "disabled" : ""} data-action="entry:mode" data-mode="once"><span>À vista</span></button>
        <button class="${parcel ? "on" : ""}" data-action="entry:mode" data-mode="parcel"><span>Parcelado</span></button>
      </div>`
          : ""
      }
      ${
        parcel
          ? `<div class="seg flat valmode" role="tablist">
        <button class="${form.valueMode === "total" ? "on" : ""}" data-action="entry:valuemode" data-v="total"><span>Valor total</span></button>
        <button class="${form.valueMode === "each" ? "on" : ""}" data-action="entry:valuemode" data-v="each"><span>Valor da parcela</span></button>
      </div>`
          : '<label class="lab" for="f-amount">Valor</label>'
      }
      <div class="amount ${isExpenseKind(kind) ? "out" : "in"}"><span>R$</span><input id="f-amount" class="num" inputmode="numeric" data-money placeholder="0,00" value="${src ? moneyInputValue(parcel ? src.total_amount : src.amount) : ""}" ${parcel ? 'data-input="entry:preview"' : ""} ${editing ? "" : "autofocus"}></div>
      ${parcel ? installmentCountFields() : ""}
      <label class="lab" for="f-desc">Descrição</label>
      <input id="f-desc" class="field" placeholder="${parcel ? "Ex.: Geladeira, celular, curso" : PLACEHOLDERS[kind]}" value="${src ? escapeHtml(src.description) : ""}">
      ${isExpenseKind(kind) ? `<div class="lab">Área</div><div class="chips">${store.state.categories.map((c) => chip({ label: c.name, icon: c.icon, active: form.cat === c.id, action: "entry:pick", data: { cat: c.id } })).join("")}</div>` : ""}
      ${
        isRecurringKind(kind)
          ? `<label class="lab" for="f-day">Dia do mês</label><input id="f-day" class="field num" inputmode="numeric" maxlength="2" value="${src ? src.day : 5}">
           <p class="hint">${editing ? `As mudanças valem a partir de ${monthLabel(app.month).toLowerCase()}. Meses anteriores ficam como estavam.` : `Entra automaticamente todo mês, a partir de ${monthLabel(app.month).toLowerCase()}.`}</p>`
          : parcel
            ? `<label class="lab" for="f-date">Data da 1ª parcela</label><input id="f-date" class="field" type="date" value="${src ? `${src.start_month}-${String(src.day).padStart(2, "0")}` : defaultDate}" data-input="entry:preview">
             <p class="hint">${editing ? "Alterar valor, parcelas ou data recalcula todas as parcelas desta compra." : "Cada parcela entra como despesa no mês dela, na área escolhida."}</p>`
            : `<label class="lab" for="f-date">Data</label><input id="f-date" class="field" type="date" value="${src ? src.date : defaultDate}">`
      }
      <p class="err" id="f-err" role="alert"></p>
      <button class="btn" data-action="entry:save">${icon("check")} Salvar</button>
      ${editing ? `<button class="btn danger" data-action="entry:delete">${icon("trash")} ${isRecurringKind(kind) ? "Encerrar a partir deste mês" : parcel ? "Excluir compra parcelada" : "Excluir"}</button>` : ""}
    </div>`;
}

/**
 * Abre o formulário.
 * @param kind  "expense" | "income" | "installment" | "rec-income" | "rec-expense"
 * @param item  item do mês para editar (ou null para novo)
 * @param prefill  valores sugeridos para um lançamento novo
 *                 { amount, description, date, category_id, title } (ex.: pagamento detectado)
 */
function openEntryForm(ctx, kind, item = null, prefill = null) {
  const { store } = ctx;
  const isInstallment = kind === "installment" || !!item?.installment;
  const src = item
    ? item.installment
      ? (store.state.installments || []).find((p) => p.id === item.id)
      : item.recurring
        ? store.state.recurring.find((r) => r.id === item.id)
        : store.state.entries.find((e) => e.id === item.id)
    : prefill;
  form = {
    kind: isInstallment ? "expense" : kind,
    item,
    src,
    cat: src ? src.category_id : null,
    mode: isInstallment ? "parcel" : "once",
    valueMode: "total",
    count: src?.count || (isInstallment ? 2 : null),
  };
  const title = item
    ? isInstallment
      ? "Editar compra parcelada"
      : "Editar lançamento"
    : prefill?.title || "Novo lançamento";
  ctx.ui.openSheet(title, formHtml(ctx));
}

/** Redesenha o formulário sem perder o que já foi digitado. */
function rerenderForm(ctx) {
  const typed = { amount: $("#f-amount")?.value, desc: $("#f-desc")?.value, date: $("#f-date")?.value };
  document.querySelector(".sheet-bd").innerHTML = formHtml(ctx);
  if (typed.amount !== undefined) $("#f-amount").value = typed.amount;
  if (typed.desc !== undefined) $("#f-desc").value = typed.desc;
  if (typed.date && $("#f-date")) $("#f-date").value = typed.date;
  if ($("#f-preview")) $("#f-preview").innerHTML = installmentPreview();
}

function installmentsSection(ctx) {
  const { store, app } = ctx;
  const active = (store.state.installments || [])
    .map((p) => ({ purchase: p, part: installmentInMonth(p, app.month) }))
    .filter((x) => x.part);
  return active.length
    ? `${sectionTitle("Compras parceladas")}
    <div class="card list">${active
      .map(({ purchase: p, part }) => {
        const remaining = remainingInstallments(p, app.month);
        const category = store.category(p.category_id);
        return `<button class="setrow" data-action="parcel:open" data-id="${p.id}">
        ${circleIcon(category ? category.icon : "tag")}
        <span class="setrow-m"><b>${escapeHtml(p.description)} <em class="badge num">${part.n}/${p.count}</em></b>
        <span class="num">Termina em ${shortMonth(lastInstallmentMonth(p))} · falta ${money(remaining.amount)}</span></span>
        <b class="num out">${money(part.amount)}</b></button>`;
      })
      .join("")}</div>`
    : "";
}

function render(ctx) {
  const { store, app } = ctx;
  const filters = [
    ["all", "Todos"],
    ["expense", "Despesas"],
    ["income", "Receitas"],
    ["fixed", "Fixos"],
    ["parcel", "Parcelas"],
  ];
  const items = monthItems(store.state, app.month).filter(
    (item) =>
      !(listFilter.filter === "expense" && item.type !== "expense") &&
      !(listFilter.filter === "income" && item.type !== "income") &&
      !(listFilter.filter === "fixed" && !item.recurring) &&
      !(listFilter.filter === "parcel" && !item.installment) &&
      !(listFilter.cat && item.category_id !== listFilter.cat),
  );
  return `
    ${quickAddButtons({ full: true })}
    ${sectionTitle("No mês")}
    <div class="seg flat" role="tablist">${filters.map(([id, label]) => `<button class="${listFilter.filter === id ? "on" : ""}" role="tab" aria-selected="${listFilter.filter === id}" data-action="tx:filter" data-filter="${id}"><span>${label}</span></button>`).join("")}</div>
    ${listFilter.filter !== "income" ? `<div class="chips scroll">${chip({ label: "Todas as áreas", active: !listFilter.cat, action: "tx:cat", data: { cat: "" } })}${store.state.categories.map((c) => chip({ label: c.name, icon: c.icon, active: listFilter.cat === c.id, action: "tx:cat", data: { cat: c.id } })).join("")}</div>` : ""}
    ${items.length ? `<div class="card list tight">${items.map((item) => transactionRow(item, store.category(item.category_id))).join("")}</div><p class="hint center">Toque em um lançamento para editar ou excluir.</p>` : `<div class="card">${emptyState("receipt", "Nenhum lançamento", "Use os botões acima ou “Adicionar lançamento” para registrar o primeiro.")}</div>`}
    ${installmentsSection(ctx)}`;
}

function recurringSettings(ctx) {
  const { store, app } = ctx;
  const active = store.state.recurring.filter((r) => !r.end_month || r.end_month >= app.month);
  return `<div class="card">
    ${
      active.length
        ? `<div class="list">${active
            .map((r) => {
              const category = store.category(r.category_id);
              const isIncome = r.type === "income";
              return `<button class="setrow" data-action="rec:open" data-id="${r.id}">
        ${circleIcon(isIncome ? "inc" : category ? category.icon : "cal", isIncome ? "in" : "")}
        <span class="setrow-m"><b>${escapeHtml(r.description)}</b><span>${isIncome ? "Receita" : escapeHtml(category ? category.name : "Conta fixa")} · todo dia ${r.day}${r.start_month > app.month ? ` · começa em ${monthLabel(r.start_month).toLowerCase()}` : ""}</span></span>
        <b class="num ${isIncome ? "in" : "out"}">${money(r.amount)}</b></button>`;
            })
            .join("")}</div>`
        : '<p class="muted">Nenhuma cadastrada. Adicione seu salário e as contas que se repetem todo mês.</p>'
    }
    <div class="row2 mt">
      <button class="btn soft" data-action="rec:new" data-kind="rec-income">${icon("plus")} Receita fixa</button>
      <button class="btn soft" data-action="rec:new" data-kind="rec-expense">${icon("plus")} Conta fixa</button>
    </div>
  </div>`;
}

const highlightOnly = (selector, isOn) =>
  document.querySelectorAll(selector).forEach((el) => el.classList.toggle("on", isOn(el)));

export default {
  id: "transactions",
  tab: {
    label: "Lançamentos",
    title: "Lançamentos do mês",
    icon: "list",
    order: 10,
    render,
    primaryAction: { label: "Adicionar lançamento", icon: "plus", action: "entry:new" },
  },
  settings: { title: "Receitas e contas fixas", order: 10, render: recurringSettings },
  init(ctx) {
    const { store, app, ui } = ctx;
    // Outros módulos podem abrir o formulário por aqui.
    ctx.ui.openEntryForm = (kind, item, prefill) => openEntryForm(ctx, kind, item, prefill);

    registerActions({
      "entry:new": (el) => openEntryForm(ctx, el?.dataset?.kind || "expense"),
      "rec:new": (el) => openEntryForm(ctx, el.dataset.kind),
      "entry:open": (el) => {
        const item = monthItems(store.state, app.month).find((i) => i.key === el.dataset.key);
        if (item) openEntryForm(ctx, kindOfItem(item), item);
      },
      "rec:open": (el) => {
        const r = store.state.recurring.find((x) => x.id === el.dataset.id);
        if (r) openEntryForm(ctx, r.type === "income" ? "rec-income" : "rec-expense", { ...r, recurring: true });
      },
      "entry:kind": (el) => {
        form.kind = el.dataset.kind;
        if (form.kind !== "expense") form.mode = "once";
        rerenderForm(ctx);
      },
      "entry:mode": (el) => {
        form.mode = el.dataset.mode;
        if (form.mode === "parcel" && !form.count) form.count = 2;
        rerenderForm(ctx);
      },
      "entry:valuemode": (el) => {
        form.valueMode = el.dataset.v;
        highlightOnly('[data-action="entry:valuemode"]', (b) => b === el);
        $("#f-preview").innerHTML = installmentPreview();
      },
      "entry:count": (el) => {
        form.count = Number(el.dataset.n);
        $("#f-count").value = form.count;
        highlightOnly('[data-action="entry:count"]', (b) => b === el);
        $("#f-preview").innerHTML = installmentPreview();
      },
      "entry:count-typed": (input) => {
        input.value = input.value.replace(/\D/g, "").slice(0, 2);
        form.count = parseInt(input.value, 10) || null;
        highlightOnly('[data-action="entry:count"]', (b) => Number(b.dataset.n) === form.count);
        $("#f-preview").innerHTML = installmentPreview();
      },
      "entry:preview": () => {
        const preview = $("#f-preview");
        if (preview) preview.innerHTML = installmentPreview();
      },
      "parcel:open": (el) => {
        const p = (store.state.installments || []).find((x) => x.id === el.dataset.id);
        if (p) openEntryForm(ctx, "installment", { id: p.id, installment: true });
      },
      "entry:pick": (el) => {
        form.cat = el.dataset.cat;
        highlightOnly('[data-action="entry:pick"]', (b) => b === el);
      },

      "entry:save": () => {
        const { kind, item } = form;
        // Lançamento vindo de uma sugestão (ex.: pagamento detectado): avisa quem sugeriu.
        const onSaved = item ? null : form.src?.onSaved;
        const amount = parseMoney($("#f-amount").value);
        if (!(amount > 0)) return setText("f-err", "Digite um valor maior que zero.");
        if (isExpenseKind(kind) && !form.cat) return setText("f-err", "Escolha a área dessa despesa.");
        const description =
          $("#f-desc").value.trim() ||
          (form.mode === "parcel" && kind === "expense" ? "Compra parcelada" : DEFAULT_DESCRIPTION[kind]);
        const type = isExpenseKind(kind) ? "expense" : "income";
        const category_id = isExpenseKind(kind) ? form.cat : null;

        if (kind === "expense" && form.mode === "parcel") {
          const f = readInstallmentFields();
          if (!f.okCount) return setText("f-err", `Escolha de 2 a ${MAX_INSTALLMENTS} parcelas.`);
          if (!DATE_RE.test(f.date)) return setText("f-err", "Escolha a data da 1ª parcela.");
          const fields = {
            description,
            total_amount: f.total,
            count: f.count,
            category_id,
            start_month: f.start,
            day: Number(f.date.slice(8, 10)),
          };
          ui.closeSheet();
          if (!item && f.start !== app.month) app.setMonth(f.start);
          if (item) store.updateInstallment(item.id, fields);
          else onSaved?.(store.addInstallment(fields));
          return ui.toast(`Compra em ${f.count}x salva`);
        }

        if (isRecurringKind(kind)) {
          const day = clampDay($("#f-day").value);
          ui.closeSheet();
          if (item) store.editRecurring(item.id, { description, amount, day, category_id }, app.month);
          else onSaved?.(store.addRecurring({ type, description, amount, day, category_id, start_month: app.month }));
        } else {
          const date = $("#f-date").value;
          if (!DATE_RE.test(date)) return setText("f-err", "Escolha uma data válida.");
          ui.closeSheet();
          if (date.slice(0, 7) !== app.month) app.setMonth(date.slice(0, 7));
          if (item) store.updateEntry(item.id, { type, description, amount, category_id, date });
          else onSaved?.(store.addEntry({ type, description, amount, category_id, date }));
        }
        ui.toast("Salvo");
      },

      "entry:delete": () => {
        const { kind, item } = form;
        if (form.mode === "parcel") {
          const purchase = form.src;
          return ui.confirmSheet({
            title: "Excluir compra parcelada?",
            text: `As ${purchase.count} parcelas de “${escapeHtml(purchase.description)}” serão removidas de todos os meses.`,
            confirmLabel: "Excluir compra",
            onConfirm: () => {
              store.deleteInstallment(item.id);
              ui.toast("Compra excluída");
            },
          });
        }
        if (isRecurringKind(kind))
          ui.confirmSheet({
            title: "Encerrar lançamento fixo",
            text: `Ele deixa de contar a partir de ${monthLabel(app.month).toLowerCase()}. Os meses anteriores continuam no histórico.`,
            confirmLabel: "Encerrar",
            onConfirm: () => {
              store.endRecurring(item.id, app.month);
              ui.toast("Encerrado");
            },
          });
        else
          ui.confirmSheet({
            title: "Excluir lançamento",
            text: "Essa ação não pode ser desfeita.",
            confirmLabel: "Excluir",
            onConfirm: () => {
              store.deleteEntry(item.id);
              ui.toast("Excluído");
            },
          });
      },

      "tx:filter": (el) => {
        listFilter.filter = el.dataset.filter;
        if (listFilter.filter === "income") listFilter.cat = null;
        app.render();
      },
      "tx:cat": (el) => {
        listFilter.cat = el.dataset.cat || null;
        app.render();
      },
    });
  },
};
