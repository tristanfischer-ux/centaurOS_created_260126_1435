// "What you gain" blocks: explicit buyer benefits per service (save time, make money, reduce risk, known cost).
// Written 13 Oct 2026 from the fact sheet only: no invented numbers or guarantees.
import GAINS from "@/lib/home/gains.json";

export { GAINS };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const GAINS_CSS = `
.gains{display:grid;gap:16px}.gain{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:22px;border-top:4px solid var(--acc)}
.gain small{display:inline-block;font-size:12px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:var(--acc-d);background:var(--acc-s);border-radius:999px;padding:4px 10px}
.gain h3{font-family:var(--serif);font-size:22px;font-weight:600;margin-top:12px}.gain p{color:var(--ink-soft);margin-top:8px;font-size:16px}
.svc .lead{font-family:var(--serif);font-size:19px;color:var(--ink);margin-top:10px;font-weight:600}
@media(min-width:760px){.gains{grid-template-columns:repeat(4,1fr)}}
`;

export function gainsSection(key: keyof typeof GAINS): string {
  const g = GAINS[key];
  return `<section class="s" id="gain"><div class="wrap"><div class="s-head"><p class="eyebrow">What you gain</p><h2>${esc(g.lead)}</h2></div>
<div class="gains">${g.gains.map(([k, t, x]) => `<div class="gain"><small>${esc(k)}</small><h3>${esc(t)}</h3><p>${esc(x)}</p></div>`).join("")}</div></div></section>`;
}
