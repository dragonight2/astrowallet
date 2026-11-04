// Módulo: aba Ajustes.
// Mostra o nome do dono e, abaixo, os blocos de configuração que os outros
// módulos oferecem (cada um decide o seu: Aparência, Segurança, Backup…).

import { registerActions } from "../core/actions.js";
import { escapeHtml } from "../core/dom.js";
import { getSettingsSections } from "../core/modules.js";
import { sectionTitle } from "../ui/components.js";
import { icon } from "../ui/icons.js";
import { normalizeName } from "../ui/input-masks.js";

export const APP_VERSION = "1.1.0";

function render(ctx) {
  const name = ctx.store.state.profile.name;
  return `
    ${sectionTitle("Dono da carteira")}
    <div class="card">
      <label class="setrow" for="set-name">
        <span class="ci">${icon("person")}</span>
        <input id="set-name" class="namefield" value="${escapeHtml(name)}" placeholder="Nome e sobrenome" autocomplete="name" autocapitalize="words" data-name data-change="profile:name">
        <span class="muted">${icon("edit")}</span>
      </label>
    </div>
    ${getSettingsSections()
      .map((section) => `<section>${sectionTitle(section.title)}${section.render(ctx)}</section>`)
      .join("")}
    <div class="credits">
      <p class="hint center">Astro Wallet · versão ${APP_VERSION}${ctx.services.platform?.kind === "native" ? "" : " · prévia web"}</p>
      <span>um sistema</span><img src="assets/astronous.png" alt="Astronous" width="112" height="12">
    </div>`;
}

export default {
  id: "settings",
  tab: { label: "Ajustes", icon: "gear", order: 50, render },
  init(ctx) {
    registerActions({
      "profile:name": (input) => {
        const name = normalizeName(input.value);
        if (!name || name === ctx.store.state.profile.name) return ctx.app.render();
        ctx.store.setProfile({ name });
        ctx.ui.toast("Nome atualizado");
      },
    });
  },
};
