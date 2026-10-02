// Bundles src/gas/main.ts into dist/Code.js for Apps Script.
// Apps Script only calls *top-level* functions (triggers, doGet, google.script.run),
// so every export of main.ts gets a global wrapper appended after the bundle.
import { build } from 'esbuild';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const GLOBAL = '__CEK';
const entry = 'src/gas/main.ts';

mkdirSync('dist', { recursive: true });

const result = await build({
  entryPoints: [entry],
  bundle: true,
  format: 'iife',
  globalName: GLOBAL,
  target: 'es2019',
  platform: 'neutral',
  write: false,
  legalComments: 'none',
});

// esbuild only reports export names for ESM output, so do a throwaway ESM pass to list them.
const esm = await build({ entryPoints: [entry], bundle: true, format: 'esm', write: false, metafile: true, platform: 'neutral' });
const exportsList = Object.values(esm.metafile.outputs)[0].exports;
if (!exportsList.includes('run') || !exportsList.includes('doGet')) throw new Error('main.ts must export run and doGet');
const wrappers = exportsList
  .map((name) => `function ${name}() { return ${GLOBAL}.${name}.apply(null, arguments); }`)
  .join('\n');

const banner = `// Cold Email Killer — https://github.com/christianmat/cold-email-killer (MIT)\n// Generated file. Edit src/ and run \`npm run build\`.\n`;
writeFileSync('dist/Code.js', `${banner}${result.outputFiles[0].text}\n${wrappers}\n`);
copyFileSync('src/ui/Settings.html', 'dist/Settings.html');
copyFileSync('src/appsscript.json', 'dist/appsscript.json');

const size = readFileSync('dist/Code.js').length;
console.log(`dist/Code.js ${(size / 1024).toFixed(1)} KB, globals: ${exportsList.join(', ')}`);
