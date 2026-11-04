// Lista de módulos do app. Para criar uma funcionalidade nova:
//   1. escreva o módulo em src/modules/<nome>.js (veja src/core/modules.js);
//   2. importe e acrescente aqui.
// A ordem na tela é definida pelo campo `order` de cada módulo, não por esta lista.

import appearance from "./appearance.js";
import backup from "./backup.js";
import dataSafety from "./data-safety.js";
import hideValues from "./hide-values.js";
import limits from "./limits.js";
import lock from "./lock.js";
import onboarding from "./onboarding.js";
import reports from "./reports/index.js";
import settings from "./settings.js";
import summary from "./summary.js";
import terms from "./terms.js";
import transactions from "./transactions.js";

export const MODULES = [
  dataSafety,
  terms,
  onboarding,
  lock,
  summary,
  transactions,
  limits,
  reports,
  settings,
  appearance,
  hideValues,
  backup,
];
