import copy from "./copy.json";
import design from "./design.json";

export type LumicityKey = "condition-desk" | "habitat-draft" | "bid-check";
export const MAIL = "tristan.fischer@fractionalforge.app";
export const KEYS: LumicityKey[] = ["condition-desk", "habitat-draft", "bid-check"];
type C = (typeof copy)["condition-desk"];

import { GAINS_CSS, gainsSection } from "@/lib/home/gains";
import {
  CONTEXT_SIZES,
  CONTEXT_WIDTHS,
  CTA_SIZES,
  CTA_WIDTHS,
  HERO_SIZES,
  HERO_WIDTHS,
  responsiveImg,
} from "@/lib/home/images";
import { FILM_CSS, explainerFilm } from "@/lib/home/film";

export const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const CSS = `
:root{--bg:var(--paper);--surface:var(--card-2);--surface-2:var(--skel);--ink-soft:var(--ink-2);--ember:var(--rust);--ember-dark:var(--rust);--ember-soft:var(--rust-soft);--acc:var(--rust);--acc-d:var(--rust);--acc-s:var(--rust-soft);--acc-m:var(--rust-line);--blue:var(--rust);--green:var(--moss);--green-soft:var(--moss-soft);--amber:#8a5a00;--amber-soft:#fff6e0;--red:#a3231b;--red-soft:#fdecea;--radius:16px;--font:var(--sans)}
*{box-sizing:border-box}html{scroll-behavior:smooth}
html:has(.pg){color-scheme:light dark}
body:has(.pg){overflow-wrap:anywhere;margin:0;background:var(--paper);color:var(--ink);font-family:var(--font);line-height:1.6;font-size:17px;-webkit-font-smoothing:antialiased;overflow-x:hidden}
a{color:var(--blue)}h1,h2,h3{line-height:1.15;letter-spacing:-.02em;margin:0}p{margin:0}
h1{font-size:clamp(34px,8vw,60px);font-weight:800}h2{font-size:clamp(26px,5vw,36px);font-weight:800}h3{font-size:19px;font-weight:700}
.wrap{max-width:1080px;margin:0 auto;padding:0 20px}
.eyebrow{font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--ember-dark)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border-radius:999px;padding:14px 24px;font-weight:700;font-size:16px;cursor:pointer;border:1px solid transparent;text-decoration:none;font-family:inherit;min-height:48px}
.btn-primary{background:var(--ember-dark);color:var(--on-rust);box-shadow:0 6px 18px rgba(15,23,41,.18)}.btn-primary:hover{background:var(--ink);color:var(--paper)}
.btn-ghost{background:var(--card);color:var(--ink);border-color:var(--line)}.btn-ghost:hover{border-color:var(--ink)}
:focus-visible{outline:3px solid var(--blue);outline-offset:2px}
header.nav{position:sticky;top:0;z-index:50;background:color-mix(in srgb,var(--paper) 92%,transparent);backdrop-filter:blur(8px);border-bottom:1px solid var(--line)}
.nav-inner{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:62px}
.brand{display:flex;align-items:baseline;gap:8px;font-weight:800;font-size:18px;color:var(--ink);text-decoration:none;flex-wrap:wrap}
.brand small{font-weight:600;font-size:13px;color:var(--muted)}
.nav .btn{padding:9px 18px;min-height:40px;font-size:15px}
.hero{padding:44px 0 48px;background:linear-gradient(180deg,var(--ember-soft),var(--paper) 70%)}
.hero h1{margin-top:14px;max-width:18ch}.hero .sub{font-size:clamp(18px,2.4vw,21px);color:var(--ink-soft);max-width:60ch;margin-top:18px}
.cta-row{display:flex;gap:12px;flex-wrap:wrap;margin-top:28px}
.hero-note{margin-top:14px;font-size:14px;color:var(--muted)}
section.s{padding:52px 0}section.alt{background:var(--surface);border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.s-head{max-width:64ch;margin-bottom:26px}.s-head h2{margin-bottom:10px}.s-head p{color:var(--ink-soft)}
.problems{list-style:none;margin:0;padding:0;display:grid;gap:12px}
.problems li{background:var(--card);border:1px solid var(--line);border-left:4px solid var(--ember);border-radius:12px;padding:16px 18px;font-size:17px}
.steps{display:grid;gap:14px;counter-reset:s}.step{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:22px}
.step .n{width:36px;height:36px;border-radius:10px;background:var(--ember-soft);color:var(--ember-dark);font-weight:800;display:flex;align-items:center;justify-content:center;margin-bottom:12px}
.step p{color:var(--ink-soft);font-size:16px;margin-top:6px}
.demo-label{display:inline-block;font-size:14px;color:var(--ink-soft);background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px 14px;margin-bottom:18px}
.demo-label b{color:var(--ember-dark)}
.panel{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);padding:16px}
.chips{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 14px}
.chip{border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:999px;padding:8px 14px;font-size:14.5px;font-weight:600;cursor:pointer;font-family:inherit;min-height:40px}
.chip[aria-pressed=true]{background:var(--ink);color:var(--paper);border-color:var(--ink)}
.chip span{opacity:.75;font-weight:700;margin-left:4px}
.block{background:var(--amber-soft);border:1px solid #f0d58a;border-radius:12px;padding:14px 16px;margin-bottom:16px}
.block h3{font-size:16px;margin-bottom:6px}.block p{font-size:14.5px;color:var(--ink-soft)}
.block ul{margin:8px 0 0;padding-left:18px;font-size:14.5px}
.block button.lnk{background:none;border:0;color:var(--blue);text-decoration:underline;cursor:pointer;font:inherit;padding:0;text-align:left}
.cards{display:grid;gap:8px}
.cc{border:1px solid var(--line);border-radius:12px;background:var(--card)}
.cc>button{all:unset;box-sizing:border-box;display:flex;gap:10px;width:100%;padding:12px 14px;cursor:pointer;align-items:flex-start}
.cc>button:focus-visible{outline:3px solid var(--blue);outline-offset:2px;border-radius:12px}
.cc .num{min-width:28px;height:28px;border-radius:8px;background:var(--surface-2);font-weight:800;font-size:13px;display:flex;align-items:center;justify-content:center}
.cc .t{font-weight:700;font-size:15.5px;line-height:1.3}.cc .meta{font-size:13px;color:var(--muted);margin-top:2px}
.cc .caret{margin-left:auto;color:var(--muted);transition:transform .15s}.cc.open .caret{transform:rotate(180deg)}
.cc .body{display:none;padding:0 14px 14px 52px;font-size:15px;color:var(--ink-soft)}.cc.open .body{display:block}
.cc .body h4{margin:12px 0 4px;font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}.cc .body ul{margin:0;padding-left:18px}
.tag{display:inline-block;font-size:12px;font-weight:700;border-radius:999px;padding:2px 9px;background:var(--surface-2);color:var(--ink-soft)}
.tag.red{background:var(--red-soft);color:var(--red)}
.hd{display:grid;gap:16px}.hd .map{margin:0}.hd .map img{width:100%;height:auto;display:block;border:1px solid var(--line);border-radius:12px;background:var(--card)}
.hd .map figcaption{font-size:13px;color:var(--muted);margin-top:6px}
.plist{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 14px}
.pbtn{border:1px solid var(--line);background:var(--card);border-radius:10px;padding:8px 12px;font-weight:700;font-size:14.5px;cursor:pointer;font-family:inherit;min-height:40px;display:flex;align-items:center;gap:6px}
.pbtn[aria-pressed=true]{background:var(--ink);color:var(--paper);border-color:var(--ink)}
.dot{width:10px;height:10px;border-radius:50%;display:inline-block}
.dot.low{background:#d97706}.dot.medium{background:#2563eb}.dot.high{background:#0f7a4d}
.pill{display:inline-block;border-radius:999px;font-size:13px;font-weight:700;padding:3px 11px}
.pill.low{background:var(--amber-soft);color:var(--amber);border:1px solid #f0d58a}.pill.medium{background:#e8effe;color:#1e40af;border:1px solid #b9cdfa}.pill.high{background:var(--green-soft);color:#0b5d3b;border:1px solid #a7dcc3}
.pdetail{border:1px solid var(--line);border-radius:12px;padding:14px 16px;background:var(--surface)}
.pdetail h3{margin-bottom:8px}.pdetail dl{margin:0;display:grid;grid-template-columns:auto 1fr;gap:6px 14px;font-size:15px}.pdetail dt{color:var(--muted)}.pdetail dd{margin:0}
.pdetail .chk{margin-top:12px;font-size:15px;color:var(--ink-soft)}
.pri{margin-top:18px}.pri h3{font-size:16px;margin-bottom:8px}.pri ol{margin:0;padding-left:20px;font-size:14.5px}.pri li{margin:4px 0}.pri button{all:unset;cursor:pointer;color:var(--blue);text-decoration:underline;font-weight:700}
.prog{position:sticky;top:62px;z-index:5;background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin-bottom:14px}
.prog .row{display:flex;justify-content:space-between;font-weight:700;font-size:15px;gap:10px;flex-wrap:wrap}
.bar{height:12px;background:var(--surface-2);border-radius:999px;overflow:hidden;margin-top:8px}.bar i{display:block;height:100%;width:0;background:var(--green);transition:width .2s}
.grp{margin-top:14px}.grp h3{font-size:16px;margin-bottom:6px}.grp .gd{font-size:13.5px;color:var(--muted);margin-bottom:6px}
.it{display:flex;gap:10px;align-items:flex-start;border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin-bottom:6px;background:var(--card)}
.it input{width:22px;height:22px;margin-top:2px;flex:none;accent-color:var(--green)}
.it label{font-size:14.5px;cursor:pointer;display:block}.it .src{display:block;font-size:12.5px;color:var(--muted);margin-top:3px}
.it.done{background:var(--green-soft)}
.priv{font-size:13px;color:var(--muted);margin-top:8px}
.get{display:grid;gap:22px}.get ul{margin:0;padding:0;list-style:none;display:grid;gap:10px}
.get li{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px 14px 44px;position:relative;font-size:16px}
.get li:before{content:"";position:absolute;left:16px;top:19px;width:14px;height:8px;border-left:3px solid var(--green);border-bottom:3px solid var(--green);transform:rotate(-45deg)}
.get figure{margin:0}.get figure img{width:100%;height:auto;display:block;border:1px solid var(--line);border-radius:12px;box-shadow:var(--shadow)}.get figcaption{font-size:13px;color:var(--muted);margin-top:8px}
.not{list-style:none;margin:0;padding:0;display:grid;gap:10px}.not li{border:1px dashed var(--line);border-radius:12px;padding:12px 16px;background:var(--card)}
.price{display:grid;gap:14px}.pc{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);padding:26px}
.pc .amt{font-size:42px;font-weight:800;letter-spacing:-.03em;line-height:1.1;margin:8px 0 2px}.pc .unit{color:var(--ink-soft)}.pc.feat{border:2px solid var(--ember)}
.price-note{margin-top:16px;color:var(--ink-soft);font-size:15px}
details.faq{background:var(--card);border:1px solid var(--line);border-radius:12px;margin-bottom:10px}
details.faq summary{cursor:pointer;font-weight:700;padding:16px 18px;list-style:none;display:flex;justify-content:space-between;gap:12px;min-height:48px}
details.faq summary::-webkit-details-marker{display:none}details.faq summary:after{content:"+";font-size:22px;line-height:1;color:var(--ember-dark)}
details.faq[open] summary:after{content:"\\2212"}details.faq p{padding:0 18px 16px;color:var(--ink-soft)}
.who{font-size:18px;color:var(--ink-soft);max-width:62ch}
.final{background:var(--band);color:var(--band-ink);text-align:center;padding:56px 0}.final h2{color:var(--band-ink)}.final p{color:var(--band-muted);margin:12px auto 0;max-width:52ch}.final .cta-row{justify-content:center}
.final .btn-ghost{background:transparent;color:var(--band-ink);border-color:var(--band-muted)}.final .btn-ghost:hover{border-color:var(--band-ink)}
.final a.mail{color:var(--band-ink)}
footer{padding:30px 0 40px;font-size:14px;color:var(--muted);border-top:1px solid var(--line)}footer p+p{margin-top:8px}footer a{color:var(--ink-soft)}
@media(min-width:760px){.wrap{padding:0 28px}.steps{grid-template-columns:repeat(3,1fr)}.problems{grid-template-columns:repeat(3,1fr)}.price{grid-template-columns:1fr 1fr}.get{grid-template-columns:1.1fr .9fr;align-items:start}.hd{grid-template-columns:.9fr 1.1fr;align-items:start}section.s{padding:72px 0}.hero{padding:76px 0 72px}.panel{padding:22px}}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}*{transition:none!important}}
`;


