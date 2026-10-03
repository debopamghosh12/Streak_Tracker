import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyStylesToPip, type DocLike } from './pipStyles';

// Tiny fake documents: enough of the DOM for copying stylesheets, no browser needed.
type El = { tag: string; textContent: string | null; rel?: string; href?: string; crossOrigin?: string | null; onload?: (() => void) | null; onerror?: (() => void) | null };

function sourceDoc(nodes: object[]): DocLike {
  return {
    head: { querySelectorAll: () => nodes as never, appendChild: () => {} },
    documentElement: { className: 'dark', lang: 'en' },
    body: { className: 'antialiased', style: { backgroundColor: '', color: '' } },
    createElement: () => ({ textContent: null }),
  };
}

function pipDoc(linkBehaviour: (href: string) => 'load' | 'error' | 'never' = () => 'load') {
  const appended: El[] = [];
  const doc: DocLike & { appended: El[] } = {
    appended,
    head: {
      querySelectorAll: () => [] as never,
      appendChild: (el) => {
        const e = el as El;
        appended.push(e);
        if (e.tag === 'link') {
          const b = linkBehaviour(e.href!);
          if (b !== 'never') setTimeout(() => (b === 'load' ? e.onload?.() : e.onerror?.()), 5);
        }
      },
    },
    documentElement: { className: '', lang: '' },
    body: { className: '', style: { backgroundColor: '', color: '' } },
    createElement: (tag) => ({ tag, textContent: null }) as El,
  };
  return doc;
}

const FONTS = 'https://fonts.googleapis.com/css2?family=Almarai';
const crossOriginSheet = {
  get cssRules(): never {
    throw Object.assign(new Error('blocked'), { name: 'SecurityError' });
  },
};

afterEach(() => vi.restoreAllMocks());

describe('pop-out stylesheets', () => {
  it('dev: <style> tags are copied by their content', async () => {
    const to = pipDoc();
    const r = await copyStylesToPip(sourceDoc([{ tagName: 'STYLE', textContent: '.text-primary{color:#DEDBC8}' }]), to);
    expect(r).toMatchObject({ styles: 1, links: 0 });
    expect(to.appended).toEqual([{ tag: 'style', textContent: '.text-primary{color:#DEDBC8}' }]);
  });

  it('production: the same-origin <link> stylesheet is copied by its rules (no second fetch), Google Fonts by a new <link> with the absolute href', async () => {
    const to = pipDoc();
    const r = await copyStylesToPip(
      sourceDoc([
        { tagName: 'LINK', textContent: '', href: FONTS, crossOrigin: null, sheet: crossOriginSheet },
        { tagName: 'LINK', textContent: '', href: 'https://persist.example/assets/index-abc.css', crossOrigin: '', sheet: { cssRules: [{ cssText: 'body{font-family:Almarai}' }, { cssText: '.rounded-full{border-radius:9999px}' }] } },
      ]),
      to,
    );
    expect(r).toEqual({ styles: 1, links: 1, failed: [] });
    expect(to.appended[0]).toMatchObject({ tag: 'link', rel: 'stylesheet', href: FONTS });
    expect(to.appended[1]).toEqual({ tag: 'style', textContent: 'body{font-family:Almarai}\n.rounded-full{border-radius:9999px}' });
  });

  it('a <link> whose rules cannot be read gets a new <link> with the absolute href, and we wait for it to load', async () => {
    const to = pipDoc();
    let done = false;
    const p = copyStylesToPip(sourceDoc([{ tagName: 'LINK', textContent: '', href: 'https://persist.example/assets/index-abc.css', crossOrigin: '', sheet: null }]), to).then((r) => {
      done = true;
      return r;
    });
    await Promise.resolve();
    expect(done).toBe(false); // still waiting for the stylesheet to load
    expect(to.appended[0]).toMatchObject({ tag: 'link', href: 'https://persist.example/assets/index-abc.css', crossOrigin: '' });
    await expect(p).resolves.toMatchObject({ links: 1, failed: [] });
  });

  it('copies root classes and colours; a failed or hanging stylesheet is logged and does not block forever', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const to = pipDoc((href) => (href.includes('bad') ? 'error' : 'never'));
    const r = await copyStylesToPip(
      sourceDoc([
        { tagName: 'LINK', textContent: '', href: 'https://x.example/bad.css', sheet: null },
        { tagName: 'LINK', textContent: '', href: 'https://x.example/slow.css', sheet: null },
      ]),
      to,
      50,
    );
    expect(r.failed).toEqual(['https://x.example/bad.css']);
    expect(warn).toHaveBeenCalled();
    expect(to.documentElement).toEqual({ className: 'dark', lang: 'en' });
    expect(to.body.className).toBe('antialiased');
    expect(to.body.style).toEqual({ backgroundColor: '#000', color: '#E1E0CC' });
  });
});
