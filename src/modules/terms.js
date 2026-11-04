// Módulo: Termos de Uso.
// Pede o aceite antes do primeiro uso e de novo sempre que TERMS_VERSION mudar.

import { registerActions } from "../core/actions.js";
import { $ } from "../core/dom.js";
import { brandLockup } from "../ui/brand.js";
import { icon } from "../ui/icons.js";

const TERMS_VERSION = "1.0";
const TERMS_DATE = "3 de novembro de 2026";

const SECTIONS = [
  {
    title: "1. O que é a Astro Wallet",
    body: "A Astro Wallet é um aplicativo de organização financeira pessoal. Ela permite registrar receitas, despesas, contas fixas e limites de gastos, e gerar relatórios a partir dessas informações. O uso é pessoal e não comercial.",
  },
  {
    title: "2. Onde ficam os seus dados",
    body: "Todas as informações que você cadastra ficam guardadas exclusivamente no seu aparelho. A Astro Wallet não possui servidor para os seus dados, não exige conta ou login e não envia, coleta, vende ou compartilha suas informações. Nós não temos acesso a nada do que você registra.",
  },
  {
    title: "3. Sua responsabilidade",
    body: "Você é o único responsável pelas informações que insere no aplicativo, pela exatidão desses dados e pelo uso que faz deles. Também é sua responsabilidade manter o aparelho protegido (senha, digital ou PIN), ativar a proteção de entrada do app se desejar, e fazer cópias de segurança (backup) sempre que achar necessário.",
  },
  {
    title: "4. Perda de dados",
    body: "Como os dados ficam apenas no aparelho, eles podem ser perdidos se o aplicativo for desinstalado, se os dados do aparelho forem apagados, ou se o aparelho for perdido, roubado, danificado ou trocado sem que você tenha feito um backup. A Astro Wallet não consegue recuperar informações perdidas.",
  },
  {
    title: "5. Compartilhamento feito por você",
    body: "Relatórios e backups só saem do aparelho quando você mesmo escolhe compartilhá-los, usando as opções do sistema do celular (por exemplo, WhatsApp, e-mail ou armazenamento em nuvem). A partir desse momento, o conteúdo fica sujeito às regras do serviço que você escolheu, e a responsabilidade pelo destino desses arquivos é sua.",
  },
  {
    title: "6. Não é aconselhamento financeiro",
    body: "Os números, avisos de limite e relatórios são apenas organizados a partir do que você informou. Eles não constituem consultoria ou recomendação financeira, contábil, fiscal ou de investimentos. Decisões tomadas com base no aplicativo são de sua inteira responsabilidade.",
  },
  {
    title: "7. Limitação de responsabilidade",
    body: "O aplicativo é oferecido no estado em que se encontra. Na máxima extensão permitida pela lei, a Astro Wallet e seus responsáveis não se responsabilizam pelos dados inseridos pelo usuário, por erros de digitação ou de cálculo decorrentes dessas informações, por perda de dados, por falhas do aparelho ou do sistema operacional, nem por prejuízos diretos ou indiretos resultantes do uso ou da impossibilidade de uso do aplicativo.",
  },
  {
    title: "8. Privacidade e LGPD",
    body: "Como não coletamos nem tratamos seus dados pessoais em servidores, o controle das informações é seu. Você pode apagar todos os dados a qualquer momento em Ajustes > Backup e dados > Apagar todos os dados, ou desinstalando o aplicativo.",
  },
  {
    title: "9. Atualizações destes termos",
    body: "Estes termos podem ser atualizados para acompanhar melhorias do aplicativo ou mudanças na lei. Quando isso acontecer, o app mostrará a nova versão e pedirá um novo aceite antes de continuar.",
  },
];

const hasAcceptedCurrent = (state) => state.profile.terms?.version === TERMS_VERSION;

const termsText = () => `
  <p class="terms-meta">Versão ${TERMS_VERSION} · ${TERMS_DATE}</p>
  ${SECTIONS.map((s) => `<h3>${s.title}</h3><p>${s.body}</p>`).join("")}`;

function termsGate(ctx) {
  if (hasAcceptedCurrent(ctx.store.state)) return null;
  const isUpdate = !!ctx.store.state.profile.terms;
  return `
    <div class="gate-brand">${brandLockup("lg")}</div>
    <div class="safe">
      <h1>${isUpdate ? "Os termos foram atualizados" : "Seus dados ficam 100% no seu celular"}</h1>
      <p class="sub">${isUpdate ? "Leia a nova versão e aceite para continuar usando a Astro Wallet." : "A Astro Wallet foi feita para que ninguém além de você veja suas finanças."}</p>
      ${
        isUpdate
          ? ""
          : `<ul class="safe-list">
        <li><span>${icon("shield")}</span><div><b>Guardados só no aparelho</b><small>Sem servidor, sem conta, sem login. Nada é enviado pela internet.</small></div></li>
        <li><span>${icon("finger")}</span><div><b>Protegidos pela sua digital ou PIN</b><small>Só abre com o desbloqueio do seu celular, se você ativar.</small></div></li>
        <li><span>${icon("share")}</span><div><b>Só saem se você quiser</b><small>Relatórios e backups saem apenas quando você compartilha.</small></div></li>
      </ul>`
      }
    </div>
    <div class="terms">
      <div class="terms-hd"><b>Termos de Uso</b><span>role para ler</span></div>
      <div class="terms-box" tabindex="0" aria-label="Texto dos Termos de Uso">${termsText()}</div>
    </div>
    <label class="check" for="terms-ok">
      <input id="terms-ok" type="checkbox" data-change="terms:check">
      <span class="box">${icon("check")}</span>
      <span>Li e aceito os Termos de Uso. Entendo que sou o único responsável pelos dados que inserir e que a Astro Wallet não se responsabiliza por essas informações.</span>
    </label>
    <button class="btn" id="terms-go" data-action="terms:accept" disabled>Aceitar e continuar</button>`;
}

export default {
  id: "terms",
  gate: { order: 1, render: termsGate },
  settings: {
    title: "Termos e privacidade",
    order: 80,
    render(ctx) {
      const terms = ctx.store.state.profile.terms;
      const acceptedOn = terms?.acceptedAt ? new Date(terms.acceptedAt).toLocaleDateString("pt-BR") : null;
      return `<div class="card list">
        <button class="setrow" data-action="terms:view">
          <span class="ci">${icon("file")}</span>
          <span class="setrow-m"><b>Termos de Uso</b><span>Versão ${TERMS_VERSION}${acceptedOn ? ` · aceitos em ${acceptedOn}` : ""}</span></span>
          <span class="muted">${icon("right")}</span>
        </button>
      </div>`;
    },
  },
  init(ctx) {
    const { store, ui } = ctx;
    registerActions({
      "terms:check": (checkbox) => {
        $("#terms-go").disabled = !checkbox.checked;
      },
      "terms:accept": () => {
        if ($("#terms-ok")?.checked)
          store.setProfile({ terms: { version: TERMS_VERSION, acceptedAt: new Date().toISOString() } });
      },
      "terms:view": () => ui.openSheet("Termos de Uso", `<div class="terms-box full">${termsText()}</div>`),
    });
  },
};
