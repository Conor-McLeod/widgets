// KaTeX for everything that shows maths, in prose (via <M>) and in widgets.
// Importing this module also pulls in KaTeX's stylesheet and fonts, so a widget that uses it
// stays self-contained.
import katex from 'katex';
import 'katex/dist/katex.min.css';

export interface TexOptions {
  /** Display (block) mode: centred, full-size operators. Default inline. */
  display?: boolean;
  /** Throw on a parse error instead of showing the source in red. Pages set this so typos fail the build. */
  strict?: boolean;
}

const cache = new Map<string, string>();

/** Render TeX to an HTML string. Use with `v-html`, `innerHTML` or `set:html`. */
export function tex(src: string, { display = false, strict = false }: TexOptions = {}): string {
  const key = `${display ? 'D' : 'I'}${strict ? 'S' : ''}${src}`;
  let html = cache.get(key);
  if (html === undefined) {
    html = katex.renderToString(src, { displayMode: display, throwOnError: strict, output: 'htmlAndMathml' });
    if (cache.size > 2000) cache.clear();
    cache.set(key, html);
  }
  return html;
}

/**
 * Render text with `$...$` spans as maths, escaping everything else. Handy for labels and
 * captions that mix words and symbols: `texText('drag $\\theta$ to 0')`.
 */
export function texText(s: string, opts: TexOptions = {}): string {
  return s
    .split(/(\$[^$]+\$)/)
    .map((part, i) => (i % 2 ? tex(part.slice(1, -1), opts) : escapeHtml(part)))
    .join('');
}

export interface SvgLabelOptions {
  /** Horizontal anchor, as SVG's text-anchor. */
  anchor?: 'start' | 'middle' | 'end';
  /** Box size in user units. Content that overflows is still drawn. */
  width?: number;
  height?: number;
  /** Extra inline style for the box, e.g. `color: var(--muted); font-size: 11px`. */
  style?: string;
  className?: string;
}

/**
 * HTML (usually from `tex`/`texText`) placed in an SVG string, for vanilla widgets that build SVG
 * markup. Unlike <text>, (x, y) is the anchor point with y at the vertical centre.
 */
export function svgLabel(x: number, y: number, html: string, opts: SvgLabelOptions = {}): string {
  const { anchor = 'start', width = 160, height = 24, style = '', className = '' } = opts;
  const left = anchor === 'start' ? x : anchor === 'end' ? x - width : x - width / 2;
  const justify = anchor === 'start' ? 'flex-start' : anchor === 'end' ? 'flex-end' : 'center';
  return (
    `<foreignObject x="${left}" y="${y - height / 2}" width="${width}" height="${height}" overflow="visible">` +
    `<div xmlns="http://www.w3.org/1999/xhtml" class="${className}" style="display:flex;align-items:center;` +
    `justify-content:${justify};height:100%;white-space:nowrap;line-height:1;${style}"><span>${html}</span></div>` +
    `</foreignObject>`
  );
}

export const escapeHtml =(s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
