// Roda antes de tudo (antes da tela de abertura aparecer) para já pintar no
// tema certo, sem piscar branco para quem usa o tema escuro.
// O tema é uma preferência visual, não um dado financeiro; por isso pode ficar
// fora do armazenamento cifrado.
try {
  if (localStorage.getItem("astro-wallet:theme") === "dark") document.documentElement.classList.add("app-dark");
} catch (e) {}
