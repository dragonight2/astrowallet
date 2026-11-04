// Lê o texto de uma notificação de banco ou carteira digital e descobre se é um
// pagamento: valor, loja (ou pessoa), data e se é saída ou entrada de dinheiro.
// Função pura, sem acesso a nada do celular (por isso tem testes).
//
// Na dúvida, a notificação é ignorada: é melhor deixar passar um pagamento
// (a pessoa lança à mão) do que criar lançamentos errados.

import { AREA_HINTS, appByPackage } from "./sources.js";

// Valor em reais: "R$ 1.234,56", "R$45,90", "R$ 10".
const AMOUNT_RE = /R\$\s?(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:,\d{1,2})?)/i;

// Notificações que falam de dinheiro mas não são um pagamento feito.
const IGNORE_RE =
  /\b(oferta|promo|cashback dispon|ganhe|ganhou|fatura (fechou|vence|dispon)|vence (hoje|amanh)|boleto gerado|lembrete|agendad|programad|código|senha|token|negad|recusad|não aprovad|nao aprovad|cancelad|estornad em|empréstimo|emprestimo|investi|rendeu|rendimento|aumentamos)/i;

const INCOME_RE =
  /\b(recebeu|recebido|recebida|você recebeu|voce recebeu|caiu na sua conta|depósito|deposito|crédito em conta|credito em conta|estorno|reembolso|devolução|devolucao)\b/i;

const EXPENSE_RE =
  /\b(compra|comprou|pagamento|pagou|pago|pix enviado|transferência enviada|transferencia enviada|você enviou|voce enviou|débito|debito|aprovad|gastou|saque)\b/i;

const clean = (text) =>
  String(text || "")
    .replace(/\s+/g, " ")
    .trim();

/** "1.234,56" → 123456 centavos */
function toCents(raw) {
  const [reais, centavos = "0"] = raw.replace(/\./g, "").split(",");
  return parseInt(reais, 10) * 100 + parseInt(centavos.padEnd(2, "0").slice(0, 2), 10);
}

// Palavras que aparecem depois de "em/no/para" mas não são a loja.
const NOT_COUNTERPART = /^(?:(?:o|a|os|as|seu|sua)\s+)?(cart[aã]o|valor|conta|sua|seu|d[eé]bito|cr[eé]dito|final|pix|app|aplicativo|hoje|ontem)\b/i;

/** Tenta achar o nome da loja ou da pessoa no texto. */
function findCounterpart(text, type) {
  const stop = "(?=\\s+(?:com|para|pra|no valor|via|às|as|hoje|ontem|em \\d|no cart|cartão|cartao|final|aprovad|foi|\\(|•)|[.,;!\\n]|$)";
  const patterns =
    type === "income"
      ? [new RegExp(`\\bde\\s+(?!R\\$)(.{2,40}?)${stop}`, "gi")]
      : [
          new RegExp(`\\b(?:para|pra)\\s+(?!R\\$)(.{2,40}?)${stop}`, "gi"),
          new RegExp(`\\b(?:em|no|na)\\s+(?!R\\$)(.{2,40}?)${stop}`, "gi"),
        ];
  // Em compras, a loja vem depois de "em"; em Pix/transferência, a pessoa vem depois de "para".
  if (type === "expense" && !/\b(pix|transfer|envi)/i.test(text)) patterns.reverse();
  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      const candidate = m[1].trim();
      if (/^\d/.test(candidate) || /R\$/.test(candidate) || NOT_COUNTERPART.test(candidate)) continue;
      return candidate;
    }
  }
  return "";
}

/** Primeira letra de cada palavra maiúscula: "PADARIA SAO JOSE" → "Padaria Sao Jose". */
function titleCase(text) {
  return text
    .toLocaleLowerCase("pt-BR")
    .replace(/(^|[\s\-/])(\p{L})/gu, (_, sep, ch) => sep + ch.toLocaleUpperCase("pt-BR"))
    .slice(0, 60);
}

const localDate = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * @param n { id, pkg, title, text, time }  notificação vinda do Android
 * @returns { id, type, amount, description, date, source, time } ou null
 */
export function parsePaymentNotification(n) {
  const app = appByPackage(n.pkg);
  if (!app) return null;
  const title = clean(n.title);
  const body = clean(n.text);
  const full = `${title}. ${body}`;
  if (IGNORE_RE.test(full)) return null;

  const amountMatch = full.match(AMOUNT_RE);
  if (!amountMatch) return null;
  const amount = toCents(amountMatch[1]);
  if (!(amount > 0)) return null;

  let type = null;
  if (INCOME_RE.test(full) && !/\bcompra\b/i.test(full)) type = "income";
  else if (EXPENSE_RE.test(full)) type = "expense";
  else if (app.wallet) type = "expense"; // carteiras (Google/Samsung) só avisam pagamentos
  if (!type) return null;

  // Nas carteiras, o título da notificação costuma ser o nome da loja.
  let counterpart = findCounterpart(body, type) || findCounterpart(title, type);
  if (!counterpart && app.wallet && title && !AMOUNT_RE.test(title)) counterpart = title;

  const description = counterpart
    ? titleCase(counterpart)
    : type === "income"
      ? `Recebido (${app.name})`
      : `Pagamento (${app.name})`;

  return {
    id: String(n.id),
    type,
    amount,
    description,
    date: localDate(n.time),
    time: n.time,
    source: app.name,
  };
}

/**
 * Banco e carteira costumam avisar o mesmo pagamento. Junta avisos com o mesmo
 * valor e tipo em até 3 minutos, ficando com o que tem a melhor descrição.
 */
export function mergeDuplicates(payments) {
  const sorted = [...payments].sort((a, b) => a.time - b.time);
  const result = [];
  for (const p of sorted) {
    const twin = result.find((r) => r.type === p.type && r.amount === p.amount && Math.abs(r.time - p.time) <= 180000);
    if (!twin) result.push(p);
    else if (/^(Pagamento|Recebido) \(/.test(twin.description) && !/^(Pagamento|Recebido) \(/.test(p.description))
      Object.assign(twin, { description: p.description, source: `${twin.source} e ${p.source}` });
  }
  return result;
}

const normalize = (s) =>
  String(s || "")
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/**
 * Sugere a área de uma despesa: primeiro pelo que a pessoa já escolheu antes
 * para a mesma loja; depois por palavras no nome da loja.
 */
export function suggestCategory(description, categories, learned = {}) {
  const key = normalize(description);
  const remembered = learned[key];
  if (remembered && categories.some((c) => c.id === remembered)) return remembered;
  const text = ` ${key} `;
  for (const hint of AREA_HINTS) {
    if (hint.words.some((w) => text.includes(normalize(w)))) {
      const category = categories.find((c) => normalize(c.name) === normalize(hint.area));
      if (category) return category.id;
    }
  }
  return null;
}

export const merchantKey = normalize;