export const CSS2 = `
body:has(.pg){background:var(--paper)}
h1,h2{font-family:var(--serif);font-weight:700;letter-spacing:-.015em}
h1{font-size:clamp(36px,7vw,58px)}
.eyebrow{color:var(--ember-dark)}
.btn-primary{background:var(--ember-dark);box-shadow:0 6px 18px rgba(15,23,41,.18)}.btn-primary:hover{background:var(--ink)}
.pg{--ember:var(--acc);--ember-dark:var(--acc-d);--ember-soft:var(--acc-s)}
.pg .hero{background:linear-gradient(180deg,var(--acc-s) 0%,var(--paper) 100%);padding:36px 0 40px;overflow:hidden}
.hero-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:32px;align-items:center}.hero-grid>*,.mock,.mock-map>*{min-width:0}
.hero h1{max-width:16ch}
.hero .price-hint{font-weight:700;color:var(--ink);margin-top:12px;font-size:15px}
.mock{background:var(--card);border:1px solid var(--line);border-radius:18px;box-shadow:0 2px 4px rgba(15,23,41,.05),0 24px 60px rgba(15,23,41,.14);overflow:hidden;font-size:13.5px;line-height:1.4;animation:rise .6s ease-out both}
@keyframes rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
.mock-bar{display:flex;align-items:center;gap:6px;padding:10px 14px;background:var(--surface-2);border-bottom:1px solid var(--line)}
.mock-bar i{width:10px;height:10px;border-radius:50%;background:#cbd5e1;display:block}.mock-bar span{margin-left:8px;font-size:12px;color:var(--muted);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mock-body{padding:16px}
.mock h4{margin:0 0 2px;font-size:15px}.mock .mm{color:var(--muted);font-size:12.5px}
.big{display:flex;gap:10px;margin:12px 0}.big div{flex:1;border:1px solid var(--line);border-radius:12px;padding:10px 12px;background:var(--surface)}
.big b{display:block;font-size:26px;line-height:1.1;letter-spacing:-.02em}.big small{color:var(--ink-soft);font-size:12px}
.big div.hot{background:var(--acc-s);border-color:var(--acc-m)}.big div.hot b{color:var(--acc-d)}
.mrow{display:flex;gap:10px;align-items:flex-start;padding:9px 0;border-top:1px solid var(--line)}
.mrow .num{min-width:24px;height:24px;border-radius:7px;background:var(--surface-2);font-weight:800;font-size:12px;display:flex;align-items:center;justify-content:center}
.mrow .tt{font-weight:700;font-size:13.5px}.mrow .ss{font-size:12px;color:var(--muted)}
.mrow .q{font-size:12.5px;color:var(--ink-soft);font-style:italic}
.spill{display:inline-block;border-radius:999px;padding:1px 8px;font-size:11px;font-weight:700;background:var(--acc-s);color:var(--acc-d);white-space:nowrap}
.spill.n{background:var(--surface-2);color:var(--ink-soft)}
.letter{margin-top:10px;border:1px dashed var(--acc-m);border-radius:10px;padding:8px 12px;background:var(--acc-s);font-size:12.5px;color:var(--acc-d);font-weight:600}
.mock-map{display:grid;grid-template-columns:minmax(0,1fr)}.mock-map img{width:100%;height:auto;display:block;border-bottom:1px solid var(--line);max-height:340px;object-fit:cover;object-position:top}
.crow{display:flex;align-items:center;gap:8px;padding:6px 0;border-top:1px solid var(--line);font-size:12.5px}.crow b{min-width:30px}.crow span.ha{margin-left:auto;color:var(--muted);white-space:nowrap}
.trust{background:var(--card);border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:18px 0}
.trust ul{list-style:none;margin:0;padding:0;display:grid;gap:10px;grid-template-columns:1fr}
.trust li{font-size:14.5px;font-weight:600;color:var(--ink-soft);padding-left:26px;position:relative}
.trust li:before{content:"";position:absolute;left:4px;top:5px;width:12px;height:7px;border-left:3px solid var(--acc);border-bottom:3px solid var(--acc);transform:rotate(-45deg)}
.pg section.alt{background:var(--acc-s);border-color:var(--acc-m)}
.pg .step{background:var(--card)}.pg .step .n{background:var(--acc);color:var(--on-rust);font-family:var(--serif);font-size:18px}
.chart{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);padding:22px}
.chart h3{font-size:18px;margin-bottom:14px}
.hbar{display:grid;grid-template-columns:minmax(110px,170px) 1fr 34px;gap:10px;align-items:center;margin:8px 0;font-size:14px}
.hbar .track{background:var(--surface-2);height:22px;border-radius:7px;overflow:hidden}.hbar .track i{display:block;height:100%;background:#b8c2d0;border-radius:7px;transform-origin:left;animation:grow .9s ease-out both}
.hbar.hot .track i{background:var(--acc)}.hbar.hot{font-weight:800}.hbar b{text-align:right;font-variant-numeric:tabular-nums}
@keyframes grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
.stack{display:flex;height:34px;border-radius:10px;overflow:hidden;margin:6px 0 12px;border:1px solid var(--line)}.stack i{display:block;min-width:2px}
.legend{display:flex;flex-wrap:wrap;gap:8px 18px;font-size:13.5px;color:var(--ink-soft)}.legend span:before{content:"";display:inline-block;width:12px;height:12px;border-radius:3px;background:var(--c);margin-right:6px;vertical-align:-1px}
.chart .cap{margin-top:14px;font-weight:700;color:var(--acc-d);font-size:15px}
.ba{display:grid;gap:12px}.ba .row{display:grid;gap:8px}
.ba .b,.ba .a{border-radius:14px;padding:16px 18px;font-size:16px}
.ba .b{background:var(--card);border:1px solid var(--line);color:var(--ink-soft)}.ba .b small,.ba .a small{display:block;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;margin-bottom:4px}
.ba .b small{color:var(--muted)}.ba .a{background:var(--card);border:2px solid var(--acc);font-weight:600}.ba .a small{color:var(--acc-d)}
.price{grid-template-columns:1fr}.pc{position:relative}.pc.feat{border:2px solid var(--acc)}
.pc .badge{position:absolute;top:-12px;left:22px;background:var(--acc);color:var(--on-rust);font-size:12px;font-weight:800;border-radius:999px;padding:3px 12px}
.pc .amt{font-family:var(--serif);color:var(--acc-d)}
.pc ul{list-style:none;margin:14px 0 0;padding:0;display:grid;gap:6px;font-size:15px;color:var(--ink-soft)}.pc ul li{padding-left:22px;position:relative}.pc ul li:before{content:"";position:absolute;left:2px;top:7px;width:10px;height:6px;border-left:2px solid var(--acc);border-bottom:2px solid var(--acc);transform:rotate(-45deg)}
.honest{margin-top:20px;background:var(--card);border:1px solid var(--line);border-left:4px solid var(--acc);border-radius:12px;padding:16px 18px}.honest h3{font-size:16px;margin-bottom:6px}.honest ul{margin:0;padding-left:18px;color:var(--ink-soft);font-size:15px}
.final{background:var(--acc-s);color:var(--ink);border-top:1px solid var(--acc-m)}.final h2{color:var(--ink)}.final p{color:var(--ink-soft)}.final .btn-ghost{color:var(--ink);border-color:var(--line);background:var(--card)}
.final .sign{margin-top:16px;font-size:15px;font-weight:600;color:var(--ink)}
.hdr-note{display:none;font-size:14px;color:var(--muted);font-weight:600}
.mbar{display:none}
.pg .step{position:relative;overflow:hidden}.pg .step .ic{color:var(--acc);margin-bottom:10px}.pg .step .n{position:absolute;top:16px;right:16px;margin:0;width:34px;height:34px}
.pg .step h3{font-family:var(--serif);font-size:22px}
.mock{font-size:14.5px}.mock .mrow .tt{font-size:14.5px}.mock .mrow .ss,.mock .mm{font-size:13px}.crow{font-size:14px}
.hero-vis{position:relative}.hero-vis:before{content:"";position:absolute;inset:-26px -18px -26px 30px;background:radial-gradient(closest-side,var(--acc-m),transparent 72%);opacity:.55;z-index:0}.hero-vis .mock{position:relative;z-index:1}
.hero-vis .back{position:absolute;z-index:0;left:-14px;right:22px;top:20px;bottom:-16px;background:var(--card);border:1px solid var(--line);border-radius:18px;transform:rotate(-1.4deg);box-shadow:0 14px 34px rgba(15,23,41,.1)}
.ba .b small,.ba .a small{display:flex;align-items:center;gap:6px}.ba .b small svg{color:#b91c1c}.ba .a small svg{color:var(--acc)}
.ba .a{background:linear-gradient(90deg,var(--acc-s),var(--card) 60%)}.ba .b{background:var(--surface);}
.get figure{max-width:620px;margin:0 auto}
.section-num{font-size:13px}
.s-head h2:after{content:"";display:block;width:56px;height:4px;border-radius:4px;background:var(--acc);margin-top:12px}
@media(max-width:759px){.mbar{display:flex;position:fixed;left:0;right:0;bottom:0;z-index:60;background:var(--card);border-top:1px solid var(--line);padding:10px 16px calc(10px + env(safe-area-inset-bottom));gap:12px;align-items:center;justify-content:space-between;box-shadow:0 -6px 20px rgba(15,23,41,.08)}.mbar span{font-size:13px;font-weight:700;line-height:1.25}.mbar .btn{padding:10px 18px;min-height:44px;white-space:nowrap}body:has(.pg){padding-bottom:72px}.nav .btn{display:none}.nav-inner{min-height:54px}}
@media(min-width:760px){.hero-grid{grid-template-columns:minmax(0,1.05fr) minmax(0,.95fr);gap:44px}.trust ul{grid-template-columns:repeat(4,1fr);gap:18px}.ba .row{grid-template-columns:1fr 1fr;align-items:stretch}.price{grid-template-columns:1fr 1fr}.hdr-note{display:block}.pg .hero{padding:64px 0 68px}.mock-map{grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr)}.mock-map img{border-bottom:0;border-right:1px solid var(--line);max-height:none;height:100%}}
@media(prefers-reduced-motion:reduce){.mock,.hbar .track i{animation:none!important}}
`;

