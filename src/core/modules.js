// Registro de módulos — o coração da arquitetura aberta.
//
// Cada funcionalidade do app é um objeto "módulo" com um id e, se quiser:
//   tab:          uma aba na barra inferior { label, title, icon, order, home, hero(ctx), render(ctx), primaryAction }
//   gate:         uma tela que aparece antes do app (termos, cadastro, bloqueio) { order, render(ctx) → html | null }
//   settings:     um bloco na aba Ajustes { title, order, render(ctx) }
//   navActions:   botões na barra superior (ctx) → [{ order, html }]
//   summaryCards: cartões na tela Início (ctx) → [{ order, html }]
//   init(ctx):    roda uma vez ao abrir o app (registrar ações, escutar eventos)
//
// Para criar uma funcionalidade nova basta escrever um módulo em src/modules/
// e incluí-lo em src/modules/index.js. Nenhum outro arquivo precisa mudar.

const modules = [];
const byOrder = (a, b) => (a.order ?? 50) - (b.order ?? 50);

export function registerModule(mod) {
  if (!mod || !mod.id) throw new Error("Módulo sem id.");
  if (modules.some((m) => m.id === mod.id)) throw new Error(`Módulo "${mod.id}" já registrado.`);
  modules.push(mod);
}

export function initModules(ctx) {
  for (const mod of modules) mod.init?.(ctx);
}

/** Primeira tela de bloqueio/cadastro que quer aparecer agora, ou null. */
export function renderGate(ctx) {
  const gates = modules
    .filter((m) => m.gate)
    .map((m) => m.gate)
    .sort(byOrder);
  for (const gate of gates) {
    const html = gate.render(ctx);
    if (html) return html;
  }
  return null;
}

export const getTabs = () =>
  modules
    .filter((m) => m.tab)
    .map((m) => ({ id: m.id, ...m.tab }))
    .sort(byOrder);

export const getSettingsSections = () =>
  modules
    .filter((m) => m.settings)
    .map((m) => ({ id: m.id, ...m.settings }))
    .sort(byOrder);

export const getNavActions = (ctx) => modules.flatMap((m) => m.navActions?.(ctx) || []).sort(byOrder);

export const getSummaryCards = (ctx) => modules.flatMap((m) => m.summaryCards?.(ctx) || []).sort(byOrder);
