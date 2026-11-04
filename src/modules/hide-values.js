// Módulo: esconder valores (botão de olho na barra superior).
// Útil para abrir o app perto de outras pessoas sem mostrar quanto tem.

import { registerActions } from "../core/actions.js";
import { events } from "../core/events.js";
import { icon } from "../ui/icons.js";

const applyHidden = (hidden) => document.documentElement.classList.toggle("hide-values", !!hidden);

const eyeButton = (hidden) =>
  `<button class="eye" data-action="values:toggle" aria-pressed="${hidden}" aria-label="${hidden ? "Mostrar valores" : "Esconder valores"}">${icon(hidden ? "eyeOff" : "eye")}</button>`;

export default {
  id: "hide-values",
  navActions: (ctx) => [{ order: 10, html: eyeButton(!!ctx.store.state.settings.hideValues) }],
  init(ctx) {
    const { store, ui } = ctx;
    applyHidden(store.state.settings.hideValues);
    events.on("data:changed", () => applyHidden(store.state.settings.hideValues));
    registerActions({
      "values:toggle": () => {
        const hidden = !store.state.settings.hideValues;
        store.setSetting("hideValues", hidden);
        ui.toast(hidden ? "Valores escondidos" : "Valores visíveis");
      },
    });
  },
};
