// Apps cujas notificações a captura automática lê. Notificações de qualquer
// outro app (WhatsApp, e-mail, redes sociais…) são ignoradas já no Android,
// antes de chegar ao Astro Wallet.
//
// Para acrescentar um banco: inclua o nome do pacote do app (aparece no link
// da Play Store: play.google.com/store/apps/details?id=<pacote>).
// Os nomes abaixo devem ser conferidos no teste do APK com notificações reais.

export const PAYMENT_APPS = [
  { pkg: "com.google.android.apps.walletnfcrel", name: "Google Wallet", wallet: true },
  { pkg: "com.samsung.android.spay", name: "Samsung Wallet", wallet: true },
  { pkg: "com.nu.production", name: "Nubank" },
  { pkg: "com.itau", name: "Itaú" },
  { pkg: "com.bradesco", name: "Bradesco" },
  { pkg: "br.com.bb.android", name: "Banco do Brasil" },
  { pkg: "br.com.gabba.Caixa", name: "Caixa" },
  { pkg: "br.gov.caixa.tem", name: "Caixa Tem" },
  { pkg: "com.santander.app", name: "Santander" },
  { pkg: "br.com.intermedium", name: "Inter" },
  { pkg: "com.c6bank.app", name: "C6 Bank" },
  { pkg: "com.picpay", name: "PicPay" },
  { pkg: "com.mercadopago.wallet", name: "Mercado Pago" },
  { pkg: "br.com.uol.ps.myaccount", name: "PagBank" },
  { pkg: "br.com.neon", name: "Neon" },
  { pkg: "br.com.bradesco.next", name: "Next" },
];

export const appByPackage = (pkg) => PAYMENT_APPS.find((a) => a.pkg === pkg) || null;

// Palavras na loja que sugerem uma área. A área é procurada pelo NOME nas
// áreas da pessoa (se ela tiver apagado ou renomeado, não sugere nada).
export const AREA_HINTS = [
  { area: "Alimentação", words: ["mercado", "supermerc", "atacad", "padaria", "panific", "restaurante", "lanchonete", "ifood", "burger", "pizza", "acougue", "açougue", "hortifruti", "cafe", "café", "assai", "assaí", "carrefour", "pao de acucar", "pão de açúcar"] },
  { area: "Transporte", words: ["uber", "99app", "99 ", "cabify", "posto", "combust", "shell", "ipiranga", "petrobras", "metro", "metrô", "onibus", "ônibus", "estacion", "pedagio", "pedágio", "sem parar", "veloe"] },
  { area: "Saúde", words: ["farmacia", "farmácia", "drogaria", "droga raia", "drogasil", "pague menos", "hospital", "clinica", "clínica", "laborat", "odonto", "otica", "ótica"] },
  { area: "Lazer", words: ["cinema", "cinemark", "netflix", "spotify", "disney", "prime video", "hbo", "max ", "steam", "playstation", "xbox", "ingresso", "show", "bar "] },
  { area: "Compras", words: ["shopping", "loja", "magazine", "magalu", "amazon", "mercado livre", "shopee", "shein", "renner", "riachuelo", "c&a", "americanas", "casas bahia"] },
  { area: "Contas", words: ["energia", "enel", "equatorial", "cemig", "copel", "light ", "agua", "água", "saneamento", "internet", "claro", "vivo", "tim ", "oi ", "net "] },
  { area: "Educação", words: ["escola", "colegio", "colégio", "faculdade", "universidade", "curso", "livraria", "udemy", "alura"] },
  { area: "Moradia", words: ["aluguel", "condominio", "condomínio", "imobiliaria", "imobiliária", "leroy", "telhanorte", "material de constru"] },
];
