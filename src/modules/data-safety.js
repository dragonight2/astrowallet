// Módulo: segurança dos dados.
// Se os dados do aparelho não abrirem, mostra uma tela para restaurar um backup
// ou começar de novo — sem apagar os arquivos antigos. Também avisa quando
// não foi possível salvar (por exemplo, celular sem espaço).

import { registerActions } from "../core/actions.js";
import { events } from "../core/events.js";
import { brandLockup } from "../ui/brand.js";
import { icon } from "../ui/icons.js";

export default {
  id: "data-safety",
  gate: {
    order: -1,
    render(ctx) {
      const recovery = ctx.services.recovery;
      return recovery
        ? `
        <div class="gate-brand">${brandLockup("lg")}</div>
        <div class="gate-form">
          <h1>Não conseguimos abrir seus dados</h1>
          <p class="sub">Motivo: ${recovery.reason}. Seus arquivos não foram apagados — eles ficam guardados à parte neste aparelho.</p>
          <button class="btn" data-action="backup:import">${icon("download")} Restaurar de um backup</button>
          <button class="skip" data-action="recovery:fresh">Começar uma carteira nova</button>
        </div>`
        : null;
    },
  },
  init(ctx) {
    const { services, ui, store, app } = ctx;
    const leaveRecovery = () => {
      services.recovery = null;
      app.render();
    };
    events.on("store:imported", () => {
      if (services.recovery) leaveRecovery();
    });
    events.on("store:reset", () => {
      if (services.recovery) leaveRecovery();
    });
    events.on("storage:error", (err) => {
      console.error(err);
      ui.toast("Não foi possível salvar. Verifique se há espaço livre no celular.");
    });
    if (services.recoveredFrom) setTimeout(() => ui.toast("Recuperamos a última versão salva dos seus dados"), 600);

    registerActions({
      "recovery:fresh": () =>
        ui.confirmSheet({
          title: "Começar uma carteira nova?",
          text: "Os arquivos antigos continuam guardados à parte neste aparelho. Você poderá restaurar um backup depois, em Ajustes.",
          confirmLabel: "Começar do zero",
          onConfirm: () => store.reset(),
        }),
    });
  },
};
