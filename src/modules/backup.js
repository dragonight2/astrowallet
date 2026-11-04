// Módulo: Backup e dados.
//   Exportar: o backup sai SEMPRE protegido por senha (veja data/backup-crypto.js)
//             e pode ser baixado ou compartilhado.
//   Restaurar: aceita backups protegidos (pede a senha) e os antigos, sem senha.
//   Apagar tudo.

import { registerActions } from "../core/actions.js";
import { $, escapeHtml, setText } from "../core/dom.js";
import { MIN_PASSWORD_LENGTH, WrongPasswordError, isProtectedBackup, openProtectedBackup, protectBackup } from "../data/backup-crypto.js";
import { makeFile } from "../platform/index.js";
import { icon } from "../ui/icons.js";

let exported = null; // { text, name } do último backup gerado, enquanto a folha de opções está aberta

const showPasswordToggle = (ids) =>
  `<label class="showpass"><input type="checkbox" data-change="backup:showpass" data-for="${ids.join(",")}"> Mostrar senha</label>`;

function exportForm() {
  return `<div class="form" data-submit="backup:protect">
    <p class="hint">O backup sai protegido por uma senha. Com ela, só você consegue abrir o arquivo, mesmo que ele seja enviado pelo WhatsApp ou guardado na nuvem.</p>
    <label class="lab" for="bk-pass1">Crie uma senha para o backup</label>
    <input id="bk-pass1" class="field" type="password" autocomplete="new-password" placeholder="Pelo menos ${MIN_PASSWORD_LENGTH} caracteres" autofocus>
    <label class="lab" for="bk-pass2">Repita a senha</label>
    <input id="bk-pass2" class="field" type="password" autocomplete="new-password" placeholder="A mesma senha">
    ${showPasswordToggle(["bk-pass1", "bk-pass2"])}
    <div class="note warnnote">${icon("alert")}<p><b>Guarde essa senha.</b> Sem ela não é possível restaurar o backup, e ninguém (nem a Astro Wallet) consegue recuperá-la.</p></div>
    <p class="err" id="bk-err" role="alert"></p>
    <button class="btn" data-action="backup:protect">${icon("lock")} Criar backup protegido</button>
  </div>`;
}

function exportOptions() {
  return `<div class="pop">
    <div class="pop-ic">${icon("shield")}</div>
    <h2>Backup protegido pronto</h2>
    <p class="muted">${escapeHtml(exported.name)} · ${Math.max(1, Math.round(exported.text.length / 1024))} KB</p>
    <div class="row2">
      <button class="btn soft" data-action="backup:download">${icon("download")} Baixar</button>
      <button class="btn" data-action="backup:send">${icon("share")} Compartilhar</button>
    </div>
    <p class="hint center">Guarde em mais de um lugar (por exemplo, no Drive e no seu e-mail). Para restaurar, você vai precisar da senha.</p>
  </div>`;
}

function restoreForm() {
  return `<div class="form" data-submit="backup:restore">
    <p class="hint">Escolha o arquivo de backup ou cole o texto dele. Tudo o que está no app agora será substituído.</p>
    <label class="btn soft" for="bk-file">${icon("file")} Escolher arquivo</label>
    <input id="bk-file" type="file" accept=".json,application/json,text/plain" data-change="backup:file" hidden>
    <textarea id="bk-in" class="field mono" placeholder="{&quot;app&quot;:&quot;astro-wallet&quot;, …}" data-input="backup:check"></textarea>
    <div id="bk-pass-wrap" class="form" hidden>
      <label class="lab" for="bk-pass">Senha do backup</label>
      <input id="bk-pass" class="field" type="password" autocomplete="current-password" placeholder="A senha criada ao exportar">
      ${showPasswordToggle(["bk-pass"])}
    </div>
    <p class="err" id="bk-err" role="alert"></p>
    <button class="btn" data-action="backup:restore">${icon("check")} Restaurar</button>
  </div>`;
}

/** Mostra o campo de senha quando o texto colado/escolhido é um backup protegido. */
function syncPasswordField() {
  const isProtected = isProtectedBackup($("#bk-in")?.value.trim() || "");
  const wrap = $("#bk-pass-wrap");
  if (wrap) wrap.hidden = !isProtected;
  return isProtected;
}

