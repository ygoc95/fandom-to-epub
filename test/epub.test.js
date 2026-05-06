import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import JSZip from 'jszip';
import { generateEpub } from '../src/epub.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, 'test-output.epub');

afterAll(() => {
  try { fs.unlinkSync(outPath); } catch {}
});

describe('generateEpub', () => {
  test('produces a valid EPUB zip with required files', async () => {
    const pages = [
      { title: 'First Page', content: 'Content of the first page.' },
      { title: 'Second Page', content: '## Section\nContent of the second page with some detail.' }
    ];

    await generateEpub({
      title: 'Test Wiki',
      author: 'Tester',
      pages,
      outputPath: outPath
    });

    expect(fs.existsSync(outPath)).toBe(true);

    const buf = fs.readFileSync(outPath);
    const zip = await JSZip.loadAsync(buf);

    // Required EPUB structure
    expect(zip.file('META-INF/container.xml')).toBeTruthy();
    expect(zip.file('OEBPS/content.opf')).toBeTruthy();
    expect(zip.file('OEBPS/style.css')).toBeTruthy();
    expect(zip.file('OEBPS/cover.xhtml')).toBeTruthy();
    expect(zip.file('OEBPS/nav.xhtml')).toBeTruthy();

    // Chapters
    expect(zip.file('OEBPS/chapter0.xhtml')).toBeTruthy();
    expect(zip.file('OEBPS/chapter1.xhtml')).toBeTruthy();
    expect(zip.file('OEBPS/chapter2.xhtml')).toBeFalsy();

    // Validate OPF content
    const opf = await zip.file('OEBPS/content.opf').async('string');
    expect(opf).toContain('<dc:title>Test Wiki</dc:title>');
    expect(opf).toContain('<dc:creator>Tester</dc:creator>');
    expect(opf).toContain('id="ch0"');
    expect(opf).toContain('id="ch1"');
    expect(opf).toContain('href="chapter0.xhtml"');
    expect(opf).toContain('href="chapter1.xhtml"');

    // Validate chapter content
    const ch0 = await zip.file('OEBPS/chapter0.xhtml').async('string');
    expect(ch0).toContain('<title>First Page</title>');
    expect(ch0).toContain('Content of the first page');

    const ch1 = await zip.file('OEBPS/chapter1.xhtml').async('string');
    expect(ch1).toContain('<h2>Section</h2>');
  });

  test('renders markdown-like content to XHTML', async () => {
    const pages = [
      { title: 'Formats', content: '# Title\n## Section\nPlain text\n- List item\n> Quote line\n\n| Col1 | Col2 |\n| A | B |' }
    ];

    await generateEpub({ pages, outputPath: outPath });

    const buf = fs.readFileSync(outPath);
    const zip = await JSZip.loadAsync(buf);
    const ch0 = await zip.file('OEBPS/chapter0.xhtml').async('string');

    expect(ch0).toContain('<h2>Section</h2>');
    expect(ch0).toContain('<li>List item</li>');
    expect(ch0).toContain('<blockquote><p>Quote line</p></blockquote>');
  });

  test('escapes special XML characters', async () => {
    const pages = [
      { title: 'Escaping <>&" Test', content: 'A & B < C > D' }
    ];

    await generateEpub({ pages, outputPath: outPath });

    const buf = fs.readFileSync(outPath);
    const zip = await JSZip.loadAsync(buf);
    const ch0 = await zip.file('OEBPS/chapter0.xhtml').async('string');

    expect(ch0).toContain('&amp;');
    expect(ch0).toContain('&lt;');
    expect(ch0).toContain('&gt;');
    expect(ch0).toContain('&quot;');
  });

  test('creates output directory if needed', async () => {
    const deep = path.join(__dirname, 'deep', 'nested', 'test.epub');
    const pages = [{ title: 'Deep', content: 'Nested output path test.' }];

    await generateEpub({ pages, outputPath: deep });

    expect(fs.existsSync(deep)).toBe(true);

    // Cleanup
    fs.unlinkSync(deep);
    fs.rmdirSync(path.join(__dirname, 'deep', 'nested'));
    fs.rmdirSync(path.join(__dirname, 'deep'));
  });
});
