// Folhas que sobem da parte de baixo da tela (formulários, confirmações) e avisos rápidos.

import { registerActions } from "../core/actions.js";
import { escapeHtml } from "../core/dom.js";
import { icon } from "./icons.js";

let layer = null; // elemento #layer onde as folhas são desenhadas
let pendingConfirm = null; // o que fazer se a pessoa confirmar
let toastTimer = null;

export function mountSheetLayer(element) {
  layer = element;
  layer.addEventListener("click", (event) => {
    if (event.target.classList.contains("overlay")) closeSheet();
  });
}

export function openSheet(title, bodyHtml, { onMount } = {}) {
  layer.innerHTML = `<div class="overlay"><div class="sheet" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
    <div class="sheet-grip" aria-hidden="true"></div>
    <div class="sheet-hd wrap"><b>${escapeHtml(title)}</b><button class="iconbtn" data-action="sheet:close" aria-label="Fechar">${icon("x")}</button></div>
    <div class="sheet-bd wrap">${bodyHtml}</div></div></div>`;
  onMount?.(layer.querySelector(".sheet"));
  const focus = layer.querySelector("[autofocus]");
  if (focus) setTimeout(() => focus.focus(), 60);
}

export const isSheetOpen = () => !!layer?.innerHTML;

export function closeSheet() {
  if (layer) layer.innerHTML = "";
  pendingConfirm = null;
}

/** Pergunta de confirmação com botões Cancelar / confirmar. `text` já deve vir protegido. */
export function confirmSheet({ title, text, confirmLabel, onConfirm }) {
  openSheet(
    title,
    `<p class="muted">${text}</p>
    <div class="row2"><button class="btn ghost" data-action="sheet:close">Cancelar</button>
    <button class="btn danger" data-action="sheet:confirm">${escapeHtml(confirmLabel)}</button></div>`,
  );
  pendingConfirm = onConfirm;
}

/** Aviso rápido no rodapé, some sozinho em 2 segundos. */
export function toast(message) {
  if (layer?.querySelector(".pop")) return; // um pop-up de aviso já está na tela
  document.querySelector(".toast")?.remove();
  const el = document.createElement("div");
  el.className = "toast";
  el.setAttribute("role", "status");
  el.textContent = message;
  document.body.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 2000);
}

registerActions({
  "sheet:close": () => closeSheet(),
  "sheet:confirm": () => {
    const run = pendingConfirm;
    closeSheet();
    run?.();
  },
});
