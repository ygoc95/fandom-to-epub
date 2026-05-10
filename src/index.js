#!/usr/bin/env node
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { getPage, getCategoryMembers, getAllPages } from './scraper.js';
import { cleanHtml } from './cleaner.js';
import { generateEpub } from './epub.js';

function parseUrl(input) {
  const u = new URL(input);
  const base = `${u.protocol}//${u.host}`;
  let category = null;
  const parts = u.pathname.split('/wiki/');
  if (parts.length > 1) {
    const p = decodeURIComponent(parts[1]);
    if (p.startsWith('Category:')) category = p.slice(9);
  }
  let name = u.hostname.split('.')[0];
  name = name.replace(/([a-z])([A-Z])/g, '$1 $2');
  name = name.replace(/-/g, ' ');
  name = name.replace(/\b\w/g, c => c.toUpperCase());
  const wikiName = name + ' Wiki';
  return { base, category, wikiName };
}

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .usage('$0 <url> [options]')
    .command('$0 <url>', 'Convert Fandom wiki to EPUB', (y) => {
      y.positional('url', { describe: 'Fandom wiki URL', type: 'string' });
    })
    .option('category', { alias: 'c', type: 'string', describe: 'Category to fetch (comma-separated for multiple)' })
    .option('pages', { alias: 'p', type: 'string', describe: 'Comma-separated page titles' })
    .option('all', { type: 'boolean', describe: 'Fetch every article on the wiki' })
    .option('limit', { alias: 'l', type: 'number', describe: 'Max pages to fetch' })
    .option('output', { alias: 'o', type: 'string', default: 'output.epub', describe: 'Output EPUB file' })
    .option('title', { alias: 't', type: 'string', describe: 'Book title' })
    .option('author', { alias: 'a', type: 'string', describe: 'Book author' })
    .option('lang', { type: 'string', default: 'en', describe: 'EPUB language code (e.g. en, de, ja)' })
    .help()
    .argv;

  const { base, category: urlCat, wikiName } = parseUrl(argv.url);
  const categoryArg = argv.category;
  const pagesArg = argv.pages ? argv.pages.split(',').map(s => s.trim()).filter(Boolean) : null;
  const limit = argv.limit || Infinity;

  const categories = [];
  if (urlCat) categories.push(urlCat);
  if (categoryArg) categories.push(...categoryArg.split(',').map(s => s.trim()).filter(Boolean));

  if (!categories.length && !pagesArg && !argv.all) {
    console.error('Provide --all, --category, --pages, or a Category URL');
    process.exit(1);
  }

  const baseTitle = argv.title || wikiName;
  const baseAuthor = argv.author || wikiName;

  // gather all titles, deduplicate
  const seen = new Set();
  const titles = [];

  if (pagesArg) {
    for (const t of pagesArg) {
      if (!seen.has(t)) { seen.add(t); titles.push(t); }
    }
  }

  if (argv.all) {
    console.log('Fetching all wiki pages...');
    const all = await getAllPages(base, Infinity);
    console.log(`  ${all.length} total pages found`);
    for (const t of all) {
      if (!seen.has(t)) { seen.add(t); titles.push(t); }
    }
  }

  for (const cat of categories) {
    console.log(`Category: ${cat}`);
    const members = await getCategoryMembers(base, cat, Infinity);
    console.log(`  ${members.length} pages found`);
    for (const t of members) {
      if (!seen.has(t)) { seen.add(t); titles.push(t); }
    }
  }

  const finalTitles = titles.slice(0, limit);

  if (!finalTitles.length) {
    console.error('No pages found.');
    process.exit(1);
  }

  console.log(`Fetching ${finalTitles.length} pages from ${base} ...`);

  const pages = [];
  const seenTitles = new Set();
  let emptyPages = 0, errorPages = 0, skippedThin = 0, skippedDup = 0;
  for (let i = 0; i < finalTitles.length; i++) {
    const t = finalTitles[i];
    process.stdout.write(`[${i + 1}/${finalTitles.length}] ${t} ... `);
    try {
      await new Promise(r => setTimeout(r, 300));
      const result = await getPage(base, t);
      if (!result.html) {
        console.log('empty');
        emptyPages++;
        continue;
      }
      const cleaned = cleanHtml(result.html, result.title);
      if (seenTitles.has(cleaned.title)) {
        console.log(`duplicate (→ ${cleaned.title})`);
        skippedDup++;
        continue;
      }
      if (cleaned.content.length > 100) {
        pages.push(cleaned);
        seenTitles.add(cleaned.title);
        console.log(`${cleaned.content.length} chars`);
      } else {
        console.log(`skip (${cleaned.content.length} chars)`);
        skippedThin++;
      }
    } catch (err) {
      console.log(`error: ${err.message}`);
      errorPages++;
    }
  }

  if (!pages.length) {
    console.error('No pages with usable content.');
    process.exit(1);
  }

  await generateEpub({
    title: baseTitle,
    author: baseAuthor,
    pages,
    outputPath: argv.output,
    description: `Generated from ${base}`,
    url: argv.url,
    lang: argv.lang
  });

  const totalChars = pages.reduce((s, p) => s + p.content.length, 0);
  const parts = [];
  parts.push(`${pages.length} chapters`);
  parts.push(`${totalChars.toLocaleString()} chars`);
  if (skippedDup) parts.push(`${skippedDup} duped`);
  if (skippedThin) parts.push(`${skippedThin} thin`);
  if (emptyPages) parts.push(`${emptyPages} empty`);
  if (errorPages) parts.push(`${errorPages} errors`);
  console.log(`\nDone: ${argv.output} (${parts.join(', ')})`);
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
