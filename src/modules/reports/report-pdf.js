// Relatório mensal em PDF (A4), com a marca da Astro Wallet. Usa a biblioteca jsPDF.
// Medidas em milímetros.

import { jsPDF } from "jspdf";
import { dayMonth, formatMoney } from "../../core/format.js";

const COLORS = {
  ink: [10, 10, 11],
  muted: [94, 94, 102],
  faint: [142, 142, 147],
  card: [245, 245, 247],
  line: [227, 227, 232],
  red: [196, 17, 29],
  white: [255, 255, 255],
  flap: [120, 120, 126],
};
const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 18;
const CONTENT_W = PAGE_W - MARGIN * 2;
const BOTTOM_LIMIT = PAGE_H - 19;

const fill = (doc, color) => doc.setFillColor(...color);
const textColor = (doc, color) => doc.setTextColor(...color);

/** Estrela de 4 pontas centrada em (x, y). */
function star(doc, x, y, r) {
  const k = r * 0.32;
  const points = [
    [x, y - r],
    [x + k, y - k],
    [x + r, y],
    [x + k, y + k],
    [x, y + r],
    [x - k, y + k],
    [x - r, y],
    [x - k, y - k],
  ];
  const deltas = points.slice(1).map((p, i) => [p[0] - points[i][0], p[1] - points[i][1]]);
  doc.lines(deltas, points[0][0], points[0][1], [1, 1], "F", true);
}

/** Ícone da carteira estelar desenhado no PDF (mesmo desenho do app, em 64 unidades). */
function brandMark(doc, x, y, size) {
  const u = size / 64;
  fill(doc, COLORS.ink);
  doc.roundedRect(x, y, size, size, 15 * u, 15 * u, "F");
  fill(doc, COLORS.flap);
  doc.roundedRect(x + 14 * u, y + 18 * u, 29 * u, 7 * u, 3 * u, 3 * u, "F");
  fill(doc, COLORS.white);
  doc.roundedRect(x + 11 * u, y + 23 * u, 40 * u, 28 * u, 7 * u, 7 * u, "F");
  fill(doc, COLORS.ink);
  doc.roundedRect(x + 35 * u, y + 30.5 * u, 19 * u, 13 * u, 6.5 * u, 6.5 * u, "F");
  fill(doc, COLORS.white);
  star(doc, x + 44.5 * u, y + 37 * u, 4.6 * u);
  star(doc, x + 50 * u, y + 12.5 * u, 4.5 * u);
  doc.circle(x + 16 * u, y + 11 * u, 1.6 * u, "F");
  doc.circle(x + 31 * u, y + 9 * u, 1.1 * u, "F");
}

function write(doc, text, x, y, { size = 10, bold = false, color = COLORS.ink, align = "left" } = {}) {
  doc.setFont("helvetica", bold ? "bold" : "normal");
  doc.setFontSize(size);
  textColor(doc, color);
  doc.text(String(text), x, y, { align, baseline: "alphabetic" });
}

/** Escreve diminuindo a fonte (até 8) para caber na largura. */
function writeFit(doc, text, x, y, maxWidth, { size, bold, color }) {
  let current = size;
  doc.setFont("helvetica", bold ? "bold" : "normal");
  while (current > 8) {
    doc.setFontSize(current);
    if (doc.getTextWidth(text) <= maxWidth) break;
    current -= 0.5;
  }
  write(doc, text, x, y, { size: current, bold, color });
}

const changeLabel = (value) => (value == null ? "sem base" : value === 0 ? "igual" : `${value > 0 ? "+" : ""}${value}%`);

