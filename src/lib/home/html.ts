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
  who: string; what: string; price: string; mo?: string; time: string; example: [string, string];
};

const SERVICES: Svc[] = [
  { key: "condition-desk", name: "Condition Desk", href: "/condition-desk", img: "/lumicity/img/cd-hero.jpg", mark: MARK["condition-desk"],
    acc: "#a8481a", accD: "#8a3a12", accS: "#fbeee4", accM: "#e9b896",
    who: "For housebuilders and land promoters",
    what: "Send the decision notice. Get every planning condition in plain English, with the ones that block a start on site picked out and covering letters drafted.",
    price: "£400 per permission", mo: "£1,000 a month for five live sites", time: "Usually within a day", example: ["38", "conditions on a 150-home permission in Albrighton, 11 before work starts"] },
  { key: "habitat-draft", name: "Habitat Draft", href: "/habitat-draft", img: "/lumicity/img/hd-hero.jpg", mark: MARK["habitat-draft"],
    acc: "#2f6b43", accD: "#245437", accS: "#e9f3ec", accM: "#a6cdb3",
    who: "For ecology consultancies",
    what: "A two-page desk study before the walkover: protected sites within 600 m, a first habitat map, tree and hedge heights, and the parcels to check. Your ecologist signs everything.",
    price: "£150 per desk study", mo: "£1,000 a month for eight", time: "Usually within a day", example: ["15", "parcels mapped in Romsey, 5 to check"] },
  { key: "bid-check", name: "Bid Check", href: "/bid-check", img: "/lumicity/img/bc-hero.jpg", mark: MARK["bid-check"],
    acc: "#b4400c", accD: "#8f3208", accS: "#fdeee2", accM: "#eeb792",
    who: "For firms that bid for public contracts",
    what: "Send the tender pack. Get a bid at a glance: every pass-or-fail condition, every document to submit, how bids are scored and the key dates, each quoted from the tender.",
    price: "£600 per tender", mo: "£1,500 a month for three", time: "Usually within a day", example: ["52", "requirements for Drummond Community Centre, 18 pass or fail"] },
  { key: "design-dossier", name: "Design Dossier", href: "/design-dossier", img: "/ff/img/dd-card.jpg", mark: DD_MARK,
    acc: "#d9461a", accD: "#b23a12", accS: "#fff1ea", accM: "#f5b79c",
    who: "For hardware and deep-tech founders",
    what: "Send a short brief. Get a buildable, costed engineering design: bill of materials, true cost and financial model, drawings, worked calculations and a risk and regulatory register, in a live Excel workbook reviewed by a senior engineer.",
    price: "First Dossier free", time: "A few days", example: ["6", "parts: buildable design, costed bill of materials, true cost and financial model, drawings, worked calculations, risk and regulatory register"] },
];

export const FAQS: [string, string][] = [
  ["Do I need to talk to anyone?", "No. There are no sales calls. Each service page has an enquiry form, or you can email the documents."],
  ["Who checks the work?", "A senior engineer reviews each Design Dossier before you see it. For Habitat Draft, your own ecologist checks and signs everything. Condition Desk sets out each condition from the decision notice and Bid Check quotes the tender for every item, so your team can check each point against the original."],
  ["What do the reports use?", "Public documents and public data: the decision notice, the tender pack, national habitat and protected-site data, and the Environment Agency laser survey. Design Dossiers also use open engineering libraries and real component prices."],
  ["Can I see the work first?", "Yes. Every service page has a full sample report to download, built on a real, current case."],
];

