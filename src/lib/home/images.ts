const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Responsive <picture> for public HTML pages (homepage and service pages). */
export function responsiveImg(opts: {
  base: string;
  alt: string;
  width: number;
  height: number;
  widths: number[];
  sizes: string;
  lazy?: boolean;
  priority?: boolean;
  className?: string;
  imgClass?: string;
}): string {
  const avif = opts.widths.map((w) => `${opts.base}-${w}w.avif ${w}w`).join(", ");
  const webp = opts.widths.map((w) => `${opts.base}-${w}w.webp ${w}w`).join(", ");
  const fallback = `${opts.base}-${opts.widths[0]}w.jpg`;
  const loading = opts.priority
    ? 'fetchpriority="high"'
    : opts.lazy === false
      ? ""
      : 'loading="lazy"';
  const picClass = opts.className ? ` class="${opts.className}"` : "";
  const imgClass = opts.imgClass ? ` class="${opts.imgClass}"` : "";
  return `<picture${picClass}><source type="image/avif" srcset="${avif}" sizes="${opts.sizes}"><source type="image/webp" srcset="${webp}" sizes="${opts.sizes}"><img src="${fallback}" width="${opts.width}" height="${opts.height}" alt="${esc(opts.alt)}" ${loading} decoding="async"${imgClass}></picture>`;
}

export const CARD_SIZES = "(min-width: 760px) 50vw, 100vw";
export const CARD_WIDTHS = [560, 1120];
export const HERO_SIZES = "(min-width: 760px) 50vw, 100vw";
export const HERO_WIDTHS = [800, 1600];
export const CTA_SIZES = "100vw";
export const CTA_WIDTHS = [800, 1600];
export const AVATAR_SIZES = "260px";
export const AVATAR_WIDTHS = [260, 520];
export const CONTEXT_SIZES = "(min-width: 760px) 50vw, 100vw";
export const CONTEXT_WIDTHS = [560, 1120];
export const COVER_SIZES = "(min-width: 760px) 340px, 80vw";
export const COVER_WIDTHS = [340, 680];
