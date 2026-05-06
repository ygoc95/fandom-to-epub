import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';

function esc(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const CSS = `
body { font-family: Georgia, "Times New Roman", serif; line-height: 1.7; margin: 3% 4%; color: #222; }
h1 { font-size: 1.9em; margin: 1.5em 0 1em; text-align: center; font-weight: 700; page-break-before: always; }
h2 { font-size: 1.5em; margin: 1.5em 0 0.5em; font-weight: 700; page-break-after: avoid; }
h3 { font-size: 1.25em; margin: 1.2em 0 0.4em; font-weight: 700; page-break-after: avoid; }
h4 { font-size: 1.1em; margin: 1em 0 0.3em; font-weight: 600; page-break-after: avoid; }
h5, h6 { font-size: 1em; margin: 0.8em 0 0.3em; font-weight: 600; }
p { margin: 0.6em 0; text-indent: 1.2em; text-align: justify; }
p:first-child { text-indent: 0; }
li { margin: 0.25em 0; }
ul, ol { margin: 0.5em 0 0.5em 1.5em; }
table { width: 100%; border-collapse: collapse; margin: 1em 0; font-size: 0.9em; }
td, th { padding: 0.35em 0.6em; border: 1px solid #bbb; text-align: left; vertical-align: top; }
th { background: #f0f0f0; font-weight: 600; }
blockquote { margin: 1em 1.5em; font-style: italic; color: #555; }
a { color: #555; text-decoration: none; }
`.trim();

const COVER_CSS = `
body { font-family: Georgia, "Times New Roman", serif; text-align: center; margin: 0; padding: 0; display: flex; align-items: center; justify-content: center; height: 100%; }
.cover { padding: 2em; }
.cover h1 { font-size: 2.5em; margin-bottom: 0.5em; }
.cover h2 { font-size: 1.3em; font-weight: 400; color: #555; margin: 0; }
.cover .meta { margin-top: 4em; font-size: 0.9em; color: #777; }
`.trim();

const NAV_CSS = `
body { font-family: Georgia, "Times New Roman", serif; margin: 3% 4%; }
h1 { font-size: 1.5em; margin-bottom: 1em; }
ol { list-style-type: none; padding: 0; }
li { margin: 0.4em 0; }
a { text-decoration: none; color: #222; }
`.trim();

function buildXhtml(title, bodyContent, style) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
  <title>${esc(title)}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
  ${style ? `<style>${style}</style>` : ''}
</head>
<body>
${bodyContent}
</body>
</html>`;
}

function renderContent(content) {
  return content.split('\n').map(line => {
    if (!line.trim()) return '';
    if (line.startsWith('###### ')) return `<h6>${esc(line.slice(7))}</h6>`;
    if (line.startsWith('##### ')) return `<h5>${esc(line.slice(6))}</h5>`;
    if (line.startsWith('#### ')) return `<h4>${esc(line.slice(5))}</h4>`;
    if (line.startsWith('### ')) return `<h3>${esc(line.slice(4))}</h3>`;
    if (line.startsWith('## ')) return `<h2>${esc(line.slice(3))}</h2>`;
    if (line.startsWith('> ')) return `<blockquote><p>${esc(line.slice(2))}</p></blockquote>`;
    if (line.startsWith('- ')) return `<li>${esc(line.slice(2))}</li>`;
    if (line.startsWith('| ')) return ''; // tables handled separately
    return `<p>${esc(line)}</p>`;
  }).filter(Boolean).join('\n');
}

export async function generateEpub(opts) {
  const {
    title = 'Wiki Export',
    author = 'Wiki',
    pages = [],
    outputPath = 'output.epub',
    description = ''
  } = opts;

  const zip = new JSZip();
  const uid = `urn:uuid:${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');

  // META-INF
  zip.file('META-INF/container.xml', `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xml:container:1.0">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);

  // CSS
  zip.file('OEBPS/style.css', CSS);

  // Cover
  zip.file('OEBPS/cover.xhtml', buildXhtml('Cover', `
<div class="cover">
  <h1>${esc(title)}</h1>
  <h2>${esc(author)}</h2>
  <div class="meta">
    <p>Generated from Fandom Wiki</p>
    <p>${new Date().toLocaleDateString()}</p>
  </div>
</div>`, COVER_CSS));

  // Chapters
  pages.forEach((page, i) => {
    zip.file(`OEBPS/chapter${i}.xhtml`, buildXhtml(page.title, `
  <h1>${esc(page.title)}</h1>
  <div class="content">
${renderContent(page.content)}
  </div>`));
  });

  // NAV
  const navItems = pages.map((p, i) =>
    `<li><a href="chapter${i}.xhtml">${esc(p.title)}</a></li>`
  ).join('\n');
  zip.file('OEBPS/nav.xhtml', buildXhtml(title, `
  <nav epub:type="toc">
    <h1>Contents</h1>
    <ol>
      ${navItems}
    </ol>
  </nav>`, NAV_CSS));

  // OPF
  const manifestItems = [
    '<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>',
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
    '<item id="css" href="style.css" media-type="text/css"/>',
    ...pages.map((_, i) => `<item id="ch${i}" href="chapter${i}.xhtml" media-type="application/xhtml+xml"/>`)
  ].join('\n    ');

  const spineItems = [
    '<itemref idref="cover" linear="yes"/>',
    '<itemref idref="nav"/>',
    ...pages.map((_, i) => `<itemref idref="ch${i}"/>`)
  ].join('\n    ');

  zip.file('OEBPS/content.opf', `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">${esc(uid)}</dc:identifier>
    <dc:title>${esc(title)}</dc:title>
    <dc:creator>${esc(author)}</dc:creator>
    <dc:language>en</dc:language>
    <dc:description>${esc(description)}</dc:description>
    <dc:date>${now}</dc:date>
    <meta property="dcterms:modified">${now}</meta>
  </metadata>
  <manifest>
    ${manifestItems}
  </manifest>
  <spine>
    ${spineItems}
  </spine>
</package>`);

  const outDir = path.dirname(outputPath);
  if (outDir && !fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  fs.writeFileSync(outputPath, buf);
  return outputPath;
}
