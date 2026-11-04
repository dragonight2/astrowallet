// A "loja" de dados: o único lugar que altera a carteira.
// Toda mudança passa por `change()`, que salva no aparelho e avisa o app
// por eventos (o que redesenha a tela). Os módulos só leem `store.state`
// e chamam os métodos abaixo — nunca alteram os dados diretamente.

import { events } from "../core/events.js";
import { addMonths, newId } from "../core/format.js";
import { sanitizeBackup } from "./sanitize.js";
import { SCHEMA_VERSION, emptyState, migrate } from "./schema.js";

const MAX_BACKUP_BYTES = 5 * 1024 * 1024;

/**
 * @param storage  onde salvar (adaptador da plataforma: web ou celular)
 * @param initial  dados carregados do aparelho, ou null para carteira nova
 */
export function createStore(storage, initial = null) {
  let state = initial ? migrate(initial) : emptyState();

  function persist() {
    try {
      const result = storage.save(state);
      if (result && typeof result.then === "function") result.catch((err) => events.emit("storage:error", err));
    } catch (err) {
      events.emit("storage:error", err);
    }
  }

  function change(mutate, eventName, payload) {
    mutate(state);
    persist();
    if (eventName) events.emit(eventName, payload);
    events.emit("data:changed", state);
  }

  const findRecurring = (id) => state.recurring.find((r) => r.id === id);

  return {
    get state() {
      return state;
    },

    category: (id) => state.categories.find((c) => c.id === id),

    setProfile: (patch) => change((s) => Object.assign(s.profile, patch), "profile:changed", patch),

    setSetting: (key, value) =>
      change(
        (s) => {
          s.settings[key] = value;
        },
        "settings:changed",
        { key, value },
      ),

    /** Dados próprios de um módulo (espaço livre para funcionalidades futuras). */
    moduleData: (moduleId) => state.modules[moduleId] || {},
    setModuleData: (moduleId, patch) =>
      change(
        (s) => {
          s.modules[moduleId] = { ...(s.modules[moduleId] || {}), ...patch };
        },
        `module:${moduleId}:changed`,
        patch,
      ),

    // ---- Lançamentos avulsos ----
    addEntry(fields) {
      const entry = { id: newId(), ...fields };
      change((s) => s.entries.push(entry), "entry:added", entry);
      return entry;
    },
    updateEntry: (id, patch) =>
      change((s) => Object.assign(s.entries.find((e) => e.id === id) || {}, patch), "entry:updated", { id, ...patch }),
    deleteEntry: (id) =>
      change(
        (s) => {
          s.entries = s.entries.filter((e) => e.id !== id);
        },
        "entry:deleted",
        { id },
      ),

    // ---- Receitas e contas fixas ----
    addRecurring(fields) {
      const item = { id: newId(), end_month: null, ...fields };
      change((s) => s.recurring.push(item), "recurring:added", item);
      return item;
    },
    /**
     * Edita um lançamento fixo a partir de `fromMonth`.
     * Os meses anteriores não mudam: o registro antigo é encerrado no mês
     * anterior e um novo começa em `fromMonth` com os valores novos.
     */
    editRecurring(id, patch, fromMonth) {
      change(
        (s) => {
          const item = findRecurring(id);
          if (!item) return;
          if (item.start_month >= fromMonth) Object.assign(item, patch);
          else {
            const previousEnd = item.end_month;
            item.end_month = addMonths(fromMonth, -1);
            s.recurring.push({ ...item, ...patch, id: newId(), start_month: fromMonth, end_month: previousEnd });
          }
        },
        "recurring:updated",
        { id, ...patch, fromMonth },
      );
    },
    /** Encerra um lançamento fixo a partir de `fromMonth` (o histórico anterior fica). */
    endRecurring(id, fromMonth) {
      change(
        (s) => {
          const item = findRecurring(id);
          if (!item) return;
          if (item.start_month >= fromMonth) s.recurring = s.recurring.filter((r) => r !== item);
          else item.end_month = addMonths(fromMonth, -1);
        },
        "recurring:ended",
        { id, fromMonth },
      );
    },

    // ---- Compras parceladas ----
    addInstallment(fields) {
      const item = { id: newId(), ...fields };
      change(
        (s) => {
          (s.installments || (s.installments = [])).push(item);
        },
        "installment:added",
        item,
      );
      return item;
    },
    updateInstallment: (id, patch) =>
      change(
        (s) => Object.assign((s.installments || []).find((p) => p.id === id) || {}, patch),
        "installment:updated",
        { id, ...patch },
      ),
    deleteInstallment: (id) =>
      change(
        (s) => {
          s.installments = (s.installments || []).filter((p) => p.id !== id);
        },
        "installment:deleted",
        { id },
      ),

    // ---- Áreas de gasto ----
    saveCategory({ id, name, icon }) {
      change(
        (s) => {
          const existing = s.categories.find((c) => c.id === id);
          if (existing) Object.assign(existing, { name, icon });
          else s.categories.push({ id: newId(), name, icon, monthly_limit: 0, sort: s.categories.length });
        },
        "category:saved",
        { id, name, icon },
      );
    },
    setCategoryLimit: (id, limit) =>
      change(
        (s) => {
          const category = s.categories.find((c) => c.id === id);
          if (category) category.monthly_limit = limit;
        },
        "category:saved",
        { id },
      ),
    /** Remove a área; os lançamentos dela continuam, como "Sem área". */
    deleteCategory(id) {
      change(
        (s) => {
          s.entries.forEach((e) => {
            if (e.category_id === id) e.category_id = null;
          });
          s.recurring.forEach((r) => {
            if (r.category_id === id) r.category_id = null;
          });
          (s.installments || []).forEach((p) => {
            if (p.category_id === id) p.category_id = null;
          });
          s.categories = s.categories.filter((c) => c.id !== id);
        },
        "category:deleted",
        { id },
      );
    },

    // ---- Backup ----
    exportJSON() {
      return JSON.stringify({
        app: "astro-wallet",
        schema: SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        data: state,
      });
    },
    /** Substitui tudo pelo conteúdo de um backup (já conferido e limpo). */
    importJSON(text) {
      if (text.length > MAX_BACKUP_BYTES) throw new Error("Backup grande demais.");
      const file = JSON.parse(text);
      if (file?.app !== "astro-wallet" && file?.app !== "axell-wallet") throw new Error("Backup inválido.");
      const raw = file.data || file;
      if (raw?.version > SCHEMA_VERSION)
        throw new Error("Este backup é de uma versão mais nova do app. Atualize o app para restaurar.");
      const { data, skipped } = sanitizeBackup(raw);
      const next = migrate(data);
      if (!next) throw new Error("Backup inválido.");
      if (!data.profile) next.profile = { ...state.profile };
      if (!data.settings) next.settings = { ...state.settings };
      next.profile.onboarded = true;
      next.profile.terms = state.profile.terms || next.profile.terms;
      change(
        () => {
          state = next;
        },
        "store:imported",
        { skipped },
      );
      return { skipped };
    },

    /** Apaga tudo e volta ao início. */
    reset: () =>
      change(() => {
        state = emptyState();
      }, "store:reset"),
  };
}
