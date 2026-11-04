// Criptografia dos dados no celular: AES-256-GCM (biblioteca @noble/ciphers, auditada).
// A chave de 256 bits é gerada no próprio aparelho e guardada no cofre do sistema
// (Android Keystore / iOS Keychain) — veja platform/native.js.
// O GCM também detecta qualquer alteração no arquivo: se alguém mexer, a leitura falha.

import { gcm } from "@noble/ciphers/aes.js";
import { randomBytes } from "@noble/ciphers/utils.js";

const AAD = new TextEncoder().encode("astro-wallet:v1"); // amarra o arquivo a este app
const FILE_TAG = "astro-wallet";

export const newDataKey = () => randomBytes(32);

export function bytesToBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(binary);
}

export function base64ToBytes(text) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Texto → arquivo cifrado (JSON com iv e conteúdo cifrado). Um iv novo a cada gravação. */
export function encryptText(text, key) {
  const iv = randomBytes(12);
  const ciphertext = gcm(key, iv, AAD).encrypt(new TextEncoder().encode(text));
  return JSON.stringify({ f: FILE_TAG, v: 1, alg: "AES-256-GCM", iv: bytesToBase64(iv), ct: bytesToBase64(ciphertext) });
}

/** Arquivo cifrado → texto. Lança erro se a chave estiver errada ou o arquivo foi alterado. */
export function decryptText(fileText, key) {
  const file = JSON.parse(fileText);
  if (file?.f !== FILE_TAG || file.v !== 1) throw new Error("Formato de arquivo desconhecido");
  const plain = gcm(key, base64ToBytes(file.iv), AAD).decrypt(base64ToBytes(file.ct));
  return new TextDecoder().decode(plain);
}