const link = (c: C, label: string, cls = "btn btn-primary") =>
  `<a class="${cls}" href="#send">${esc(label)}</a>`;
const mailto = (c: C) =>
  `<a href="mailto:${MAIL}?subject=${encodeURIComponent(c.mail)}">${MAIL}</a>`;
type D = (typeof design)["condition-desk"];

const short = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : s);

const ICON = [
  `<svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true"><path d="M4 16L28 5l-6 22-6-8-4 5-1-7z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`,
  `<svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true"><rect x="6" y="3" width="20" height="26" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M11 11h10M11 16h10M11 21h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  `<svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true"><circle cx="16" cy="16" r="12" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10 16.5l4 4 8-9" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
];
export const CSS3 = `
.pg{--font:var(--sans);font-family:var(--font);background:var(--paper);color:var(--ink)}
.pg h1,.pg h2,.pg h3.serif{font-family:var(--serif);font-weight:600;letter-spacing:-.02em}
.pg h1{font-size:clamp(38px,5.2vw,64px);line-height:1.04}
.pg h2{font-size:clamp(30px,4.2vw,46px);line-height:1.08}
.pg .s-head h2:after{display:none}
.pg .eyebrow{max-width:100%;line-height:1.35;display:inline-flex;align-items:center;flex-wrap:wrap;gap:8px;background:var(--card);border:1px solid var(--acc-m);color:var(--acc-d);border-radius:999px;padding:6px 14px;font-size:12.5px;letter-spacing:.06em}
.pg .eyebrow:before{content:"";width:7px;height:7px;border-radius:50%;background:var(--acc)}
.pg header.nav{background:color-mix(in srgb,var(--paper) 90%,transparent)}
.logo{display:flex;align-items:center;gap:10px;text-decoration:none;color:var(--ink)}
.logo .mk{width:34px;height:34px;border-radius:10px;background:var(--acc);color:var(--on-rust);display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(15,23,41,.18)}
.logo b{font-family:var(--serif);font-size:21px;font-weight:600;letter-spacing:-.01em}
.logo small{display:block;font-size:11.5px;color:var(--muted);font-weight:600;letter-spacing:.02em;margin-top:-2px}
.navlinks{display:none;gap:26px;font-size:15px;font-weight:600}.navlinks a{color:var(--ink-soft);text-decoration:none}.navlinks a:hover{color:var(--acc-d)}
.hero2{position:relative;padding:40px 0 56px;background:radial-gradient(1200px 500px at 85% -10%,var(--acc-s),transparent 60%),linear-gradient(180deg,var(--paper),var(--paper))}
.hero2 .grid{display:grid;gap:36px;align-items:center}
.hero2 .sub{font-size:clamp(18px,2vw,20px);color:var(--ink-soft);max-width:54ch;margin-top:20px}
.hero2 h1{margin-top:18px;max-width:17ch}
.hero2 h1 em{font-style:italic;color:var(--acc-d)}
.hero2 .meta{display:flex;flex-wrap:wrap;gap:10px 22px;margin-top:22px;font-size:14.5px;color:var(--ink-soft);font-weight:600}
.hero2 .meta span{display:inline-flex;align-items:center;gap:7px}.hero2 .meta svg{color:var(--acc)}
.dl-link{display:inline-flex;align-items:center;gap:8px;margin-top:18px;font-weight:700;color:var(--acc-d);text-decoration:none;border-bottom:2px solid var(--acc-m);padding-bottom:2px}.dl-link:hover{border-color:var(--acc-d)}
.photo{position:relative;min-width:0}
.photo .ph{position:relative;border-radius:28px;overflow:hidden;box-shadow:0 30px 80px rgba(15,23,41,.22);aspect-ratio:4/3.3;background:var(--skel)}
.photo .ph picture{display:block;width:100%;height:100%}.photo .ph img{width:100%;height:100%;object-fit:cover;display:block}
.photo .ph:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,transparent 55%,rgba(15,23,41,.35))}
.photo .float{position:relative;margin:-90px 14px 0;z-index:2}
.mini{background:var(--card);border-radius:18px;padding:16px 18px;box-shadow:0 24px 60px rgba(15,23,41,.25);border:1px solid var(--line)}
.mini .mt{display:flex;gap:10px;align-items:center}.mini .mk{width:34px;height:34px;border-radius:10px;background:var(--acc);color:var(--on-rust);display:flex;align-items:center;justify-content:center;flex:none}
.mini .mt b{display:block;font-size:15px}.mini .mt small{display:block;font-size:12.5px;color:var(--muted)}
.mini .mn{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}.mini .mn div{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:10px 12px}
.mini .mn b{display:block;font-family:var(--serif);font-size:30px;line-height:1;font-weight:600}.mini .mn b:empty{display:none}.mini .mn small{font-size:12.5px;color:var(--ink-soft)}
.mini .mn .hot{background:var(--acc-s);border-color:var(--acc-m)}.mini .mn .hot b{color:var(--acc-d)}
.mini .mf{margin-top:10px;font-size:13px;font-weight:600;color:var(--ink-soft);display:flex;gap:6px;align-items:center}.mini .mf svg{color:var(--acc)}
.photo .tagc{position:absolute;z-index:3;top:18px;left:18px;background:var(--card);color:var(--ink);backdrop-filter:blur(6px);border-radius:14px;padding:10px 14px;box-shadow:0 10px 30px rgba(15,23,41,.18);font-size:13.5px;font-weight:700;display:flex;align-items:center;gap:10px}
.photo .tagc i{width:30px;height:30px;border-radius:9px;background:var(--acc-s);color:var(--acc-d);display:flex;align-items:center;justify-content:center;font-style:normal}
.photo .tagc small{display:block;font-weight:500;color:var(--muted);font-size:12px}
.stats{background:var(--band);color:var(--band-ink);padding:34px 0}
.stats ul{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:1fr 1fr;gap:22px}
.stats b{display:block;font-family:var(--serif);font-size:clamp(34px,4vw,48px);font-weight:600;line-height:1;color:var(--band-ink)}
.stats b:empty{display:none}
.stats span{display:block;margin-top:8px;font-size:14px;color:var(--band-muted);max-width:24ch}
.split{display:grid;gap:34px;align-items:center}
.split .pic{border-radius:24px;overflow:hidden;box-shadow:0 24px 60px rgba(15,23,41,.16);aspect-ratio:4/3}
.split .pic picture{display:block;width:100%;height:100%}.split .pic img{width:100%;height:100%;object-fit:cover;display:block}
.split h2{margin-bottom:16px}
.plist2{list-style:none;margin:22px 0 0;padding:0;display:grid;gap:14px}
.plist2 li{display:flex;gap:14px;align-items:flex-start;font-size:17px}
.plist2 li i{flex:none;width:30px;height:30px;border-radius:50%;background:var(--red-soft);color:var(--red);display:flex;align-items:center;justify-content:center;font-style:normal;font-weight:800;font-size:15px}
.lede{font-size:18px;color:var(--ink-soft)}
.sample{background:linear-gradient(135deg,var(--acc-s),var(--card) 70%);border:1px solid var(--acc-m);border-radius:28px;padding:28px;display:grid;gap:30px;align-items:center;overflow:hidden}
.sample .paper{position:relative;max-width:340px;margin:0 auto}.sample .paper picture{display:block;width:100%}
.sample .paper img{width:100%;display:block;border-radius:6px;box-shadow:0 2px 4px rgba(15,23,41,.08),0 30px 60px rgba(15,23,41,.22);transform:rotate(-2.5deg);background:var(--card)}
.sample .paper:before{content:"";position:absolute;inset:14px -14px -10px 18px;background:var(--card);border-radius:6px;box-shadow:0 20px 40px rgba(15,23,41,.12);transform:rotate(3deg)}
.sample .paper .pdf{position:absolute;right:-6px;bottom:22px;background:var(--acc);color:var(--on-rust);font-weight:800;font-size:12px;border-radius:8px;padding:5px 10px;box-shadow:0 6px 16px rgba(15,23,41,.25);transform:rotate(-2.5deg)}
.sample h2{margin-bottom:12px}
.sample ul{list-style:none;padding:0;margin:18px 0 24px;display:grid;gap:10px}
.sample li{padding-left:30px;position:relative}.sample li:before{content:"";position:absolute;left:4px;top:7px;width:12px;height:7px;border-left:3px solid var(--acc);border-bottom:3px solid var(--acc);transform:rotate(-45deg)}
.btn-dl{background:var(--ink);color:var(--paper)}.btn-dl:hover{background:var(--ink-2);color:var(--paper)}
.founder{display:grid;gap:26px;align-items:start;background:var(--card);border:1px solid var(--line);border-radius:24px;padding:28px;box-shadow:var(--shadow)}
.founder .av{width:84px;height:84px;border-radius:50%;background:var(--acc);color:var(--on-rust);font-family:var(--serif);font-size:32px;font-weight:600;display:flex;align-items:center;justify-content:center}
.founder h3{font-family:var(--serif);font-size:26px;font-weight:600}
.founder .role{color:var(--muted);font-weight:600;margin-top:2px}
.founder p.bio{margin-top:14px;color:var(--ink-soft);font-size:17px;max-width:68ch}
.founder .facts{display:flex;flex-wrap:wrap;gap:10px;margin-top:18px}.founder .facts span{background:var(--surface);border:1px solid var(--line);border-radius:999px;padding:6px 12px;font-size:13.5px;font-weight:600}
.founder a{font-weight:700;color:var(--acc-d)}
.pg .steps .step{border-radius:20px;padding:26px}
.cta-photo{position:relative;color:var(--band-ink);background:var(--band);padding:96px 0;overflow:hidden;text-align:center}
.cta-photo picture.bg,.cta-photo img.bg{position:absolute;inset:0;width:100%;height:100%}
.cta-photo picture.bg img,.cta-photo img.bg{width:100%;height:100%;object-fit:cover;display:block}
.cta-photo:before{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(15,23,41,.55),rgba(15,23,41,.72));z-index:1}
.cta-photo .wrap{position:relative;z-index:2}
.cta-photo h2{color:var(--band-ink);font-size:clamp(34px,5vw,56px)}.cta-photo p{color:var(--band-muted);margin:14px auto 0;max-width:52ch;font-size:18px}
.cta-photo .cta-row{justify-content:center}.cta-photo .btn-primary{background:var(--card);color:var(--ink);box-shadow:0 10px 30px rgba(0,0,0,.3)}.cta-photo .btn-primary:hover{background:var(--acc-s)}
.cta-photo .btn-ghost{background:transparent;color:var(--band-ink);border-color:color-mix(in srgb,var(--band-ink) 60%,transparent)}
.cta-photo a.mail{color:var(--band-ink)}
.pg footer{background:var(--paper)}
@media(max-width:759px){body:has(.pg) [aria-label="Cookie preferences"]{margin-bottom:76px}.photo .float{margin:-60px 8px 0}.photo .tagc{top:12px;left:12px}}
@media(min-width:760px){.navlinks{display:flex}.hero2{padding:56px 0 84px}.hero2 .grid{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:56px}.photo .float{position:absolute;left:-48px;right:auto;bottom:-40px;width:300px;margin:0}.photo .ph{aspect-ratio:4/4.5}.stats ul{grid-template-columns:repeat(4,1fr)}.split{grid-template-columns:1fr 1fr;gap:64px}.split.rev .pic{order:2}.sample{grid-template-columns:.85fr 1.15fr;padding:48px}.founder{grid-template-columns:auto 1fr;padding:40px}}

.enq{display:grid;gap:32px;background:var(--card);border:1px solid var(--line);border-radius:24px;padding:28px;box-shadow:0 20px 50px -30px rgba(15,23,42,.35)}
.enq-l p{color:var(--ink-soft);margin-top:14px}.enq-l h2{margin-top:10px}.enq-l ul{list-style:none;padding:0;margin:20px 0 0;display:grid;gap:10px;font-weight:600}.enq-l li{display:flex;gap:8px;align-items:center}.enq-l li svg{color:var(--acc)}
.enq-f{display:grid;gap:14px}.enq-f label{display:grid;gap:6px;font-size:14px;font-weight:600}
.enq-f input,.enq-f textarea{font:inherit;font-weight:400;font-size:16px;padding:12px 14px;border:1px solid var(--line);border-radius:12px;background:var(--card);color:var(--ink);width:100%;box-sizing:border-box}
.enq-f input:focus,.enq-f textarea:focus{outline:2px solid var(--acc);outline-offset:1px;border-color:transparent}
.enq-f .hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
.enq-f button{justify-self:start;border:0;cursor:pointer}.enq-f button[disabled]{opacity:.6;cursor:wait}
.enq-s{font-weight:600;min-height:1.4em}.enq-s.ok{color:#166534}.enq-s.err{color:#b91c1c}
@media(min-width:760px){.enq{grid-template-columns:.9fr 1.1fr;padding:48px;gap:56px}}
`;

