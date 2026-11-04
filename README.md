# Astro Wallet

Carteira pessoal para o celular: receitas, despesas, contas fixas, compras parceladas,
limites por área com alertas, relatório mensal em PDF com gráficos e, no Android, captura
automática de pagamentos pelas notificações do banco/carteira (opcional, revisada pela pessoa). **Todos os dados ficam só no aparelho**,
sem servidor, sem conta e sem login.

- Prévia no navegador: https://dragonight2.github.io/astrowallet/
  (na prévia a digital é simulada e os dados ficam sem criptografia no navegador; use só para testar)
- App Android: baixe o APK mais recente em Releases (https://github.com/dragonight2/astrowallet/releases/latest)

## Como rodar

```bash
npm install
npm test            # testes automáticos
npm run build:web   # gera dist/ e atualiza index.html + assets/ na raiz (GitHub Pages)
npm run dev         # o mesmo, refazendo a cada mudança em src/
```

`index.html`, `assets/` (na raiz) e `dist/` são **gerados**: não edite à mão; edite `src/` e rode o build.
O gerador de PDF fica num arquivo separado em `assets/`, carregado só quando a pessoa gera um relatório.

## Organização do código

```
src/
  main.js              ponto de partida: plataforma → dados → migração → módulos
  core/                peças gerais, sem regra de negócio
    app.js             moldura da tela (barra superior, mês, abas) e eventos da página
    modules.js         registro de módulos (veja "Funcionalidade nova" abaixo)
    actions.js         registro de ações dos botões (data-action, data-change…)
    events.js          barramento de eventos entre módulos
    format.js          datas, meses e dinheiro (valores sempre em centavos)
    dom.js             atalhos de HTML e escapeHtml (proteção contra injeção)
  data/                os dados da carteira
    schema.js          formato dos dados, versão e MIGRAÇÕES
    store.js           único lugar que altera os dados; salva e avisa a tela
    finance.js         cálculos do mês (puros, com testes)
    sanitize.js        conferência dos arquivos de backup
  platform/            o que muda entre celular e navegador
    native.js          celular: arquivos cifrados, chave no cofre do sistema, digital/PIN
    web.js             navegador: prévia (sem criptografia, digital simulada)
    encrypted-storage.js  gravação segura (temporário → conferência → troca) e recuperação
    crypto.js          AES-256-GCM
  ui/                  peças visuais reaproveitadas (ícones, marca, folhas, máscaras)
  modules/             cada funcionalidade num arquivo
  styles/              CSS (tokens de design, base, layout, componentes, telas)
android/               projeto Android (Capacitor); código próprio em app/src/main/java/com/astronous/astrowallet
.github/workflows/     gera o APK a cada atualização e publica em Releases
tests/                 testes automáticos (node --test)
```

## Funcionalidade nova

1. Crie `src/modules/minha-funcao.js` exportando um módulo:
   ```js
   export default {
     id: "minha-funcao",
     tab: { label: "Metas", icon: "piggy", order: 35, render: (ctx) => "<p>…</p>" }, // opcional
     settings: { title: "Metas", order: 40, render: (ctx) => "…" },              // opcional
     summaryCards: (ctx) => [],                                                   // opcional
     init(ctx) { /* registerActions({...}), events.on(...) */ },
   };
   ```
2. Inclua em `src/modules/index.js`.

Dados próprios do módulo ficam em `ctx.store.moduleData(id)` / `ctx.store.setModuleData(id, {...})`,
sem mexer no formato principal.

## Regras que não podem ser quebradas

- **Nunca perder dados numa atualização.** Mudou o formato? Aumente `SCHEMA_VERSION` em
  `src/data/schema.js` e escreva a migração. O app guarda uma cópia antes de migrar.
- **Todo texto do usuário passa por `escapeHtml`** antes de ir para a tela.
- **Nada sai do aparelho** sem a pessoa tocar em compartilhar. A página tem uma regra de segurança
  (Content-Security-Policy em `src/index.html`) que impede qualquer conexão com a internet; a fonte
  fica dentro do app. Não acrescente recursos externos (CDN, fontes, analytics).
- **Backup sai sempre protegido por senha** (PBKDF2 + AES-256-GCM, `src/data/backup-crypto.js`).

## App Android

- Projeto em `android/` (Capacitor 8, pacote `com.astronous.astrowallet`).
- A cada envio para o GitHub, o fluxo `.github/workflows/android.yml` testa, monta, compila e
  publica o APK assinado em **Releases**.
- Assinatura: `android/keystore/astrowallet-release.p12`, protegida por senha. A senha fica só no
  segredo `ANDROID_KEYSTORE_PASSWORD` do repositório. **Nunca troque essa chave**: versões
  assinadas com outra chave não atualizam o app instalado (seria preciso desinstalar e perder os dados).
- Proteções: sem permissão de internet, sem backup automático do Android, conteúdo escondido
  na tela de apps recentes e em capturas de tela (FLAG_SECURE).
