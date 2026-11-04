// Módulo: bloqueio com digital ou PIN do celular.
// Quando ativado, o app abre bloqueado e volta a bloquear sempre que vai
// para segundo plano. Quem confirma a identidade é o próprio sistema do celular.

import { registerActions } from "../core/actions.js";
import { $, escapeHtml } from "../core/dom.js";
import { firstName } from "../core/format.js";
import { brandLockup } from "../ui/brand.js";
import { icon } from "../ui/icons.js";

let locked = false;

export default {
  id: "lock",
  gate: {
    order: 0,
    render(ctx) {
      if (!locked) return null;
      const first = escapeHtml(firstName(ctx.store.state.profile.name));
      return `
        <div class="gate-brand">${brandLockup("lg")}</div>
        <div class="gate-form lock">
          <h1>${first ? `Olá, ${first}` : "Olá"}</h1>
          <p class="sub">Use sua digital ou o PIN do celular para abrir sua carteira.</p>
          <div class="fp" id="lk-fp">${icon("finger")}</div>
          <button class="btn" data-action="lock:unlock">${icon("finger")} Entrar</button>
          <p class="err" id="lk-err" role="alert"></p>
          ${ctx.services.auth.kind === "simulated" ? '<p class="note-light">Prévia: toque em Entrar para simular a digital.</p>' : ""}
        </div>`;
    },
  },
  settings: {
    title: "Segurança",
    order: 30,
    render(ctx) {
      const on = !!ctx.store.state.settings.lock;
      return `<div class="card">
        <div class="setrow">
          <span class="ci">${icon("finger")}</span>
          <span class="setrow-m"><b>Entrar com digital ou PIN</b><span>Pede a digital, o rosto ou o PIN do celular ao abrir</span></span>
          <button class="switch ${on ? "on" : ""}" role="switch" aria-checked="${on}" data-action="lock:toggle" aria-label="Entrar com digital ou PIN"></button>
        </div>
        <div class="note">${icon("shield")}<p>Na Astro Wallet seus dados ficam só no celular: sem servidor, sem conta, sem envio pela internet.${ctx.services.platform?.kind === "native" ? " Ficam criptografados (AES-256) e a chave fica protegida pelo sistema do celular." : " Nesta prévia ficam só neste navegador."}</p></div>
      </div>`;
    },
  },
  init(ctx) {
    const { store, services, app, ui } = ctx;
    const lockEnabled = () => store.state.profile.onboarded && store.state.settings.lock;

    locked = lockEnabled();
    ctx.services.platform?.onBackground(() => {
      if (lockEnabled() && !locked) {
        locked = true;
        ui.closeSheet();
        app.render();
      }
    });

    registerActions({
      "lock:unlock": async (button) => {
        button.disabled = true;
        if (!(await services.auth.authenticate("Entrar na Astro Wallet"))) {
          button.disabled = false;
          const error = $("#lk-err");
          if (error) error.textContent = "Não foi possível confirmar. Tente de novo.";
          return;
        }
        const fingerprint = $("#lk-fp");
        if (fingerprint) {
          fingerprint.classList.add("ok");
          fingerprint.innerHTML = icon("check");
        }
        setTimeout(() => {
          locked = false;
          app.render();
        }, 300);
      },
      "lock:toggle": async () => {
        const turnOn = !store.state.settings.lock;
        if (turnOn) {
          if (services.auth.isAvailable && !(await services.auth.isAvailable()))
            return ui.toast("Cadastre uma digital ou um PIN nas configurações do celular primeiro");
          if (!(await services.auth.authenticate("Ativar proteção"))) return;
        }
        store.setSetting("lock", turnOn);
        ui.toast(turnOn ? "Entrada com digital ou PIN ativada" : "Proteção desativada");
      },
    });
  },
};
