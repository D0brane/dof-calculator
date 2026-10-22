// 把 index.html 及其 CSS、JS 内联成一个独立的 HTML 文件：node scripts/build-single.js
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

let html = read('index.html');

html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (_, href) => {
  return '<style>\n' + read(href) + '</style>';
});

html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, src) => {
  const code = read(src);
  if (/<\/script/i.test(code)) throw new Error(src + ' 中含有 </script，不能直接内联');
  return '<script>\n' + code + '</script>';
});

if (/(href|src)="(css|js)\//.test(html)) throw new Error('还有未内联的本地资源');

const outDir = path.join(root, 'dist');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'dof-calculator.html');
fs.writeFileSync(outFile, html);
console.log('已生成 ' + path.relative(root, outFile) + '（' + Math.round(html.length / 1024) + ' KB）');
