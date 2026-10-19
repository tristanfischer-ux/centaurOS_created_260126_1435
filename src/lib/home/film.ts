/** Explainer films on the four service pages. Approved 19 Oct 2026; do not rewrite captions. */

export const FILMS = {
  "condition-desk": { duration: "1:04" },
  "habitat-draft": { duration: "0:58" },
  "bid-check": { duration: "1:05" },
  "design-dossier": { duration: "1:13" },
} as const;

export type FilmKey = keyof typeof FILMS;

export const FILM_CSS = `
.film{max-width:920px}
.film h2{margin-top:14px}
.film-dur{font-family:var(--sans);font-size:15px;font-weight:700;color:var(--muted);margin-left:12px;letter-spacing:0;font-variant-numeric:tabular-nums}
.film-frame{max-width:100%;aspect-ratio:16/9;border-radius:var(--r-lg);overflow:hidden;background:var(--skel);box-shadow:var(--shadow);margin-top:22px}
.film-frame video{width:100%;height:auto;max-width:100%;aspect-ratio:16/9;display:block;border-radius:var(--r-lg)}
`;

export function explainerFilm(key: FilmKey): string {
  const d = FILMS[key];
  return `<section class="s" id="explainer"><div class="wrap"><div class="film">
<p class="eyebrow">Explainer</p>
<h2>Watch how it works<span class="film-dur">${d.duration}</span></h2>
<div class="film-frame"><video controls preload="none" playsinline poster="/ff/films/${key}.webp" width="1920" height="1080">
<source src="/ff/films/${key}.mp4" type="video/mp4">
<track kind="captions" src="/ff/films/${key}.vtt" srclang="en" label="English" default>
</video></div>
</div></div></section>`;
}
