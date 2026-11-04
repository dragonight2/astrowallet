import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeDuplicates, parsePaymentNotification, suggestCategory } from "../src/modules/payment-capture/parser.js";
import { emptyState } from "../src/data/schema.js";

const T = new Date(2026, 10, 4, 10, 30).getTime();
const parse = (pkg, title, text, time = T) => parsePaymentNotification({ id: "1", pkg, title, text, time });

test("compra no cartão (banco)", () => {
  const p = parse("com.nu.production", "Compra aprovada", "Compra de R$ 45,90 APROVADA em PADARIA SAO JOSE para o cartão com final 1234.");
  assert.deepEqual([p.type, p.amount, p.description, p.date, p.source], ["expense", 4590, "Padaria Sao Jose", "2026-11-04", "Nubank"]);
});

test("texto com 'no cartão' antes da loja e limite disponível no fim", () => {
  const p = parse("com.itau", "Itaú", "Compra aprovada no cartão final 1234 no valor de R$ 1.234,50 em 04/11 às 10:30 em MAGAZINE LUIZA. Limite disponível R$ 3.000,00");
  assert.equal(p.amount, 123450);
  assert.equal(p.description, "Magazine Luiza");
});

test("Google Wallet: loja no título", () => {
  const p = parse("com.google.android.apps.walletnfcrel", "Drogaria São Paulo", "R$ 32,10 com Mastercard •••• 1234");
  assert.deepEqual([p.type, p.amount, p.description], ["expense", 3210, "Drogaria São Paulo"]);
});

test("Pix enviado e Pix recebido", () => {
  const sent = parse("br.com.intermedium", "Pix enviado", "Você enviou R$ 50,00 para Maria Souza.");
  assert.deepEqual([sent.type, sent.amount, sent.description], ["expense", 5000, "Maria Souza"]);
  const got = parse("com.nu.production", "Pix recebido", "Você recebeu um Pix de R$ 1.200,00 de JOAO PEDRO LIMA.");
  assert.deepEqual([got.type, got.amount, got.description], ["income", 120000, "Joao Pedro Lima"]);
});

test("ignora promoções, fatura, códigos, recusas e outros apps", () => {
  assert.equal(parse("com.nu.production", "Oferta", "Ganhe R$ 20,00 de cashback na sua próxima compra"), null);
  assert.equal(parse("com.itau", "Fatura", "Sua fatura fechou em R$ 2.345,00"), null);
  assert.equal(parse("com.nu.production", "Código", "Seu código de segurança é 123456. Compra de R$ 10,00"), null);
  assert.equal(parse("com.nu.production", "Compra negada", "Compra de R$ 99,00 negada em LOJA X"), null);
  assert.equal(parse("com.whatsapp", "Ana", "Me paga os R$ 50,00 da pizza"), null);
  assert.equal(parse("com.nu.production", "Nubank", "Aumentamos seu limite para R$ 5.000,00"), null);
  assert.equal(parse("com.nu.production", "Nubank", "Seu saldo disponível é R$ 300,00"), null);
});

test("sem loja reconhecível usa o nome do app", () => {
  const p = parse("com.c6bank.app", "C6", "Pagamento de R$ 15,00 realizado.");
  assert.equal(p.description, "Pagamento (C6 Bank)");
});

test("junta o mesmo pagamento avisado pelo banco e pela carteira", () => {
  const a = parse("com.nu.production", "Compra aprovada", "Compra de R$ 32,10 aprovada.", T);
  const b = parse("com.google.android.apps.walletnfcrel", "Drogaria São Paulo", "R$ 32,10 com Mastercard", T + 5000);
  const merged = mergeDuplicates([a, { ...b, id: "2" }]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].description, "Drogaria São Paulo");
  const later = mergeDuplicates([a, { ...b, id: "2", time: T + 3600000 }]);
  assert.equal(later.length, 2);
});

test("sugere área pelo nome da loja e lembra a escolha anterior", () => {
  const cats = emptyState().categories; // c0 Alimentação, c1 Transporte, c4 Saúde…
  assert.equal(suggestCategory("Padaria Sao Jose", cats), "c0");
  assert.equal(suggestCategory("Uber Trip", cats), "c1");
  assert.equal(suggestCategory("Drogaria São Paulo", cats), "c4");
  assert.equal(suggestCategory("Loja Desconhecida Xyz", cats, {}), "c7");
  assert.equal(suggestCategory("Empresa Qualquer", cats), null);
  assert.equal(suggestCategory("Empresa Qualquer", cats, { "empresa qualquer": "c8" }), "c8");
});