export const MARK: Record<LumicityKey, string> = {
  "condition-desk": `<svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true"><path d="M6 3h9l3 3v15H6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M9 13l2 2 4-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  "habitat-draft": `<svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true"><path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M5 19l8-8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  "bid-check": `<svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true"><path d="M4 6l2 2 3-3M4 13l2 2 3-3M4 20l2 2 3-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M13 7h7M13 14h7M13 21h7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
};
export const TICK = `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M2.5 8.5l3.5 3.5 7.5-8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

type Extra = { img: string; problemTitle: string; stats: [string, string][]; sample: { pages: number; label: string; points: string[] }; ctaLine: string };
function extra(key: LumicityKey): Extra {
  if (key === "condition-desk") {
    return { img: "cd", problemTitle: "Planning conditions hold up the start on site",
      stats: [["26", "numbered conditions plus the biodiversity gain condition"], ["7", "before work starts"], ["1 day", "usual turnaround for the full register"], ["£400", "per permission, or £1,000 a month for five live sites"]],
      sample: { pages: 17, label: "The full Condition Desk report for a new school scheme: 26 numbered conditions plus the biodiversity gain condition, with 7 before work starts.", points: ["Every condition in plain English, with when it is due", "Which specialist usually prepares each one, and the documents to gather", "The conditions that block a start on site, picked out", "A drafted covering letter for the first council submission"] },
      ctaLine: "Send us a decision notice and get the register back, usually within a day." };
  }
  if (key === "habitat-draft") {
    return { img: "hd", problemTitle: "Desk studies eat into time on site",
      stats: [["£150", "per desk study, or £1,000 a month for eight"], ["", "Usually within a day"], ["", "Know which parcels matter before the walkover"], ["", "Your ecologist signs everything"]],
      sample: { pages: 2, label: "A Habitat Draft desk study: a first habitat map, the records search and the parcels to check on the walkover.", points: ["Protected sites and priority habitats within 600 metres", "A first habitat map from national data, with how sure we are per parcel", "Tree and hedge heights from the Environment Agency's laser survey", "A list of the parcels to check on the walkover"] },
      ctaLine: "Send us a site boundary and get the desk study back, usually within a day." };
  }
  return { img: "bc", problemTitle: "Tender packs are long, and one miss loses the bid",
    stats: [["30", "bidder-facing requirements"], ["16", "specification points"], ["4", "items to submit"], ["£600", "per tender, or £1,500 a month for three"]],
    sample: { pages: 3, label: "The bid at a glance for a parish council fencing tender: 30 bidder-facing requirements, 16 specification points, 4 items to submit, 4 contract deliverables, 6 scored criteria.", points: ["Every pass-or-fail condition, quoted from the tender", "Every document to submit, and how bids are scored", "The key dates and deadlines", "Each item linked to the page it came from"] },
    ctaLine: "Send us a tender pack and get your bid at a glance, usually within a day." };
}

function mini(key: LumicityKey): string {
  let t = "", m = "", a: [string, string], b: [string, string], foot = "";
  if (key === "condition-desk") {
    t = "Condition register"; m = "Sample: a new school scheme";
    a = ["26", "numbered conditions"]; b = ["7", "before work starts"]; foot = "Covering letters drafted";
  } else if (key === "habitat-draft") {
    t = "Desk study"; m = "Ecology desk study, first draft"; a = ["£150", "per desk study"]; b = ["", "Usually within a day"]; foot = "Ecologist signs everything";
  } else {
    t = "Bid at a glance"; m = "Sample: a parish council fencing tender"; a = ["30", "bidder-facing requirements"]; b = ["16", "specification points"]; foot = "Each quoted from the tender";
  }
  return `<div class="mini"><div class="mt"><span class="mk">${MARK[key]}</span><div><b>${esc(t)}</b><small>${esc(short(m, 42))}</small></div></div><div class="mn"><div><b>${a[0]}</b><small>${esc(a[1])}</small></div><div class="hot"><b>${b[0]}</b><small>${esc(b[1])}</small></div></div><p class="mf">${TICK} ${esc(foot)}</p></div>`;
}

const BIO = "Tristan Fischer has been chief executive or a board director of fourteen companies, almost all of them hard technology: wind, solar, wave and tidal, batteries, carbon capture and controlled-environment agriculture. He has built three greenfield industrial sites, including a 25,000 m² automated factory, and has raised around £200m for his companies. He started in project finance at Citigroup and later ran corporate venture investments at Shell Technology Ventures.";

const ASK: Record<LumicityKey, [string, string]> = {
  "condition-desk": ["Planning reference or link to the decision notice", "Planning reference or a link to the decision notice"],
  "habitat-draft": ["Site address, grid reference or planning reference", "Site address, grid reference or planning reference"],
  "bid-check": ["Link to the tender, or the buyer and tender title", "For example a Find a Tender or Contracts Finder link"],
};

function form(key: LumicityKey, c: C): string {
  const [ref, ph] = ASK[key];
  return `<section class="s" id="send"><div class="wrap"><div class="enq">
