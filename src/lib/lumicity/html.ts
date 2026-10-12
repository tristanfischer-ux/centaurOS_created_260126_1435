import copy from "./copy.json";

export type LumicityKey = "condition-desk" | "habitat-draft" | "bid-check";
export const CAL = "https://calendly.com/tristan-fischer-wjlf/30min";
export const MAIL = "tristan.fischer@fractionalforge.app";
export const KEYS: LumicityKey[] = ["condition-desk", "habitat-draft", "bid-check"];
type C = (typeof copy)["condition-desk"];

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const CSS = `
:root{--bg:#fff;--surface:#f8fafc;--surface-2:#f1f5f9;--ink:#0f1729;--ink-soft:#334155;--muted:#5b6b82;--line:#e6eaf0;--ember:#e2562a;--ember-dark:#b83a0e;--ember-soft:#fff2ec;--blue:#1d4ed8;--green:#0f7a4d;--green-soft:#e8f6ef;--amber:#8a5a00;--amber-soft:#fff6e0;--red:#a3231b;--red-soft:#fdecea;--radius:16px;--shadow:0 1px 2px rgba(15,23,41,.04),0 10px 30px rgba(15,23,41,.07);--font:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,Helvetica,Arial,sans-serif}
*{box-sizing:border-box}html{scroll-behavior:smooth;color-scheme:light}
body{overflow-wrap:anywhere;margin:0;background:#fff;color:var(--ink);font-family:var(--font);line-height:1.6;font-size:17px;-webkit-font-smoothing:antialiased;overflow-x:hidden}
a{color:var(--blue)}h1,h2,h3{line-height:1.15;letter-spacing:-.02em;margin:0}p{margin:0}
h1{font-size:clamp(34px,8vw,60px);font-weight:800}h2{font-size:clamp(26px,5vw,36px);font-weight:800}h3{font-size:19px;font-weight:700}
.wrap{max-width:1080px;margin:0 auto;padding:0 20px}
.eyebrow{font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--ember-dark)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border-radius:999px;padding:14px 24px;font-weight:700;font-size:16px;cursor:pointer;border:1px solid transparent;text-decoration:none;font-family:inherit;min-height:48px}
.btn-primary{background:var(--ember-dark);color:#fff;box-shadow:0 6px 18px rgba(226,86,42,.28)}.btn-primary:hover{background:#9c300a}
.btn-ghost{background:#fff;color:var(--ink);border-color:#c9d2de}.btn-ghost:hover{border-color:var(--ink)}
:focus-visible{outline:3px solid var(--blue);outline-offset:2px}
header.nav{position:sticky;top:0;z-index:50;background:rgba(255,255,255,.94);backdrop-filter:blur(8px);border-bottom:1px solid var(--line)}
.nav-inner{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:62px}
.brand{display:flex;align-items:baseline;gap:8px;font-weight:800;font-size:18px;color:var(--ink);text-decoration:none;flex-wrap:wrap}
.brand small{font-weight:600;font-size:13px;color:var(--muted)}
.nav .btn{padding:9px 18px;min-height:40px;font-size:15px}
.hero{padding:44px 0 48px;background:linear-gradient(180deg,var(--ember-soft),#fff 70%)}
.hero h1{margin-top:14px;max-width:18ch}.hero .sub{font-size:clamp(18px,2.4vw,21px);color:var(--ink-soft);max-width:60ch;margin-top:18px}
.cta-row{display:flex;gap:12px;flex-wrap:wrap;margin-top:28px}
.hero-note{margin-top:14px;font-size:14px;color:var(--muted)}
section.s{padding:52px 0}section.alt{background:var(--surface);border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.s-head{max-width:64ch;margin-bottom:26px}.s-head h2{margin-bottom:10px}.s-head p{color:var(--ink-soft)}
.problems{list-style:none;margin:0;padding:0;display:grid;gap:12px}
.problems li{background:#fff;border:1px solid var(--line);border-left:4px solid var(--ember);border-radius:12px;padding:16px 18px;font-size:17px}
.steps{display:grid;gap:14px;counter-reset:s}.step{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:22px}
.step .n{width:36px;height:36px;border-radius:10px;background:var(--ember-soft);color:var(--ember-dark);font-weight:800;display:flex;align-items:center;justify-content:center;margin-bottom:12px}
.step p{color:var(--ink-soft);font-size:16px;margin-top:6px}
.demo-label{display:inline-block;font-size:14px;color:var(--ink-soft);background:#fff;border:1px solid var(--line);border-radius:12px;padding:10px 14px;margin-bottom:18px}
.demo-label b{color:var(--ember-dark)}
.panel{background:#fff;border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);padding:16px}
.chips{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 14px}
.chip{border:1px solid #c9d2de;background:#fff;color:var(--ink);border-radius:999px;padding:8px 14px;font-size:14.5px;font-weight:600;cursor:pointer;font-family:inherit;min-height:40px}
.chip[aria-pressed=true]{background:var(--ink);color:#fff;border-color:var(--ink)}
.chip span{opacity:.75;font-weight:700;margin-left:4px}
.block{background:var(--amber-soft);border:1px solid #f0d58a;border-radius:12px;padding:14px 16px;margin-bottom:16px}
.block h3{font-size:16px;margin-bottom:6px}.block p{font-size:14.5px;color:var(--ink-soft)}
.block ul{margin:8px 0 0;padding-left:18px;font-size:14.5px}
.block button.lnk{background:none;border:0;color:var(--blue);text-decoration:underline;cursor:pointer;font:inherit;padding:0;text-align:left}
.cards{display:grid;gap:8px}
.cc{border:1px solid var(--line);border-radius:12px;background:#fff}
.cc>button{all:unset;box-sizing:border-box;display:flex;gap:10px;width:100%;padding:12px 14px;cursor:pointer;align-items:flex-start}
.cc>button:focus-visible{outline:3px solid var(--blue);outline-offset:2px;border-radius:12px}
.cc .num{min-width:28px;height:28px;border-radius:8px;background:var(--surface-2);font-weight:800;font-size:13px;display:flex;align-items:center;justify-content:center}
.cc .t{font-weight:700;font-size:15.5px;line-height:1.3}.cc .meta{font-size:13px;color:var(--muted);margin-top:2px}
.cc .caret{margin-left:auto;color:var(--muted);transition:transform .15s}.cc.open .caret{transform:rotate(180deg)}
.cc .body{display:none;padding:0 14px 14px 52px;font-size:15px;color:var(--ink-soft)}.cc.open .body{display:block}
.cc .body h4{margin:12px 0 4px;font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}.cc .body ul{margin:0;padding-left:18px}
.tag{display:inline-block;font-size:12px;font-weight:700;border-radius:999px;padding:2px 9px;background:var(--surface-2);color:var(--ink-soft)}
.tag.red{background:var(--red-soft);color:var(--red)}
.hd{display:grid;gap:16px}.hd .map{margin:0}.hd .map img{width:100%;height:auto;display:block;border:1px solid var(--line);border-radius:12px;background:#fff}
.hd .map figcaption{font-size:13px;color:var(--muted);margin-top:6px}
.plist{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 14px}
.pbtn{border:1px solid #c9d2de;background:#fff;border-radius:10px;padding:8px 12px;font-weight:700;font-size:14.5px;cursor:pointer;font-family:inherit;min-height:40px;display:flex;align-items:center;gap:6px}
.pbtn[aria-pressed=true]{background:var(--ink);color:#fff;border-color:var(--ink)}
.dot{width:10px;height:10px;border-radius:50%;display:inline-block}
.dot.low{background:#d97706}.dot.medium{background:#2563eb}.dot.high{background:#0f7a4d}
.pill{display:inline-block;border-radius:999px;font-size:13px;font-weight:700;padding:3px 11px}
.pill.low{background:var(--amber-soft);color:var(--amber);border:1px solid #f0d58a}.pill.medium{background:#e8effe;color:#1e40af;border:1px solid #b9cdfa}.pill.high{background:var(--green-soft);color:#0b5d3b;border:1px solid #a7dcc3}
.pdetail{border:1px solid var(--line);border-radius:12px;padding:14px 16px;background:var(--surface)}
.pdetail h3{margin-bottom:8px}.pdetail dl{margin:0;display:grid;grid-template-columns:auto 1fr;gap:6px 14px;font-size:15px}.pdetail dt{color:var(--muted)}.pdetail dd{margin:0}
.pdetail .chk{margin-top:12px;font-size:15px;color:var(--ink-soft)}
.pri{margin-top:18px}.pri h3{font-size:16px;margin-bottom:8px}.pri ol{margin:0;padding-left:20px;font-size:14.5px}.pri li{margin:4px 0}.pri button{all:unset;cursor:pointer;color:var(--blue);text-decoration:underline;font-weight:700}
.prog{position:sticky;top:62px;z-index:5;background:#fff;border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin-bottom:14px}
.prog .row{display:flex;justify-content:space-between;font-weight:700;font-size:15px;gap:10px;flex-wrap:wrap}
.bar{height:12px;background:var(--surface-2);border-radius:999px;overflow:hidden;margin-top:8px}.bar i{display:block;height:100%;width:0;background:var(--green);transition:width .2s}
.grp{margin-top:14px}.grp h3{font-size:16px;margin-bottom:6px}.grp .gd{font-size:13.5px;color:var(--muted);margin-bottom:6px}
.it{display:flex;gap:10px;align-items:flex-start;border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin-bottom:6px;background:#fff}
.it input{width:22px;height:22px;margin-top:2px;flex:none;accent-color:var(--green)}
.it label{font-size:14.5px;cursor:pointer;display:block}.it .src{display:block;font-size:12.5px;color:var(--muted);margin-top:3px}
.it.done{background:var(--green-soft)}
.priv{font-size:13px;color:var(--muted);margin-top:8px}
.get{display:grid;gap:22px}.get ul{margin:0;padding:0;list-style:none;display:grid;gap:10px}
.get li{background:#fff;border:1px solid var(--line);border-radius:12px;padding:14px 16px 14px 44px;position:relative;font-size:16px}
.get li:before{content:"";position:absolute;left:16px;top:19px;width:14px;height:8px;border-left:3px solid var(--green);border-bottom:3px solid var(--green);transform:rotate(-45deg)}
.get figure{margin:0}.get figure img{width:100%;height:auto;display:block;border:1px solid var(--line);border-radius:12px;box-shadow:var(--shadow)}.get figcaption{font-size:13px;color:var(--muted);margin-top:8px}
.not{list-style:none;margin:0;padding:0;display:grid;gap:10px}.not li{border:1px dashed #c9d2de;border-radius:12px;padding:12px 16px;background:#fff}
.price{display:grid;gap:14px}.pc{background:#fff;border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);padding:26px}
.pc .amt{font-size:42px;font-weight:800;letter-spacing:-.03em;line-height:1.1;margin:8px 0 2px}.pc .unit{color:var(--ink-soft)}.pc.feat{border:2px solid var(--ember)}
.price-note{margin-top:16px;color:var(--ink-soft);font-size:15px}
details.faq{background:#fff;border:1px solid var(--line);border-radius:12px;margin-bottom:10px}
details.faq summary{cursor:pointer;font-weight:700;padding:16px 18px;list-style:none;display:flex;justify-content:space-between;gap:12px;min-height:48px}
details.faq summary::-webkit-details-marker{display:none}details.faq summary:after{content:"+";font-size:22px;line-height:1;color:var(--ember-dark)}
details.faq[open] summary:after{content:"\\2212"}details.faq p{padding:0 18px 16px;color:var(--ink-soft)}
.who{font-size:18px;color:var(--ink-soft);max-width:62ch}
.final{background:var(--ink);color:#fff;text-align:center;padding:56px 0}.final h2{color:#fff}.final p{color:#d3dbe8;margin:12px auto 0;max-width:52ch}.final .cta-row{justify-content:center}
.final .btn-ghost{background:transparent;color:#fff;border-color:#8793a8}.final .btn-ghost:hover{border-color:#fff}
.final a.mail{color:#fff}
footer{padding:30px 0 40px;font-size:14px;color:var(--muted);border-top:1px solid var(--line)}footer p+p{margin-top:8px}footer a{color:var(--ink-soft)}
@media(min-width:760px){.wrap{padding:0 28px}.steps{grid-template-columns:repeat(3,1fr)}.problems{grid-template-columns:repeat(3,1fr)}.price{grid-template-columns:1fr 1fr}.get{grid-template-columns:1.1fr .9fr;align-items:start}.hd{grid-template-columns:.9fr 1.1fr;align-items:start}section.s{padding:72px 0}.hero{padding:76px 0 72px}.panel{padding:22px}}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}*{transition:none!important}}
`;

