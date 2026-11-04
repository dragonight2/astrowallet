// Registro de ações.
// Botões e campos dizem o que fazem com atributos (data-action, data-change,
// data-input, data-submit) e cada módulo registra o código dessas ações aqui.
// Assim o HTML das telas não carrega código, e um módulo novo só precisa
// registrar as próprias ações.

const handlers = new Map();

/** Registra várias ações de uma vez: { "nome:da-acao": (elemento, evento) => … } */
export function registerActions(map) {
  for (const [name, handler] of Object.entries(map)) {
    if (handlers.has(name)) console.warn(`Ação "${name}" registrada duas vezes; a última vale.`);
    handlers.set(name, handler);
  }
}

/** Executa uma ação pelo nome. */
export function runAction(name, element, event) {
  const handler = handlers.get(name);
  if (!handler) {
    console.warn(`Ação desconhecida: ${name}`);
    return;
  }
  return handler(element, event);
}
