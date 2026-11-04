// Módulo: Aparência (tema claro ou escuro).
// O padrão é claro; o escuro só liga quando a pessoa escolhe em Ajustes.

import { registerActions } from "../core/actions.js";
import { events } from "../core/events.js";
import { icon } from "../ui/icons.js";

function applyTheme(theme) {
  const dark = theme === "dark";
  document.documentElement.classList.toggle("app-dark", dark);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = dark ? "#000000" : "#FFFFFF";
  // Lembrete só do tema, para a tela de abertura já abrir na cor certa (assets/theme-boot.js).
  try {
    localStorage.setItem("astro-wallet:theme", dark ? "dark" : "light");
  } catch {}
}

export default {
  id: "appearance",
  settings: {
    title: "Aparência",
    order: 5,
    render(ctx) {
      const dark = ctx.store.state.settings.theme === "dark";
      const option = (id, label, iconName, on) => `<button class="${on ? "on" : ""}" data-action="theme:set" data-theme-id="${id}" aria-pressed="${on}">
        <span class="prev ${id}"><i></i><i></i><i></i></span><span>${icon(iconName)} ${label}</span></button>`;
      return `<div class="card"><div class="theme-pick">${option("light", "Claro", "sun", !dark)}${option("dark", "Escuro", "moon", dark)}</div></div>`;
    },
  },
  init(ctx) {
    const { store } = ctx;
    applyTheme(store.state.settings.theme);
    events.on("settings:changed", ({ key, value }) => {
      if (key === "theme") applyTheme(value);
    });
    events.on("store:reset", () => applyTheme("light"));
    events.on("store:imported", () => applyTheme(store.state.settings.theme));
    registerActions({
      "theme:set": (button) => {
        const theme = button.dataset.themeId;
        if (theme !== (store.state.settings.theme || "light")) store.setSetting("theme", theme);
      },
    });
  },
};
