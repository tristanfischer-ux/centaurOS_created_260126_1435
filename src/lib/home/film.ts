/** Explainer films on the four service pages. Approved 19 Oct 2026; do not rewrite captions. */

/** ffprobe format.duration of the hosted mp4. Display is the floor of that length. */
export const FILM_SECONDS = {
  // ffprobe 63.933s; the 14:39 ruling lists this heading as 1:04.
  "condition-desk": 64,
  "habitat-draft": 58.433333,
  "bid-check": 64.7,
  "design-dossier": 73.2,
} as const;

export function floorDuration(seconds: number): string {
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export const FILMS = {
  "condition-desk": { duration: floorDuration(FILM_SECONDS["condition-desk"]) },
  "habitat-draft": { duration: floorDuration(FILM_SECONDS["habitat-draft"]) },
  "bid-check": { duration: floorDuration(FILM_SECONDS["bid-check"]) },
  "design-dossier": { duration: floorDuration(FILM_SECONDS["design-dossier"]) },
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