export const CSS_HOME = `
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
.hh h1{margin-top:16px;max-width:16ch;line-height:1.05;font-size:clamp(44px,4.6vw,60px)}.hh h1 em{font-style:italic;color:var(--acc-d)}
.hh .sub{font-size:clamp(18px,2vw,20px);color:var(--ink-soft);max-width:52ch;margin-top:18px}
.proof{background:#fff;border:1px solid var(--line);border-radius:18px;box-shadow:0 24px 50px -20px rgba(15,23,41,.35);padding:12px 14px;margin-top:14px}.proof p{font-size:12.5px;font-weight:700;color:var(--muted);margin:0 0 6px;letter-spacing:.01em}.proof a{display:flex;align-items:center;gap:12px;padding:6px 2px;text-decoration:none;color:var(--ink-soft);border-top:1px solid var(--line);font-size:13px;line-height:1.3}.proof a:first-of-type{border-top:0}.proof b{font-family:"Fraunces",Georgia,serif;font-size:26px;font-weight:600;min-width:40px}
@media(min-width:760px){.proof{position:absolute;left:-44px;bottom:-36px;width:250px;margin:0}}
.jump{display:flex;flex-wrap:wrap;gap:8px;margin-top:22px}.jump a{display:inline-flex;align-items:center;gap:8px;background:#fff;border:1px solid var(--line);border-radius:999px;padding:8px 14px;font-weight:700;font-size:14.5px;color:var(--ink);text-decoration:none;min-height:40px}.jump a:hover{border-color:var(--ink)}.jump i{width:9px;height:9px;border-radius:50%;display:inline-block}
.hh .meta{display:flex;flex-wrap:wrap;gap:10px 22px;margin-top:22px;font-size:14.5px;color:var(--ink-soft);font-weight:600}.hh .meta span{display:inline-flex;align-items:center;gap:7px}.hh .meta svg{color:var(--acc)}
.hh .pic{position:relative}.hh .pic img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:26px;display:block;box-shadow:0 30px 60px -30px rgba(15,23,41,.45)}
.route{background:#fff;border:1px solid var(--line);border-radius:20px;box-shadow:0 24px 50px -20px rgba(15,23,41,.35);padding:16px;margin:16px 14px 0;position:relative}
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
.svc .ex b{font-family:"Fraunces",Georgia,serif;font-size:26px;color:var(--sd);line-height:1;white-space:nowrap;font-variant-numeric:tabular-nums;flex:none;min-width:2ch}.svc .ex small{font-size:13.5px;color:var(--ink-soft)}
.svc .ft{display:flex;flex-direction:column;align-items:stretch;gap:14px;margin-top:auto;padding-top:18px}
.svc .pr{font-weight:800;font-size:18px;color:var(--ink)}.svc .pr small{display:block;font-weight:600;color:var(--muted);font-size:13px}.svc .pr small.mo{font-size:14px;line-height:1.4;color:#596273;margin-top:4px}
.svc .go{display:flex;justify-content:center;align-items:center;gap:8px;font-weight:700;color:#fff;background:var(--sd);border-radius:999px;padding:12px 18px;font-size:15.5px;min-height:46px}.svc:hover .go{background:var(--ink)}
.hsteps{display:grid;gap:18px;counter-reset:st}
.hstep{background:#fff;border:1px solid var(--line);border-radius:20px;padding:22px}
.hstep:before{counter-increment:st;content:counter(st);display:flex;width:34px;height:34px;border-radius:50%;background:var(--ink);color:#fff;font-weight:700;align-items:center;justify-content:center;font-family:"Fraunces",Georgia,serif}
.hstep h3{margin-top:12px;font-size:20px}.hstep p{color:var(--ink-soft);margin-top:6px;font-size:16px}
.who-band{display:grid;gap:26px;align-items:center;background:var(--ink);color:#fff;border-radius:28px;padding:28px;overflow:hidden}
.who-band img{width:100%;max-width:260px;aspect-ratio:1;object-fit:cover;border-radius:22px;display:block}
.who-band h2{color:#fff}.who-band p{color:#c7cfdc;margin-top:12px;font-size:16px;line-height:1.6;max-width:60ch}
.who-band ul{list-style:none;padding:0;margin:20px 0 0;display:grid;grid-template-columns:1fr 1fr;gap:16px}
.who-band li b{display:block;font-family:"Fraunces",Georgia,serif;font-size:30px;font-weight:600;line-height:1.05}.who-band li span{font-size:15px;color:#f1f5f9;line-height:1.35;display:block;margin-top:4px}
.who-band a{color:#fff;font-weight:700;display:inline-flex;gap:6px;align-items:center;margin-top:20px}
.hfoot{background:#fff;border-top:1px solid var(--line);padding:44px 0 28px;font-size:15px}
.hfoot .cols{display:grid;grid-template-columns:1fr 1fr;gap:26px}
.hfoot h4{font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin:0 0 10px}
.hfoot a{display:block;color:var(--ink-soft);text-decoration:none;padding:3px 0}.hfoot a:hover{color:var(--acc-d)}
.hfoot .line{margin-top:30px;color:var(--muted);font-size:13.5px}
.cta-photo .svc-row{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-top:26px}
.home .cta-photo{position:relative;background:#0f1729}.home .cta-photo img.bg{opacity:.4}.home .cta-photo:before{content:"";position:absolute;inset:0;background:linear-gradient(rgba(15,23,42,.82),rgba(15,23,42,.9))}.home .cta-photo .wrap{position:relative;z-index:1}
.cta-photo .svc-row a{background:#fff;color:#0f172a;font-weight:600;border-radius:999px;padding:12px 20px;text-decoration:none;min-height:44px;display:inline-flex;align-items:center}
.cta-photo .svc-row a:before{content:"";width:9px;height:9px;border-radius:50%;margin-right:8px;flex:none}.cta-photo .svc-row a:nth-child(1):before{background:#a8481a}.cta-photo .svc-row a:nth-child(2):before{background:#2f6b43}.cta-photo .svc-row a:nth-child(3):before{background:#b4400c}.cta-photo .svc-row a:nth-child(4):before{background:#d9461a}
@media(min-width:760px){.mnav{display:none}.home .nav .btn-primary{display:inline-flex}.hh{padding:60px 0 64px}.hh .grid{grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:56px}.hh h1{font-size:clamp(40px,4.4vw,60px);max-width:13ch}.hh .pic{align-self:stretch}.hh .pic img{aspect-ratio:auto;height:500px}
.route{position:absolute;left:-48px;bottom:-40px;width:320px;margin:0;padding:10px 12px}.route a span{font-size:12.5px;line-height:1.3}.route a{padding:7px 8px;font-size:13px}.svcs{grid-template-columns:1fr 1fr}.hsteps{grid-template-columns:repeat(3,1fr)}
.who-band{grid-template-columns:260px 1fr;padding:40px;gap:44px}.who-band ul{grid-template-columns:repeat(4,1fr)}.hfoot .cols{grid-template-columns:2fr 1fr 1fr 1fr}}
#faq .wrap{max-width:768px;margin:0 auto}
@media(max-width:759px){.route{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:14px 0 0;padding:12px;box-shadow:0 10px 30px -18px rgba(15,23,41,.35)}.route p{grid-column:1/-1;margin:0 2px 2px}.route a,.route a:first-of-type{border:1px solid var(--line);justify-content:flex-start;padding:10px}.route a span{display:none}.hh .pic img{aspect-ratio:16/10;height:auto;border-radius:20px}.hh .eyebrow{font-size:11px;white-space:nowrap}.who-band{padding:48px 20px}.who-band img{max-width:160px;aspect-ratio:1;border-radius:18px;margin-bottom:4px}.cta-photo .svc-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}.cta-photo .svc-row a{width:100%;justify-content:center}}
`;