<div class="enq-l"><p class="eyebrow">No calls needed</p><h2>${esc(c.cta)}</h2>
<p>Fill in the form and we reply by email. If you have the documents to hand, you can also email them to ${mailto(c)}.</p>
<ul><li>${TICK} Questions answered by email</li><li>${TICK} Usually within a day</li><li>${TICK} Built from public documents</li></ul></div>
<form class="enq-f" data-service="${key}" novalidate>
<label>Your name<input name="name" autocomplete="name" required maxlength="120"></label>
<label>Work email<input name="email" type="email" autocomplete="email" required maxlength="200"></label>
<label>Organisation<input name="org" autocomplete="organization" maxlength="200"></label>
<label>${esc(ref)}<input name="ref" placeholder="${esc(ph)}" maxlength="500"></label>
<label>Anything else we should know<textarea name="message" rows="4" maxlength="4000"></textarea></label>
<label class="hp" aria-hidden="true">Leave blank<input name="website" tabindex="-1" autocomplete="off"></label>
<button class="btn btn-primary" type="submit">Send</button>
<p class="enq-s" role="status" aria-live="polite"></p>
</form></div></div></section>`;
}

export function buildHtml(key: LumicityKey): string {
  const c = (copy as unknown as Record<string, C>)[key];
  const d = (design as unknown as Record<string, D>)[key];
  const x = extra(key);
  const others = KEYS.filter((k) => k !== key)
    .map((k) => `<a href="/${k}">${esc((copy as unknown as Record<string, C>)[k].name)}</a>`)
    .join(" · ");
  const faqs = [...c.faqs.slice(0, -1), ...d.extra_faq, c.faqs[c.faqs.length - 1]]
    .map((f) => `<details class="faq"><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`)
    .join("");
  const style = `--acc:${d.accent};--acc-d:${d.accent_dark};--acc-s:${d.accent_soft};--acc-m:${d.accent_mid}`;
  return `<style>${CSS}${CSS2}${CSS3}${FILM_CSS}${GAINS_CSS}</style>
