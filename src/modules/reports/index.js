// Módulo: Relatórios.
// Resumo do mês na tela e o botão "Gerar relatório e compartilhar", que cria
// um PDF e abre o compartilhamento do celular (WhatsApp, e-mail, Drive…).

import { registerActions } from "../../core/actions.js";
import { $, escapeHtml } from "../../core/dom.js";
import { dayMonth } from "../../core/format.js";
import { makeFile } from "../../platform/index.js";
import { circleIcon, emptyState, money, sectionTitle } from "../../ui/components.js";
import { icon } from "../../ui/icons.js";
import { buildReport } from "./report-data.js";
import { buildReportPdf } from "./report-pdf.js";
import { reportFileName, reportText, reportTitle } from "./report-text.js";

/** Seta de variação. Para despesas, cair é bom (lowerIsBetter). */
const delta = (value, lowerIsBetter) =>
  value == null
    ? '<span class="delta flat">sem base</span>'
    : value === 0
      ? '<span class="delta flat">igual</span>'
      : `<span class="delta ${(lowerIsBetter ? value < 0 : value > 0) ? "good" : "bad"}">${icon(value > 0 ? "up" : "down")}${Math.abs(value)}%</span>`;

function hero(ctx) {
  return `<p class="lead-t">${buildReport(ctx.store.state, ctx.app.month).closed ? "Mês fechado." : "Mês em andamento — os números ainda são parciais."}</p>`;
}

function render(ctx) {
  const r = buildReport(ctx.store.state, ctx.app.month);
  if (r.empty)
    return `<div class="card">${emptyState("chart", "Sem lançamentos neste mês", "Quando houver receitas ou despesas, o relatório aparece aqui.")}</div>`;
  const biggest = Math.max(1, ...r.categories.map((c) => c.spent), r.uncategorized);
  return `
    <div class="kpis">
      <div class="kpi"><span>Receitas</span><b class="num in">${money(r.income)}</b>${r.prev.hasData ? delta(r.changes.income, false) : ""}</div>
      <div class="kpi"><span>Despesas</span><b class="num out">${money(r.expense)}</b>${r.prev.hasData ? delta(r.changes.expense, true) : ""}</div>
      <div class="kpi wide"><span>Saldo</span><b class="num ${r.balance < 0 ? "out" : ""}">${money(r.balance)}</b>
        ${r.savedPct != null ? `<small>${r.balance >= 0 ? `${r.savedPct}% da renda guardada` : `${Math.abs(r.savedPct)}% acima do que entrou`}</small>` : ""}</div>
    </div>
    ${r.prev.hasData ? `<p class="hint">Setas comparam com ${r.prev.label.toLowerCase()}.</p>` : ""}

    ${sectionTitle("Para onde foi o dinheiro")}
    <div class="card list">
      ${
        r.categories
          .map(
            (c) => `
        <div class="rbar">
          <div class="rbar-h">${circleIcon(c.icon, "sm")}<span class="n">${escapeHtml(c.name)}</span><span class="v num">${money(c.spent)}</span></div>
          <div class="rbar-track"><i class="${c.level === "over" ? "over" : ""}" style="width:${(c.spent / biggest) * 100}%"></i></div>
          <div class="sub num">${c.share}% das despesas${c.limit ? ` · limite ${money(c.limit)}${c.level === "over" ? ' · <b class="bad">acima</b>' : ""}` : ""}</div>
        </div>`,
          )
          .join("") || '<p class="muted">Nenhuma despesa neste mês.</p>'
      }
      ${r.uncategorized ? `<div class="rbar"><div class="rbar-h">${circleIcon("help", "sm")}<span class="n">Sem área</span><span class="v num">${money(r.uncategorized)}</span></div><div class="rbar-track"><i style="width:${(r.uncategorized / biggest) * 100}%"></i></div></div>` : ""}
    </div>

    ${
      r.limits.total
        ? `<div class="pillrow">
      <span class="pill ok">${r.limits.total - r.limits.over - r.limits.warn} dentro do limite</span>
      ${r.limits.warn ? `<span class="pill warn">${r.limits.warn} perto do limite</span>` : ""}
      ${r.limits.over ? `<span class="pill over">${r.limits.over} acima do limite</span>` : ""}
    </div>`
        : ""
    }

    ${
      r.top.length
        ? `${sectionTitle("Maiores gastos")}
    <div class="card list">${r.top
      .map(
        (t, i) => `
      <div class="toprow"><span class="rank">${i + 1}</span><span class="toprow-m"><b>${escapeHtml(t.description)}</b><span>${escapeHtml(t.category)} · ${dayMonth(t.date)}${t.recurring ? " · fixa" : ""}</span></span><b class="num out">${money(t.amount)}</b></div>`,
      )
      .join("")}
    </div>`
        : ""
    }

    <p class="hint center">O relatório sai em PDF, com a logo da Astro Wallet, pronto para enviar ou imprimir.</p>`;
}

let downloadUrl = null;

/** Quando o navegador não abre o compartilhamento: baixar o PDF ou copiar o texto. */
function showFallback(ctx, report, pdfBlob) {
  if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  downloadUrl = URL.createObjectURL(pdfBlob);
  ctx.ui.openSheet(
    "Relatório em PDF",
    `<div class="form">
    <p class="muted">Este navegador não abriu o menu de compartilhamento. Baixe o PDF ou copie o texto do relatório.</p>
    <a class="btn" href="${downloadUrl}" download="${reportFileName(report)}" target="_blank" rel="noopener">${icon("download")} Baixar PDF</a>
    <textarea id="r-body" class="field mono" readonly>${escapeHtml(`${reportTitle(report)}\n\n${reportText(report)}`)}</textarea>
    <button class="btn soft" data-action="report:copy">${icon("copy")} Copiar texto</button>
    <p class="hint">No app instalado, este botão abre direto as opções do celular.</p>
  </div>`,
  );
}

export default {
  id: "reports",
  tab: {
    label: "Relatórios",
    icon: "chart",
    order: 40,
    hero,
    render,
    primaryAction: { label: "Gerar relatório e compartilhar", icon: "share", action: "report:share" },
  },
  init(ctx) {
    const { store, app, ui, services } = ctx;
    registerActions({
      // data-month opcional: compartilhar o relatório de outro mês (ex.: aviso de fim de mês).
      "report:share": async (button) => {
        const report = buildReport(store.state, button?.dataset?.month || app.month);
        if (report.empty) return ui.toast("Ainda não há lançamentos neste mês");
        button.disabled = true;
        ui.toast("Gerando PDF…");
        let pdf;
        try {
          pdf = buildReportPdf(report).output("blob");
        } catch (err) {
          button.disabled = false;
          console.error(err);
          return ui.toast("Não foi possível gerar o PDF. Tente de novo.");
        }
        const result = await services.share.share({
          title: reportTitle(report),
          text: `${reportTitle(report)} (PDF)`,
          file: makeFile(pdf, reportFileName(report), "application/pdf"),
        });
        button.disabled = false;
        if (result === "shared") ui.toast("Relatório compartilhado");
        else if (result === "unsupported") showFallback(ctx, report, pdf);
      },
      "report:copy": async () => {
        const textarea = $("#r-body");
        try {
          await navigator.clipboard.writeText(textarea.value);
          ui.toast("Relatório copiado");
        } catch {
          textarea.focus();
          textarea.select();
          ui.toast("Texto selecionado: copie com Ctrl+C");
        }
      },
    });
  },
};
