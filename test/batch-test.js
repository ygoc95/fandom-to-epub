import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import JSZip from 'jszip';
import { getPage, getAllPages } from '../src/scraper.js';
import { cleanHtml } from '../src/cleaner.js';
import { generateEpub } from '../src/epub.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'batch-output');
const REPORT_PATH = path.join(__dirname, '..', 'batch-report.json');

const WIKIS = [
  { name: 'minecraft', url: 'https://minecraft.fandom.com' },
  { name: 'harrypotter', url: 'https://harrypotter.fandom.com' },
  { name: 'starwars', url: 'https://starwars.fandom.com' },
  { name: 'gameofthrones', url: 'https://gameofthrones.fandom.com' },
  { name: 'marvel', url: 'https://marvel.fandom.com' },
  { name: 'darksouls', url: 'https://darksouls.fandom.com' },
  { name: 'nier', url: 'https://nier.fandom.com' },
  { name: 'eldenring', url: 'https://eldenring.fandom.com' },
  { name: 'zelda', url: 'https://zelda.fandom.com' },
  { name: 'pokemon', url: 'https://pokemon.fandom.com' },
  { name: 'wowpedia', url: 'https://wowpedia.fandom.com' },
  { name: 'lotr', url: 'https://lotr.fandom.com' },
  { name: 'naruto', url: 'https://naruto.fandom.com' },
  { name: 'onepiece', url: 'https://onepiece.fandom.com' },
  { name: 'dragonage', url: 'https://dragonage.fandom.com' },
  { name: 'masseffect', url: 'https://masseffect.fandom.com' },
  { name: 'fallout', url: 'https://fallout.fandom.com' },
  { name: 'skyrim', url: 'https://elderscrolls.fandom.com' },
  { name: 'witcher', url: 'https://witcher.fandom.com' },
  { name: 'terraria', url: 'https://terraria.fandom.com' },
  { name: 'stardewvalley', url: 'https://stardewvalley.fandom.com' },
  { name: 'finalfantasy', url: 'https://finalfantasy.fandom.com' },
  { name: 'halo', url: 'https://halo.fandom.com' },
  { name: 'doom', url: 'https://doom.fandom.com' },
  { name: 'bloodborne', url: 'https://bloodborne.fandom.com' },
  { name: 'cyberpunk', url: 'https://cyberpunk.fandom.com' },
  { name: 'baldursgate3', url: 'https://baldursgate3.fandom.com' },
  { name: 'animalcrossing', url: 'https://animalcrossing.fandom.com' },
  { name: 'avatar', url: 'https://avatar.fandom.com' },
  { name: 'breakingbad', url: 'https://breakingbad.fandom.com' },
];

const LIMIT = 15; // pages per wiki for testing

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function validateEpub(filePath) {
  try {
    const buf = fs.readFileSync(filePath);
    const zip = await JSZip.loadAsync(buf);
    const hasContainer = !!zip.file('META-INF/container.xml');
    const hasOpf = !!zip.file('OEBPS/content.opf');
    const hasCss = !!zip.file('OEBPS/style.css');
    const hasCover = !!zip.file('OEBPS/cover.xhtml');
    const hasNav = !!zip.file('OEBPS/nav.xhtml');

    const chapters = Object.keys(zip.files).filter(f => f.match(/chapter\d+\.xhtml/));
    const opfContent = await zip.file('OEBPS/content.opf').async('string');
    const navContent = await zip.file('OEBPS/nav.xhtml').async('string');

    let chapterTocs = 0;
    const tocRegex = /<li><a href="chapter/g;
    const tocMatch = navContent.match(tocRegex);
    chapterTocs = tocMatch ? tocMatch.length : 0;

    let chapterSizes = [];
    for (const ch of chapters) {
      const c = await zip.file(ch).async('string');
      chapterSizes.push(c.length);
    }

    return {
      valid: hasContainer && hasOpf && hasCss && hasCover && hasNav && chapters.length > 0,
      fileSize: buf.length,
      chapterCount: chapters.length,
      tocMatches: chapterTocs,
      avgChapterSize: chapterSizes.length ? Math.round(chapterSizes.reduce((a, b) => a + b, 0) / chapterSizes.length) : 0,
      maxChapterSize: chapterSizes.length ? Math.max(...chapterSizes) : 0,
      minChapterSize: chapterSizes.length ? Math.min(...chapterSizes) : 0,
      opfTitle: (opfContent.match(/<dc:title>(.*?)<\/dc:title>/) || [,''])[1],
      opfAuthor: (opfContent.match(/<dc:creator>(.*?)<\/dc:creator>/) || [,''])[1],
    };
  } catch (e) {
    return { valid: false, error: e.message };
  }
}

function analyzeContent(pages) {
  if (!pages.length) return { quality: 'empty', score: 0 };

  const totalChars = pages.reduce((s, p) => s + p.content.length, 0);
  const avgChars = Math.round(totalChars / pages.length);
  const hasHeadings = pages.filter(p => p.content.includes('## ')).length;
  const hasLists = pages.filter(p => p.content.includes('- ')).length;
  const hasTables = pages.filter(p => p.content.includes('| ')).length;
  const hasQuotes = pages.filter(p => p.content.includes('> ')).length;

  let score = 0;
  if (avgChars > 500) score += 2;
  else if (avgChars > 200) score += 1;
  if (hasHeadings > pages.length * 0.3) score += 2;
  else if (hasHeadings > 0) score += 1;
  if (hasLists > 0) score += 1;
  if (hasTables > 0) score += 1;

  let quality = 'poor';
  if (score >= 5) quality = 'excellent';
  else if (score >= 4) quality = 'good';
  else if (score >= 2) quality = 'fair';

  return {
    quality,
    score,
    totalChars,
    avgChars,
    pagesWithHeadings: hasHeadings,
    pagesWithLists: hasLists,
    pagesWithTables: hasTables,
    pagesWithQuotes: hasQuotes,
  };
}

