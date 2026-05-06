import { fetchWikiPage } from '../src/index.js';
import { scrapeCategory } from '../src/index.js';

async function test() {
  const pages = await scrapeCategory('https://nier.fandom.com', 'Characters');
  console.log(`Found ${pages.length} characters`);
  console.log(pages.slice(0, 5).join(', '));
}

test().catch(console.error);