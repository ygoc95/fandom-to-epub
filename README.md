# fandom-to-epub

![NPM Version](https://img.shields.io/npm/v/fandom-to-epub)
![License](https://img.shields.io/npm/l/fandom-to-epub)
![Build](https://github.com/ygoc95/fandom-to-epub/actions/workflows/test.yml/badge.svg)

Convert any Fandom wiki into a single dictionary-style EPUB ebook. Uses the MediaWiki API — no scraping, no Puppeteer, no Cloudflare headaches.

## Install

```bash
npm install -g fandom-to-epub
```

Or from source:

```bash
git clone https://github.com/ygoc95/fandom-to-epub
cd fandom-to-epub
npm install
npm link
```

## Usage

```bash
fandom-to-epub <url> [options]
```

### Modes

| Flag | Description |
|------|-------------|
| `--all` | Fetch every article on the wiki (namespace 0) |
| `-c, --category <cats>` | One or more categories, comma-separated |
| `-p, --pages <titles>` | Specific page titles, comma-separated |
| `-l, --limit <n>` | Global cap across all sources |

Modes combine — `--all` + `-c` merges and deduplicates.

### Options

| Flag | Default | Description |
|------|---------|-------------|
| `-o, --output <path>` | `output.epub` | Output file |
| `-t, --title <name>` | auto | Book title |
| `-a, --author <name>` | auto | Book author |

### Examples

```bash
# Full wiki dictionary
fandom-to-epub https://darksouls.fandom.com --all -o darksouls.epub

# Single category
fandom-to-epub https://nier.fandom.com -c Characters -o nier-chars.epub

# Multiple categories combined
fandom-to-epub https://nier.fandom.com -c "Characters,Weapons,Locations" -o nier.epub

# Specific pages with custom title
fandom-to-epub https://starwars.fandom.com -p "Darth Vader,Luke Skywalker" -t "Star Wars Profiles"

# Category URL auto-detection
fandom-to-epub https://nier.fandom.com/wiki/Category:Weapons -o weapons.epub

# Limit results (useful for testing)
fandom-to-epub https://darksouls.fandom.com --all -l 100 -o ds-test.epub
```

### Output

Produces a standards-compliant EPUB3 file with:
- Cover page with title, author, and date
- Styled CSS (serif body, clean tables, heading hierarchy)
- Interactive table of contents

## How it works

Uses the [MediaWiki API](https://www.mediawiki.org/wiki/API:Main_page) exclusively:

- **Scraper** — `getPage()` follows redirects, `getCategoryMembers()` paginates through categories, `getAllPages()` enumerates every article
- **Cleaner** — Strips infoboxes, navboxes, references, galleries, edit links. Extracts headings, paragraphs, lists, tables, blockquotes as clean text
- **EPUB** — Generates EPUB3 via JSZip with proper OPF manifest, spine, XHTML pages, and CSS

All API calls use exponential backoff for 429/503 responses.

## Development

```bash
git clone https://github.com/ygoc95/fandom-to-epub
cd fandom-to-epub
npm install
npm test
```

## License

MIT
