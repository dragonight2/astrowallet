// Escolhe a plataforma: app instalado (native) ou prévia no navegador (web).
// Todas oferecem a mesma interface: { kind, storage, auth, share, onBackground }.
// O resto do app não sabe em qual está rodando.

import { Capacitor } from "@capacitor/core";

export async function createPlatform() {
  if (Capacitor.isNativePlatform()) {
    const { createNativePlatform } = await import("./native.js");
    return createNativePlatform();
  }
  const { createWebPlatform } = await import("./web.js");
  return createWebPlatform();
}

/** Cria um arquivo para compartilhar (ou null se o navegador não permitir). */
export function makeFile(content, name, type) {
  try {
    return new File([content], name, { type });
  } catch {
    return null;
  }
}
