#!/usr/bin/env node
// Builds Brayan's fight into one self-contained page, with its styles, scripts, pictures and
// sounds inside it (the font still comes from Google Fonts):
//   node brayan/tools/build.js [fragment.html]
// writes brayan/dist/index.html, and, if asked, the same page without its <html>, <head> and
// <body> tags (for hosts that wrap a page in their own).
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
let html = read('index.html');
html = html.replace('<link rel="stylesheet" href="css/style.css" />', () => `<style>\n${read('css/style.css')}</style>`);
html = html.replace(/<script src="(js\/[\w.]+)"><\/script>/g, (_, f) => `<script>\n${read(f).replace(/<\/script/g, '<\\/script')}\n</script>`);
const music = path.join(ROOT, 'assets/audio/ripple.mp3');
const src = fs.existsSync(music) ? `data:audio/mpeg;base64,${fs.readFileSync(music).toString('base64')}` : '';
html = html.replace("'assets/audio/ripple.mp3'", () => `'${src}'`);
fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
const out = path.join(ROOT, 'dist/index.html');
fs.writeFileSync(out, html);
console.log(`wrote brayan/dist/index.html (${(fs.statSync(out).size / 1e6).toFixed(1)} MB)`);

if (process.argv[2]) {
  const head = html.slice(html.indexOf('<head>') + 6, html.indexOf('</head>')).replace(/\s*<meta charset="utf-8" \/>\s*<meta name="viewport"[^>]*\/>/, '');
  const body = html.slice(html.indexOf('<body>') + 6, html.lastIndexOf('</body>'));
  fs.writeFileSync(process.argv[2], head.trim() + '\n' + body.trim() + '\n');
  console.log(`wrote ${process.argv[2]}`);
}
