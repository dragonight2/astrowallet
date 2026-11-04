// Barramento de eventos do app.
// Os módulos conversam entre si por eventos ("entry:added", "data:changed"…),
// sem precisar importar uns aos outros. Um erro num ouvinte não derruba os demais.

const listeners = new Map();

export const events = {
  /** Escuta um evento. Devolve uma função que cancela a escuta. */
  on(name, handler) {
    if (!listeners.has(name)) listeners.set(name, new Set());
    listeners.get(name).add(handler);
    return () => listeners.get(name).delete(handler);
  },

  /** Avisa todos os ouvintes de um evento. */
  emit(name, payload) {
    for (const handler of listeners.get(name) || []) {
      try {
        handler(payload);
      } catch (err) {
        console.error(`[evento ${name}]`, err);
      }
    }
  },
};
