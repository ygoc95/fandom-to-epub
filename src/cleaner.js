import * as cheerio from 'cheerio';

const REMOVE = [
  '.portable-infobox', '.infobox', '#toc', '.toc',
  '.navbox', '.navbox-wrapper',
  '.mw-editsection', '.mw-editsection-like',
  'ol.references', '.mw-references-wrap', '.reflist',
  '.catlinks', '.gallery', 'figure', '.thumb', '.thumbinner',
  '.noprint', '.metadata', '.mw-empty-elt',
  '.sistersitebox',
  'style', 'script', 'noscript',
  'sup.reference', '.mw-cite-backlink',
  '.printfooter', '.mw-redirectedfrom',
  '.hidden', '.hiddenstructure'
];

function isDisambiguation(html) {
  return html.includes('class="disambig"') ||
         html.includes('id="disambigbox"') ||
         html.includes('disambig-notice');
}

export function cleanHtml(html, title) {
  if (isDisambiguation(html)) return { title, content: '' };
  if (/^List of|disambiguation/i.test(title)) return { title, content: '' };

  const $ = cheerio.load(`<html><body><div id="root">${html}</div></body></html>`);
  const root = $('#root');

  root.find(REMOVE.join(',')).remove();
  root.find('img').remove();
  root.find('br').replaceWith('\n');

  let text = '';

  function walk(el) {
    el.children().each((_, child) => {
      const $c = $(child);
      const tag = (child.tagName || '').toLowerCase();

      if (/^h[2-6]$/.test(tag)) {
        const heading = $c.text().replace(/\[(edit|source)\]/g, '').trim();
        if (!heading) return;
        const level = parseInt(tag[1]);
        text += `\n\n${'#'.repeat(level)} ${heading}\n\n`;
      } else if (tag === 'p') {
        const t = $c.text().trim();
        if (t.length > 5 && !t.startsWith('Categories:')) text += t + '\n\n';
      } else if (tag === 'ul' || tag === 'ol') {
        $c.children('li').each((_, li) => {
          const t = $(li).text().trim();
          if (t) text += '- ' + t + '\n';
        });
        text += '\n';
      } else if (tag === 'table') {
        if ($c.is('.wikitable, .article-table, .fandom-table')) {
          const rows = [];
          $c.find('tr').each((_, tr) => {
            const cells = [];
            $(tr).children('th, td').each((_, td) => cells.push($(td).text().trim()));
            if (cells.length) rows.push('| ' + cells.join(' | ') + ' |');
          });
          if (rows.length) text += '\n' + rows.join('\n') + '\n\n';
        }
      } else if (tag === 'div' && $c.children().length) {
        walk($c);
      } else if (tag === 'dl') {
        $c.children('dt, dd').each((_, d) => {
          const t = $(d).text().trim();
          if (t) text += t + '\n';
        });
        text += '\n';
      } else if (tag === 'blockquote') {
        const t = $c.text().trim();
        if (t) text += '> ' + t.replace(/\n/g, '\n> ') + '\n\n';
      } else if (tag && $c.text().trim().length > 5) {
        text += $c.text().trim() + '\n\n';
      }
    });
  }

  walk(root);

  text = text
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\[\d+\]/g, '')
    .replace(/\[citation needed\]/gi, '')
    .replace(/  +/g, ' ')
    .trim();

  return { title, content: text };
}
