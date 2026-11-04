// Atalhos para o HTML.

export const $ = (selector, root = document) => root.querySelector(selector);

/**
 * Protege texto antes de colocá-lo no HTML.
 * TODO texto que veio do usuário (nomes, descrições) passa por aqui,
 * para que ninguém consiga injetar código pela tela.
 */
export const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch],
  );

/** Escreve um texto (sem HTML) num elemento pelo id, se ele existir. */
export function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}
