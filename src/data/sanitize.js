// Limpeza de dados que vêm de fora (arquivo de backup).
// Tudo é conferido e cortado no tamanho certo antes de entrar no app:
// textos sem caracteres de controle, ids só com letras/números, valores
// inteiros e positivos, datas no formato certo. O que não passar é descartado.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;
const MAX_ITEMS = 50000;

const cleanText = (value, max = 140) =>
  String(value ?? "")
    .replace(/[\u0000-\u001f]/g, " ")
    .trim()
    .slice(0, max);

/** Centavos válidos (inteiro, 0 a 10 trilhões) ou null. */
const cleanAmount = (value) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n >= 0 && n < 1e13 ? n : null;
};

const cleanId = (value) => cleanText(value, 64).replace(/[^\w-]/g, "") || null;
const cleanType = (value) => (value === "income" ? "income" : "expense");
const cleanDay = (value) => Math.min(31, Math.max(1, parseInt(value, 10) || 1));

/**
 * Confere os dados de um backup.
 * Devolve { data, skipped } — skipped é quantos registros inválidos foram ignorados.
 * Lança erro se o arquivo não tiver a estrutura esperada ou for grande demais.
 */
export function sanitizeBackup(input) {
  if (!input || typeof input !== "object") throw new Error("Backup inválido.");
  let data = input.installments === undefined ? { ...input, installments: [] } : input;

  for (const key of ["categories", "recurring", "entries", "installments"]) {
    if (!Array.isArray(data[key])) throw new Error("Backup inválido.");
    if (data[key].length > MAX_ITEMS) throw new Error("Backup grande demais.");
  }

  let skipped = 0;
  const keep = (ok) => ok || (skipped++, false);

  const categories = data.categories
    .map((c, i) => ({
      ...c,
      id: cleanId(c.id),
      name: cleanText(c.name, 40),
      icon: cleanText(c.icon, 24).replace(/[^\w]/g, "") || "tag",
      monthly_limit: cleanAmount(c.monthly_limit) ?? 0,
      sort: Number.isFinite(+c.sort) ? +c.sort : i,
    }))
    .filter((c) => c.id && c.name);

  const recurring = data.recurring
    .map((r) => ({
      ...r,
      id: cleanId(r.id),
      type: cleanType(r.type),
      description: cleanText(r.description) || "Lançamento fixo",
      amount: cleanAmount(r.amount),
      day: cleanDay(r.day),
      category_id: r.category_id ? cleanId(r.category_id) : null,
      start_month: MONTH_RE.test(r.start_month) ? r.start_month : null,
      end_month: MONTH_RE.test(r.end_month) ? r.end_month : null,
    }))
    .filter((r) => keep(r.id && r.amount !== null && r.start_month));

  const entries = data.entries
    .map((e) => ({
      ...e,
      id: cleanId(e.id),
      type: cleanType(e.type),
      description: cleanText(e.description) || "Lançamento",
      amount: cleanAmount(e.amount),
      category_id: e.category_id ? cleanId(e.category_id) : null,
      date: DATE_RE.test(e.date) ? e.date : null,
    }))
    .filter((e) => keep(e.id && e.amount !== null && e.date));

  const installments = data.installments
    .map((p) => ({
      ...p,
      id: cleanId(p.id),
      description: cleanText(p.description) || "Compra parcelada",
      total_amount: cleanAmount(p.total_amount),
      count: Math.min(48, Math.max(2, parseInt(p.count, 10) || 0)),
      category_id: p.category_id ? cleanId(p.category_id) : null,
      start_month: MONTH_RE.test(p.start_month) ? p.start_month : null,
      day: cleanDay(p.day),
    }))
    .filter((p) => keep(p.id && p.total_amount && parseInt(p.count, 10) >= 2 && p.start_month));

  const profile = data.profile ? { ...data.profile, name: cleanText(data.profile.name, 80) } : data.profile;

  return { data: { ...data, profile, categories, recurring, entries, installments }, skipped };
}
