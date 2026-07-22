import { build } from 'esbuild';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });

await build({
  entryPoints: ['src/main.js'],
  outfile: 'dist/city.js',
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2020'],
  sourcemap: false,
  legalComments: 'none'
});

await Promise.all([
  copyFile('index.html', 'dist/index.html'),
  copyFile('styles.css', 'dist/styles.css'),
  copyFile('dist/city.js', 'city.js')
]);

const [html, styles, bundle] = await Promise.all([
  readFile('index.html', 'utf8'),
  readFile('styles.css', 'utf8'),
  readFile('dist/city.js', 'utf8')
]);
const safeBundle = bundle.replace(/<\/script/gi, '<\\/script');
const standalone = html
  .replace('<link rel="stylesheet" href="./styles.css" />', () => `<style>${styles}</style>`)
  .replace('<script defer src="./city.js" onerror="window.showCityLoadError?.(\'主程序加载失败\')"></script>', () => `<script>${safeBundle}</script>`);

await Promise.all([
  writeFile('栖光市-直接打开.html', standalone, 'utf8'),
  writeFile('dist/栖光市-直接打开.html', standalone, 'utf8')
]);

console.log('城市已构建：index.html、dist/、栖光市-直接打开.html');
