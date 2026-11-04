// Módulo: Backup e dados.
// Exportar (pelo compartilhamento do celular), restaurar de um arquivo e apagar tudo.

import { registerActions } from "../core/actions.js";
import { $, escapeHtml, setText } from "../core/dom.js";
import { makeFile } from "../platform/index.js";
import { icon } from "../ui/icons.js";

export default {
  id: "backup",
  settings: {
    title: "Backup e dados",
    order: 90,
    render: () => `<div class="card stack">
      <p class="hint">Como nada sai do celular, se você trocar ou perder o aparelho os dados vão junto. Exporte um backup de vez em quando e guarde onde preferir.</p>
      <div class="row2">
        <button class="btn soft" data-action="backup:export">${icon("share")} Exportar</button>
        <button class="btn soft" data-action="backup:import">${icon("download")} Restaurar</button>
      </div>
      <button class="btn danger" data-action="backup:wipe">${icon("trash")} Apagar todos os dados</button>
    </div>`,
  },
  init(ctx) {
    const { store, ui } = ctx;
    registerActions({
      "backup:export": async (button) => {
        const json = store.exportJSON();
        const date = new Date().toISOString().slice(0, 10);
        button.disabled = true;
        const result = await ctx.services.share.share({
          title: "Backup Astro Wallet",
          text: "Backup da Astro Wallet. Guarde este arquivo para restaurar seus dados.",
          file: makeFile(json, `astro-wallet-backup-${date}.json`, "application/json"),
        });
        button.disabled = false;
        if (result === "shared") return ui.toast("Backup compartilhado");
        if (result !== "cancelled")
          ui.openSheet(
            "Exportar backup",
            `<div class="form">
        <p class="hint">Este navegador não abriu o menu de compartilhamento. Copie o texto abaixo e guarde onde preferir.</p>
        <textarea id="bk-out" class="field mono" readonly>${escapeHtml(store.exportJSON())}</textarea>
        <button class="btn" data-action="backup:copy">${icon("copy")} Copiar</button></div>`,
          );
      },
      "backup:copy": async () => {
        const textarea = $("#bk-out");
        try {
          await navigator.clipboard.writeText(textarea.value);
          ui.toast("Backup copiado");
        } catch {
          textarea.focus();
          textarea.select();
          ui.toast("Texto selecionado: copie com Ctrl+C");
        }
      },
      "backup:import": () =>
        ui.openSheet(
          "Restaurar backup",
          `<div class="form">
        <p class="hint">Escolha o arquivo de backup ou cole o texto dele. Tudo o que está no app agora será substituído.</p>
        <label class="btn soft" for="bk-file">${icon("file")} Escolher arquivo</label>
        <input id="bk-file" type="file" accept=".json,application/json" data-change="backup:file" hidden>
        <textarea id="bk-in" class="field mono" placeholder="{&quot;app&quot;:&quot;astro-wallet&quot;, …}" autofocus></textarea>
        <p class="err" id="bk-err" role="alert"></p>
        <button class="btn" data-action="backup:restore">${icon("check")} Restaurar</button></div>`,
        ),
      "backup:file": (input) => {
        const file = input.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          $("#bk-in").value = String(reader.result || "");
        };
        reader.readAsText(file);
      },
      "backup:restore": () => {
        try {
          const { skipped } = store.importJSON($("#bk-in").value.trim());
          ui.closeSheet();
          ui.toast(skipped ? `Backup restaurado (${skipped} lançamento(s) inválido(s) ignorado(s))` : "Backup restaurado");
        } catch (err) {
          setText(
            "bk-err",
            /versão mais nova|grande demais/.test(err?.message)
              ? err.message
              : "Backup inválido. Confira se escolheu o arquivo certo ou colou o texto completo.",
          );
        }
      },
      "backup:wipe": () =>
        ui.confirmSheet({
          title: "Apagar todos os dados?",
          text: "Lançamentos, receitas fixas, áreas, limites e seu nome serão apagados. O app volta para a tela de boas-vindas.",
          confirmLabel: "Apagar tudo",
          onConfirm: () => {
            ctx.app.go("summary");
            store.reset();
          },
        }),
    });
  },
};
