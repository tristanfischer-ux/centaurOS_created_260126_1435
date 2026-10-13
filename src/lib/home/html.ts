import { CSS, CSS2, CSS3, MARK, TICK, esc } from "@/lib/lumicity/html";

// Fractional Forge homepage: a short front door to the four services.
// Copy drafted by an OpenRouter writer/critic loop (13 Oct 2026) against a fixed fact sheet; no invented claims.

export const MAIL = "tristan.fischer@fractionalforge.app";

const FF_MARK = `<svg viewBox="0 0 32 32" width="20" height="20" aria-hidden="true"><path d="M16 4c1.5 4.5 6 6.5 6 12a6 6 0 0 1-12 0c0-2.6 1.2-4.3 2.6-5.6.3 2 1.3 3.2 2.6 3.6C14.6 10.4 15 7 16 4z" fill="currentColor"/></svg>`;
const DD_MARK = `<svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true"><path d="M5 25h22M8 25V13l6-4v16M14 25V9l10 5v11M18 17h2M18 21h2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ARROW = `<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M4 10h11m0 0l-4-4m4 4l-4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

type Svc = {
  key: string; name: string; href: string; img: string; mark: string;
  acc: string; accD: string; accS: string; accM: string;
  who: string; what: string; price: string; time: string; example: [string, string];
};

const SERVICES: Svc[] = [
  { key: "condition-desk", name: "Condition Desk", href: "/condition-desk", img: "/lumicity/img/cd-hero.jpg", mark: MARK["condition-desk"],
    acc: "#a8481a", accD: "#8a3a12", accS: "#fbeee4", accM: "#e9b896",
    who: "For housebuilders and land promoters",
    what: "Send the decision notice. Get every planning condition in plain English, with the ones that block a start on site picked out and covering letters drafted.",
    price: "£400 per permission", time: "Usually within a day", example: ["38", "conditions on a 150-home permission in Albrighton"] },
  { key: "habitat-draft", name: "Habitat Draft", href: "/habitat-draft", img: "/lumicity/img/hd-hero.jpg", mark: MARK["habitat-draft"],
    acc: "#2f6b43", accD: "#245437", accS: "#e9f3ec", accM: "#a6cdb3",
    who: "For ecology consultancies",
    what: "A two-page desk study before the walkover: protected sites within 600 m, a first habitat map, tree and hedge heights, and the parcels to check. Your ecologist signs everything.",
    price: "£150 per desk study", time: "Usually within a day", example: ["15", "parcels mapped on a 98-home site in Romsey"] },
  { key: "bid-check", name: "Bid Check", href: "/bid-check", img: "/lumicity/img/bc-hero.jpg", mark: MARK["bid-check"],
    acc: "#b4400c", accD: "#8f3208", accS: "#fdeee2", accM: "#eeb792",
    who: "For firms that bid for public contracts",
    what: "Send the tender pack. Get a bid at a glance: every pass-or-fail condition, every document to submit, how bids are scored and the key dates, each quoted from the tender.",
    price: "£600 per tender", time: "Usually within a day", example: ["52", "requirements in a real council tender, 18 pass or fail"] },
  { key: "design-dossier", name: "Design Dossier", href: "/design-dossier", img: "/ff/img/dd-card.jpg", mark: DD_MARK,
    acc: "#d9461a", accD: "#b23a12", accS: "#fff1ea", accM: "#f5b79c",
    who: "For hardware and deep-tech founders",
    what: "Send a short brief. Get a costed engineering design: bill of materials, financial model, drawings, worked calculations and a risk register, in a live Excel workbook a senior engineer has reviewed.",
    price: "First Dossier free", time: "A few days", example: ["6", "parts: design, bill of materials, financial model, drawings, calculations and risk register"] },
];

const FAQS: [string, string][] = [
  ["Do I need to talk to anyone?", "No. There are no sales calls. Each service page has an enquiry form, or you can email the documents."],
  ["Who checks the work?", "A person checks every report before it is sent. A senior engineer reviews each Design Dossier. For Habitat Draft, your own ecologist signs everything."],
  ["What do the reports use?", "Public documents and public data: the decision notice, the tender pack, national habitat and protected-site data, and the Environment Agency laser survey. Design Dossiers also use open engineering libraries and real component prices."],
  ["Can I see the work first?", "Yes. Every service page has a full sample report to download, built on a real, current case."],
];

