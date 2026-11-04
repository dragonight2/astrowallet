// Formato dos dados e migrações entre versões.
//
// REGRA DE OURO: uma atualização do app nunca pode perder dados.
// Quando o formato mudar, aumente SCHEMA_VERSION e acrescente uma migração
// em MIGRATIONS que converta o formato antigo no novo. Antes de migrar, o app
// guarda uma cópia dos dados antigos (veja src/main.js).

export const SCHEMA_VERSION = 3;

const DEFAULT_CATEGORIES = [
  ["Alimentação", "food"],
  ["Transporte", "bus"],
  ["Moradia", "home"],
  ["Contas", "bolt"],
  ["Saúde", "heart"],
  ["Educação", "school"],
  ["Lazer", "game"],
  ["Compras", "bag"],
  ["Outros", "tag"],
];

/**
 * Estado de uma carteira nova.
 *   profile       nome, se terminou o cadastro, termos aceitos
 *   settings      lock (pedir digital/PIN), theme, hideValues
 *   modules       espaço livre para módulos guardarem dados próprios
 *   categories    áreas de gasto { id, name, icon, monthly_limit (centavos), sort }
 *   recurring     receitas e contas fixas { id, type, description, amount, day, category_id, start_month, end_month }
 *   entries       lançamentos avulsos { id, type, description, amount, category_id, date }
 *   installments  compras parceladas { id, description, total_amount, count, category_id, start_month, day }
 */
export function emptyState() {
  return {
    version: SCHEMA_VERSION,
    profile: { name: "", onboarded: false },
    settings: { lock: false },
    modules: {},
    categories: DEFAULT_CATEGORIES.map(([name, icon], i) => ({
      id: `c${i}`,
      name,
      icon,
      monthly_limit: 0,
      sort: i,
    })),
    recurring: [],
    entries: [],
    installments: [],
  };
}

const MIGRATIONS = [
  {
    to: 2,
    name: "perfil, configurações e dados de módulos em blocos próprios",
    up(data) {
      const { name, onboarded, lock, ...rest } = data;
      return {
        ...rest,
        profile: data.profile || { name: name || "", onboarded: !!onboarded },
        settings: data.settings || { lock: !!lock },
        modules: data.modules || {},
      };
    },
  },
  {
    to: 3,
    name: "compras parceladas",
    up(data) {
      return { ...data, installments: Array.isArray(data.installments) ? data.installments : [] };
    },
  },
];

/** Os dados salvos são de uma versão anterior e precisam de migração? */
export const needsMigration = (data) => !!data && (data.version || 1) < SCHEMA_VERSION;

/** Garante que todos os blocos existam, sem apagar nada que já esteja lá. */
function fillDefaults(data) {
  const base = emptyState();
  return {
    ...data,
    profile: { ...base.profile, ...(data.profile || {}) },
    settings: { ...base.settings, ...(data.settings || {}) },
    modules: { ...(data.modules || {}) },
    categories: Array.isArray(data.categories) ? data.categories : base.categories,
    recurring: Array.isArray(data.recurring) ? data.recurring : [],
    entries: Array.isArray(data.entries) ? data.entries : [],
    installments: Array.isArray(data.installments) ? data.installments : [],
  };
}

/** Leva dados de qualquer versão anterior até a atual. Devolve null se não forem dados do app. */
export function migrate(data) {
  if (!data || typeof data !== "object" || !Array.isArray(data.categories)) return null;
  let result = JSON.parse(JSON.stringify(data));
  let version = result.version || 1;
  for (const step of MIGRATIONS) {
    if (version < step.to) {
      result = step.up(result);
      version = step.to;
      result.version = version;
    }
  }
  if (!result.version || result.version < SCHEMA_VERSION) result.version = SCHEMA_VERSION;
  return fillDefaults(result);
}
