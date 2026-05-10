const API_TIMEOUT = 30000;
const MAX_REDIRECTS = 5;

function apiUrl(base) {
  const u = typeof base === 'string' ? base : base.replace(/\/$/, '');
  return `${u}/api.php`;
}

async function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function apiCall(baseUrl, params, retries = 3) {
  const qs = new URLSearchParams({ ...params, format: 'json' });
  const url = `${apiUrl(baseUrl)}?${qs}`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), API_TIMEOUT);
    try {
      const r = await fetch(url, { signal: ctrl.signal });
      if (!r.ok) {
        if ([429, 503].includes(r.status) && attempt < retries) {
          await delay(1000 * attempt);
          continue;
        }
        throw new Error(`HTTP ${r.status}`);
      }
      return await r.json();
    } finally {
      clearTimeout(t);
    }
  }
  throw new Error(`Failed after ${retries} retries`);
}

async function resolveRedirect(baseUrl, title) {
  for (let i = 0; i < MAX_REDIRECTS; i++) {
    const data = await apiCall(baseUrl, {
      action: 'parse',
      page: title,
      prop: 'text'
    });
    const html = data?.parse?.text?.['*'] || '';
    if (!html.includes('class="redirectMsg"')) {
      return { title: data?.parse?.title || title, html };
    }
    const m = html.match(/<a\s[^>]*href="\/wiki\/([^"?]+)/);
    if (!m) return { title, html: '' };
    title = decodeURIComponent(m[1]);
  }
  return { title, html: '' };
}

export async function getPage(baseUrl, title) {
  return resolveRedirect(baseUrl, title);
}

export async function getCategoryMembers(baseUrl, category, limit = Infinity) {
  const pages = [];
  let cont = null;
  const catTitle = category.startsWith('Category:') ? category : `Category:${category}`;

  while (pages.length < limit) {
    const params = {
      action: 'query',
      list: 'categorymembers',
      cmtitle: catTitle,
      cmlimit: 500
    };
    if (cont) params.cmcontinue = cont;

    const data = await apiCall(baseUrl, params);
    for (const m of data.query?.categorymembers || []) {
      if (m.ns === 0 && !m.title.startsWith('Category:') && !m.title.startsWith('File:')) {
        pages.push(m.title);
        if (pages.length >= limit) break;
      }
    }
    cont = data.continue?.cmcontinue;
    if (!cont || !data.query?.categorymembers?.length) break;
  }
  return pages.slice(0, limit);
}

export async function getAllPages(baseUrl, limit = Infinity) {
  const pages = [];
  let cont = null;

  while (pages.length < limit) {
    const params = {
      action: 'query',
      list: 'allpages',
      aplimit: 500,
      apnamespace: 0,
      apfilterredir: 'nonredirects'
    };
    if (cont) params.apcontinue = cont;

    const data = await apiCall(baseUrl, params);
    for (const p of data.query?.allpages || []) {
      pages.push(p.title);
      if (pages.length >= limit) break;
    }
    cont = data.continue?.apcontinue;
    if (!cont || !data.query?.allpages?.length) break;
  }
  return pages.slice(0, limit);
}