const CSS_HOME = `
.home{--acc:#d9461a;--acc-d:#b23a12;--acc-s:#fff1ea;--acc-m:#f5b79c}
.home .logo .mk{background:var(--ink)}
.home .navlinks{gap:28px}
.mnav{display:block;position:relative}.mnav summary{list-style:none;cursor:pointer;border:1px solid #c9d2de;border-radius:999px;padding:8px 16px;font-weight:700;font-size:15px;background:#fff;min-height:40px;display:flex;align-items:center}
.mnav summary::-webkit-details-marker{display:none}
.mnav[open] .mpanel{display:grid}.mpanel{display:none;position:absolute;right:0;top:52px;background:#fff;border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow);padding:10px;min-width:230px;gap:2px;z-index:70}
.mpanel a{padding:10px 12px;border-radius:10px;color:var(--ink);font-weight:600;text-decoration:none}.mpanel a:hover{background:var(--surface)}
.home .nav .btn-primary{display:none}
.hh{position:relative;padding:36px 0 56px;background:radial-gradient(1100px 480px at 90% -10%,#fde7dc,transparent 60%),linear-gradient(180deg,#fffdf9,#fff)}
.hh .grid{display:grid;gap:34px;align-items:center}
.hh h1{margin-top:16px;max-width:19ch;font-size:clamp(38px,4.6vw,60px)}.hh h1 em{font-style:italic;color:var(--acc-d)}
.hh .sub{font-size:clamp(18px,2vw,20px);color:var(--ink-soft);max-width:52ch;margin-top:18px}
.hh .meta{display:flex;flex-wrap:wrap;gap:10px 22px;margin-top:22px;font-size:14.5px;color:var(--ink-soft);font-weight:600}.hh .meta span{display:inline-flex;align-items:center;gap:7px}.hh .meta svg{color:var(--acc)}
.hh .pic{position:relative}.hh .pic img{width:100%;aspect-ratio:5/4;object-fit:cover;border-radius:26px;display:block;box-shadow:0 30px 60px -30px rgba(15,23,41,.45)}
.route{background:#fff;border:1px solid var(--line);border-radius:20px;box-shadow:0 24px 50px -20px rgba(15,23,41,.35);padding:16px;margin-top:-56px;position:relative;margin-left:14px;margin-right:14px}
.route p{font-weight:700;font-size:14px;margin:2px 4px 8px;color:var(--ink)}
.route a{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:9px 10px;border-radius:12px;text-decoration:none;color:var(--ink-soft);font-size:14px;border-top:1px solid var(--line)}
.route a:first-of-type{border-top:0}.route a:hover{background:var(--surface)}
.route a b{color:var(--ink);font-size:14.5px;white-space:nowrap;display:inline-flex;align-items:center;gap:6px}.route a b i{width:9px;height:9px;border-radius:50%;display:inline-block}
.svcs{display:grid;gap:22px}
.svc{display:flex;flex-direction:column;background:#fff;border:1px solid var(--line);border-radius:24px;overflow:hidden;text-decoration:none;color:var(--ink);box-shadow:var(--shadow);transition:transform .15s ease,box-shadow .15s ease}
.svc:hover{transform:translateY(-3px);box-shadow:0 26px 50px -24px rgba(15,23,41,.4)}.svc:focus-visible{outline:3px solid var(--sa);outline-offset:3px}
.svc .im{position:relative}.svc .im img{width:100%;aspect-ratio:16/9;object-fit:cover;display:block}
.svc .tag{position:absolute;left:14px;top:14px;background:#fff;border-radius:999px;padding:6px 12px 6px 6px;display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:700;color:var(--ink);box-shadow:0 6px 16px rgba(15,23,41,.2)}
.svc .tag span{width:26px;height:26px;border-radius:50%;background:var(--sa);color:#fff;display:flex;align-items:center;justify-content:center}.svc .tag svg{width:16px;height:16px}
.svc .bd{padding:22px 22px 24px;display:flex;flex-direction:column;flex:1}
.svc h3{font-family:"Fraunces",Georgia,serif;font-size:28px;font-weight:600}
.svc .who{color:var(--sd);font-weight:700;font-size:14.5px;margin-top:4px}
.svc .what{color:var(--ink-soft);margin-top:12px;font-size:16px}
.svc .ex{display:flex;gap:12px;align-items:baseline;margin-top:16px;padding:12px 14px;border-radius:14px;background:var(--ss);border:1px solid var(--sm)}
.svc .ex b{font-family:"Fraunces",Georgia,serif;font-size:26px;color:var(--sd);line-height:1}.svc .ex small{font-size:13.5px;color:var(--ink-soft)}
.svc .ft{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:10px;margin-top:auto;padding-top:18px}
.svc .pr{font-weight:800;font-size:16px}.svc .pr small{display:block;font-weight:600;color:var(--muted);font-size:13px}
.svc .go{display:inline-flex;align-items:center;gap:6px;font-weight:700;color:var(--sd);font-size:15px}
.hsteps{display:grid;gap:18px;counter-reset:st}
.hstep{background:#fff;border:1px solid var(--line);border-radius:20px;padding:22px}
.hstep:before{counter-increment:st;content:counter(st);display:flex;width:34px;height:34px;border-radius:50%;background:var(--ink);color:#fff;font-weight:700;align-items:center;justify-content:center;font-family:"Fraunces",Georgia,serif}
.hstep h3{margin-top:12px;font-size:20px}.hstep p{color:var(--ink-soft);margin-top:6px;font-size:16px}
.who-band{display:grid;gap:26px;align-items:center;background:var(--ink);color:#fff;border-radius:28px;padding:28px;overflow:hidden}
.who-band img{width:100%;max-width:260px;aspect-ratio:1;object-fit:cover;border-radius:22px;display:block}
.who-band h2{color:#fff}.who-band p{color:#c7cfdc;margin-top:12px;font-size:17px;max-width:60ch}
.who-band ul{list-style:none;padding:0;margin:20px 0 0;display:grid;grid-template-columns:1fr 1fr;gap:16px}
.who-band li b{display:block;font-family:"Fraunces",Georgia,serif;font-size:30px;font-weight:600;line-height:1.05}.who-band li span{font-size:13.5px;color:#c7cfdc}
.who-band a{color:#fff;font-weight:700;display:inline-flex;gap:6px;align-items:center;margin-top:20px}
.hfoot{background:#fff;border-top:1px solid var(--line);padding:44px 0 28px;font-size:15px}
.hfoot .cols{display:grid;grid-template-columns:1fr 1fr;gap:26px}
.hfoot h4{font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin:0 0 10px}
.hfoot a{display:block;color:var(--ink-soft);text-decoration:none;padding:3px 0}.hfoot a:hover{color:var(--acc-d)}
.hfoot .line{margin-top:30px;color:var(--muted);font-size:13.5px}
.cta-photo .svc-row{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-top:26px}
.cta-photo .svc-row a{background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.45);color:#fff;border-radius:999px;padding:10px 16px;font-weight:700;text-decoration:none;min-height:44px;display:inline-flex;align-items:center}
.cta-photo .svc-row a:hover{background:#fff;color:var(--ink)}
@media(min-width:760px){.mnav{display:none}.home .nav .btn-primary{display:inline-flex}.hh{padding:60px 0 88px}.hh .grid{grid-template-columns:minmax(0,1fr) minmax(0,1.05fr);gap:64px}
.route{position:absolute;left:-56px;bottom:-64px;width:300px;margin:0;padding:12px}.route a{padding:7px 8px;font-size:13px}.svcs{grid-template-columns:1fr 1fr}.hsteps{grid-template-columns:repeat(3,1fr)}
.who-band{grid-template-columns:260px 1fr;padding:40px;gap:44px}.who-band ul{grid-template-columns:repeat(4,1fr)}.hfoot .cols{grid-template-columns:2fr 1fr 1fr 1fr}}
`;

