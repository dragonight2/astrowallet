// Módulo: primeira entrada (cadastro em 3 passos).
//   0. nome e sobrenome
//   1. renda fixa mensal (pode pular)
//   2. proteger com digital ou PIN do celular (pode pular)
//   3. resumo e "Abrir minha carteira"

import { registerActions } from "../core/actions.js";
import { $, escapeHtml, setText } from "../core/dom.js";
import { events } from "../core/events.js";
import { clampDay, firstName, formatMoney, monthLabel, parseMoney } from "../core/format.js";
import { brandLockup, brandMark } from "../ui/brand.js";
import { icon } from "../ui/icons.js";
import { normalizeName } from "../ui/input-masks.js";

let step = 0;
const draft = { amount: "", day: "5", salary: 0 };

const resetDraft = () => {
  step = 0;
  Object.assign(draft, { amount: "", day: "5", salary: 0 });
};

const stepDots = (current) =>
  `<div class="dots" aria-label="Passo ${current + 1} de 3">${[0, 1, 2].map((i) => `<i class="${i === current ? "cur" : i < current ? "done" : ""}"></i>`).join("")}</div>`;

function onboardingScreen(ctx) {
  const { store, app } = ctx;
  const name = store.state.profile.name;
  const first = escapeHtml(firstName(name));

  if (step === 0)
    return `
    <div class="gate-brand">${brandLockup("lg")}<p>Sua carteira pessoal. Tudo fica guardado só no seu celular.</p></div>
    ${stepDots(0)}
    <div class="gate-form" data-submit="ob:name">
      <h1>Como você se chama?</h1>
      <p class="sub">Nome e sobrenome. É assim que você vai saber que esta carteira é sua.</p>
      <input id="ob-name" class="field" placeholder="Nome e sobrenome" autocomplete="name" autocapitalize="words" data-name value="${escapeHtml(name)}" autofocus>
      <p class="err" id="ob-err" role="alert"></p>
      <button class="btn" data-action="ob:name">Continuar ${icon("arrow")}</button>
    </div>`;

  if (step === 1)
    return `
    <div class="gate-brand">${brandMark("md")}</div>
    ${stepDots(1)}
    <div class="gate-form" data-submit="ob:salary">
      <h1>${first}, quanto você recebe por mês?</h1>
      <p class="sub">Seu salário ou outra renda fixa. Entra sozinho todo mês, a partir de ${monthLabel(app.month).toLowerCase()}.</p>
      <div class="amount"><span>R$</span><input id="ob-amount" class="num" inputmode="numeric" data-money placeholder="0,00" value="${escapeHtml(draft.amount)}" autofocus aria-label="Valor do salário"></div>
      <label class="lab" for="ob-day">Dia em que cai na conta</label>
      <input id="ob-day" class="field num" inputmode="numeric" maxlength="2" value="${escapeHtml(draft.day)}">
      <p class="err" id="ob-err" role="alert"></p>
      <button class="btn" data-action="ob:salary">${icon("check")} Salvar e continuar</button>
      <button class="skip" data-action="ob:skip-salary">Pular por enquanto</button>
    </div>`;

  if (step === 2)
    return `
    <div class="fp" id="ob-fp">${icon("finger")}</div>
    ${stepDots(2)}
    <div class="gate-form">
      <h1>Proteja sua carteira</h1>
      <p class="sub">Para entrar, o app vai pedir a sua digital ou o PIN do celular. Assim ninguém abre seus dados, mesmo com o celular desbloqueado.</p>
      <button class="btn" data-action="ob:protect">${icon("lock")} Usar digital ou PIN</button>
      <p class="err" id="ob-err" role="alert"></p>
      <button class="skip" data-action="ob:skip-lock">Agora não</button>
      ${ctx.services.auth.kind === "simulated" ? '<p class="note-light">Nesta prévia a digital é simulada. No app instalado, quem confirma é o celular.</p>' : ""}
    </div>`;

  const locked = store.state.settings.lock;
  return `
    <div class="gate-brand">${brandMark("lg")}<h1>Tudo pronto, ${first}!</h1></div>
    <div class="glass-card">
      <div class="sumrow">${icon("person")}<span>Carteira de ${escapeHtml(name)}</span></div>
      <div class="sumrow">${icon("repeat")}<span class="num">${draft.salary ? `Salário de ${formatMoney(draft.salary)} todo dia ${draft.day}` : "Salário: cadastre depois em Ajustes"}</span></div>
      <div class="sumrow">${icon(locked ? "lock" : "unlock")}<span>${locked ? "Entrada com digital ou PIN" : "Sem proteção (ative em Ajustes)"}</span></div>
    </div>
    <button class="btn" data-action="ob:open">${icon("arrow")} Abrir minha carteira</button>`;
}

export default {
  id: "onboarding",
  gate: { order: 2, render: (ctx) => (ctx.store.state.profile.onboarded ? null : onboardingScreen(ctx)) },
  init(ctx) {
    const { store, app, services } = ctx;
    events.on("store:reset", resetDraft);
    registerActions({
      "ob:name": () => {
        const name = normalizeName($("#ob-name").value);
        if (!name) return setText("ob-err", "Digite seu nome para criar sua carteira.");
        if (name.split(" ").length < 2) return setText("ob-err", "Digite nome e sobrenome.");
        step = 1;
        store.setProfile({ name });
      },
      "ob:salary": () => {
        draft.amount = $("#ob-amount").value;
        draft.day = $("#ob-day").value;
        const amount = parseMoney(draft.amount);
        if (!(amount > 0)) return setText("ob-err", "Digite um valor maior que zero, ou toque em “Pular por enquanto”.");
        const day = clampDay(draft.day);
        draft.day = String(day);
        draft.salary = amount;
        step = 2;
        store.addRecurring({
          type: "income",
          description: "Salário",
          amount,
          day,
          category_id: null,
          start_month: app.month,
        });
      },
      "ob:skip-salary": () => {
        step = 2;
        app.render();
      },
      "ob:protect": async (button) => {
        if (services.auth.isAvailable && !(await services.auth.isAvailable()))
          return setText(
            "ob-err",
            "Seu celular não tem digital nem PIN cadastrado. Cadastre nas configurações do celular ou toque em “Agora não”.",
          );
        button.disabled = true;
        if (!(await services.auth.authenticate("Proteger minha carteira"))) {
          button.disabled = false;
          return;
        }
        const fingerprint = $("#ob-fp");
        if (fingerprint) {
          fingerprint.classList.add("ok");
          fingerprint.innerHTML = icon("check");
        }
        setTimeout(() => {
          step = 3;
          store.setSetting("lock", true);
        }, 350);
      },
      "ob:skip-lock": () => {
        step = 3;
        store.setSetting("lock", false);
      },
      "ob:open": () => store.setProfile({ onboarded: true }),
    });
  },
};