const link = (c: C, label: string, cls = "btn btn-primary") =>
  `<a class="${cls}" href="${CAL}" target="_blank" rel="noopener">${esc(label)}</a>`;
const mailto = (c: C) =>
  `<a href="mailto:${MAIL}?subject=${encodeURIComponent(c.mail)}">${MAIL}</a>`;

function demoShell(key: LumicityKey, c: C): string {
  const intro = `<p class="demo-label"><b>A real example, built from public documents.</b> ${esc(c.demo_label.replace(/^A real example, built from public documents: /, ""))}</p>`;
  return `<div id="demo-root" data-demo="${key}" class="panel"><p>Loading the example</p></div>${""}${intro ? "" : ""}`;
}

export function buildHtml(key: LumicityKey): string {
  const c = (copy as Record<string, C>)[key];
  const others = KEYS.filter((k) => k !== key)
    .map((k) => `<a href="/${k}">${esc((copy as Record<string, C>)[k].name)}</a>`)
    .join(" · ");
  const faqs = c.faqs
    .map((f) => `<details class="faq"><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`)
    .join("");
  return `<style>${CSS}</style>
<header class="nav"><div class="wrap nav-inner"><a class="brand" href="/${key}">${esc(c.name)} <small>by Fractional Forge</small></a>${link(c, "Book a call", "btn btn-primary")}</div></header>
<main>
<section class="hero"><div class="wrap">
<p class="eyebrow">${esc(c.name)}, a Fractional Forge service</p>
<h1>${esc(c.headline)}</h1>
<p class="sub">${esc(c.subhead)}</p>
<div class="cta-row">${link(c, c.cta)}<a class="btn btn-ghost" href="#demo">See a real example</a></div>
<p class="hero-note">Prefer email? Write to ${mailto(c)}.</p>
</div></section>
<section class="s"><div class="wrap"><div class="s-head"><h2>Sound familiar?</h2></div>
<ul class="problems">${c.problem.map((p) => `<li>${esc(p)}</li>`).join("")}</ul></div></section>
<section class="s alt"><div class="wrap"><div class="s-head"><h2>How it works</h2></div>
<div class="steps">${c.steps.map((s, i) => `<div class="step"><div class="n">${i + 1}</div><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></div>`).join("")}</div></div></section>
<section class="s" id="demo"><div class="wrap"><div class="s-head"><h2>${esc(c.demo_title)}</h2><p>${esc(c.demo_intro)}</p></div>
<p class="demo-label"><b>A real example, built from public documents.</b> ${esc(c.demo_label.replace(/^A real example, built from public documents: /, ""))}</p>
${demoShell(key, c)}</div></section>
<section class="s alt"><div class="wrap"><div class="s-head"><h2>What you get</h2></div>
<div class="get"><ul>${c.you_get.map((g) => `<li>${esc(g)}</li>`).join("")}</ul>
<figure><a href="${c.report}" target="_blank" rel="noopener" aria-label="Open the sample report page at full size"><img src="${c.report}" alt="${esc(c.report_alt)}" width="918" height="1298" loading="lazy"></a><figcaption>${esc(c.report_cap)} Select the image to open it at full size.</figcaption></figure></div></div></section>
<section class="s"><div class="wrap"><div class="s-head"><h2>What it does not do</h2></div>
<ul class="not">${c.not_do.map((n) => `<li>${esc(n)}</li>`).join("")}</ul></div></section>
<section class="s alt"><div class="wrap"><div class="s-head"><h2>Price</h2></div>
<div class="price"><div class="pc feat"><p class="eyebrow">One-off</p><p class="amt">${esc(c.one[0])}</p><p class="unit">${esc(c.one[1])}</p><div class="cta-row">${link(c, c.cta)}</div></div>
<div class="pc"><p class="eyebrow">Monthly</p><p class="amt">${esc(c.mon[0])}</p><p class="unit">${esc(c.mon[1])}</p><div class="cta-row">${link(c, "Talk about monthly", "btn btn-ghost")}</div></div></div>
</div></section>
<section class="s"><div class="wrap"><div class="s-head"><h2>Questions</h2></div>${faqs}</div></section>
<section class="s alt"><div class="wrap"><div class="s-head"><h2>Who is behind it</h2></div>
<p class="who">Tristan Fischer has led or sat on the boards of fourteen hard-technology companies, built three industrial sites and raised around £200m. He began his career in project finance at Citigroup.</p></div></section>
<section class="final"><div class="wrap"><h2>${esc(c.cta)}</h2><p>Book a 30 minute call, or email <a class="mail" href="mailto:${MAIL}?subject=${encodeURIComponent(c.mail)}">${MAIL}</a>.</p>
<div class="cta-row">${link(c, c.cta)}</div></div></section>
</main>
<footer><div class="wrap"><p>${esc(c.name)}, a Fractional Forge service. Also from Fractional Forge: ${others}</p>
<p>Fractional Forge Limited · Tristan Fischer · ${mailto(c)}</p></div></footer>`;
}