function card(s: Svc): string {
  const vars = `--sa:${s.acc};--sd:${s.accD};--ss:${s.accS};--sm:${s.accM}`;
  return `<a class="svc" href="${s.href}" style="${vars}">
<div class="im"><img src="${s.img}" alt="" loading="lazy"><span class="tag"><span>${s.mark}</span>${esc(s.name)}</span></div>
<div class="bd"><h3>${esc(s.name)}</h3><p class="who">${esc(s.who)}</p><p class="what">${esc(s.what)}</p>
<div class="ex"><b>${esc(s.example[0])}</b><small>${esc(s.example[1])}</small></div>
<div class="ft"><p class="pr">${esc(s.price)}<small>${esc(s.time)}</small></p><span class="go">Sample report and form ${ARROW}</span></div></div></a>`;
}

export function buildHomeHtml(): string {
  const route = SERVICES.map((s) => `<a href="${s.href}"><span>${esc(s.who.replace(/^For /, ""))}</span><b><i style="background:${s.acc}"></i>${esc(s.name)}</b></a>`).join("");
  const faqs = FAQS.map(([q, a]) => `<details class="faq"><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("");
  const svcLinks = SERVICES.map((s) => `<a href="${s.href}">${esc(s.name)}</a>`).join("");
  return `<style>${CSS}${CSS2}${CSS3}${CSS_HOME}</style>
<div class="pg home">
<header class="nav"><div class="wrap nav-inner"><a class="logo" href="/"><span class="mk">${FF_MARK}</span><span><b>Fractional Forge</b><small>Checked reports, fixed prices</small></span></a>
<nav class="navlinks" aria-label="Main">${svcLinks}<a href="/insights">Insights</a></nav>
<a class="btn btn-primary" href="#services">Choose a service</a>
<details class="mnav"><summary>Menu</summary><div class="mpanel">${svcLinks}<a href="/insights">Insights</a><a href="/about">About</a><a href="mailto:${MAIL}">Email Tristan</a></div></details></div></header>

<section class="hh"><div class="wrap grid"><div>
<p class="eyebrow">Planning · Ecology · Tenders · Hardware</p>
<h1>Specialist reports, <em>checked by a person.</em></h1>
<p class="sub">Four services for housebuilders, ecologists, bid teams and hardware founders. Send your documents by email or web form and get a clear report back, usually within a day.</p>
<div class="cta-row"><a class="btn btn-primary" href="#services">Choose a service</a><a class="btn btn-ghost" href="#examples">See real examples</a></div>
<div class="meta"><span>${TICK} Fixed prices</span><span>${TICK} No sales calls</span><span>${TICK} Built from public documents</span></div>
</div>
<div class="pic"><img src="/ff/img/home-hero.jpg" alt="A desk with a housing site plan, a habitat map, a tender document and an engineering drawing" fetchpriority="high">
<div class="route"><p>Which service fits?</p>${route}</div></div>
</div></section>

<section class="s" id="services"><div class="wrap"><div class="s-head"><p class="eyebrow">Four services</p><h2>Pick the job you need done</h2>
<p class="lede">Each service has its own page with a real worked example, a full sample report to download and an enquiry form.</p></div>
<div class="svcs">${SERVICES.map(card).join("")}</div></div></section>

<section class="stats" id="examples"><div class="wrap"><ul>
<li><b>38</b><span>planning conditions registered for a 150-home permission in Albrighton</span></li>
<li><b>15</b><span>habitat parcels mapped on a 98-home site in Romsey</span></li>
<li><b>52</b><span>requirements found in a real council tender, 18 of them pass or fail</span></li>
<li><b>£0</b><span>for your first hardware Design Dossier</span></li>
</ul></div></section>

<section class="s alt" id="how"><div class="wrap"><div class="s-head"><p class="eyebrow">How it works</p><h2>Send it. We build it. A person checks it.</h2></div>
<div class="hsteps">
<div class="hstep"><h3>Send the documents</h3><p>A decision notice, a site boundary, a tender pack or a short hardware brief, through the service's form or by email.</p></div>
<div class="hstep"><h3>The report is built</h3><p>From public documents and public data, in plain English, with the sources shown.</p></div>
<div class="hstep"><h3>Checked, then sent</h3><p>A person checks it before it reaches you. Most reports arrive within a day; Design Dossiers take a few days.</p></div>
</div></div></section>

<section class="s"><div class="wrap"><div class="who-band">
<img src="/images/site/tristan.webp" alt="Tristan Fischer" loading="lazy">
<div><p class="eyebrow" style="background:transparent;border-color:#475569;color:#e2e8f0">Who is behind it</p>
<h2>Run by Tristan Fischer</h2>
<p>Tristan has been chief executive or a board director of fourteen companies, almost all hard technology: wind, solar, wave and tidal, batteries, carbon capture and indoor farming. He started in project finance at Citigroup and ran corporate venture investments at Shell Technology Ventures.</p>
<ul><li><b>14</b><span>companies led or overseen</span></li><li><b>3</b><span>industrial sites built</span></li><li><b>~£200m</b><span>raised</span></li><li><b>AIM</b><span>took a company public</span></li></ul>
<a href="/about">More about Tristan ${ARROW}</a></div></div></div></section>

<section class="s alt" id="faq"><div class="wrap"><div class="s-head"><h2>Questions</h2></div>${faqs}</div></section>

<section class="cta-photo"><img class="bg" src="/lumicity/img/cd-cta.jpg" alt="" loading="lazy"><div class="wrap"><h2>Start with the service that fits</h2>
<p>Every service page has a sample report and an enquiry form. Not sure which one? Email <a class="mail" href="mailto:${MAIL}">${MAIL}</a>.</p>
<div class="svc-row">${svcLinks}</div></div></section>

<footer class="hfoot"><div class="wrap"><div class="cols">
<div><a class="logo" href="/"><span class="mk">${FF_MARK}</span><span><b>Fractional Forge</b><small>Checked reports, fixed prices</small></span></a></div>
<div><h4>Services</h4>${svcLinks}</div>
<div><h4>Company</h4><a href="/about">About</a><a href="/insights">Insights</a><a href="mailto:${MAIL}">Contact</a></div>
<div><h4>More</h4><a href="/sample-package">Example Design Dossier</a><a href="/quote">For teams who quote</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a></div>
</div><p class="line">© ${new Date().getFullYear()} Fractional Forge Limited · ${MAIL}</p></div></footer>
</div>`;
}