<div class="pg" style="${style}">
<header class="nav"><div class="wrap nav-inner"><a class="logo" href="/${key}"><span class="mk">${MARK[key]}</span><span><b>${esc(c.name)}</b><small>A Fractional Forge service</small></span></a>
<nav class="navlinks" aria-label="Page sections"><a href="#how">How it works</a><a href="#explainer">Watch</a><a href="#price">Price</a><a href="#faq">Questions</a></nav>${link(c, "Send a request", "btn btn-primary")}</div></header>
<main>
<section class="hero2"><div class="wrap grid"><div>
<p class="eyebrow">${esc(d.kicker)}</p>
<h1>${esc(c.hero_head || c.headline)}</h1>
<p class="sub">${esc(c.hero_sub || c.subhead)}</p>
<div class="cta-row">${link(c, c.cta)}<a class="btn btn-ghost" href="#explainer">Watch how it works</a></div>
<div class="meta"><span>${TICK} Usually within a day</span><span>${TICK} ${esc(c.one[0])} ${esc(c.one[1])}</span><span>${TICK} Built from public documents</span></div>
</div>
<div class="photo"><div class="ph">${responsiveImg({
    base: `/lumicity/img/${x.img}-hero`,
    alt: "",
    width: 800,
    height: 451,
    widths: HERO_WIDTHS,
    sizes: HERO_SIZES,
    priority: true,
  })}</div>
