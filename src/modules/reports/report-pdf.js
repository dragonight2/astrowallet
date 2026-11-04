// Relatório mensal em PDF (A4), com a marca da Astro Wallet. Usa a biblioteca jsPDF.
// Medidas em milímetros.
//
// Conteúdo:
//   1. Cabeçalho e cartões (receitas, despesas, saldo)
//   2. Quanto da renda foi gasto (barra)
//   3. Para onde foi o dinheiro: gráfico de rosca (pizza) com legenda, valores e %
//   4. Tipo de despesa: fixas, parcelas e do dia a dia (barra dividida)
//   5. Gastos por área: barras com a cor da área, marca do limite e situação
//   6. Comparação com o mês anterior (barras lado a lado)
//   7. Maiores gastos

import { jsPDF } from "jspdf";
import { dayMonth, formatMoney, percent } from "../../core/format.js";

const COLORS = {
  ink: [10, 10, 11],
  muted: [94, 94, 102],
  faint: [142, 142, 147],
  card: [245, 245, 247],
  line: [227, 227, 232],
  track: [235, 235, 239],
  red: [196, 17, 29],
  amber: [154, 91, 0],
  green: [0, 120, 60],
  white: [255, 255, 255],
  flap: [120, 120, 126],
  other: [161, 161, 166], // "Outras áreas" no gráfico
  prev: [199, 199, 204], // mês anterior na comparação
};

// Cores das áreas no gráfico, sempre nesta ordem (da maior despesa para a menor).
// Paleta conferida para daltonismo; como algumas cores são claras, todo pedaço
// do gráfico tem nome, valor e % escritos na legenda.
const SLICE_COLORS = [
  [42, 120, 214], // azul
  [235, 104, 52], // laranja
  [27, 175, 122], // verde-água
  [237, 161, 0], // amarelo
  [232, 123, 164], // rosa
  [0, 131, 0], // verde
];
const MAX_SLICES = SLICE_COLORS.length;

// Tipos de despesa (tons de cinza: é uma divisão simples, com rótulos ao lado).
const KIND_COLORS = { fixed: [10, 10, 11], parcels: [110, 110, 118], daily: [190, 190, 196] };