export default {
  id: "backup",
  settings: {
    title: "Backup e dados",
    order: 90,
    render: () => `<div class="card stack">
      <p class="hint">Como nada sai do celular, se você trocar ou perder o aparelho os dados vão junto. Exporte um backup de vez em quando e guarde onde preferir. Ele sai protegido por senha.</p>
      <div class="row2">
        <button class="btn soft" data-action="backup:export">${icon("share")} Exportar</button>
        <button class="btn soft" data-action="backup:import">${icon("download")} Restaurar</button>
      </div>
      <button class="btn danger" data-action="backup:wipe">${icon("trash")} Apagar todos os dados</button>
    </div>`,
  },
  init(ctx) {
    const { store, ui, services } = ctx;
    registerActions({
      "backup:export": () => ui.openSheet("Exportar backup", exportForm()),

      "backup:showpass": (checkbox) => {
        for (const id of checkbox.dataset.for.split(",")) {
          const input = document.getElementById(id);
          if (input) input.type = checkbox.checked ? "text" : "password";
        }
      },

      "backup:protect": async () => {
        const pass1 = $("#bk-pass1").value;
        const pass2 = $("#bk-pass2").value;
        if (pass1.length < MIN_PASSWORD_LENGTH) return setText("bk-err", `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
        if (pass1 !== pass2) return setText("bk-err", "As duas senhas não são iguais.");
        const button = document.querySelector('[data-action="backup:protect"]');
        button.disabled = true;
        setText("bk-err", "");
        button.textContent = "Protegendo…";
        try {
          const date = new Date().toISOString().slice(0, 10);
          exported = { text: await protectBackup(store.exportJSON(), pass1), name: `astro-wallet-backup-${date}.json` };
        } catch (err) {
          console.error(err);
          button.disabled = false;
          button.textContent = "Criar backup protegido";
          return setText("bk-err", "Não foi possível criar o backup. Tente de novo.");
        }
        ui.openSheet("Exportar backup", exportOptions());
      },

      "backup:download": async (button) => {
        if (!exported) return;
        button.disabled = true;
        const saved = await services.platform.files.save(new Blob([exported.text], { type: "application/json" }), exported.name);
        button.disabled = false;
        if (!saved.ok) return ui.toast("Não foi possível salvar. Tente Compartilhar.");
        ui.closeSheet();
        ui.toast(`Backup salvo em ${saved.where}`);
      },

      "backup:send": async (button) => {
        if (!exported) return;
        button.disabled = true;
        const result = await services.share.share({
          title: "Backup Astro Wallet",
          text: "Backup protegido da Astro Wallet. Para restaurar, use a senha criada ao exportar.",
          file: makeFile(exported.text, exported.name, "application/json"),
        });
        button.disabled = false;
        if (result === "shared") {
          ui.closeSheet();
          return ui.toast("Backup compartilhado");
        }
        if (result !== "cancelled")
          ui.openSheet(
            "Exportar backup",
            `<div class="form">
        <p class="hint">Este navegador não abriu o menu de compartilhamento. Baixe o arquivo ou copie o texto abaixo (ele continua protegido pela senha).</p>
        <button class="btn" data-action="backup:download">${icon("download")} Baixar</button>
        <textarea id="bk-out" class="field mono" readonly>${escapeHtml(exported.text)}</textarea>
        <button class="btn soft" data-action="backup:copy">${icon("copy")} Copiar</button></div>`,
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

      "backup:import": () => ui.openSheet("Restaurar backup", restoreForm()),

      "backup:file": (input) => {
        const file = input.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          $("#bk-in").value = String(reader.result || "");
          if (syncPasswordField()) $("#bk-pass").focus();
        };
        reader.readAsText(file);
      },

      "backup:check": () => syncPasswordField(),

      "backup:restore": async () => {
        let text = $("#bk-in").value.trim();
        if (!text) return setText("bk-err", "Escolha o arquivo do backup ou cole o texto dele.");
        if (syncPasswordField()) {
          const password = $("#bk-pass").value;
          if (!password) {
            $("#bk-pass").focus();
            return setText("bk-err", "Este backup tem senha. Digite a senha criada ao exportar.");
          }
          const button = document.querySelector('[data-action="backup:restore"]');
          button.disabled = true;
          try {
            text = await openProtectedBackup(text, password);
          } catch (err) {
            button.disabled = false;
            return setText(
              "bk-err",
              err instanceof WrongPasswordError ? "Senha incorreta. Confira e tente de novo." : "Backup inválido. Confira se escolheu o arquivo certo.",
            );
          }
          button.disabled = false;
        }
        try {
          const { skipped } = store.importJSON(text);
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