async function testWiki(wiki) {
  const startTime = Date.now();
  const result = {
    name: wiki.name,
    url: wiki.url,
    status: 'pending',
    error: null,
    pagesFound: 0,
    pagesFetched: 0,
    pagesSkipped: 0,
    duration: 0,
    epubPath: null,
  };

  try {
    console.log(`\n=== Testing ${wiki.name} (${wiki.url}) ===`);

    console.log('  Fetching page list...');
    const allTitles = await getAllPages(wiki.url, LIMIT);
    result.pagesFound = allTitles.length;
    console.log(`  ${allTitles.length} pages found`);

    const pages = [];
    const seenTitles = new Set();
    for (let i = 0; i < allTitles.length; i++) {
      const t = allTitles[i];
      process.stdout.write(`  [${i + 1}/${allTitles.length}] ${t.substring(0, 50)}... `);
      try {
        await sleep(300);
        const pageHtml = await getPage(wiki.url, t);
        if (!pageHtml.html) {
          console.log('empty');
          result.pagesSkipped++;
          continue;
        }
        const cleaned = cleanHtml(pageHtml.html, pageHtml.title);
        if (seenTitles.has(cleaned.title)) {
          console.log(`duplicate -> ${cleaned.title}`);
          result.pagesSkipped++;
          continue;
        }
        if (cleaned.content.length > 100) {
          pages.push(cleaned);
          seenTitles.add(cleaned.title);
          result.pagesFetched++;
          console.log(`${cleaned.content.length} chars`);
        } else {
          console.log(`skip (${cleaned.content.length} chars)`);
          result.pagesSkipped++;
        }
      } catch (err) {
        console.log(`error: ${err.message}`);
        result.pagesSkipped++;
      }
    }

    const wikiName = wiki.url.replace(/https?:\/\/(.*?)\.fandom\.com/, (_, n) => {
      return n.charAt(0).toUpperCase() + n.slice(1) + ' Wiki';
    });

    const epubPath = path.join(OUT_DIR, `${wiki.name}.epub`);
    await generateEpub({
      title: wikiName,
      author: wikiName,
      pages,
      outputPath: epubPath,
      description: `Generated from ${wiki.url}`,
    });

    result.epubPath = epubPath;
    result.duration = Date.now() - startTime;

    const validation = await validateEpub(epubPath);
    const contentAnalysis = analyzeContent(pages);

    result.status = 'success';
    result.validation = validation;
    result.content = contentAnalysis;
    result.epubSize = validation.fileSize;

    console.log(`  Done: ${pages.length} chapters, ${contentAnalysis.totalChars} chars, ${(result.duration / 1000).toFixed(1)}s`);
    console.log(`  Quality: ${contentAnalysis.quality} (score ${contentAnalysis.score}/6)`);
    console.log(`  EPUB: valid=${validation.valid}, size=${(validation.fileSize / 1024).toFixed(1)}KB, ch=${validation.chapterCount}`);

  } catch (err) {
    result.status = 'failed';
    result.error = err.message;
    console.log(`  FAILED: ${err.message}`);
  }

  return result;
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  console.log('Fandom-to-EPUB Batch Test');
  console.log('=========================');
  console.log(`Testing ${WIKIS.length} wikis (limit: ${LIMIT} pages each)`);
  console.log(`Started at: ${new Date().toISOString()}`);
  console.log('');

  const results = [];
  for (let i = 0; i < WIKIS.length; i++) {
    console.log(`\n[${i + 1}/${WIKIS.length}]`);
    const r = await testWiki(WIKIS[i]);
    results.push(r);

    // Save intermediate report
    fs.writeFileSync(REPORT_PATH, JSON.stringify(results, null, 2));
  }

  // Summary
  const succeeded = results.filter(r => r.status === 'success');
  const failed = results.filter(r => r.status === 'failed');
  const totalFetched = succeeded.reduce((s, r) => s + r.pagesFetched, 0);
  const totalChars = succeeded.reduce((s, r) => s + (r.content?.totalChars || 0), 0);
  const totalTime = results.reduce((s, r) => s + r.duration, 0);
  const qualityCounts = {};
  succeeded.forEach(r => {
    const q = r.content?.quality || 'unknown';
    qualityCounts[q] = (qualityCounts[q] || 0) + 1;
  });

  console.log('\n\n========================================');
  console.log('           BATCH TEST SUMMARY             ');
  console.log('========================================');
  console.log(`Total wikis:      ${WIKIS.length}`);
  console.log(`Succeeded:        ${succeeded.length}`);
  console.log(`Failed:           ${failed.length}`);
  console.log(`Total pages:      ${totalFetched}`);
  console.log(`Total chars:      ${totalChars.toLocaleString()}`);
  console.log(`Total time:       ${(totalTime / 1000).toFixed(1)}s`);
  console.log('');
  console.log('Quality distribution:');
  for (const [q, c] of Object.entries(qualityCounts)) {
    console.log(`  ${q}: ${c} (${((c / succeeded.length) * 100).toFixed(0)}%)`);
  }

  if (failed.length) {
    console.log('\nFailed wikis:');
    failed.forEach(f => console.log(`  ${f.name}: ${f.error}`));
  }

  console.log(`\nFull report saved to: ${REPORT_PATH}`);
  console.log(`EPUB files saved to: ${OUT_DIR}`);
}

main().catch(err => {
  console.error('Batch test failed:', err.message);
  process.exit(1);
});
