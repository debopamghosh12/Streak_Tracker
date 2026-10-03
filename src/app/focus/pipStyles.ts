/**
 * The pop-out (Document Picture-in-Picture) is a separate, empty document: it gets none of the
 * page's CSS unless we copy it. In dev Vite injects CSS as <style> tags; in production it's a
 * <link rel="stylesheet">. Copying the <link> element only works if the pop-out can fetch it
 * again, so same-origin stylesheets are copied by their text (no network, no flash of unstyled
 * content); cross-origin ones (Google Fonts) get a new <link> with the absolute href, and we wait
 * for those to load before showing anything. Written against small interfaces so it can be tested
 * without a DOM.
 */

interface SheetLike {
  cssRules: ArrayLike<{ cssText: string }>;
}
interface NodeLike {
  tagName: string;
  textContent: string | null;
  /** <link> only */
  href?: string;
  crossOrigin?: string | null;
  sheet?: SheetLike | null;
}
interface ElLike {
  textContent: string | null;
  rel?: string;
  href?: string;
  crossOrigin?: string | null;
  onload?: (() => void) | null;
  onerror?: (() => void) | null;
}
export interface DocLike {
  head: { querySelectorAll(sel: string): ArrayLike<NodeLike> & Iterable<NodeLike>; appendChild(el: ElLike): unknown };
  documentElement: { className: string; lang: string };
  body: { className: string; style: { backgroundColor: string; color: string } };
  createElement(tag: string): ElLike;
}

/** The text of a same-origin stylesheet, or null when it can't be read (cross-origin / not loaded). */
function sheetText(sheet: SheetLike | null | undefined): string | null {
  if (!sheet) return null;
  try {
    return Array.from(sheet.cssRules, (r) => r.cssText).join('\n');
  } catch {
    return null; // SecurityError: cross-origin sheet
  }
}

/**
 * Copies every stylesheet and the root classes into the pop-out. Resolves once linked
 * stylesheets have loaded (or failed, or `timeoutMs` passed). Returns what was copied.
 */
export async function copyStylesToPip(from: DocLike, to: DocLike, timeoutMs = 3000): Promise<{ styles: number; links: number; failed: string[] }> {
  const loads: Promise<void>[] = [];
  const failed: string[] = [];
  let styles = 0;
  let links = 0;
  for (const node of Array.from(from.head.querySelectorAll('style, link[rel="stylesheet"]'))) {
    const inline = node.tagName === 'STYLE' ? node.textContent : sheetText(node.sheet);
    if (inline !== null && inline !== undefined) {
      const style = to.createElement('style');
      style.textContent = inline;
      to.head.appendChild(style);
      styles++;
      continue;
    }
    if (!node.href) continue;
    const link = to.createElement('link');
    link.rel = 'stylesheet';
    link.href = node.href; // .href is already absolute
    if (node.crossOrigin != null) link.crossOrigin = node.crossOrigin; // "" = anonymous (Vite adds crossorigin)
    loads.push(
      new Promise<void>((resolve) => {
        link.onload = () => resolve();
        link.onerror = () => {
          failed.push(node.href!);
          resolve();
        };
      }),
    );
    to.head.appendChild(link);
    links++;
  }
  to.documentElement.className = from.documentElement.className;
  to.documentElement.lang = from.documentElement.lang;
  to.body.className = from.body.className;
  to.body.style.backgroundColor = '#000';
  to.body.style.color = '#E1E0CC';
  await Promise.race([Promise.all(loads), new Promise((r) => setTimeout(r, timeoutMs))]);
  if (failed.length) console.warn('[Persist] Pop-out: stylesheet failed to load:', failed.join(', '));
  return { styles, links, failed };
}
