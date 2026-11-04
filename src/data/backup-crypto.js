// Backup protegido por senha.
//
// A senha vira uma chave com PBKDF2-SHA-256 (600 mil repetições, o que torna
// tentativas de adivinhar a senha muito lentas) e o conteúdo é cifrado com
// AES-256-GCM, que também detecta qualquer alteração no arquivo.
// Usa a criptografia do próprio sistema (WebCrypto), disponível no celular e no navegador.
//
// A senha NUNCA é guardada. Sem ela, ninguém (nem a Astro Wallet) consegue abrir o backup.

const FORMAT = "backup-protegido";
const ITERATIONS = 600000;
const AAD = new TextEncoder().encode("astro-wallet-backup:v1");
export const MIN_PASSWORD_LENGTH = 8;

export class WrongPasswordError extends Error {
  constructor() {
    super("Senha incorreta");
    this.name = "WrongPasswordError";
  }
}

const toBase64 = (bytes) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 32768) s += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(s);
};
const fromBase64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

async function deriveKey(password, salt, iterations) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password.normalize("NFC")), "PBKDF2", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** O texto é um backup protegido por senha? */
export function isProtectedBackup(text) {
  try {
    const file = JSON.parse(text);
    return file?.app === "astro-wallet" && file?.format === FORMAT;
  } catch {
    return false;
  }
}

/** Cifra o conteúdo do backup com a senha. Devolve o texto do arquivo. */
export async function protectBackup(plainText, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, ITERATIONS);
  const data = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: AAD }, key, new TextEncoder().encode(plainText)),
  );
  return JSON.stringify({
    app: "astro-wallet",
    format: FORMAT,
    v: 1,
    createdAt: new Date().toISOString(),
    kdf: { name: "PBKDF2-SHA-256", iterations: ITERATIONS, salt: toBase64(salt) },
    cipher: { name: "AES-256-GCM", iv: toBase64(iv) },
    data: toBase64(data),
  });
}

/** Abre um backup protegido. Lança WrongPasswordError se a senha não confere. */
export async function openProtectedBackup(fileText, password) {
  const file = JSON.parse(fileText);
  if (file?.format !== FORMAT || file.v !== 1) throw new Error("Backup inválido.");
  const iterations = Number(file.kdf?.iterations);
  if (!Number.isInteger(iterations) || iterations < 100000 || iterations > 10000000) throw new Error("Backup inválido.");
  const key = await deriveKey(password, fromBase64(file.kdf.salt), iterations);
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(file.cipher.iv), additionalData: AAD },
      key,
      fromBase64(file.data),
    );
    return new TextDecoder().decode(plain);
  } catch {
    throw new WrongPasswordError();
  }
}
