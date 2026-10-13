import { CSS, CSS2, CSS3, TICK, esc } from "@/lib/lumicity/html";
import { CSS_HOME, MAIL, siteFooter, siteHeader } from "@/lib/home/html";
import copy from "@/lib/home/dd-copy.json";

// Design Dossier page in the same design as the other service pages.
// Copy drafted by an OpenRouter writer/critic loop (13 Oct 2026) against a fixed fact sheet.
// The AI barge example is shown anonymously (Tristan, 13 Oct 2026): no client name, suppliers, sites or costs.

const ARROW = `<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M4 10h11m0 0l-4-4m4 4l-4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const CSS_DD = `
.dd{--acc:#d9461a;--acc-d:#b23a12;--acc-s:#fff1ea;--acc-m:#f5b79c}
.ddsplit{display:grid;gap:30px;align-items:center}.ddsplit img{width:100%;border-radius:24px;display:block;aspect-ratio:4/3;object-fit:cover;box-shadow:var(--shadow)}
.ddsplit ul{list-style:none;padding:0;margin:18px 0 0;display:grid;gap:12px}.ddsplit li{display:flex;gap:10px;color:var(--ink-soft);font-size:17px}.ddsplit li svg{color:var(--acc);flex:none;margin-top:5px}
.ddsplit .close{margin-top:18px;font-weight:600}
.getg{display:grid;gap:16px}.getg div{background:#fff;border:1px solid var(--line);border-radius:20px;padding:22px}
.getg b{display:flex;gap:10px;align-items:center;font-size:18px}.getg b i{width:30px;height:30px;border-radius:50%;background:var(--acc-s);color:var(--acc-d);font-style:normal;font-family:"Fraunces",Georgia,serif;display:flex;align-items:center;justify-content:center;font-size:15px;flex:none}
.getg p{color:var(--ink-soft);margin-top:8px;font-size:16px}
.exs{display:grid;gap:22px}.ex{background:#fff;border:1px solid var(--line);border-radius:24px;overflow:hidden;box-shadow:var(--shadow);display:flex;flex-direction:column}
.ex .ims{display:grid;grid-template-columns:2fr 1fr;gap:4px}.ex .ims img{width:100%;height:100%;aspect-ratio:4/3;object-fit:cover;display:block}
.ex .bd{padding:22px}.ex h3{font-family:"Fraunces",Georgia,serif;font-size:26px;font-weight:600}.ex p{color:var(--ink-soft);margin-top:8px}.ex small{display:block;color:var(--muted);margin-top:10px;font-size:13.5px}
.ex .lnk{display:inline-flex;gap:6px;align-items:center;font-weight:700;color:var(--acc-d);margin-top:14px;margin-right:18px}
.ddtrust{background:#fff;border:1px solid var(--line);border-radius:24px;padding:26px}.ddtrust ul{list-style:none;padding:0;margin:16px 0 0;display:grid;gap:12px;grid-template-columns:1fr}.ddtrust li{display:flex;gap:10px;color:var(--ink-soft)}.ddtrust li svg{color:var(--acc);flex:none;margin-top:5px}
.steer{margin-top:18px;background:var(--acc-s);border:1px solid var(--acc-m);border-radius:20px;padding:20px 22px}.steer b{display:block;font-size:18px}.steer p{color:var(--ink-soft);margin-top:6px}
.notl{list-style:none;padding:0;margin:18px 0 0;display:grid;gap:10px}.notl li{display:flex;gap:10px;color:var(--ink-soft)}.notl li svg{color:var(--acc);flex:none;margin-top:5px}
@media(min-width:760px){.ddsplit{grid-template-columns:1fr 1fr;gap:56px}.getg{grid-template-columns:repeat(3,1fr)}.exs{grid-template-columns:1fr 1fr}}
`;

type Ex = { key: string; title: string; text: string; caption: string };

function example(e: Ex): string {
  if (e.key === "barge") {
    return `<div class="ex"><div class="ims"><img src="/ff/img/barge-sea.jpg" alt="Render of a floating AI data centre on a barge at sea, from the 3D model" loading="lazy"><img src="/ff/img/barge-deck.jpg" alt="Render of the barge deck with cooling and power equipment" loading="lazy"></div>
<div class="bd"><h3>${esc(e.title)}</h3><p>${esc(e.text)}</p><small>${esc(e.caption)}</small></div></div>`;
  }
  return `<div class="ex"><div class="ims"><img src="/images/site/dossier-render.webp" alt="Render of a water-treatment plant designed with Anvil" loading="lazy"><img src="/images/site/dossier-ga.webp" alt="General-arrangement drawing of the water-treatment plant" loading="lazy"></div>
<div class="bd"><h3>${esc(e.title)}</h3><p>${esc(e.text)}</p><small>${esc(e.caption)}</small>
<a class="lnk" href="/cost/water-treatment-plant">Worked cost breakdown ${ARROW}</a><a class="lnk" href="/sample-package">Example package ${ARROW}</a></div></div>`;
}

export function buildDdHtml(): string {
  const c = copy;
  const card = c.hero.card.rows.map(([v, l]) => `<a href="#get"><b style="font-size:20px;min-width:96px">${esc(v)}</b><span>${esc(l)}</span></a>`).join("");
  const faqs = c.faqs.map((f) => `<details class="faq" open><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join("");
  return `<style>${CSS}${CSS2}${CSS3}${CSS_HOME}${CSS_DD}</style>
<div class="pg home dd">
${siteHeader()}

<section class="hh"><div class="wrap grid"><div>
<p class="eyebrow">${esc(c.hero.eyebrow)}</p>
<h1>${esc(c.hero.headline)}</h1>
<p class="sub">${esc(c.hero.subhead)}</p>
<div class="cta-row"><a class="btn btn-primary" href="/brief">${esc(c.hero.cta)}</a><a class="btn btn-ghost" href="#examples">See worked examples</a></div>
<div class="meta"><span>${TICK} First Dossier free</span><span>${TICK} No sales calls</span><span>${TICK} Reviewed by a senior engineer</span></div>
</div>
<div class="pic"><img src="/ff/img/barge-sea.jpg" alt="Render of a floating AI data centre designed with Anvil, at sea" fetchpriority="high">
<div class="proof"><p>${esc(c.hero.card.title)}</p>${card}</div></div>
</div></section>

<section class="stats"><div class="wrap"><ul>${c.stats.map(([v, l]) => `<li><b>${esc(v)}</b><span>${esc(l)}</span></li>`).join("")}</ul></div></section>

<section class="s"><div class="wrap ddsplit"><img src="/ff/img/dd-card.jpg" alt="An engineering workshop with a skid-mounted water treatment unit" loading="lazy">
<div><h2>${esc(c.problem.title)}</h2><ul>${c.problem.points.map((p) => `<li>${TICK}<span>${esc(p)}</span></li>`).join("")}</ul><p class="close">${esc(c.problem.close)}</p></div></div></section>

<section class="s alt" id="how"><div class="wrap"><div class="s-head"><p class="eyebrow">How it works</p><h2>From one paragraph to a design you can inspect</h2></div>
<div class="hsteps">${c.steps.map((s) => `<div class="hstep"><h3>${esc(s.title.replace(/^\d+\.\s*/, ""))}</h3><p>${esc(s.text)}</p></div>`).join("")}</div>
<div class="steer"><b>${esc(c.steer.title)}</b><p>${esc(c.steer.text)}</p></div></div></section>

<section class="s" id="get"><div class="wrap"><div class="s-head"><p class="eyebrow">What you get</p><h2>Six parts, one live workbook</h2></div>
<div class="getg">${c.get.map((g, i) => `<div><b><i>${i + 1}</i>${esc(g.title)}</b><p>${esc(g.text)}</p></div>`).join("")}</div></div></section>

<section class="s alt" id="examples"><div class="wrap"><div class="s-head"><p class="eyebrow">Worked examples</p><h2>Real designs from the same engine</h2><p class="lede">${esc(c.examples_intro)}</p></div>
<div class="exs">${c.examples.map(example).join("")}</div></div></section>

<section class="s"><div class="wrap"><div class="ddtrust"><h2>${esc(c.trust.title)}</h2><p class="lede" style="margin-top:10px">${esc(c.trust.intro)}</p>
<ul>${c.trust.points.map((p) => `<li>${TICK}<span>${esc(p)}</span></li>`).join("")}</ul></div></div></section>

<section class="s alt" id="price"><div class="wrap"><div class="s-head"><p class="eyebrow">Price</p><h2>Start free</h2></div>
<div class="price"><div class="pc feat"><p class="amt">${esc(c.price.one)}</p><p class="unit">${esc(c.price.one_unit)}</p><div class="cta-row"><a class="btn btn-primary" href="/brief">Send a brief</a></div></div>
<div class="pc"><p class="amt" style="font-size:26px">${esc(c.price.after)}</p><p class="unit">${esc(c.price.after_unit)}</p></div></div>
<ul class="notl">${c.not_do.map((n) => `<li>${TICK}<span>${esc(n)}</span></li>`).join("")}</ul></div></section>

<section class="s"><div class="wrap"><div class="who-band">
<img src="/images/site/tristan.webp" alt="Tristan Fischer">
<div><p class="eyebrow" style="background:transparent;border-color:#475569;color:#e2e8f0">Who is behind it</p>
<h2>Run by Tristan Fischer</h2>
<p>Tristan has been chief executive or a board director of fourteen companies, almost all hard technology. He has built three greenfield industrial sites, including a 25,000 m² automated factory at Fischer Farms, and raised around £200m. He started in project finance at Citigroup and ran corporate venture investments at Shell Technology Ventures.</p>
<a href="/about">More about Tristan ${ARROW}</a></div></div></div></section>

<section class="s alt" id="faq"><div class="wrap"><div class="s-head"><h2>Questions</h2></div>${faqs}</div></section>

<section class="cta-photo"><img class="bg" src="/ff/img/barge-deck.jpg" alt="" loading="lazy"><div class="wrap"><h2>Send a brief</h2>
<p>${esc(c.cta_line)} Questions? Email <a class="mail" href="mailto:${MAIL}">${MAIL}</a>.</p>
<div class="cta-row"><a class="btn btn-primary" href="/brief">Send a brief</a></div></div></section>

${siteFooter()}
</div>`;
}
