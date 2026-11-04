// Datas, meses e dinheiro.
// Meses são textos "AAAA-MM" e datas "AAAA-MM-DD".
// Valores em dinheiro são sempre inteiros em CENTAVOS (R$ 12,34 → 1234),
// o que evita erros de arredondamento.

const MONTH_NAMES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

export const pad2 = (n) => String(n).padStart(2, "0");
const monthOf = (date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;

/** Mês atual, "AAAA-MM". */
export const currentMonth = () => monthOf(new Date());

/** Data de hoje, "AAAA-MM-DD". */
export const today = () => {
  const d = new Date();
  return `${monthOf(d)}-${pad2(d.getDate())}`;
};

/** Soma (ou subtrai) meses: addMonths("2026-01", -1) → "2025-12". */
export function addMonths(month, delta) {
  const [y, m] = month.split("-").map(Number);
  return monthOf(new Date(y, m - 1 + delta, 1));
}

/** Quantos meses de `from` até `to`. */
export function monthsBetween(from, to) {
  const [y1, m1] = from.split("-").map(Number);
  const [y2, m2] = to.split("-").map(Number);
  return (y2 - y1) * 12 + (m2 - m1);
}

/** "2026-11" → "nov/26" */
export function shortMonth(month) {
  return `${MONTH_NAMES[Number(month.split("-")[1]) - 1].slice(0, 3)}/${month.slice(2, 4)}`;
}

/** "2026-11" → "novembro" */
export function monthName(month) {
  return MONTH_NAMES[Number(month.split("-")[1]) - 1];
}

/** "2026-11" → "Novembro de 2026" */
export function monthLabel(month) {
  const name = monthName(month);
  return `${name[0].toUpperCase()}${name.slice(1)} de ${month.slice(0, 4)}`;
}

/** Quantos dias tem o mês. */
export function daysInMonth(month) {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

/** Centavos → "R$ 1.234,56" */
export function formatMoney(cents) {
  const negative = cents < 0;
  const abs = Math.abs(Math.round(cents || 0));
  const reais = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negative ? "-" : ""}R$ ${reais},${pad2(abs % 100)}`;
}

/** Texto digitado ("1.234,56", "R$ 10", "10.5") → centavos, ou NaN. */
export function parseMoney(text) {
  let s = String(text ?? "")
    .trim()
    .replace(/[R$\s]/g, "");
  if (!s) return NaN;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = parseFloat(s);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

/** Centavos → "1.234,56" para preencher campos (vazio quando zero). */
export const moneyInputValue = (cents) => (cents ? formatMoney(cents).replace(/^-?R\$ /, "") : "");

/** "2026-11-04" → "04/11" */
export const dayMonth = (date) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;

/** Dia do mês válido (1 a 31). */
export const clampDay = (value) => Math.min(31, Math.max(1, parseInt(value, 10) || 1));

/** Primeiro nome. */
export const firstName = (name) =>
  String(name || "")
    .trim()
    .split(/\s+/)[0] || "";

/** Identificador curto e único para registros. */
export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/** Percentual inteiro de parte/total, ou null quando não há total. */
export const percent = (part, total) => (total > 0 ? Math.round((part / total) * 100) : null);
