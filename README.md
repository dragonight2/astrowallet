# Astro Wallet

Carteira pessoal para o celular: receitas, despesas, contas fixas, compras parceladas,
limites por área com alertas e relatório mensal em PDF (com aviso quando o mês fecha). **Todos os dados ficam só no aparelho**,
sem servidor, sem conta e sem login.

- Prévia no navegador: https://dragonight2.github.io/astrowallet/
  (na prévia a digital é simulada e os dados ficam sem criptografia no navegador; use só para testar)
- App Android: em preparação (Capacitor)

## Como rodar

```bash
npm install
npm test            # testes automáticos
npm run build:web   # gera o index.html da raiz (GitHub Pages) e dist/index.html
npm run dev         # o mesmo, refazendo a cada mudança em src/
```

`index.html` na raiz e `dist/` são **gerados** — não edite à mão; edite `src/` e rode o build.

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
- **Nada sai do aparelho** sem a pessoa tocar em compartilhar.