<div class="tagc"><i>${TICK}</i><span>Usually within a day<small>Built from public documents</small></span></div>
<div class="float">${mini(key)}</div></div>
</div></section>
<section class="stats" aria-label="Key numbers"><div class="wrap"><ul>${x.stats.map((s) => `<li>${s[0] ? `<b>${esc(s[0])}</b>` : ""}<span>${esc(s[1])}</span></li>`).join("")}</ul></div></section>
${gainsSection(key)}
<section class="s"><div class="wrap split"><div class="pic">${responsiveImg({
    base: `/lumicity/img/${x.img}-context`,
    alt: "",
    width: 560,
    height: 416,
    widths: CONTEXT_WIDTHS,
    sizes: CONTEXT_SIZES,
    lazy: true,
  })}</div>
<div><h2>${esc(x.problemTitle)}</h2><ul class="plist2">${c.problem.map((p) => `<li><i>!</i><span>${esc(p)}</span></li>`).join("")}</ul>
<p class="lede" style="margin-top:22px">${esc(c.name)} does that groundwork for you, usually within a day, so your team can get on with the parts only they can do.</p></div></div></section>
<section class="s alt" id="how"><div class="wrap"><div class="s-head"><h2>How it works</h2></div>
<div class="steps">${d.step_titles.map((t, i) => `<div class="step"><div class="ic">${ICON[i]}</div><div class="n">${i + 1}</div><h3>${esc(t)}</h3><p>${esc(d.step_texts[i])}</p></div>`).join("")}</div></div></section>
<section class="s alt"><div class="wrap"><div class="s-head"><h2>By hand, or with ${esc(c.name)}</h2></div>
<div class="ba">${d.before_after.map((r) => `<div class="row"><div class="b"><small><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg> By hand</small>${esc(r[0])}</div><div class="a"><small>${TICK} With ${esc(c.name)}</small>${esc(r[1])}</div></div>`).join("")}</div></div></section>
${explainerFilm(key)}
<section class="s alt" id="price"><div class="wrap"><div class="s-head"><h2>Simple pricing</h2></div>
<div class="price"><div class="pc feat"><span class="badge">Start here</span><p class="eyebrow">One-off</p><p class="amt">${esc(c.one[0])}</p><p class="unit">${esc(c.one[1])}</p><div class="cta-row">${link(c, c.cta)}</div></div>
<div class="pc"><p class="eyebrow">Monthly</p><p class="amt">${esc(c.mon[0])}</p><p class="unit">${esc(c.mon[1])}</p><div class="cta-row">${link(c, "Ask about monthly", "btn btn-ghost")}</div></div></div>
<div class="honest"><h3>What it does not do</h3><ul>${c.not_do.map((n) => `<li>${esc(n)}</li>`).join("")}</ul></div>
</div></section>
<section class="s"><div class="wrap"><div class="founder"><div class="av" aria-hidden="true">TF</div><div><h3>Who is behind ${esc(c.name)}</h3><p class="role">Tristan Fischer, Director, Fractional Forge Limited</p>
<p class="bio">${esc(BIO)}</p>
<div class="facts"><span>Chief executive or director of 14 companies</span><span>3 industrial sites built</span><span>About £200m raised</span><span>Citigroup project finance</span></div>
<p style="margin-top:18px"><a href="https://www.linkedin.com/in/tristanfischer/" target="_blank" rel="noopener">Tristan on LinkedIn</a></p></div></div></div></section>
${form(key, c)}
<section class="s alt" id="faq"><div class="wrap"><div class="s-head"><h2>Questions</h2></div>${faqs}</div></section>
<section class="cta-photo">${responsiveImg({
    base: `/lumicity/img/${x.img}-cta`,
    alt: "",
    width: 800,
    height: 342,
    widths: CTA_WIDTHS,
    sizes: CTA_SIZES,
    lazy: true,
    className: "bg",
  })}<div class="wrap"><h2>${esc(c.cta)}</h2><p>${esc(x.ctaLine)} Everything is done by email: no calls or meetings needed.</p>
<div class="cta-row">${link(c, c.cta)}<a class="btn btn-ghost" href="#explainer">Watch how it works</a></div></div></section>
</main>
<footer><div class="wrap"><p>${esc(c.name)}, a <a href="/">Fractional Forge</a> service. Also from Fractional Forge: ${others} · <a href="/design-dossier">Design Dossier</a></p>
<p>Fractional Forge Limited · Tristan Fischer · ${mailto(c)}</p></div></footer>
<div class="mbar"><span>${esc(c.one[0])} ${esc(c.one[1])}<br>Usually within a day</span>${link(c, "Send a request")}</div>
</div>`;
}
