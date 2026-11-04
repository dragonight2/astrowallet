// Ponto de partida do app.
//   1. escolhe a plataforma (celular ou navegador);
//   2. carrega os dados do aparelho;
//   3. se forem de uma versão anterior, guarda uma cópia e migra;
//   4. registra os módulos e desenha a tela.

import { startApp } from "./core/app.js";
import { registerModule } from "./core/modules.js";
import { createStore } from "./data/store.js";
import { SCHEMA_VERSION, needsMigration } from "./data/schema.js";
import { MODULES } from "./modules/index.js";
import { createPlatform } from "./platform/index.js";

MODULES.forEach(registerModule);

async function boot() {
  const platform = await createPlatform();

  let saved = null;
  let recovery = null;
  try {
    saved = await platform.storage.load();
  } catch (err) {
    if (err?.name !== "DataUnreadableError") throw err;
    recovery = { reason: err.reason };
  }

  const migrating = needsMigration(saved);
  if (migrating) {
    try {
      await platform.storage.snapshot(saved, `antes-da-versao-${SCHEMA_VERSION}`);
    } catch (err) {
      console.warn("Cópia antes da atualização falhou", err);
    }
  }

  const store = createStore(platform.storage, saved);
  if (migrating) await platform.storage.save(store.state);

  startApp({
    store,
    root: document.getElementById("app"),
    layer: document.getElementById("layer"),
    services: {
      platform,
      auth: platform.auth,
      share: platform.share,
      recovery,
      recoveredFrom: platform.storage.recoveredFrom || null,
    },
  });
}

boot().catch((err) => {
  console.error(err);
  document.getElementById("app").innerHTML =
    '<div style="padding:40px 24px;font-family:system-ui;text-align:center"><h2>O app não abriu</h2><p>Feche e abra de novo. Seus dados não foram alterados.</p></div>';
});
