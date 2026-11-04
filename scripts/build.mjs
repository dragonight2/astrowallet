// Monta o app para publicar.
//   npm run build       → dist/ (usado pelo app Android/iOS via Capacitor)
//   npm run build:web   → também atualiza index.html + assets/ na raiz (GitHub Pages)
//   npm run dev         → igual ao build:web, refazendo a cada mudança em src/
//
// Resultado:
//   index.html            página com o CSS embutido e a regra de segurança (CSP)
//   assets/main-*.js      o app
//   assets/*-*.js         partes carregadas só quando usadas (ex.: gerador de PDF)
//   assets/manrope.woff2  a fonte, dentro do app (nada vem da internet)
//   assets/astronous.png, assets/theme-boot.js  arquivos fixos de src/static/

import { build, context } from "esbuild";
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const STYLES = ["fonts", "page", "tokens", "base", "layout", "components", "screens", "splash"];
const FONT_SRC = join(root, "node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2");
const DIST = join(root, "dist");

// O jsPDF carrega sob demanda bibliotecas para converter HTML e SVG em PDF.
// O app não usa esses recursos, então elas são trocadas por módulos vazios
// (economiza ~360 KB).
const UNUSED_PDF_EXTRAS = /^(html2canvas|canvg|dompurify)$/;
const stubUnusedPdfExtras = {
  name: "stub-unused-pdf-extras",
  setup(b) {
    b.onResolve({ filter: UNUSED_PDF_EXTRAS }, (a) => ({ path: a.path, namespace: "stub" }));
    b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export default undefined;", loader: "js" }));
  },
};

async function assemble(result) {
  // Arquivos JS gerados (com nome único por versão, para o celular não usar um antigo).
  const outputs = result.outputFiles.filter((f) => f.path.endsWith(".js"));
  const entry = Object.entries(result.metafile.outputs).find(([, o]) => o.entryPoint?.endsWith("src/main.js"))[0];
  const entryName = basename(entry);

  await rm(DIST, { recursive: true, force: true });
  await mkdir(join(DIST, "assets"), { recursive: true });
  for (const f of outputs) await writeFile(join(DIST, "assets", basename(f.path)), f.contents);
  await copyFile(FONT_SRC, join(DIST, "assets/manrope.woff2"));
  // Arquivos fixos (logo Astronous, script do tema) vão junto, com o mesmo nome.
  for (const name of await readdir(join(root, "src/static"))) await copyFile(join(root, "src/static", name), join(DIST, "assets", name));

  const template = await readFile(join(root, "src/index.html"), "utf8");
  const css = (await Promise.all(STYLES.map((n) => readFile(join(root, `src/styles/${n}.css`), "utf8")))).join("\n");
  const html = template.replace("/*STYLES*/", () => css).replace("%MAIN%", `assets/${entryName}`);
  await writeFile(join(DIST, "index.html"), html);

  if (args.has("--web")) {
    // Raiz do repositório = o que o GitHub Pages publica.
    await rm(join(root, "assets"), { recursive: true, force: true });
    await mkdir(join(root, "assets"), { recursive: true });
    for (const name of await readdir(join(DIST, "assets"))) await copyFile(join(DIST, "assets", name), join(root, "assets", name));
    await writeFile(join(root, "index.html"), html);
  }
  const size = outputs.reduce((s, f) => s + f.contents.length, 0);
  const main = outputs.find((f) => basename(f.path) === entryName).contents.length;
  console.log(`build pronto: app ${Math.round(main / 1024)} KB ao abrir · ${Math.round(size / 1024)} KB no total`);
}

const options = {
  entryPoints: { main: join(root, "src/main.js") },
  plugins: [stubUnusedPdfExtras],
  bundle: true,
  splitting: true,
  format: "esm",
  outdir: join(DIST, "assets"),
  entryNames: "[name]-[hash]",
  chunkNames: "[name]-[hash]",
  target: ["es2020", "chrome90", "safari15"],
  minify: !args.has("--no-minify"),
  legalComments: "none",
  metafile: true,
  write: false,
  logLevel: "warning",
};

if (args.has("--watch")) {
  const ctx = await context({
    ...options,
    plugins: [
      stubUnusedPdfExtras,
      {
        name: "assemble",
        setup(b) {
          b.onEnd(async (result) => {
            if (!result.errors.length) await assemble(result);
          });
        },
      },
    ],
  });
  await ctx.watch();
  console.log("Observando mudanças em src/…");
} else {
  await assemble(await build(options));
}