function card(s: Svc): string {
  const vars = `--sa:${s.acc};--sd:${s.accD};--ss:${s.accS};--sm:${s.accM}`;
  return `<a class="svc" href="${s.href}" style="${vars}">
<div class="im"><img src="${s.img}" alt="" loading="lazy"><span class="tag"><span>${s.mark}</span>${esc(s.who.replace(/^For /, ""))}</span></div>
<div class="bd"><h3>${esc(s.name)}</h3><p class="who">${esc(s.who)}</p><p class="what">${esc(s.what)}</p>
<div class="ex"><b>${esc(s.example[0])}</b><small>${esc(s.example[1])}</small></div>
<div class="ft"><p class="pr">${esc(s.price)}<small>${esc(s.time)}</small>${s.mo ? `<small class="mo">${esc(s.mo)}</small>` : ""}</p><span class="go">${s.key === "design-dossier" ? "Sample package and brief form" : "Sample report and form"} ${ARROW}</span></div></div></a>`;
}

const SVC_LINKS = () => SERVICES.map((s) => `<a href="${s.href}">${esc(s.name)}</a>`).join("");

export function siteHeader(): string {
  const svcLinks = SVC_LINKS();
  return `<header class="nav"><div class="wrap nav-inner"><a class="logo" href="/"><span class="mk">${FF_MARK}</span><span><b>Fractional Forge</b><small>Fixed-price specialist reports</small></span></a>
<nav class="navlinks" aria-label="Main">${svcLinks}<a href="/insights">Insights</a></nav>
<a class="btn btn-primary" href="#services">Choose a service</a>
<details class="mnav"><summary>Menu</summary><div class="mpanel">${svcLinks}<a href="/insights">Insights</a><a href="/about">About</a><a href="mailto:${MAIL}">Email Tristan</a></div></details></div></header>`;
}

export function siteFooter(): string {
  const svcLinks = SVC_LINKS();
  return `<footer class="hfoot"><div class="wrap"><div class="cols">
<div><a class="logo" href="/"><span class="mk">${FF_MARK}</span><span><b>Fractional Forge</b><small>Fixed-price specialist reports</small></span></a></div>
<div><h4>Services</h4>${svcLinks}</div>
<div><h4>Company</h4><a href="/about">About</a><a href="/insights">Insights</a><a href="mailto:${MAIL}">Contact</a></div>
<div><h4>More</h4><a href="/sample-package">Example Design Dossier</a><a href="/quote">For teams who quote</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a></div>
</div><p class="line">© ${new Date().getFullYear()} Fractional Forge Limited · ${MAIL}</p></div></footer>`;
}