export function buildReportPdf(report, { generatedAt = new Date() } = {}) {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  doc.setProperties({
    title: `Relatório de ${report.label.toLowerCase()} · Astro Wallet`,
    creator: "Astro Wallet",
    author: report.owner || "Astro Wallet",
  });

  let y = MARGIN;
  const ensureSpace = (height) => {
    if (y + height > BOTTOM_LIMIT) {
      doc.addPage();
      y = MARGIN + 4;
    }
  };
  const section = (title) => {
    ensureSpace(16);
    y += 9;
    write(doc, title.toUpperCase(), MARGIN, y, { size: 8.5, bold: true, color: COLORS.muted });
    y += 4;
  };

  // Cabeçalho
  brandMark(doc, MARGIN, y, 13);
  write(doc, "Astro", MARGIN + 17, y + 8.6, { size: 15, bold: true });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  write(doc, "Wallet", MARGIN + 17 + doc.getTextWidth("Astro") + 1.6, y + 8.6, { size: 15 });
  write(doc, "Relatório mensal", PAGE_W - MARGIN, y + 5.5, { size: 9, color: COLORS.muted, align: "right" });
  write(doc, `Gerado em ${generatedAt.toLocaleDateString("pt-BR")}`, PAGE_W - MARGIN, y + 10, {
    size: 8,
    color: COLORS.faint,
    align: "right",
  });
  y += 19;
  doc.setDrawColor(...COLORS.line);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 13;
  write(doc, `Relatório de ${report.label.toLowerCase()}`, MARGIN, y, { size: 22, bold: true });
  y += 7;
  write(
    doc,
    `${report.owner ? `Carteira de ${report.owner} · ` : ""}${report.closed ? "mês fechado" : "mês em andamento, números parciais"}`,
    MARGIN,
    y,
    { size: 10, color: COLORS.muted },
  );
  y += 8;

  // Três cartões: receitas, despesas, saldo
  const gap = 4;
  const cardW = (CONTENT_W - gap * 2) / 3;
  [
    ["Receitas", formatMoney(report.income), `Fixas ${formatMoney(report.incomeFixed)} · extras ${formatMoney(report.incomeExtra)}`],
    ["Despesas", formatMoney(report.expense), `Fixas ${formatMoney(report.expenseFixed)} · parcelas ${formatMoney(report.expenseInstallments)}`],
    [
      "Saldo",
      formatMoney(report.balance),
      report.savedPct == null
        ? "sem receitas no mês"
        : report.balance >= 0
          ? `${report.savedPct}% da renda guardada`
          : `${Math.abs(report.savedPct)}% acima do que entrou`,
    ],
  ].forEach(([label, value, detail], i) => {
    const x = MARGIN + i * (cardW + gap);
    fill(doc, COLORS.card);
    doc.roundedRect(x, y, cardW, 27, 3, 3, "F");
    write(doc, label, x + 4, y + 7, { size: 8.5, color: COLORS.muted });
    writeFit(doc, value, x + 4, y + 15.5, cardW - 8, {
      size: 14,
      bold: true,
      color: i === 2 && report.balance < 0 ? COLORS.red : COLORS.ink,
    });
    writeFit(doc, detail, x + 4, y + 22, cardW - 8, { size: 7.5, color: COLORS.muted });
  });
  y += 27;

  // Comparação com o mês anterior
  if (report.prev.hasData) {
    section(`Comparado a ${report.prev.label.toLowerCase()}`);
    [
      ["Receitas", report.prev.income, report.income, report.changes.income],
      ["Despesas", report.prev.expense, report.expense, report.changes.expense],
    ].forEach(([label, before, now, change]) => {
      y += 7;
      write(doc, label, MARGIN, y, { size: 10 });
      write(doc, `${formatMoney(before)}  >  ${formatMoney(now)}`, PAGE_W - MARGIN - 30, y, { size: 10, align: "right" });
      write(doc, changeLabel(change), PAGE_W - MARGIN, y, {
        size: 10,
        bold: true,
        align: "right",
        color: label === "Despesas" && change > 0 ? COLORS.red : COLORS.ink,
      });
      y += 3;
      doc.setDrawColor(...COLORS.line);
      doc.line(MARGIN, y, PAGE_W - MARGIN, y);
    });
  }

  // Gastos por área
  const rows = [...report.categories];
  if (report.uncategorized)
    rows.push({ name: "Sem área", spent: report.uncategorized, limit: 0, level: "none", share: null });
  if (rows.length) {
    section("Gastos por área");
    const shareX = PAGE_W - MARGIN - 46;
    const limitX = PAGE_W - MARGIN;
    const spentX = shareX - 20;
    y += 5;
    write(doc, "Área", MARGIN, y, { size: 8, color: COLORS.muted });
    write(doc, "Gasto", spentX, y, { size: 8, color: COLORS.muted, align: "right" });
    write(doc, "Parte", shareX, y, { size: 8, color: COLORS.muted, align: "right" });
    write(doc, "Limite", limitX, y, { size: 8, color: COLORS.muted, align: "right" });
    const biggest = Math.max(1, ...rows.map((r) => r.spent));
    rows.forEach((row) => {
      ensureSpace(12);
      y += 6.5;
      write(doc, row.name, MARGIN, y, { size: 10.5 });
      write(doc, formatMoney(row.spent), spentX, y, { size: 10.5, bold: true, align: "right" });
      write(doc, row.share == null ? "-" : `${row.share}%`, shareX, y, { size: 9.5, color: COLORS.muted, align: "right" });
      write(doc, row.limit ? formatMoney(row.limit) : "-", limitX, y, {
        size: 9.5,
        color: row.level === "over" ? COLORS.red : COLORS.muted,
        align: "right",
      });
      y += 3;
      fill(doc, COLORS.line);
      doc.roundedRect(MARGIN, y, CONTENT_W, 1.6, 0.8, 0.8, "F");
      fill(doc, row.level === "over" ? COLORS.red : COLORS.ink);
      doc.roundedRect(MARGIN, y, Math.max(1.6, (row.spent / biggest) * CONTENT_W), 1.6, 0.8, 0.8, "F");
      y += 1.6;
    });
    if (report.limits.total) {
      y += 7;
      const within = report.limits.total - report.limits.over - report.limits.warn;
      write(doc, `Limites: ${within} dentro · ${report.limits.warn} perto · ${report.limits.over} acima`, MARGIN, y, {
        size: 9,
        color: COLORS.muted,
      });
    }
  }

  // Maiores gastos
  if (report.top.length) {
    section("Maiores gastos");
    report.top.forEach((item, i) => {
      ensureSpace(9);
      y += 6.5;
      write(doc, String(i + 1), MARGIN + 2, y, { size: 11, bold: true, color: COLORS.faint, align: "center" });
      writeFit(doc, item.description, MARGIN + 9, y, 64, { size: 10.5 });
      writeFit(doc, `${item.category} · ${dayMonth(item.date)}${item.recurring ? " · fixa" : ""}`, MARGIN + 78, y, 62, {
        size: 8.5,
        color: COLORS.muted,
      });
      write(doc, formatMoney(item.amount), PAGE_W - MARGIN, y, { size: 10.5, bold: true, align: "right" });
      y += 2.5;
      doc.setDrawColor(...COLORS.line);
      doc.line(MARGIN + 9, y, PAGE_W - MARGIN, y);
    });
  }

  // Rodapé em todas as páginas
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(...COLORS.line);
    doc.line(MARGIN, PAGE_H - 15, PAGE_W - MARGIN, PAGE_H - 15);
    brandMark(doc, MARGIN, PAGE_H - 12.2, 4.6);
    write(
      doc,
      "Gerado pela Astro Wallet. Os dados da carteira ficam só no celular de quem usa o app.",
      MARGIN + 6.5,
      PAGE_H - 8.6,
      { size: 7.5, color: COLORS.faint },
    );
    write(doc, `${page} de ${pages}`, PAGE_W - MARGIN, PAGE_H - 8.6, { size: 7.5, color: COLORS.faint, align: "right" });
  }
  return doc;
}
