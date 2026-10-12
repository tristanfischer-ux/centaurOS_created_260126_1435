import copy from "./copy.json";
import design from "./design.json";
import cdData from "../../../public/lumicity/condition-desk.json";
import hdData from "../../../public/lumicity/habitat-draft.json";
import bcData from "../../../public/lumicity/bid-check.json";

export type LumicityKey = "condition-desk" | "habitat-draft" | "bid-check";
export const CAL = "https://calendly.com/tristan-fischer-wjlf/30min";
export const MAIL = "tristan.fischer@fractionalforge.app";
export const KEYS: LumicityKey[] = ["condition-desk", "habitat-draft", "bid-check"];
type C = (typeof copy)["condition-desk"];

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const CSS = `
:root{--bg:#fff;--surface:#f8fafc;--surface-2:#f1f5f9;--ink:#0f1729;--ink-soft:#334155;--muted:#5b6b82;--line:#e6eaf0;--ember:#e2562a;--ember-dark:#b83a0e;--ember-soft:#fff2ec;--acc:#b83a0e;--acc-d:#8f3208;--acc-s:#fff2ec;--acc-m:#f0b99c;--blue:#1d4ed8;--green:#0f7a4d;--green-soft:#e8f6ef;--amber:#8a5a00;--amber-soft:#fff6e0;--red:#a3231b;--red-soft:#fdecea;--radius:16px;--shadow:0 1px 2px rgba(15,23,41,.04),0 10px 30px rgba(15,23,41,.07);--font:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,Helvetica,Arial,sans-serif}
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


export const CSS2 = `
body{background:#fffdfa}
h1,h2{font-family:"Iowan Old Style","Palatino Linotype",Palatino,"Book Antiqua",Georgia,serif;font-weight:700;letter-spacing:-.015em}
h1{font-size:clamp(36px,7vw,58px)}
.eyebrow{color:var(--ember-dark)}
.btn-primary{background:var(--ember-dark);box-shadow:0 6px 18px rgba(15,23,41,.18)}.btn-primary:hover{background:var(--ink)}
.pg{--ember:var(--acc);--ember-dark:var(--acc-d);--ember-soft:var(--acc-s)}
.pg .hero{background:linear-gradient(180deg,var(--acc-s) 0%,#fffdfa 100%);padding:36px 0 40px;overflow:hidden}
.hero-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:32px;align-items:center}.hero-grid>*,.mock,.mock-map>*{min-width:0}
.hero h1{max-width:16ch}
.hero .price-hint{font-weight:700;color:var(--ink);margin-top:12px;font-size:15px}
.mock{background:#fff;border:1px solid var(--line);border-radius:18px;box-shadow:0 2px 4px rgba(15,23,41,.05),0 24px 60px rgba(15,23,41,.14);overflow:hidden;font-size:13.5px;line-height:1.4;animation:rise .6s ease-out both}
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
.trust{background:#fff;border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:18px 0}
.trust ul{list-style:none;margin:0;padding:0;display:grid;gap:10px;grid-template-columns:1fr}
.trust li{font-size:14.5px;font-weight:600;color:var(--ink-soft);padding-left:26px;position:relative}
.trust li:before{content:"";position:absolute;left:4px;top:5px;width:12px;height:7px;border-left:3px solid var(--acc);border-bottom:3px solid var(--acc);transform:rotate(-45deg)}
.pg section.alt{background:var(--acc-s);border-color:var(--acc-m)}
.pg .step{background:#fff}.pg .step .n{background:var(--acc);color:#fff;font-family:Georgia,serif;font-size:18px}
.chart{background:#fff;border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);padding:22px}
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
.ba .b{background:#fff;border:1px solid var(--line);color:var(--ink-soft)}.ba .b small,.ba .a small{display:block;font-size:11.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;margin-bottom:4px}
.ba .b small{color:var(--muted)}.ba .a{background:#fff;border:2px solid var(--acc);font-weight:600}.ba .a small{color:var(--acc-d)}
.price{grid-template-columns:1fr}.pc{position:relative}.pc.feat{border:2px solid var(--acc)}
.pc .badge{position:absolute;top:-12px;left:22px;background:var(--acc);color:#fff;font-size:12px;font-weight:800;border-radius:999px;padding:3px 12px}
.pc .amt{font-family:Georgia,serif;color:var(--acc-d)}
.pc ul{list-style:none;margin:14px 0 0;padding:0;display:grid;gap:6px;font-size:15px;color:var(--ink-soft)}.pc ul li{padding-left:22px;position:relative}.pc ul li:before{content:"";position:absolute;left:2px;top:7px;width:10px;height:6px;border-left:2px solid var(--acc);border-bottom:2px solid var(--acc);transform:rotate(-45deg)}
.honest{margin-top:20px;background:#fff;border:1px solid var(--line);border-left:4px solid var(--acc);border-radius:12px;padding:16px 18px}.honest h3{font-size:16px;margin-bottom:6px}.honest ul{margin:0;padding-left:18px;color:var(--ink-soft);font-size:15px}
.final{background:var(--acc-s);color:var(--ink);border-top:1px solid var(--acc-m)}.final h2{color:var(--ink)}.final p{color:var(--ink-soft)}.final .btn-ghost{color:var(--ink);border-color:#c9d2de;background:#fff}
.final .sign{margin-top:16px;font-size:15px;font-weight:600;color:var(--ink)}
.hdr-note{display:none;font-size:14px;color:var(--muted);font-weight:600}
.mbar{display:none}
.pg .step{position:relative;overflow:hidden}.pg .step .ic{color:var(--acc);margin-bottom:10px}.pg .step .n{position:absolute;top:16px;right:16px;margin:0;width:34px;height:34px}
.pg .step h3{font-family:Georgia,serif;font-size:22px}
.mock{font-size:14.5px}.mock .mrow .tt{font-size:14.5px}.mock .mrow .ss,.mock .mm{font-size:13px}.crow{font-size:14px}
.hero-vis{position:relative}.hero-vis:before{content:"";position:absolute;inset:-26px -18px -26px 30px;background:radial-gradient(closest-side,var(--acc-m),transparent 72%);opacity:.55;z-index:0}.hero-vis .mock{position:relative;z-index:1}
.hero-vis .back{position:absolute;z-index:0;left:-14px;right:22px;top:20px;bottom:-16px;background:#fff;border:1px solid var(--line);border-radius:18px;transform:rotate(-1.4deg);box-shadow:0 14px 34px rgba(15,23,41,.1)}
.ba .b small,.ba .a small{display:flex;align-items:center;gap:6px}.ba .b small svg{color:#b91c1c}.ba .a small svg{color:var(--acc)}
.ba .a{background:linear-gradient(90deg,var(--acc-s),#fff 60%)}.ba .b{background:var(--surface);}
.get figure{max-width:620px;margin:0 auto}
.section-num{font-size:13px}
.s-head h2:after{content:"";display:block;width:56px;height:4px;border-radius:4px;background:var(--acc);margin-top:12px}
@media(max-width:759px){.mbar{display:flex;position:fixed;left:0;right:0;bottom:0;z-index:60;background:#fff;border-top:1px solid var(--line);padding:10px 16px calc(10px + env(safe-area-inset-bottom));gap:12px;align-items:center;justify-content:space-between;box-shadow:0 -6px 20px rgba(15,23,41,.08)}.mbar span{font-size:13px;font-weight:700;line-height:1.25}.mbar .btn{padding:10px 18px;min-height:44px;white-space:nowrap}body{padding-bottom:72px}.nav .btn{display:none}.nav-inner{min-height:54px}}
@media(min-width:760px){.hero-grid{grid-template-columns:minmax(0,1.05fr) minmax(0,.95fr);gap:44px}.trust ul{grid-template-columns:repeat(4,1fr);gap:18px}.ba .row{grid-template-columns:1fr 1fr;align-items:stretch}.price{grid-template-columns:1fr 1fr}.hdr-note{display:block}.pg .hero{padding:64px 0 68px}.mock-map{grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr)}.mock-map img{border-bottom:0;border-right:1px solid var(--line);max-height:none;height:100%}}
@media(prefers-reduced-motion:reduce){.mock,.hbar .track i{animation:none!important}}
`;

const link = (c: C, label: string, cls = "btn btn-primary") =>
  `<a class="${cls}" href="${CAL}" target="_blank" rel="noopener">${esc(label)}</a>`;
const mailto = (c: C) =>
  `<a href="mailto:${MAIL}?subject=${encodeURIComponent(c.mail)}">${MAIL}</a>`;
type D = (typeof design)["condition-desk"];

const STAGE_LABEL: Record<string, string> = {
  before_start: "Before work starts", with_reserved_matters: "With the detailed plans", during_build: "During the build",
  before_occupation: "Before people move in", start_deadline: "Time limit to start", if_event: "Only if something happens", compliance: "Rules to follow throughout",
};
const short = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : s);

const ICON = [
  `<svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true"><path d="M4 16L28 5l-6 22-6-8-4 5-1-7z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`,
  `<svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true"><rect x="6" y="3" width="20" height="26" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M11 11h10M11 16h10M11 21h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  `<svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true"><circle cx="16" cy="16" r="12" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10 16.5l4 4 8-9" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
];
function mockup(key: LumicityKey): string {
  if (key === "condition-desk") {
    const all = cdData.conditions;
    const blockers = all.filter((c) => c.stage === "before_start");
    const rows = blockers.slice(0, 4).map((c) => `<div class="mrow"><span class="num">${c.n}</span><div><div class="tt">${esc(c.title)}</div><div class="ss"><span class="spill">${esc(STAGE_LABEL[c.stage])}</span> prepared by ${esc(c.who.toLowerCase())}</div></div></div>`).join("");
    return `<div class="mock" aria-label="Example of a Condition Desk register"><div class="mock-bar"><i></i><i></i><i></i><span>Condition register: ${esc(cdData.site)}, ${esc(cdData.ref)}</span></div><div class="mock-body">
<h4>${esc(cdData.site)}</h4><p class="mm">${esc(cdData.council)}, ${esc(cdData.homes)} homes (a real permission)</p>
<div class="big"><div><b>${all.length}</b><small>conditions found</small></div><div class="hot"><b>${blockers.length}</b><small>must be cleared before work starts</small></div></div>
${rows}<div class="letter">A covering letter to the council is drafted for each submission.</div></div></div>`;
  }
  if (key === "habitat-draft") {
    const ps = hdData.parcels.slice(0, 6);
    const rows = ps.map((p) => `<div class="crow"><b>${esc(p.id)}</b><span>${esc(short(p.habitat, 26))}</span><span class="pill ${p.confidence}">${esc(p.confidence)}</span></div>`).join("");
    return `<div class="mock" aria-label="Example of a Habitat Draft desk study"><div class="mock-bar"><i></i><i></i><i></i><span>Desk study: ${esc(hdData.site)}, ${esc(hdData.ref)}</span></div>
<div class="mock-map"><img src="/lumicity/romsey-map.png" alt="First habitat map of the Romsey site drawn from national data" width="600" height="800"><div class="mock-body"><h4>${esc(hdData.proposal)}, ${hdData.area_ha} hectares</h4><p class="mm">${hdData.parcels.length} parcels. First draft, unchecked. How sure we are, per parcel:</p>${rows}<p class="mm" style="margin-top:8px">The ecologist checks and signs everything.</p></div></div></div>`;
  }
  const items = bcData.items;
  const n = (k: string) => items.filter((i) => i.kind === k).length;
  const gates = items.filter((i) => i.kind === "gate").slice(0, 3);
  const rows = gates.map((g, i) => `<div class="mrow"><span class="num">${i + 1}</span><div><div class="q">“${esc(short(g.text, 88))}”</div><div class="ss"><span class="spill">Pass or fail</span> ${esc(g.source)}</div></div></div>`).join("");
  return `<div class="mock" aria-label="Example of a Bid Check bid at a glance"><div class="mock-bar"><i></i><i></i><i></i><span>Bid at a glance: ${esc(bcData.title)}</span></div><div class="mock-body">
<h4>${esc(bcData.title)}</h4><p class="mm">${esc(bcData.buyer)}, closes ${esc(bcData.closing)}, ${esc(bcData.value)} (a real tender)</p>
<div class="big"><div><b>${items.length}</b><small>requirements found</small></div><div class="hot"><b>${n("gate")}</b><small>pass-or-fail conditions</small></div><div><b>${n("return_item")}</b><small>documents to return</small></div></div>${rows}</div></div>`;
}

function chart(key: LumicityKey, d: D): string {
  const cap = `<p class="cap">${esc(d.chart_caption)}</p>`;
  if (key === "condition-desk") {
    const all = cdData.conditions; const order = Object.keys(STAGE_LABEL);
    const rows = order.map((k) => [k, all.filter((c) => c.stage === k).length] as [string, number]).filter((r) => r[1] > 0).sort((a, b) => b[1] - a[1]);
    const mx = Math.max(...rows.map((r) => r[1]));
    return `<div class="chart"><h3>${esc(d.chart_title)}</h3>${rows.map((r) => `<div class="hbar${r[0] === "before_start" ? " hot" : ""}"><span>${esc(STAGE_LABEL[r[0]])}</span><span class="track"><i style="width:${(r[1] / mx) * 100}%"></i></span><b>${r[1]}</b></div>`).join("")}${cap}</div>`;
  }
  if (key === "habitat-draft") {
    const col: Record<string, string> = { low: "#d97706", medium: "#2563eb", high: "#0f7a4d" };
    const cnt = (k: string) => hdData.parcels.filter((p) => p.confidence === k).length;
    const tot = hdData.parcels.length;
    return `<div class="chart"><h3>${esc(d.chart_title)}</h3><div class="stack" role="img" aria-label="Parcels by confidence: ${cnt("low")} low, ${cnt("medium")} medium, ${cnt("high")} high">${["low", "medium", "high"].map((k) => `<i style="width:${(cnt(k) / tot) * 100}%;background:${col[k]}"></i>`).join("")}</div>
<div class="legend">${["low", "medium", "high"].map((k) => `<span style="--c:${col[k]}">${cnt(k)} parcels, ${k} confidence</span>`).join("")}</div>${cap}</div>`;
  }
  const items = bcData.items; const kinds: [string, string, string][] = [["gate", "Pass or fail", "#b4400c"], ["return_item", "Documents to return", "#64748b"], ["scored", "Scored criteria", "#2563eb"], ["deadline", "Deadlines", "#0f7a4d"], ["other", "Other", "#a8b3c4"]];
  const cnt = (k: string) => items.filter((i) => i.kind === k).length;
  return `<div class="chart"><h3>${esc(d.chart_title)}</h3><div class="stack" role="img" aria-label="Requirements by type">${kinds.map((k) => `<i style="width:${(cnt(k[0]) / items.length) * 100}%;background:${k[2]}"></i>`).join("")}</div>
<div class="legend">${kinds.map((k) => `<span style="--c:${k[2]}">${cnt(k[0])} ${k[1].toLowerCase()}</span>`).join("")}</div>
<p style="margin-top:14px;color:var(--ink-soft)"><b>How the bid is scored:</b> Price 50%, Quality 40%.</p>${cap}</div>`;
}

function demoShell(key: LumicityKey): string {
  return `<div id="demo-root" data-demo="${key}" class="panel"><p>Loading the example</p></div>`;
}

export const CSS3 = `
@import url("https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700;800&display=swap");
.pg{--font:"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-family:var(--font);background:#fffdf9}
.pg h1,.pg h2,.pg h3.serif{font-family:"Fraunces",Georgia,serif;font-weight:600;letter-spacing:-.02em}
.pg h1{font-size:clamp(38px,5.2vw,64px);line-height:1.04}
.pg h2{font-size:clamp(30px,4.2vw,46px);line-height:1.08}
.pg .s-head h2:after{display:none}
.pg .eyebrow{max-width:100%;line-height:1.35;display:inline-flex;align-items:center;gap:8px;background:#fff;border:1px solid var(--acc-m);color:var(--acc-d);border-radius:999px;padding:6px 14px;font-size:12.5px;letter-spacing:.06em}
.pg .eyebrow:before{content:"";width:7px;height:7px;border-radius:50%;background:var(--acc)}
.pg header.nav{background:rgba(255,253,249,.9)}
.logo{display:flex;align-items:center;gap:10px;text-decoration:none;color:var(--ink)}
.logo .mk{width:34px;height:34px;border-radius:10px;background:var(--acc);color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(15,23,41,.18)}
.logo b{font-family:"Fraunces",Georgia,serif;font-size:21px;font-weight:600;letter-spacing:-.01em}
.logo small{display:block;font-size:11.5px;color:var(--muted);font-weight:600;letter-spacing:.02em;margin-top:-2px}
.navlinks{display:none;gap:26px;font-size:15px;font-weight:600}.navlinks a{color:var(--ink-soft);text-decoration:none}.navlinks a:hover{color:var(--acc-d)}
.hero2{position:relative;padding:40px 0 56px;background:radial-gradient(1200px 500px at 85% -10%,var(--acc-s),transparent 60%),linear-gradient(180deg,#fffdf9,#fff)}
.hero2 .grid{display:grid;gap:36px;align-items:center}
.hero2 .sub{font-size:clamp(18px,2vw,20px);color:var(--ink-soft);max-width:54ch;margin-top:20px}
.hero2 h1{margin-top:18px;max-width:17ch}
.hero2 h1 em{font-style:italic;color:var(--acc-d)}
.hero2 .meta{display:flex;flex-wrap:wrap;gap:10px 22px;margin-top:22px;font-size:14.5px;color:var(--ink-soft);font-weight:600}
.hero2 .meta span{display:inline-flex;align-items:center;gap:7px}.hero2 .meta svg{color:var(--acc)}
.dl-link{display:inline-flex;align-items:center;gap:8px;margin-top:18px;font-weight:700;color:var(--acc-d);text-decoration:none;border-bottom:2px solid var(--acc-m);padding-bottom:2px}.dl-link:hover{border-color:var(--acc-d)}
.photo{position:relative;min-width:0}
.photo .ph{position:relative;border-radius:28px;overflow:hidden;box-shadow:0 30px 80px rgba(15,23,41,.22);aspect-ratio:4/3.3;background:#e8e2d8}
.photo .ph img{width:100%;height:100%;object-fit:cover;display:block}
.photo .ph:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,transparent 55%,rgba(15,23,41,.35))}
.photo .float{position:relative;margin:-90px 14px 0;z-index:2}
.mini{background:#fff;border-radius:18px;padding:16px 18px;box-shadow:0 24px 60px rgba(15,23,41,.25);border:1px solid var(--line)}
.mini .mt{display:flex;gap:10px;align-items:center}.mini .mk{width:34px;height:34px;border-radius:10px;background:var(--acc);color:#fff;display:flex;align-items:center;justify-content:center;flex:none}
.mini .mt b{display:block;font-size:15px}.mini .mt small{display:block;font-size:12.5px;color:var(--muted)}
.mini .mn{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}.mini .mn div{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:10px 12px}
.mini .mn b{display:block;font-family:"Fraunces",Georgia,serif;font-size:30px;line-height:1;font-weight:600}.mini .mn small{font-size:12.5px;color:var(--ink-soft)}
.mini .mn .hot{background:var(--acc-s);border-color:var(--acc-m)}.mini .mn .hot b{color:var(--acc-d)}
.mini .mf{margin-top:10px;font-size:13px;font-weight:600;color:var(--ink-soft);display:flex;gap:6px;align-items:center}.mini .mf svg{color:var(--acc)}
.photo .tagc{position:absolute;z-index:3;top:18px;left:18px;background:rgba(255,255,255,.95);backdrop-filter:blur(6px);border-radius:14px;padding:10px 14px;box-shadow:0 10px 30px rgba(15,23,41,.18);font-size:13.5px;font-weight:700;display:flex;align-items:center;gap:10px}
.photo .tagc i{width:30px;height:30px;border-radius:9px;background:var(--acc-s);color:var(--acc-d);display:flex;align-items:center;justify-content:center;font-style:normal}
.photo .tagc small{display:block;font-weight:500;color:var(--muted);font-size:12px}
.stats{background:var(--ink);color:#fff;padding:34px 0}
.stats ul{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:1fr 1fr;gap:22px}
.stats b{display:block;font-family:"Fraunces",Georgia,serif;font-size:clamp(34px,4vw,48px);font-weight:600;line-height:1;color:#fff}
.stats span{display:block;margin-top:8px;font-size:14px;color:#c7cfdc;max-width:24ch}
.split{display:grid;gap:34px;align-items:center}
.split .pic{border-radius:24px;overflow:hidden;box-shadow:0 24px 60px rgba(15,23,41,.16);aspect-ratio:4/3}
.split .pic img{width:100%;height:100%;object-fit:cover;display:block}
.split h2{margin-bottom:16px}
.plist2{list-style:none;margin:22px 0 0;padding:0;display:grid;gap:14px}
.plist2 li{display:flex;gap:14px;align-items:flex-start;font-size:17px}
.plist2 li i{flex:none;width:30px;height:30px;border-radius:50%;background:var(--red-soft);color:var(--red);display:flex;align-items:center;justify-content:center;font-style:normal;font-weight:800;font-size:15px}
.lede{font-size:18px;color:var(--ink-soft)}
.sample{background:linear-gradient(135deg,var(--acc-s),#fff 70%);border:1px solid var(--acc-m);border-radius:28px;padding:28px;display:grid;gap:30px;align-items:center;overflow:hidden}
.sample .paper{position:relative;max-width:340px;margin:0 auto}
.sample .paper img{width:100%;display:block;border-radius:6px;box-shadow:0 2px 4px rgba(15,23,41,.08),0 30px 60px rgba(15,23,41,.22);transform:rotate(-2.5deg);background:#fff}
.sample .paper:before{content:"";position:absolute;inset:14px -14px -10px 18px;background:#fff;border-radius:6px;box-shadow:0 20px 40px rgba(15,23,41,.12);transform:rotate(3deg)}
.sample .paper .pdf{position:absolute;right:-6px;bottom:22px;background:var(--acc);color:#fff;font-weight:800;font-size:12px;border-radius:8px;padding:5px 10px;box-shadow:0 6px 16px rgba(15,23,41,.25);transform:rotate(-2.5deg)}
.sample h2{margin-bottom:12px}
.sample ul{list-style:none;padding:0;margin:18px 0 24px;display:grid;gap:10px}
.sample li{padding-left:30px;position:relative}.sample li:before{content:"";position:absolute;left:4px;top:7px;width:12px;height:7px;border-left:3px solid var(--acc);border-bottom:3px solid var(--acc);transform:rotate(-45deg)}
.btn-dl{background:var(--ink);color:#fff}.btn-dl:hover{background:#000}
.founder{display:grid;gap:26px;align-items:start;background:#fff;border:1px solid var(--line);border-radius:24px;padding:28px;box-shadow:var(--shadow)}
.founder .av{width:84px;height:84px;border-radius:50%;background:var(--acc);color:#fff;font-family:"Fraunces",Georgia,serif;font-size:32px;font-weight:600;display:flex;align-items:center;justify-content:center}
.founder h3{font-family:"Fraunces",Georgia,serif;font-size:26px;font-weight:600}
.founder .role{color:var(--muted);font-weight:600;margin-top:2px}
.founder p.bio{margin-top:14px;color:var(--ink-soft);font-size:17px;max-width:68ch}
.founder .facts{display:flex;flex-wrap:wrap;gap:10px;margin-top:18px}.founder .facts span{background:var(--surface);border:1px solid var(--line);border-radius:999px;padding:6px 12px;font-size:13.5px;font-weight:600}
.founder a{font-weight:700;color:var(--acc-d)}
.pg .steps .step{border-radius:20px;padding:26px}
.cta-photo{position:relative;color:#fff;padding:96px 0;overflow:hidden;text-align:center}
.cta-photo img.bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.cta-photo:before{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(15,23,41,.55),rgba(15,23,41,.72));z-index:1}
.cta-photo .wrap{position:relative;z-index:2}
.cta-photo h2{color:#fff;font-size:clamp(34px,5vw,56px)}.cta-photo p{color:#e2e8f0;margin:14px auto 0;max-width:52ch;font-size:18px}
.cta-photo .cta-row{justify-content:center}.cta-photo .btn-primary{background:#fff;color:var(--ink);box-shadow:0 10px 30px rgba(0,0,0,.3)}.cta-photo .btn-primary:hover{background:var(--acc-s)}
.cta-photo .btn-ghost{background:transparent;color:#fff;border-color:rgba(255,255,255,.6)}
.cta-photo a.mail{color:#fff}
.pg footer{background:#fff}
@media(max-width:759px){body:has(.pg) [aria-label="Cookie preferences"]{margin-bottom:76px}.photo .float{margin:-60px 8px 0}.photo .tagc{top:12px;left:12px}}
@media(min-width:760px){.navlinks{display:flex}.hero2{padding:56px 0 84px}.hero2 .grid{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:56px}.photo .float{position:absolute;left:-48px;right:auto;bottom:-40px;width:300px;margin:0}.photo .ph{aspect-ratio:4/4.5}.stats ul{grid-template-columns:repeat(4,1fr)}.split{grid-template-columns:1fr 1fr;gap:64px}.split.rev .pic{order:2}.sample{grid-template-columns:.85fr 1.15fr;padding:48px}.founder{grid-template-columns:auto 1fr;padding:40px}}
`;

const MARK: Record<LumicityKey, string> = {
  "condition-desk": `<svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true"><path d="M6 3h9l3 3v15H6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M9 13l2 2 4-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  "habitat-draft": `<svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true"><path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M5 19l8-8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  "bid-check": `<svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true"><path d="M4 6l2 2 3-3M4 13l2 2 3-3M4 20l2 2 3-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M13 7h7M13 14h7M13 21h7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
};
const TICK = `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M2.5 8.5l3.5 3.5 7.5-8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const DL = `<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M10 3v10m0 0l-4-4m4 4l4-4M4 16h12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

type Extra = { img: string; problemTitle: string; stats: [string, string][]; sample: { pages: number; label: string; points: string[] }; ctaLine: string };
function extra(key: LumicityKey): Extra {
  if (key === "condition-desk") {
    const all = cdData.conditions; const pre = all.filter((c) => c.stage === "before_start").length;
    return { img: "cd", problemTitle: "Planning conditions hold up the start on site",
      stats: [[String(all.length), `conditions on a real permission for ${cdData.homes} homes in Albrighton`], [String(pre), "of them must be cleared before work can start"], ["1 day", "usual turnaround for the full register"], ["£400", "per permission, or £1,000 a month for five live sites"]],
      sample: { pages: 17, label: "The full Condition Desk report for Land north of Kingswood Road, Albrighton: all 38 conditions, built from Shropshire Council's decision notice.", points: ["Every condition in plain English, with when it is due", "Which specialist usually prepares each one, and the documents to gather", "The conditions that block a start on site, picked out", "A drafted covering letter for the first council submission"] },
      ctaLine: "Send us a decision notice and get the register back, usually within a day." };
  }
  if (key === "habitat-draft") {
    return { img: "hd", problemTitle: "Desk studies eat into time on site",
      stats: [[String(hdData.parcels.length), "habitat parcels mapped on a real site in Romsey"], [String(hdData.area_ha), "hectares covered from national data"], ["600 m", "search radius for protected sites and priority habitats"], ["£150", "per desk study, or £1,000 a month for eight"]],
      sample: { pages: 2, label: "A Habitat Draft desk study for land east of Southampton Road, Romsey, built from open data and the council's public application.", points: ["Protected sites and priority habitats within 600 metres", "A first habitat map from national data, with how sure we are per parcel", "Tree and hedge heights from the Environment Agency's laser survey", "A list of the parcels to check on the walkover"] },
      ctaLine: "Send us a site boundary and get the desk study back, usually within a day." };
  }
  const items = bcData.items; const n = (k: string) => items.filter((i) => i.kind === k).length;
  return { img: "bc", problemTitle: "Tender packs are long, and one miss loses the bid",
    stats: [[String(items.length), "requirements found in a real council tender"], [String(n("gate")), "of them are pass-or-fail"], [String(n("return_item")), "documents the bidder must submit"], ["£600", "per tender, or £1,500 a month for three"]],
    sample: { pages: 3, label: "The bid at a glance for Hedge End Town Council's Drummond Community Centre refurbishment, built only from the public tender documents.", points: ["Every pass-or-fail condition, quoted from the tender", "Every document to submit, and how bids are scored", "The key dates and deadlines", "Each item linked to the page it came from"] },
    ctaLine: "Send us a tender pack and get your bid at a glance, usually within a day." };
}

function mini(key: LumicityKey): string {
  let t = "", m = "", a: [string, string], b: [string, string], foot = "";
  if (key === "condition-desk") {
    const all = cdData.conditions; t = "Condition register"; m = `${cdData.site}`;
    a = [String(all.length), "conditions"]; b = [String(all.filter((c) => c.stage === "before_start").length), "before work starts"]; foot = "Covering letters drafted";
  } else if (key === "habitat-draft") {
    t = "Desk study"; m = `${hdData.site}`; a = [String(hdData.parcels.length), "parcels mapped"]; b = [String(hdData.parcels.filter((p) => p.confidence === "low").length), "to check on site"]; foot = "Ecologist signs everything";
  } else {
    const it = bcData.items; t = "Bid at a glance"; m = `${bcData.title}`; a = [String(it.length), "requirements"]; b = [String(it.filter((i) => i.kind === "gate").length), "pass or fail"]; foot = "Each quoted from the tender";
  }
  return `<div class="mini"><div class="mt"><span class="mk">${MARK[key]}</span><div><b>${esc(t)}</b><small>${esc(short(m, 42))}</small></div></div><div class="mn"><div><b>${a[0]}</b><small>${esc(a[1])}</small></div><div class="hot"><b>${b[0]}</b><small>${esc(b[1])}</small></div></div><p class="mf">${TICK} ${esc(foot)}</p></div>`;
}

const BIO = "Tristan Fischer has been chief executive or a board director of fourteen companies, almost all of them hard technology: wind, solar, wave and tidal, batteries, carbon capture and controlled-environment agriculture. He has built three greenfield industrial sites, including a 25,000 m² automated factory, and has raised around £200m for his companies. He started in project finance at Citigroup and later ran corporate venture investments at Shell Technology Ventures.";

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
  const pdf = `/lumicity/samples/${key}-sample.pdf`;
  const dlName = `${c.name} sample report.pdf`;
  const dlBtn = (cls: string, label: string) => `<a class="${cls}" href="${pdf}" download="${esc(dlName)}">${DL} ${esc(label)}</a>`;
  return `<style>${CSS}${CSS2}${CSS3}</style>
<div class="pg" style="${style}">
<header class="nav"><div class="wrap nav-inner"><a class="logo" href="/${key}"><span class="mk">${MARK[key]}</span><span><b>${esc(c.name)}</b><small>A Fractional Forge service</small></span></a>
<nav class="navlinks" aria-label="Page sections"><a href="#how">How it works</a><a href="#demo">Example</a><a href="#sample">Sample report</a><a href="#price">Price</a><a href="#faq">Questions</a></nav>${link(c, "Book a call", "btn btn-primary")}</div></header>
<main>
<section class="hero2"><div class="wrap grid"><div>
<p class="eyebrow">${esc(d.kicker)}</p>
<h1>${esc(c.hero_head || c.headline)}</h1>
<p class="sub">${esc(c.hero_sub || c.subhead)}</p>
<div class="cta-row">${link(c, c.cta)}<a class="btn btn-ghost" href="#demo">Try a real example</a></div>
${dlBtn("dl-link", `Download a sample report (PDF, ${x.sample.pages} pages)`)}
<div class="meta"><span>${TICK} Usually within a day</span><span>${TICK} ${esc(c.one[0])} ${esc(c.one[1])}</span><span>${TICK} Built from public documents</span></div>
</div>
<div class="photo"><div class="ph"><img src="/lumicity/img/${x.img}-hero.jpg" alt="" width="1600" height="903" fetchpriority="high"></div>
<div class="tagc"><i>${TICK}</i><span>Usually within a day<small>Built from public documents</small></span></div>
<div class="float">${mini(key)}</div></div>
</div></section>
<section class="stats" aria-label="Key numbers"><div class="wrap"><ul>${x.stats.map((s) => `<li><b>${esc(s[0])}</b><span>${esc(s[1])}</span></li>`).join("")}</ul></div></section>
<section class="s"><div class="wrap split"><div class="pic"><img src="/lumicity/img/${x.img}-context.jpg" alt="" width="1100" height="817" loading="lazy"></div>
<div><h2>${esc(x.problemTitle)}</h2><ul class="plist2">${c.problem.map((p) => `<li><i>!</i><span>${esc(p)}</span></li>`).join("")}</ul>
<p class="lede" style="margin-top:22px">${esc(c.name)} does that groundwork for you, usually within a day, so your team can get on with the parts only they can do.</p></div></div></section>
<section class="s alt" id="how"><div class="wrap"><div class="s-head"><h2>How it works</h2></div>
<div class="steps">${d.step_titles.map((t, i) => `<div class="step"><div class="ic">${ICON[i]}</div><div class="n">${i + 1}</div><h3>${esc(t)}</h3><p>${esc(d.step_texts[i])}</p></div>`).join("")}</div></div></section>
<section class="s" id="demo"><div class="wrap"><div class="s-head"><h2>${esc(c.demo_title)}</h2><p>${esc(c.demo_intro)}</p></div>
<p class="demo-label"><b>A real example, built from public documents.</b> ${esc(c.demo_label.replace(/^A real example, built from public documents: /, ""))}</p>
${demoShell(key)}<div style="margin-top:28px">${chart(key, d)}</div></div></section>
<section class="s alt"><div class="wrap"><div class="s-head"><h2>By hand, or with ${esc(c.name)}</h2></div>
<div class="ba">${d.before_after.map((r) => `<div class="row"><div class="b"><small><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg> By hand</small>${esc(r[0])}</div><div class="a"><small>${TICK} With ${esc(c.name)}</small>${esc(r[1])}</div></div>`).join("")}</div></div></section>
<section class="s" id="sample"><div class="wrap"><div class="sample"><a class="paper" href="${pdf}" download="${esc(dlName)}" aria-label="Download the sample report"><img src="/lumicity/samples/${key}-cover.jpg" alt="First page of the ${esc(c.name)} sample report" loading="lazy"><span class="pdf">PDF · ${x.sample.pages} ${x.sample.pages === 1 ? "page" : "pages"}</span></a>
<div><p class="eyebrow">Sample report</p><h2 style="margin-top:14px">See a full report before you pay</h2><p class="lede">${esc(x.sample.label)}</p>
<ul>${x.sample.points.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
<div class="cta-row">${dlBtn("btn btn-dl", "Download the sample")}${link(c, c.cta, "btn btn-ghost")}</div></div></div></div></section>
<section class="s alt" id="price"><div class="wrap"><div class="s-head"><h2>Simple pricing</h2></div>
<div class="price"><div class="pc feat"><span class="badge">Start here</span><p class="eyebrow">One-off</p><p class="amt">${esc(c.one[0])}</p><p class="unit">${esc(c.one[1])}</p><div class="cta-row">${link(c, c.cta)}</div></div>
<div class="pc"><p class="eyebrow">Monthly</p><p class="amt">${esc(c.mon[0])}</p><p class="unit">${esc(c.mon[1])}</p><div class="cta-row">${link(c, "Talk about monthly", "btn btn-ghost")}</div></div></div>
<div class="honest"><h3>What it does not do</h3><ul>${c.not_do.map((n) => `<li>${esc(n)}</li>`).join("")}</ul></div>
</div></section>
<section class="s"><div class="wrap"><div class="founder"><div class="av" aria-hidden="true">TF</div><div><h3>Who is behind ${esc(c.name)}</h3><p class="role">Tristan Fischer, Director, Fractional Forge Limited</p>
<p class="bio">${esc(BIO)}</p>
<div class="facts"><span>Chief executive or director of 14 companies</span><span>3 industrial sites built</span><span>About £200m raised</span><span>Citigroup project finance</span></div>
<p style="margin-top:18px"><a href="https://www.linkedin.com/in/tristanfischer/" target="_blank" rel="noopener">Tristan on LinkedIn</a></p></div></div></div></section>
<section class="s alt" id="faq"><div class="wrap"><div class="s-head"><h2>Questions</h2></div>${faqs}</div></section>
<section class="cta-photo"><img class="bg" src="/lumicity/img/${x.img}-cta.jpg" alt="" loading="lazy"><div class="wrap"><h2>${esc(c.cta)}</h2><p>${esc(x.ctaLine)} Book a 30 minute call, or email <a class="mail" href="mailto:${MAIL}?subject=${encodeURIComponent(c.mail)}">${MAIL}</a>.</p>
<div class="cta-row">${link(c, c.cta)}${dlBtn("btn btn-ghost", "Download the sample")}</div></div></section>
</main>
<footer><div class="wrap"><p>${esc(c.name)}, a Fractional Forge service. Also from Fractional Forge: ${others}</p>
<p>Fractional Forge Limited · Tristan Fischer · ${mailto(c)}</p></div></footer>
<div class="mbar"><span>${esc(c.one[0])} ${esc(c.one[1])}<br>Usually within a day</span>${link(c, "Book a call")}</div>
</div>`;
}
