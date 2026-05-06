import { describe, test, expect } from '@jest/globals';

// Mock fetch globally
const originalFetch = global.fetch;

function mockFetch(responses) {
  let call = 0;
  global.fetch = async (url) => {
    const key = call++;
    const resp = responses[key] || responses[responses.length - 1] || { ok: true, json: async () => ({}) };
    const status = resp.status || 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: resp.json || (async () => ({}))
    };
  };
}

afterEach(() => {
  global.fetch = originalFetch;
});

describe('getPage', () => {
  test('resolves a normal page without redirect', async () => {
    const { getPage } = await import('../src/scraper.js');

    mockFetch([
      { ok: true, json: async () => ({ parse: { title: 'TestPage', text: { '*': '<p>Hello world</p>' } } }) }
    ]);

    const result = await getPage('https://test.fandom.com', 'TestPage');
    expect(result.title).toBe('TestPage');
    expect(result.html).toBe('<p>Hello world</p>');
  });

  test('follows a redirect', async () => {
    const { getPage } = await import('../src/scraper.js');

    mockFetch([
      {
        ok: true,
        json: async () => ({
          parse: {
            title: 'Redirect',
            text: { '*': '<div class="redirectMsg"><p>Redirect to:</p><ul class="redirectText"><li><a href="/wiki/RealPage" title="RealPage">RealPage</a></li></ul></div>' }
          }
        })
      },
      { ok: true, json: async () => ({ parse: { title: 'RealPage', text: { '*': '<p>Actual content</p>' } } }) }
    ]);

    const result = await getPage('https://test.fandom.com', 'Redirect');
    expect(result.title).toBe('RealPage');
    expect(result.html).toBe('<p>Actual content</p>');
  });

  test('returns empty html on api failure', async () => {
    const { getPage } = await import('../src/scraper.js');

    mockFetch([
      { ok: false, status: 500 }
    ]);

    await expect(getPage('https://test.fandom.com', 'Fail')).rejects.toThrow();
  });
});

describe('getCategoryMembers', () => {
  test('returns member titles (namespace 0 only)', async () => {
    const { getCategoryMembers } = await import('../src/scraper.js');

    mockFetch([
      {
        ok: true,
        json: async () => ({
          query: {
            categorymembers: [
              { ns: 0, title: 'Article' },
              { ns: 0, title: 'Another' },
              { ns: 14, title: 'Category:Meta' },
              { ns: 0, title: 'RealPage' },
              { ns: 6, title: 'File:Image.png' }
            ]
          }
        })
      }
    ]);

    const pages = await getCategoryMembers('https://test.fandom.com', 'Characters');
    expect(pages).toContain('Article');
    expect(pages).toContain('Another');
    expect(pages).toContain('RealPage');
    expect(pages).not.toContain('Category:Meta');
    expect(pages).not.toContain('File:Image.png');
  });

  test('handles pagination via cmcontinue', async () => {
    const { getCategoryMembers } = await import('../src/scraper.js');

    mockFetch([
      {
        ok: true,
        json: async () => ({
          continue: { cmcontinue: 'abc123' },
          query: { categorymembers: [{ ns: 0, title: 'Page1' }, { ns: 0, title: 'Page2' }] }
        })
      },
      {
        ok: true,
        json: async () => ({
          query: { categorymembers: [{ ns: 0, title: 'Page3' }] }
        })
      }
    ]);

    const pages = await getCategoryMembers('https://test.fandom.com', 'Large');
    expect(pages).toEqual(['Page1', 'Page2', 'Page3']);
  });

  test('respects limit', async () => {
    const { getCategoryMembers } = await import('../src/scraper.js');

    mockFetch([
      {
        ok: true,
        json: async () => ({
          query: {
            categorymembers: [
              { ns: 0, title: 'A' }, { ns: 0, title: 'B' },
              { ns: 0, title: 'C' }, { ns: 0, title: 'D' }
            ]
          }
        })
      }
    ]);

    const pages = await getCategoryMembers('https://test.fandom.com', 'Chars', 2);
    expect(pages).toHaveLength(2);
  });
});

describe('getAllPages', () => {
  test('returns all main-namespace pages', async () => {
    const { getAllPages } = await import('../src/scraper.js');

    mockFetch([
      {
        ok: true,
        json: async () => ({
          continue: { apcontinue: 'mid' },
          query: { allpages: [{ title: 'Apple' }, { title: 'Banana' }] }
        })
      },
      {
        ok: true,
        json: async () => ({
          query: { allpages: [{ title: 'Cherry' }] }
        })
      }
    ]);

    const pages = await getAllPages('https://test.fandom.com');
    expect(pages).toEqual(['Apple', 'Banana', 'Cherry']);
  });
});

describe('apiCall retry', () => {
  test('retries on 429', async () => {
    const { getAllPages } = await import('../src/scraper.js');

    mockFetch([
      { ok: false, status: 429 },
      { ok: false, status: 429 },
      {
        ok: true,
        json: async () => ({ query: { allpages: [{ title: 'Recovered' }] } })
      }
    ]);

    const pages = await getAllPages('https://test.fandom.com', 1);
    expect(pages).toEqual(['Recovered']);
  });
});
