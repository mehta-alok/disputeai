import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outdir = join(__dirname, 'dist');

// Ensure dist and assets dirs exist
mkdirSync(join(outdir, 'assets'), { recursive: true });

console.log('Building AccuDefend frontend...');
console.time('Total Build');

// Step 1: Process Tailwind CSS using standalone binary (Node.js Tailwind hangs on v25+)
console.log('\n[1/3] Processing Tailwind CSS...');
console.time('Tailwind');
try {
  // Try standalone binary first (works on all Node versions)
  const tailwindBin = existsSync('/tmp/tailwindcss') ? '/tmp/tailwindcss'
    : existsSync('/opt/homebrew/bin/tailwindcss') ? '/opt/homebrew/bin/tailwindcss'
    : existsSync('/usr/local/bin/tailwindcss') ? '/usr/local/bin/tailwindcss'
    : null;

  if (tailwindBin) {
    execSync(
      `${tailwindBin} -c tailwind.config.cjs -i ./src/index.css -o ./dist/assets/tailwind.css --minify`,
      { cwd: __dirname, stdio: 'inherit', timeout: 120000 }
    );
  } else {
    // Fallback to npx (may hang on Node v25+)
    console.log('  (No standalone binary found, trying npx...)');
    execSync(
      `npx tailwindcss -i ./src/index.css -o ./dist/assets/tailwind.css --minify`,
      { cwd: __dirname, stdio: 'inherit', timeout: 120000 }
    );
  }
  console.timeEnd('Tailwind');
} catch (error) {
  console.error('Tailwind CSS build failed:', error.message);
  console.error('  Tip: Download standalone binary: curl -sL -o /tmp/tailwindcss https://github.com/tailwindlabs/tailwindcss/releases/download/v3.4.17/tailwindcss-macos-arm64 && chmod +x /tmp/tailwindcss');
  process.exit(1);
}

// Step 2: Bundle JS with esbuild (exclude CSS imports — handled by Tailwind)
console.log('\n[2/3] Bundling JavaScript with esbuild...');
console.time('esbuild');

// CSS plugin to ignore CSS imports (already handled by Tailwind)
const ignoreCssPlugin = {
  name: 'ignore-css',
  setup(build) {
    build.onResolve({ filter: /\.css$/ }, args => ({
      path: args.path,
      namespace: 'ignore-css'
    }));
    build.onLoad({ filter: /.*/, namespace: 'ignore-css' }, () => ({
      contents: '',
      loader: 'js'
    }));
  }
};

try {
  const result = await esbuild.build({
    entryPoints: [join(__dirname, 'src/main.jsx')],
    bundle: true,
    outdir: join(outdir, 'assets'),
    splitting: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2020',
    jsx: 'automatic',
    plugins: [ignoreCssPlugin],
    loader: {
      '.jsx': 'jsx',
      '.js': 'jsx',
      '.svg': 'dataurl',
      '.png': 'dataurl',
      '.jpg': 'dataurl',
      '.gif': 'dataurl',
    },
    define: {
      'process.env.NODE_ENV': '"production"',
    },
    minify: true,
    sourcemap: false,
    metafile: true,
    logLevel: 'info',
  });
  console.timeEnd('esbuild');

  // Step 3: Generate index.html
  console.log('\n[3/3] Generating index.html...');

  const indexHtml = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/accudefend-icon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="AccuDefend - AI-powered hotel chargeback defense platform" />
    <meta name="theme-color" content="#2563eb" />
    <title>AccuDefend</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <!-- Tailwind CSS (pre-compiled with all utilities) -->
    <link rel="stylesheet" href="/assets/tailwind.css" />
    <style>
      @keyframes fadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
      .animate-fade-in { animation: fadeIn 0.3s ease-out; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/assets/main.js"></script>
  </body>
</html>`;

  writeFileSync(join(outdir, 'index.html'), indexHtml);

  // Copy public files (icons, etc.)
  if (existsSync(join(__dirname, 'public'))) {
    cpSync(join(__dirname, 'public'), outdir, { recursive: true, force: true });
  }

  console.timeEnd('Total Build');
  console.log('\nBuild complete! Output in dist/');

  // Print bundle sizes
  const analysis = await esbuild.analyzeMetafile(result.metafile, { verbose: false });
  console.log(analysis);
} catch (error) {
  console.error('Build failed:', error);
  process.exit(1);
}
