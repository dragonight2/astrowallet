// Monta o app num único arquivo HTML (CSS e JavaScript embutidos).
//   npm run build       → dist/index.html (usado pelo app Android/iOS via Capacitor)
//   npm run build:web   → também atualiza o index.html da raiz (publicado no GitHub Pages)
//   npm run dev         → igual ao build:web, refazendo a cada mudança em src/

import { build, context } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const STYLES = ["page", "tokens", "base", "layout", "components", "screens"];

async function assemble(jsCode) {
  const template = await readFile(join(root, "src/index.html"), "utf8");
  const css = (await Promise.all(STYLES.map((n) => readFile(join(root, `src/styles/${n}.css`), "utf8")))).join("\n");
  const js = jsCode.replace(/<\/script/gi, "<\\/script");
  const html = template.replace("/*STYLES*/", () => css).replace("/*SCRIPT*/", () => js);
  await mkdir(join(root, "dist"), { recursive: true });
  await writeFile(join(root, "dist/index.html"), html);
  if (args.has("--web")) await writeFile(join(root, "index.html"), html);
  console.log(`index.html gerado (${Math.round(html.length / 1024)} KB)`);
}

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

const options = {
  entryPoints: [join(root, "src/main.js")],
  plugins: [stubUnusedPdfExtras],
  bundle: true,
  format: "iife",
  target: ["es2020", "chrome90", "safari15"],
  minify: !args.has("--no-minify"),
  legalComments: "none",
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
            if (!result.errors.length) await assemble(result.outputFiles[0].text);
          });
        },
      },
    ],
  });
  await ctx.watch();
  console.log("Observando mudanças em src/…");
} else {
  const result = await build(options);
  await assemble(result.outputFiles[0].text);
}