const STATUS = {
  over: { label: "Acima do limite", color: COLORS.red },
  warn: { label: "Perto do limite", color: COLORS.amber },
  ok: { label: "Dentro do limite", color: COLORS.green },
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

/** Escreve diminuindo a fonte (até 8) e, se ainda não couber, corta com "…". */
function writeFit(doc, text, x, y, maxWidth, { size, bold, color, align }) {
  let current = size;
  let value = String(text);
  doc.setFont("helvetica", bold ? "bold" : "normal");
  while (current > 8) {
    doc.setFontSize(current);
    if (doc.getTextWidth(value) <= maxWidth) break;
    current -= 0.5;
  }
  doc.setFontSize(current);
  if (doc.getTextWidth(value) > maxWidth) {
    while (value.length > 1 && doc.getTextWidth(`${value}…`) > maxWidth) value = value.slice(0, -1);
    value = `${value.trimEnd()}…`;
  }
  write(doc, value, x, y, { size: current, bold, color, align });
}

/** Barra com pontas arredondadas (largura mínima para continuar visível). */
function bar(doc, x, y, width, height, color) {
  fill(doc, color);
  const w = Math.max(height, width);
  doc.roundedRect(x, y, w, height, height / 2, height / 2, "F");
}

/** Fatia de rosca entre dois ângulos (radianos, 0 = topo, sentido horário). */
function donutSlice(doc, cx, cy, outer, inner, start, end, color) {
  const steps = Math.max(2, Math.ceil(((end - start) / (Math.PI * 2)) * 120));
  const point = (r, a) => [cx + r * Math.sin(a), cy - r * Math.cos(a)];
  const path = [];
  for (let i = 0; i <= steps; i++) path.push(point(outer, start + ((end - start) * i) / steps));
  for (let i = steps; i >= 0; i--) path.push(point(inner, start + ((end - start) * i) / steps));
  const deltas = path.slice(1).map((p, i) => [p[0] - path[i][0], p[1] - path[i][1]]);
  fill(doc, color);
  doc.lines(deltas, path[0][0], path[0][1], [1, 1], "F", true);
}

/** Separa as áreas do gráfico: as maiores ganham cor; o resto vira "Outras áreas". */
function chartParts(report) {
  const rows = report.categories.map((c) => ({ id: c.id, name: c.name, spent: c.spent }));
  if (report.uncategorized) rows.push({ id: "__none", name: "Sem área", spent: report.uncategorized });
  rows.sort((a, b) => b.spent - a.spent);
  const parts = rows.length > MAX_SLICES ? rows.slice(0, MAX_SLICES - 1) : rows;
  parts.forEach((p, i) => (p.color = SLICE_COLORS[i]));
  if (rows.length > MAX_SLICES) {
    const rest = rows.slice(MAX_SLICES - 1);
    parts.push({ name: `Outras áreas (${rest.length})`, spent: rest.reduce((s, r) => s + r.spent, 0), color: COLORS.other });
  }
  return parts;
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
  /** Título de seção; `needs` = altura mínima do conteúdo que vem logo abaixo. */
  const section = (title, needs = 0) => {
    ensureSpace(16 + needs);
    y += 10;
    write(doc, title.toUpperCase(), MARGIN, y, { size: 8.5, bold: true, color: COLORS.muted });
    y += 4;
  };

  // ---------- 1. Cabeçalho ----------
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

  // ---------- 2. Quanto da renda foi gasto ----------
  const spentPct = percent(report.expense, report.income);
  if (spentPct != null) {
    y += 9;
    const over = spentPct > 100;
    write(doc, `${spentPct}% das receitas foram gastos`, MARGIN, y, { size: 10.5, bold: true, color: over ? COLORS.red : COLORS.ink });
    write(
      doc,
      over ? `Faltaram ${formatMoney(-report.balance)}` : `Sobraram ${formatMoney(report.balance)}`,
      PAGE_W - MARGIN,
      y,
      { size: 9.5, color: COLORS.muted, align: "right" },
    );
    y += 3.5;
    bar(doc, MARGIN, y, CONTENT_W, 3.2, COLORS.track);
    if (report.expense > 0) bar(doc, MARGIN, y, (Math.min(100, spentPct) / 100) * CONTENT_W, 3.2, over ? COLORS.red : COLORS.ink);
    y += 3.2;
  }

  // ---------- 3. Para onde foi o dinheiro (rosca) ----------
  const parts = chartParts(report);
  if (report.expense > 0 && parts.length) {
    const legendRows = parts.length;
    const chartH = Math.max(58, legendRows * 8 + 6);
    section("Para onde foi o dinheiro", chartH);
    const top = y + 2;
    const radius = 25;
    const cx = MARGIN + radius + 2;
    const cy = top + radius + 2;

    // Fatias, com um fio branco separando uma da outra.
    let angle = 0;
    const total = parts.reduce((s, p) => s + p.spent, 0);
    const edges = [];
    for (const p of parts) {
      const sweep = (p.spent / total) * Math.PI * 2;
      donutSlice(doc, cx, cy, radius, radius * 0.6, angle, angle + sweep, p.color);
      edges.push(angle);
      angle += sweep;
    }
    if (parts.length > 1) {
      doc.setDrawColor(...COLORS.white);
      doc.setLineWidth(0.7);
      for (const a of edges)
        doc.line(cx + radius * 0.58 * Math.sin(a), cy - radius * 0.58 * Math.cos(a), cx + (radius + 0.3) * Math.sin(a), cy - (radius + 0.3) * Math.cos(a));
    }
    write(doc, "Despesas", cx, cy - 1.5, { size: 7.5, color: COLORS.muted, align: "center" });
    writeFit(doc, formatMoney(report.expense), cx, cy + 3.5, radius * 1.1, { size: 9.5, bold: true, align: "center" });

    // Legenda: cor, nome, valor e % (as cores nunca aparecem sozinhas).
    const lx = MARGIN + radius * 2 + 14;
    const valueX = PAGE_W - MARGIN - 16;
    const pctX = PAGE_W - MARGIN;
    let ly = top + Math.max(4, (chartH - legendRows * 8) / 2) + 2;
    for (const p of parts) {
      fill(doc, p.color);
      doc.roundedRect(lx, ly - 3, 3.4, 3.4, 0.8, 0.8, "F");
      writeFit(doc, p.name, lx + 6, ly, valueX - lx - 32, { size: 10 });
      write(doc, formatMoney(p.spent), valueX, ly, { size: 10, bold: true, align: "right" });
      write(doc, `${Math.round((p.spent / total) * 100)}%`, pctX, ly, { size: 9.5, color: COLORS.muted, align: "right" });
      ly += 8;
    }
    y = top + chartH;
  }

  // ---------- 4. Tipo de despesa ----------
  if (report.expense > 0) {
    const daily = Math.max(0, report.expense - report.expenseFixed - report.expenseInstallments);
    const kinds = [
      { key: "fixed", label: "Contas fixas", value: report.expenseFixed },
      { key: "parcels", label: "Parcelas", value: report.expenseInstallments },
      { key: "daily", label: "Dia a dia", value: daily },
    ].filter((k) => k.value > 0);
    section("Tipo de despesa", 18);
    y += 2;
    let x = MARGIN;
    kinds.forEach((k, i) => {
      const w = (k.value / report.expense) * CONTENT_W;
      fill(doc, KIND_COLORS[k.key]);
      doc.rect(x, y, Math.max(0.6, w - (i < kinds.length - 1 ? 0.6 : 0)), 5, "F");
      x += w;
    });
    y += 11;
    const colW = CONTENT_W / 3;
    kinds.forEach((k, i) => {
      const kx = MARGIN + i * colW;
      fill(doc, KIND_COLORS[k.key]);
      doc.roundedRect(kx, y - 3, 3.4, 3.4, 0.8, 0.8, "F");
      write(doc, k.label, kx + 6, y, { size: 9.5, color: COLORS.muted });
      write(doc, `${formatMoney(k.value)} · ${Math.round((k.value / report.expense) * 100)}%`, kx + 6, y + 5, { size: 10, bold: true });
    });
    y += 5;
  }

  // ---------- 5. Gastos por área ----------
  const rows = [...report.categories];
  if (report.uncategorized)
    rows.push({ id: "__none", name: "Sem área", spent: report.uncategorized, limit: 0, level: "none", share: percent(report.uncategorized, report.expense) });
  if (rows.length) {
    // Mesma cor da área no gráfico e na tabela.
    const colorOf = new Map(parts.filter((p) => p.id).map((p) => [p.id, p.color]));
    section("Gastos por área", 14);
    const shareX = PAGE_W - MARGIN - 46;
    const limitX = PAGE_W - MARGIN;
    const spentX = shareX - 20;
    y += 5;
    write(doc, "Área", MARGIN, y, { size: 8, color: COLORS.muted });
    write(doc, "Gasto", spentX, y, { size: 8, color: COLORS.muted, align: "right" });
    write(doc, "Parte", shareX, y, { size: 8, color: COLORS.muted, align: "right" });
    write(doc, "Limite", limitX, y, { size: 8, color: COLORS.muted, align: "right" });
    const scale = Math.max(1, ...rows.map((r) => Math.max(r.spent, r.limit || 0)));
    rows.forEach((row) => {
      ensureSpace(15);
      y += 7;
      const color = colorOf.get(row.id) || COLORS.other;
      fill(doc, color);
      doc.roundedRect(MARGIN, y - 3, 3.4, 3.4, 0.8, 0.8, "F");
      writeFit(doc, row.name, MARGIN + 6, y, spentX - MARGIN - 32, { size: 10.5 });
      write(doc, formatMoney(row.spent), spentX, y, { size: 10.5, bold: true, align: "right" });
      write(doc, row.share == null ? "-" : `${row.share}%`, shareX, y, { size: 9.5, color: COLORS.muted, align: "right" });
      write(doc, row.limit ? formatMoney(row.limit) : "sem limite", limitX, y, { size: 9.5, color: COLORS.muted, align: "right" });
      y += 2.8;
      // Trilho, gasto (na cor da área; vermelho se passou) e um traço marcando o limite.
      bar(doc, MARGIN, y, CONTENT_W, 2, COLORS.track);
      bar(doc, MARGIN, y, (row.spent / scale) * CONTENT_W, 2, row.level === "over" ? COLORS.red : color);
      if (row.limit) {
        const lx = MARGIN + (row.limit / scale) * CONTENT_W;
        doc.setDrawColor(...COLORS.ink);
        doc.setLineWidth(0.5);
        doc.line(lx, y - 1, lx, y + 3);
      }
      y += 2;
      const status = STATUS[row.level];
      if (status) {
        y += 4;
        fill(doc, status.color);
        doc.circle(MARGIN + 1.2, y - 1.1, 1.1, "F");
        const detail =
          row.level === "over"
            ? `passou ${formatMoney(row.spent - row.limit)}`
            : `${Math.round((row.spent / row.limit) * 100)}% usado · restam ${formatMoney(row.limit - row.spent)}`;
        write(doc, `${status.label} · ${detail}`, MARGIN + 4, y, { size: 8, color: status.color });
      }
    });
    if (report.limits.total) {
      y += 8;
      const within = report.limits.total - report.limits.over - report.limits.warn;
      write(doc, `Limites: ${within} dentro · ${report.limits.warn} perto · ${report.limits.over} acima   |   o traço preto na barra marca o limite`, MARGIN, y, {
        size: 8,
        color: COLORS.muted,
      });
    }
  }

  // ---------- 6. Comparação com o mês anterior ----------
  if (report.prev.hasData) {
    section(`Comparado a ${report.prev.label.toLowerCase()}`, 30);
    const labelW = 24;
    const barW = CONTENT_W - labelW - 50;
    const scale = Math.max(1, report.prev.income, report.income, report.prev.expense, report.expense);
    [
      ["Receitas", report.prev.income, report.income, report.changes.income, false],
      ["Despesas", report.prev.expense, report.expense, report.changes.expense, true],
    ].forEach(([label, before, now, change, lowerIsBetter]) => {
      y += 7;
      write(doc, label, MARGIN, y + 2.5, { size: 10, bold: true });
      const bx = MARGIN + labelW;
      bar(doc, bx, y - 2.2, (before / scale) * barW, 2.6, COLORS.prev);
      write(doc, formatMoney(before), bx + barW + 4, y, { size: 8.5, color: COLORS.muted });
      bar(doc, bx, y + 1.6, (now / scale) * barW, 2.6, COLORS.ink);
      write(doc, formatMoney(now), bx + barW + 4, y + 4, { size: 9, bold: true });
      const bad = change != null && change !== 0 && (lowerIsBetter ? change > 0 : change < 0);
      write(doc, changeLabel(change), PAGE_W - MARGIN, y + 2.5, { size: 10, bold: true, align: "right", color: bad ? COLORS.red : COLORS.ink });
      y += 5;
    });
    y += 6;
    fill(doc, COLORS.prev);
    doc.roundedRect(MARGIN + 24, y - 2.4, 6, 2.6, 1.3, 1.3, "F");
    write(doc, report.prev.label, MARGIN + 32, y, { size: 8, color: COLORS.muted });
    fill(doc, COLORS.ink);
    doc.roundedRect(MARGIN + 80, y - 2.4, 6, 2.6, 1.3, 1.3, "F");
    write(doc, report.label, MARGIN + 88, y, { size: 8, color: COLORS.muted });
  }

  // ---------- 7. Maiores gastos ----------
  if (report.top.length) {
    section("Maiores gastos", 10);
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
      doc.setLineWidth(0.3);
      doc.line(MARGIN + 9, y, PAGE_W - MARGIN, y);
    });
  }

  // ---------- Rodapé em todas as páginas ----------
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(...COLORS.line);
    doc.setLineWidth(0.3);
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