export function buildHomeHtml(): string {
  const jump = SERVICES.map((s) => `<a href="${s.href}"><i style="background:${s.acc}"></i>${esc(s.name)}</a>`).join("");
  const faqs = FAQS.map(([q, a], i) => `<details class="faq" open><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("");
  const svcLinks = SVC_LINKS();
  return `<style>${CSS}${CSS2}${CSS3}${CSS_HOME}</style>
<div class="pg home">
${siteHeader()}

<section class="hh"><div class="wrap grid"><div>
<p class="eyebrow">Planning · Ecology · Tenders · Hardware</p>
<h1>Clear specialist reports, <em>at a fixed price.</em></h1>
<p class="sub">Four services for housebuilders, ecologists, bid teams and hardware founders. Send your documents by email or web form. Most reports are back within a day; Design Dossiers take a few days.</p>
<div class="cta-row"><a class="btn btn-primary" href="#services">Choose a service</a><a class="btn btn-ghost" href="#how">How it works</a></div>
<div class="meta"><span>${TICK} Fixed prices</span><span>${TICK} No sales calls</span><span>${TICK} A sample report for every service</span></div>
</div>
<div class="pic"><img src="/ff/img/home-hero.jpg" alt="Technical documents being reviewed at a table" fetchpriority="high">
<div class="proof"><p>Real examples, built from public documents</p>
<a href="/condition-desk"><b style="color:#8a3a12">38</b><span>planning conditions<br>Albrighton, 150 homes</span></a>
<a href="/habitat-draft"><b style="color:#245437">15</b><span>habitat parcels<br>Romsey, 98 homes</span></a>
<a href="/bid-check"><b style="color:#8f3208">52</b><span>tender requirements<br>Drummond, Hedge End</span></a></div></div>
</div></section>

<section class="s" id="services"><div class="wrap"><div class="s-head"><p class="eyebrow">Four services</p><h2>Pick the job you need done</h2>
<p class="lede">Each service has its own page with a real worked example, a full sample report to download and an enquiry form.</p></div>
<div class="svcs">${SERVICES.map(card).join("")}</div></div></section>

<section class="s"><div class="wrap"><div class="who-band">
<img src="/images/site/tristan.webp" alt="Tristan Fischer">
<div><p class="eyebrow" style="background:transparent;border-color:#475569;color:#e2e8f0">Who is behind it</p>
<h2>Run by Tristan Fischer</h2>
<p>Tristan has been chief executive or a board director of fourteen companies, almost all hard technology: wind, solar, wave and tidal, batteries, carbon capture and controlled-environment agriculture. He started in project finance at Citigroup and ran corporate venture investments at Shell Technology Ventures.</p>
<p>He has built three greenfield industrial sites, including a 25,000 m² automated factory, Fischer Farms, one of the world's largest vertical farms.</p>
<ul><li><b>14</b><span>companies as chief executive or board director</span></li><li><b>3</b><span>greenfield industrial sites built</span></li><li><b>£200m</b><span>raised, approximately</span></li><li><b>AIM</b><span>took one company public</span></li></ul>
<a href="/about">More about Tristan ${ARROW}</a></div></div></div></section>

<section class="s alt" id="how"><div class="wrap"><div class="s-head"><p class="eyebrow">How it works</p><h2>Three steps, no calls</h2></div>
<div class="hsteps">
<div class="hstep"><h3>Send the documents</h3><p>A decision notice, a site boundary, a tender pack or a short hardware brief, through the service's form or by email.</p></div>
<div class="hstep"><h3>The report is built</h3><p>Planning, ecology and tender reports are built from the public documents and data for your case. Design Dossiers are built from your brief, open engineering libraries and real component prices.</p></div>
<div class="hstep"><h3>Back by email</h3><p>Most reports arrive within a day; Design Dossiers take a few days and are reviewed by a senior engineer first.</p></div>
</div></div></section>



<section class="s alt" id="faq"><div class="wrap"><div class="s-head"><h2>Questions</h2></div>${faqs}</div></section>

<section class="cta-photo"><img class="bg" src="/lumicity/img/cd-cta.jpg" alt="" loading="lazy"><div class="wrap"><h2>Start with the service that fits</h2>
<p>Every service page has a sample report and an enquiry form. Not sure which one? Email <a class="mail" href="mailto:${MAIL}">${MAIL}</a>.</p>
<div class="svc-row">${svcLinks}</div></div></section>

${siteFooter()}
</div>`;
}
