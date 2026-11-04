// Marca da Astro Wallet: o ícone "carteira estelar" e o nome.
// As cores vêm das variáveis --mark-fg / --mark-bg, então funcionam no tema claro e no escuro.

const MARK_SVG = `<svg viewBox="0 0 64 64" aria-hidden="true">
  <path style="fill:var(--mark-fg);opacity:.55" d="M14 24a6 6 0 0 1 6-6h20a3 3 0 0 1 0 6z"/>
  <rect style="fill:var(--mark-fg)" x="11" y="23" width="40" height="28" rx="7"/>
  <rect style="fill:var(--mark-bg)" x="35" y="30.5" width="19" height="13" rx="6.5"/>
  <path style="fill:var(--mark-fg)" d="M44.5 32.4l1.2 3.4 3.4 1.2-3.4 1.2-1.2 3.4-1.2-3.4-3.4-1.2 3.4-1.2z"/>
  <path style="fill:var(--mark-fg)" d="M50 8l1.2 3.3 3.3 1.2-3.3 1.2L50 17l-1.2-3.3-3.3-1.2 3.3-1.2z"/>
  <circle style="fill:var(--mark-fg)" cx="16" cy="11" r="1.6"/>
  <circle style="fill:var(--mark-fg)" cx="31" cy="9" r="1.1"/>
</svg>`;

/** Só o ícone. Tamanhos: "sm", "md", "lg". */
export const brandMark = (size = "md") => `<span class="mark mark-${size}">${MARK_SVG}</span>`;

const wordmark = (size = "md") =>
  `<span class="wordmark wordmark-${size}" aria-label="Astro Wallet"><b>Astro</b><i>Wallet</i></span>`;

/** Ícone + nome lado a lado. */
export const brandLockup = (size = "md") =>
  `<span class="lockup lockup-${size}">${brandMark(size)}${wordmark(size)}</span>`;
