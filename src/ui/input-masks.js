// Formatação automática enquanto a pessoa digita:
//   data-money → valores "1.234,56"
//   data-name  → nomes com iniciais maiúsculas

import { pad2 } from "../core/format.js";

const NAME_PARTICLES = new Set(["da", "das", "de", "do", "dos", "e", "di", "du", "del", "van", "von"]);

const capitalizeHyphenated = (word) =>
  word
    .split("-")
    .map((part) => part && part[0].toLocaleUpperCase("pt-BR") + part.slice(1))
    .join("-");

/** "maria DA silva" → "Maria da Silva" (usado ao salvar o nome). */
export function normalizeName(text) {
  return String(text || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR")
    .split(" ")
    .map((word, i) => (i > 0 && NAME_PARTICLES.has(word) ? word : capitalizeHyphenated(word)))
    .join(" ");
}

/** Deixa maiúscula a primeira letra de cada palavra, sem mexer no resto (enquanto digita). */
function capitalizeWords(text) {
  return String(text || "").replace(
    new RegExp("(^|[\\s-])(\\p{Ll})", "gu"),
    (_, before, letter) => before + letter.toLocaleUpperCase("pt-BR"),
  );
}

/** Só dígitos → "1.234,56" (os dois últimos dígitos são os centavos). */
function maskMoney(text) {
  const digits = String(text || "")
    .replace(/\D/g, "")
    .replace(/^0+/, "")
    .slice(0, 13);
  if (!digits) return "";
  const n = Number(digits);
  return `${Math.floor(n / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${pad2(n % 100)}`;
}

export function applyInputMask(input) {
  if (input.hasAttribute("data-money")) {
    const masked = maskMoney(input.value);
    if (masked !== input.value) {
      input.value = masked;
      const end = masked.length;
      try {
        input.setSelectionRange(end, end);
      } catch {}
    }
  } else if (input.hasAttribute("data-name")) {
    const caret = input.selectionStart;
    const capitalized = capitalizeWords(input.value);
    if (capitalized !== input.value) {
      input.value = capitalized;
      try {
        input.setSelectionRange(caret, caret);
      } catch {}
    }
  }
}
