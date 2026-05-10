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
@namespace epub "http://www.idpf.org/2007/ops";
body { font-family: Georgia, Charter, "Bitstream Charter", "Times New Roman", serif; line-height: 1.75; margin: 3% 5%; color: #1a1a1a; widows: 2; orphans: 2; }
h1 { font-size: 2em; margin: 2em 0 1em; text-align: center; font-weight: 800; page-break-before: always; letter-spacing: 0.02em; }
h2 { font-size: 1.5em; margin: 1.8em 0 0.6em; font-weight: 700; page-break-after: avoid; }
h3 { font-size: 1.25em; margin: 1.4em 0 0.5em; font-weight: 700; page-break-after: avoid; }
h4 { font-size: 1.1em; margin: 1.1em 0 0.4em; font-weight: 600; page-break-after: avoid; font-style: italic; }
h5, h6 { font-size: 1em; margin: 0.9em 0 0.3em; font-weight: 600; }
p { margin: 0.5em 0; text-indent: 1.3em; text-align: justify; hyphens: auto; }
p:first-of-type, h1 + p, h2 + p, h3 + p, h4 + p, h5 + p, h6 + p { text-indent: 0; }
li { margin: 0.2em 0; }
ul, ol { margin: 0.5em 0 0.5em 2em; }
li > ul, li > ol { margin: 0.25em 0 0.25em 1.5em; }
table { width: 100%; border-collapse: collapse; margin: 1.2em 0; font-size: 0.9em; }
td, th { padding: 0.4em 0.7em; border: 1px solid #ccc; text-align: left; vertical-align: top; }
th { background: #f5f5f5; font-weight: 700; }
blockquote { margin: 1em 2em; padding: 0.3em 0.8em; border-left: 3px solid #ccc; font-style: italic; color: #444; }
cite { font-style: italic; }
a { color: #2a5db0; text-decoration: none; }
hr { border: none; border-top: 1px solid #ccc; margin: 2em 0; }
sup { font-size: 0.75em; vertical-align: super; line-height: 0; }
sub { font-size: 0.75em; vertical-align: sub; line-height: 0; }
`.trim();

const COVER_CSS = `
@namespace epub "http://www.idpf.org/2007/ops";
body { font-family: Georgia, Charter, "Bitstream Charter", "Times New Roman", serif; text-align: center; margin: 0; padding: 0; display: flex; align-items: center; justify-content: center; height: 100%; }
.cover { padding: 3em 2em; max-width: 80%; }
.cover h1 { font-size: 2.6em; margin: 0 0 0.4em; font-weight: 800; letter-spacing: 0.03em; line-height: 1.2; }
.cover h2 { font-size: 1.4em; font-weight: 400; color: #444; margin: 0 0 0.3em; }
.cover .line { width: 20%; border: none; border-top: 2px solid #aaa; margin: 2.5em auto; }
.cover .meta { font-size: 0.85em; color: #666; line-height: 2; }
.cover .meta span { display: block; }
`.trim();

const NAV_CSS = `
body { font-family: Georgia, "Times New Roman", serif; margin: 3% 4%; }
h1 { font-size: 1.5em; margin-bottom: 1em; }
ol { list-style-type: none; padding: 0; }
li { margin: 0.4em 0; }
a { text-decoration: none; color: #222; }
`.trim();

function buildXhtml(title, bodyContent, style, lang) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${esc(lang)}" lang="${esc(lang)}">
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
    description = '',
    lang = 'en',
    url = ''
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
  const coverMeta = [
    `${pages.length} chapter${pages.length === 1 ? '' : 's'}`,
    ...(url ? [url] : []),
    new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  ].map(s => `<span>${esc(s)}</span>`).join('\n');

  zip.file('OEBPS/cover.xhtml', buildXhtml('Cover', `
<div class="cover">
  <h1>${esc(title)}</h1>
  <h2>${esc(author)}</h2>
  <hr class="line"/>
  <div class="meta">
    ${coverMeta}
  </div>
</div>`, COVER_CSS, lang));

  // Chapters
  pages.forEach((page, i) => {
    zip.file(`OEBPS/chapter${i}.xhtml`, buildXhtml(page.title, `
  <h1>${esc(page.title)}</h1>
  <div class="content">
${renderContent(page.content)}
  </div>`, '', lang));
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
  </nav>`, NAV_CSS, lang));

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
    <dc:language>${esc(lang)}</dc:language>
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
