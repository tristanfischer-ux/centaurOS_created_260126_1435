import type { Metadata } from "next";
import { HeroNavScroll } from "./nav-scroll";
import { WorkbookGate } from "@/components/marketing/workbook-gate";
import { FOCUS_SECTORS } from "@/lib/focus-sectors";

const FOCUS_ONLY = FOCUS_SECTORS.filter((s) => s.id !== "generic");
const GENERIC = FOCUS_SECTORS.find((s) => s.id === "generic");
const SECTOR_CARDS = FOCUS_ONLY.map(
  (s) => `      <div class="scard"><h3>${s.title}</h3><p>${s.blurb}</p></div>`,
).join("\n");

export const metadata: Metadata = {
  title: "Fractional Forge — the front end for hardware",
  description:
    "A costed, buildable engineering design in a few days — free, and reviewed by senior engineers from our partner network, who can then build it. From there we help you raise the capital too. Anvil designs and costs it; fractional experts review it; contract manufacturers build it.",
  alternates: {
    canonical: "https://fractionalforge.app/",
  },
};

const HTML = `<style>

  :root{
    --bg:#ffffff;--surface:#f8fafc;--surface-2:#f1f5f9;--ink:#0f1729;--ink-soft:#334155;
    --muted:#64748b;--line:#e6eaf0;--ember:#e2562a;--ember-dark:#c2410c;--ember-soft:#fff2ec;
    --blue:#1d4ed8;--green:#0f7a4d;--radius:18px;--radius-sm:12px;
    --shadow:0 1px 2px rgba(15,23,41,.04), 0 10px 30px rgba(15,23,41,.07);
    --shadow-sm:0 1px 2px rgba(15,23,41,.05), 0 4px 14px rgba(15,23,41,.05);
    --maxw:1100px;--font:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,Helvetica,Arial,sans-serif;
  }
  *{box-sizing:border-box;}
  html{scroll-behavior:smooth;}
  body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--font);line-height:1.6;-webkit-font-smoothing:antialiased;font-size:17px;}
  a{color:var(--blue);text-decoration:none;}
  a:hover{text-decoration:underline;}
  .wrap{max-width:var(--maxw);margin:0 auto;padding:0 24px;}
  .eyebrow{font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--ember-dark);}
  h1,h2,h3{line-height:1.15;letter-spacing:-.02em;margin:0;}
  h1{font-size:clamp(34px,5vw,56px);font-weight:800;}
  h2{font-size:clamp(26px,3.4vw,38px);font-weight:800;}
  h3{font-size:20px;font-weight:700;}
  p{margin:0;}
  .muted{color:var(--muted);}
  .btn{display:inline-flex;align-items:center;gap:9px;border-radius:999px;padding:14px 24px;font-weight:700;font-size:16px;cursor:pointer;border:1px solid transparent;transition:.15s;}
  .btn-primary{background:var(--ember);color:#fff;box-shadow:0 6px 18px rgba(226,86,42,.28);}
  .btn-primary:hover{background:var(--ember-dark);text-decoration:none;transform:translateY(-1px);}
  .btn-ghost{background:#fff;color:var(--ink);border-color:var(--line);}
  .btn-ghost:hover{border-color:var(--ink-soft);text-decoration:none;}
  .btn-lg{padding:16px 28px;font-size:17px;}

  header.nav{position:sticky;top:0;z-index:50;background:transparent;border-bottom:1px solid transparent;transition:background .25s ease,border-color .25s ease,box-shadow .25s ease;}
  header.nav.scrolled{background:rgba(255,255,255,.85);backdrop-filter:saturate(180%) blur(10px);border-bottom:1px solid var(--line);box-shadow:0 4px 20px rgba(15,23,41,.05);}
  .nav-inner{display:flex;align-items:center;justify-content:space-between;height:68px;}
  .brand{display:flex;align-items:center;gap:10px;font-weight:800;font-size:18px;color:var(--ink);letter-spacing:-.02em;}
  .brand:hover{text-decoration:none;}
  .flame{width:26px;height:26px;border-radius:8px;background:linear-gradient(160deg,#f59e0b,#e2562a 60%,#c2410c);display:inline-flex;align-items:center;justify-content:center;}
  .flame svg{width:15px;height:15px;stroke:#fff;fill:none;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round;}
  .nav-links{display:flex;gap:26px;align-items:center;}
  .nav-links a{color:var(--ink-soft);font-weight:600;font-size:15px;}
  @media(max-width:920px){.nav-links{display:none;} }

  .hero{position:relative;overflow:hidden;padding:44px 0 60px;min-height:86vh;display:flex;align-items:center;background:
     linear-gradient(180deg, var(--ember-soft) 0%, #ffffff 56%),
     radial-gradient(1000px 560px at 88% -5%, rgba(226,86,42,.13), transparent 62%),
     radial-gradient(820px 460px at 2% 8%, #e6efff, transparent 58%);}
  .hero::before{content:"";position:absolute;inset:0;pointer-events:none;z-index:0;background-image:linear-gradient(rgba(15,23,41,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(15,23,41,.045) 1px,transparent 1px);background-size:34px 34px;-webkit-mask-image:radial-gradient(130% 108% at 50% -8%, #000 36%, transparent 74%);mask-image:radial-gradient(130% 108% at 50% -8%, #000 36%, transparent 74%);}
  .hero>.wrap{position:relative;z-index:1;width:100%;}
  .hero h1{margin:18px 0 0;max-width:20ch;}
  .hero .sub{font-size:clamp(18px,2.1vw,21px);color:var(--ink-soft);max-width:62ch;margin:22px 0 0;}
  .hero-cta{display:flex;gap:14px;flex-wrap:wrap;margin-top:32px;}
  .hero-trust{margin-top:18px;font-size:14px;color:var(--muted);display:flex;align-items:center;gap:8px;}
  .dot{width:6px;height:6px;border-radius:50%;background:var(--green);display:inline-block;}

  .hero-grid{display:grid;grid-template-columns:1.05fr .95fr;gap:52px;align-items:center;}
  .hero-copy .sub{max-width:52ch;}
  @media(max-width:900px){.hero-grid{grid-template-columns:1fr;} .hero-visual{display:none;} }
  .hero h1{font-size:clamp(40px,6.2vw,72px);line-height:1.04;}
  .cred{border-top:1px solid var(--line);border-bottom:1px solid var(--line);background:var(--surface);padding:26px 0 24px;}
  .cred-inner{display:grid;grid-template-columns:repeat(4,1fr);gap:26px;align-items:start;}
  .cred-stat{display:flex;flex-direction:column;gap:5px;}
  .cred-stat b{font-size:26px;font-weight:800;color:var(--ember);letter-spacing:-.02em;line-height:1;}
  .cred-stat span{font-size:13px;color:var(--muted);line-height:1.4;}
  .cred-by{margin-top:18px;font-size:14px;color:var(--muted);}
  .cred-by strong{color:var(--ink);}
  @media(max-width:760px){.cred-inner{grid-template-columns:repeat(2,1fr);gap:20px;} }
  .wb{background:#fff;border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow);overflow:hidden;}
  .wb-top{display:flex;align-items:center;gap:9px;padding:13px 16px;border-bottom:1px solid var(--line);font-weight:800;font-size:14px;color:var(--ink);}
  .wb-top .flame{width:20px;height:20px;border-radius:6px;}
  .wb-file{margin-left:auto;color:var(--muted);font-weight:600;font-size:12px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;}
  .wb-tabs{display:flex;gap:6px;padding:11px 14px;background:var(--surface);border-bottom:1px solid var(--line);flex-wrap:wrap;}
  .wb-tab{font-size:11px;padding:4px 9px;border-radius:6px;color:var(--muted);background:#fff;border:1px solid var(--line);}
  .wb-tab.on{color:var(--ember-dark);background:var(--ember-soft);border-color:transparent;font-weight:700;}
  .wb-row{display:flex;justify-content:space-between;align-items:center;padding:11px 16px;font-size:13.5px;border-bottom:1px solid var(--surface-2);}
  .wb-row span{color:var(--ink-soft);}
  .wb-row b{color:var(--ink);font-variant-numeric:tabular-nums;}
  .wb-row.total{border-top:2px solid var(--line);border-bottom:none;}
  .wb-row.total span{font-weight:800;color:var(--ink);}
  .wb-row.total b{color:var(--ember);font-weight:800;}
  .wb-foot{padding:11px 16px;font-size:11.5px;color:var(--muted);background:var(--surface);border-top:1px solid var(--line);display:flex;align-items:center;gap:7px;}
  .wb-foot .dot{background:var(--ember);}

  section.s{padding:72px 0;}
  .s-head{max-width:64ch;}
  .s-head h2{margin-bottom:14px;}

  .strip{background:linear-gradient(120deg,var(--ember-soft),#fff 70%);border:1px solid var(--line);border-radius:var(--radius);padding:40px;display:grid;grid-template-columns:1.25fr 1fr;gap:28px;align-items:center;box-shadow:var(--shadow-sm);}
  .strip h2{color:var(--ink);}
  .strip p{color:var(--ink-soft);margin-top:12px;}
  .strip .big{font-size:clamp(30px,4.4vw,46px);font-weight:800;color:var(--ink);letter-spacing:-.03em;line-height:1.06;}
  .strip .big span{color:var(--ember);}
  @media(max-width:760px){.strip{grid-template-columns:1fr;} }

  .steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:22px;margin-top:36px;}
  .step{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:28px;}
  .step .n{width:38px;height:38px;border-radius:11px;background:var(--ember-soft);color:var(--ember-dark);font-weight:800;display:flex;align-items:center;justify-content:center;font-size:18px;}
  .step h3{margin:16px 0 8px;}
  .step p{color:var(--ink-soft);font-size:15.5px;}
  .step p + p{margin-top:10px;}
  .step a{font-weight:700;font-size:14.5px;}
  @media(max-width:760px){.steps{grid-template-columns:1fr;} }

  .feat{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px;margin-top:36px;}
  .card{background:#fff;border:1px solid var(--line);border-radius:var(--radius-sm);padding:22px;box-shadow:var(--shadow-sm);}
  .card h3{font-size:16px;margin:0 0 6px;}
  .card p{font-size:14px;color:var(--muted);}
  @media(max-width:920px){.feat{grid-template-columns:repeat(2,1fr);} }
  @media(max-width:520px){.feat{grid-template-columns:1fr;} }

  .sectors{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;margin-top:32px;}
  .scard{background:#fff;border:1px solid var(--line);border-radius:var(--radius-sm);padding:22px;box-shadow:var(--shadow-sm);}
  .scard h3{font-size:16.5px;margin:0 0 8px;}
  .scard p{font-size:14px;color:var(--muted);}
  .scard-wide{margin-top:16px;background:#fff;border:1px dashed var(--line);border-radius:var(--radius-sm);padding:22px;}
  .scard-wide h3{font-size:16.5px;margin:0 0 8px;}
  .scard-wide p{font-size:14px;color:var(--muted);}
  @media(max-width:920px){.sectors{grid-template-columns:repeat(2,1fr);} }
  @media(max-width:520px){.sectors{grid-template-columns:1fr;} }

  .examples{background:var(--surface);}
  .ex-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px;margin-top:34px;}
  .ex{background:#fff;border:1px solid var(--line);border-radius:var(--radius);overflow:hidden;box-shadow:var(--shadow);display:flex;flex-direction:column;}
  .ex .top{padding:26px 26px 0;}
  .ex .tag{display:inline-block;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--ember-dark);background:var(--ember-soft);padding:5px 11px;border-radius:999px;}
  .ex h3{margin:16px 0 6px;font-size:22px;}
  .ex .desc{color:var(--ink-soft);font-size:15px;}
  .ex .cover{display:block;width:100%;height:190px;object-fit:cover;object-position:top center;border-bottom:1px solid var(--line);background:#fff;}
  .ex .cover:hover{opacity:.93;}
  .ex .meta{display:flex;gap:16px;padding:16px 26px;border-top:1px solid var(--line);margin-top:auto;color:var(--muted);font-size:14px;font-weight:600;}
  .ex .act{padding:0 26px 26px;}
  .ex .act .btn{width:100%;justify-content:center;}
  .ex-note{margin-top:18px;color:var(--muted);font-size:14px;text-align:center;}
  @media(max-width:900px){.ex-grid{grid-template-columns:1fr;} }

  .partners{background:linear-gradient(120deg,#0f1729,#1f2a44 70%);color:#e7ecf5;}
  .partners .eyebrow{color:#ff8a5c;}
  .partners h2{color:#fff;}
  .partners .lead{color:#c7d0e0;margin-top:14px;max-width:60ch;font-size:16.5px;}
  .partners .offer{list-style:none;padding:0;margin:30px 0 0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;}
  .partners .offer li{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:var(--radius-sm);padding:22px;}
  .partners .offer b{display:block;color:#fff;font-size:16px;margin-bottom:8px;}
  .partners .offer span{font-size:14.5px;color:#bcc6d8;}
  .partners .pact{margin-top:30px;display:flex;gap:14px;flex-wrap:wrap;align-items:center;}
  .partners .pnote{margin-top:18px;font-size:13px;color:#94a3bd;font-style:italic;}
  @media(max-width:760px){.partners .offer{grid-template-columns:1fr;} }

  .founders-grid{display:grid;grid-template-columns:1fr 1fr;gap:36px;align-items:center;margin-top:8px;}
  .founders-img{width:100%;border-radius:var(--radius);box-shadow:var(--shadow);display:block;}
  .hero-img{width:100%;height:auto;display:block;border-radius:16px;box-shadow:var(--shadow);}
  .wb-visuals{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin:10px 0 36px;}
  .wb-visuals figure{margin:0;}
  .wb-visuals img{width:100%;border-radius:12px;border:1px solid var(--line);box-shadow:var(--shadow-sm);display:block;background:#fff;}
  .wb-visuals figcaption{font-size:12.5px;color:var(--muted);margin-top:9px;text-align:center;}
  @media(max-width:640px){.wb-visuals{grid-template-columns:1fr;} }
  .axis-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:34px;}
  .axis{background:#fff;border:1px solid var(--line);border-radius:var(--radius-sm);padding:24px;box-shadow:var(--shadow-sm);}
  .axis-k{display:inline-block;font-size:19px;font-weight:800;color:var(--ember);letter-spacing:-.01em;margin-bottom:8px;}
  .axis p{font-size:14.5px;color:var(--ink-soft);}
  .axis-foot{margin-top:24px;font-size:16px;color:var(--ink-soft);max-width:66ch;}
  .axis-foot::before{content:"\\21bb";color:var(--ember);font-weight:800;margin-right:9px;}
  @media(max-width:760px){.axis-grid{grid-template-columns:1fr;} }
  .founders-grid ul{list-style:none;padding:0;margin:0;}
  .founders-grid li{padding:11px 0 11px 30px;position:relative;font-size:16px;color:var(--ink-soft);border-bottom:1px solid var(--line);}
  .founders-grid li:last-child{border-bottom:none;}
  .founders-grid li::before{content:"\\2192";position:absolute;left:0;color:var(--ember);font-weight:800;}
  @media(max-width:760px){.founders-grid{grid-template-columns:1fr;}}

  .about{background:linear-gradient(120deg,#eef4ff,#fff 70%);border:1px solid var(--line);border-radius:var(--radius);padding:44px;display:grid;grid-template-columns:120px minmax(0,1fr);gap:30px;align-items:start;box-shadow:var(--shadow-sm);}
  .about .ava{width:108px;height:108px;border-radius:50%;object-fit:cover;box-shadow:var(--shadow-sm);display:block;}
  .about h2{color:var(--ink);}
  .about p{color:var(--ink-soft);margin-top:14px;max-width:66ch;}
  .about .essays{margin-top:18px;display:flex;flex-direction:column;gap:6px;}
  .about .essays .lbl{color:var(--muted);font-size:14px;font-weight:600;}
  .about .essays a{color:var(--blue);font-weight:600;font-size:15px;}
  .about .sign{margin-top:20px;font-weight:700;color:var(--ink);}
  .about .btn{margin-top:22px;}
  @media(max-width:640px){.about{grid-template-columns:1fr;} }

  .price{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:22px;margin-top:34px;}
  .plan{border:1px solid var(--line);border-radius:var(--radius);padding:30px;background:#fff;box-shadow:var(--shadow-sm);}
  .plan.feat-plan{border:2px solid var(--ember);}
  .plan .price-big{font-size:34px;font-weight:800;margin:6px 0 0;}
  .plan .price-big small{font-size:15px;font-weight:600;color:var(--muted);display:block;margin-top:4px;}
  .plan ul{list-style:none;padding:0;margin:18px 0 24px;}
  .plan li{padding:7px 0;padding-left:26px;position:relative;font-size:15px;color:var(--ink-soft);}
  .plan li::before{content:"\\2713";position:absolute;left:0;color:var(--green);font-weight:800;}
  .plan .btn{width:100%;justify-content:center;}
  .tag-pill{display:inline-block;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:5px 11px;border-radius:999px;}
  .tag-ember{color:var(--ember-dark);background:var(--ember-soft);}
  .tag-grey{color:var(--ink-soft);background:var(--surface-2);}
  .price-note{margin-top:20px;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-sm);padding:18px 22px;font-size:15px;color:var(--ink-soft);}
  .price-note b{color:var(--ink);}
  @media(max-width:640px){.price{grid-template-columns:1fr;} }

  details{border:1px solid var(--line);border-radius:var(--radius-sm);padding:0;margin-top:12px;background:#fff;overflow:hidden;}
  summary{cursor:pointer;padding:18px 22px;font-weight:700;font-size:16.5px;list-style:none;display:flex;justify-content:space-between;align-items:center;}
  summary::-webkit-details-marker{display:none;}
  summary::after{content:"+";color:var(--ember);font-size:22px;font-weight:700;}
  details[open] summary::after{content:"\\2013";}
  details .body{padding:0 22px 20px;color:var(--ink-soft);font-size:15.5px;}

  .final{background:radial-gradient(700px 300px at 50% 120%, var(--ember-soft), transparent 60%);text-align:center;padding:84px 0;}
  .final h2{max-width:20ch;margin:0 auto 16px;}
  .final p{max-width:54ch;margin:0 auto 28px;color:var(--ink-soft);font-size:18px;}
  .paths{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:34px;text-align:left;}
  .paths .plan h3{font-size:18px;}
  .paths .plan p{margin:10px 0 20px;font-size:15px;color:var(--ink-soft);max-width:none;}
  @media(max-width:640px){.paths{grid-template-columns:1fr;}}

  footer{border-top:1px solid var(--line);padding:56px 0 38px;color:var(--muted);font-size:14px;background:var(--surface);}
  .foot-grid{display:grid;grid-template-columns:2fr 1fr 1fr;gap:40px;}
  .foot-brand .brand{margin-bottom:14px;}
  .foot-brand p{max-width:430px;line-height:1.65;color:var(--muted);margin:0;}
  .foot-col h4{font-size:14px;font-weight:700;color:var(--ink);margin:0 0 14px;}
  .foot-col a{display:block;color:var(--muted);margin-bottom:9px;font-size:14px;}
  .foot-col a:hover{color:var(--ink);text-decoration:none;}
  .foot-bottom{display:flex;justify-content:space-between;align-items:center;gap:16px;border-top:1px solid var(--line);margin-top:44px;padding-top:24px;font-size:12.5px;}
  .foot-legal a{color:var(--muted);margin-left:18px;}
  .foot-legal a:hover{color:var(--ink);text-decoration:none;}
  @media(max-width:760px){.foot-grid{grid-template-columns:1fr;gap:28px;} .foot-bottom{flex-direction:column;align-items:flex-start;} .foot-legal a{margin-left:0;margin-right:18px;} }

  .hood-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:26px;margin-top:34px;}
  @media(max-width:760px){.hood-grid{grid-template-columns:1fr;}}
  .hood-col{background:#fff;border:1px solid var(--line);border-radius:var(--radius);padding:28px;box-shadow:var(--shadow-sm);}
  .hood-col h3{font-size:18px;}
  .hood-col > p.lead{margin:8px 0 0;font-size:14.5px;color:var(--muted);}
  .chips{display:grid;grid-template-columns:minmax(0,1fr);gap:10px;margin-top:18px;}
  .chip{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:11px 13px;}
  .chip b{display:block;font-size:14px;color:var(--ink);}
  .chip span{display:block;font-size:12px;color:var(--muted);margin-top:2px;}
  .hood-list{list-style:none;padding:0;margin:18px 0 0;}
  .hood-list li{padding:9px 0 9px 26px;position:relative;font-size:14.5px;color:var(--ink-soft);border-bottom:1px solid var(--line);}
  .hood-list li:last-child{border-bottom:none;}
  .hood-list li::before{content:"\\2713";position:absolute;left:0;color:var(--green);font-weight:800;}
  .hood-list b{color:var(--ink);}
  .hood-note{margin-top:16px;font-size:12.5px;color:var(--muted);font-style:italic;}

</style>




<header class="nav">
  <div class="wrap nav-inner">
    <a class="brand" href="#"><span class="flame"><svg viewBox="0 0 24 24"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg></span> Fractional&nbsp;Forge</a>
    <nav class="nav-links">
      <a href="#how">How it works</a>
      <a href="#sectors">What we do</a>
      <a href="#examples">What&rsquo;s inside</a>
      <a href="/sample-package">Example package</a>
      <a href="#partners">For partners</a>
      <a href="/insights">Insights</a>
      <a href="#about">About</a>
    </nav>
    <a class="btn btn-primary" href="/brief">Get your free Design Dossier</a>
  </div>
</header>

<!-- HERO -->
<section class="hero">
  <div class="wrap hero-grid">
    <div class="hero-copy">
      <span class="eyebrow">For deep-tech &amp; hardware founders</span>
      <h1>The front end for hardware.</h1>
      <p class="sub">A costed, buildable engineering design in a few days &mdash; free, and reviewed by senior engineers from our partner network, who can then build it. From there we help you raise the capital too.</p>
      <div class="hero-cta">
        <a class="btn btn-primary btn-lg" href="/brief">Get your free Design Dossier</a>
        <a class="btn btn-ghost btn-lg" href="/sample-package">See a real example &rarr;</a>
      </div>
      <p class="hero-trust"><span class="dot"></span> Anvil designs and costs it, our partner network&rsquo;s engineers review it &mdash; and the same network can build it.</p>
    </div>
    <div class="hero-visual">
      <img class="hero-img" src="/images/site/hero-illustration.webp" alt="A software-style control panel piped into an industrial process plant — the front end for hardware" width="1500" height="661" />
    </div>
  </div>
</section>

<!-- CREDIBILITY BAND -->
<section class="cred">
  <div class="wrap cred-inner">
    <div class="cred-stat"><b>25+ yrs</b><span>building capital-intensive deep-tech &amp; manufacturing</span></div>
    <div class="cred-stat"><b>~&pound;200m</b><span>raised across his own &amp; advised companies</span></div>
    <div class="cred-stat"><b>4 focus lines</b><span>battery energy storage &middot; water treatment &middot; electric motor sets &middot; medical assay</span></div>
    <div class="cred-stat"><b>Ex-Citigroup</b><span>&amp; Shell Ventures &middot; took a company public on AIM</span></div>
  </div>
  <p class="wrap cred-by">Founded by <strong>Tristan Fischer</strong> &mdash; a decade building Fischer Farms into one of the world&rsquo;s largest vertical farms. Every Design Dossier is reviewed by a senior engineer from our partner network.</p>
</section>

<!-- THESIS: why hardware is harder than software -->
<section class="s">
  <div class="wrap">
    <div class="strip">
      <div>
        <span class="eyebrow">The missing layer</span>
        <h2 style="margin-top:10px">Hardware is harder than software &mdash; by design.</h2>
        <p>Software won partly because the hard infrastructure is rented. AWS and Azure run the compute; the app stores handle distribution. A founder can stay product- and customer-led and let someone else own the atoms. Hardware has no equivalent: founders must invent the product, engineer it, stand up a factory or supply chain, <em>and</em> raise the capital &mdash; all at once. It&rsquo;s why so many genuinely good hardware companies stall.</p>
        <p style="margin-top:16px"><a href="/insights/from-basement-servers-to-billion-users-what-software-learned-that-hardware-hasnt">Read: Hardware Needs Its AWS Moment &rarr;</a></p>
      </div>
      <div><div class="big">Fractional&nbsp;Forge is building <span>the AWS for atoms.</span></div></div>
    </div>
  </div>
</section>

<!-- HOW IT WORKS: three pillars -->
<section class="s" id="how">
  <div class="wrap">
    <div class="s-head">
      <span class="eyebrow">How it works</span>
      <h2>Three parts, one chain: designed, reviewed, built.</h2>
      <p class="muted" style="margin-top:12px">One brief goes in; a costed design comes out, checked by the engineers who can then build it. You stay product-, sales- and customer-led.</p>
    </div>
    <div class="steps">
      <div class="step">
        <div class="n">1</div>
        <h3>Anvil &mdash; the engine</h3>
        <p><strong>Anvil</strong> turns your project brief into a costed, physics-checked <strong>Design Dossier</strong> in a few business days: a buildable design, a costed bill-of-materials ledger, engineering drawings, a financial model and a risk register.</p>
        <p>Every number is a formula you can check. Your first Dossier is free.</p>
        <p><a href="#whats-in">See what&rsquo;s inside &darr;</a></p>
      </div>
      <div class="step">
        <div class="n">2</div>
        <h3>Fractional experts &mdash; the review</h3>
        <p>Before you see it, the Dossier is reviewed by senior engineers from our curated network of design and engineering partner firms.</p>
        <p>Not an anonymous sign-off &mdash; the same firms that build hardware for a living put their eyes on your design.</p>
      </div>
      <div class="step">
        <div class="n">3</div>
        <h3>Contract manufacturing &mdash; the build</h3>
        <p>When you&rsquo;re ready, the same curated partner network builds it &mdash; from prototypes to mid-volume production.</p>
        <p>So you don&rsquo;t build a factory to ship a product.</p>
        <p><a href="#partners">Meet the partner network &rarr;</a></p>
      </div>
    </div>
    <p style="margin-top:28px;font-size:16px;color:var(--ink-soft);max-width:72ch">And when you&rsquo;re raising: we help with the capital too &mdash; fundraising on an introducer / success-fee basis (<strong>no raise, no fee</strong>), plus grants and non-dilutive routes. A costed, engineer-reviewed design with a route to build makes you far more fundable.</p>
  </div>
</section>

<!-- FOCUS SECTORS -->
<section class="s" id="sectors">
  <div class="wrap">
    <div class="s-head">
      <span class="eyebrow">What we do</span>
      <h2>Four lines we are building to be genuinely good at.</h2>
      <p class="muted" style="margin-top:12px">Anvil still takes a short brief for any machine. These four are where the engine, the packs and the partner review are deepest &mdash; battery energy storage, water treatment systems, electric motor sets, and medical assay machines. Everything else uses the same door as a generic pack.</p>
    </div>
    <div class="sectors">
${SECTOR_CARDS}
    </div>
    <div class="scard-wide">
      <h3>${GENERIC?.title ?? "Other hardware"}</h3>
      <p>${GENERIC?.blurb ?? ""}</p>
    </div>
    <p style="margin-top:22px"><a class="btn btn-primary" href="/brief">Send a brief in one of these &rarr;</a></p>
  </div>
</section>

<!-- DOSSIER ON-RAMP: what you get -->
<section class="s" id="whats-in" style="background:var(--surface)">
  <div class="wrap">
    <div class="s-head">
      <span class="eyebrow">Start here &mdash; the Design Dossier</span>
      <h2>Your day-one on-ramp: a full Design Dossier, free.</h2>
      <p class="muted" style="margin-top:12px">Describe your idea in a short brief &mdash; a paragraph is enough to start, and the more you tell it, the more precisely it hits your spec. Anvil, the engine inside Fractional Forge, builds your Design Dossier: an auditable Excel workbook &mdash; a buildable design, a costed bill-of-materials ledger, the true cost and a live financial model, the engineering drawings, and the risks and codes it must meet. Every number is a live formula you can trace, and Anvil runs independent checks on its own work before it ships.</p>
      <p style="margin-top:16px;font-weight:700;color:var(--ink);font-size:16.5px">A few business days, not a quarter &mdash; a Design Dossier compresses the two-to-three months and &pound;20k&ndash;&pound;40k of an upfront engineering study* into one auditable workbook.</p>
      <p class="muted" style="margin-top:8px;font-size:13px">*Compared with a typical early feasibility / FEED-style scoping study for an industrial product: concept design, equipment sizing, budget costing and a first risk register.</p>
    </div>
    <div class="feat">
      <div class="card"><h3>A buildable design</h3><p>Your idea broken into modules, with every principal part sized and dimensioned &mdash; geometry that audits itself.</p></div>
      <div class="card"><h3>Costed bill of materials</h3><p>A full BoM ledger: every line costed, with the method, the confidence, and where each number came from.</p></div>
      <div class="card"><h3>True cost &amp; a financial model</h3><p>A cost waterfall from materials to installed price, and a live financial model &mdash; capex, opex, levelised cost &mdash; you can change.</p></div>
      <div class="card"><h3>Engineering drawings</h3><p>General arrangement, P&amp;ID, block-flow, single-line and HVAC &mdash; real, print-ready ISO A1 drawings &mdash; plus photoreal renders.</p></div>
      <div class="card"><h3>Worked calculations</h3><p>Every key number recomputed live in the sheet and checked &mdash; hand-verifiable, not a black box.</p></div>
      <div class="card"><h3>Risk &amp; regulatory</h3><p>A hazard and risk register, and the codes and standards the design was actually sized to.</p></div>
      <div class="card"><h3>Holds &amp; open questions</h3><p>The honest open-items list: what&rsquo;s assumed, what&rsquo;s excluded, and the exact questions to confirm with us.</p></div>
      <div class="card"><h3>It checks itself</h3><p>Component specs validated against datasheets, load-vs-rating sizing checks, standards checked for your market, cross-document consistency checks &mdash; then a quality scorecard and ship verdict.</p></div>
    </div>
  </div>
</section>

<!-- DESIGN TO YOUR REALITY -->
<section class="s" id="steer">
  <div class="wrap">
    <div class="s-head">
      <span class="eyebrow">Steer it</span>
      <h2>Design to your reality &mdash; then change it.</h2>
      <p class="muted" style="margin-top:12px">Every design has one number that can&rsquo;t move. Tell the engine which, and it engineers to hit it &mdash; flexing everything else.</p>
    </div>
    <div class="axis-grid">
      <div class="axis"><span class="axis-k">Budget</span><p>Fix a &pound;5m ceiling and it designs the best plant that fits it.</p></div>
      <div class="axis"><span class="axis-k">Footprint</span><p>Only a 30 &times; 10 m building? It makes the design fit the envelope.</p></div>
      <div class="axis"><span class="axis-k">Output</span><p>Need a set output? It sizes to that and prices the rest.</p></div>
    </div>
    <p class="axis-foot">Change your mind and it re-solves in hours &mdash; no three-month sunk cost forcing you to ship a design you&rsquo;ve outgrown.</p>
  </div>
</section>

<!-- WHAT'S INSIDE — AUDITABLE WORKBOOK -->
<section class="s examples" id="examples">
  <div class="wrap">
    <div class="s-head">
      <span class="eyebrow">See how it&rsquo;s built</span>
      <h2>An auditable workbook, not a black box.</h2>
      <p class="muted" style="margin-top:12px">Your Design Dossier is a live Excel model. Every cost traces from the inputs and assumptions, through the calculations and quantities, into a bill-of-materials ledger, a cost waterfall and a full financial model &mdash; so you and your investors can change an assumption and watch the numbers move. Nothing is a black box.</p>
    </div>
    <div class="wb-visuals">
      <figure><img src="/images/site/dossier-render.webp" alt="Photoreal isometric render of a water-treatment plant Fractional Forge designed" loading="lazy" /><figcaption>A photoreal render of the plant &mdash; built from the same model as the costs</figcaption></figure>
      <figure><img src="/images/site/dossier-ga.webp" alt="General-arrangement engineering drawing: plan and elevations with an equipment schedule" loading="lazy" /><figcaption>Its general-arrangement drawing &mdash; one of a full ISO A1 set</figcaption></figure>
    </div>
    <div class="feat">
      <div class="card"><h3>Traceable costs</h3><p>Inputs &amp; assumptions &rarr; calculations &rarr; quantities &rarr; bill-of-materials ledger &rarr; cost waterfall &rarr; financial model. Every number is a formula.</p></div>
      <div class="card"><h3>Engineering drawings</h3><p>General arrangement, P&amp;ID, block-flow, single-line, HVAC and electrical &mdash; plus 3D renders of the build.</p></div>
      <div class="card"><h3>Risk &amp; open questions</h3><p>What you&rsquo;ll need to certify, the holds and exclusions, and the questions still to resolve &mdash; stated plainly, not buried.</p></div>
      <div class="card"><h3>It checks itself</h3><p>A scorecard, sense-check, connection trace and audit run before delivery &mdash; then a senior engineer from our partner network reviews the whole workbook. It&rsquo;s built to be checked: it makes an expert think, and catches what a busy team would miss.</p></div>
    </div>
  </div>
</section>
`;

// Second HTML chunk — everything after the workbook gate (rendered as JSX
// between the two chunks so the email-unlock form can be a client component).
const HTML_AFTER_GATE = `
<!-- FOR FOUNDERS -->
<section class="s" id="founders">
  <div class="wrap">
    <div class="s-head">
      <span class="eyebrow">For founders</span>
      <h2>Build a hardware company that behaves like a software company.</h2>
    </div>
    <div class="founders-grid">
      <ul>
        <li>Focus on your product and your customers, not factories.</li>
        <li>Access world-class manufacturing without the capital expenditure.</li>
        <li>Get design-for-manufacture advice from day one.</li>
        <li>Get fundraising-ready, with a built-in manufacturing story investors trust.</li>
      </ul>
      <div>
        <p class="muted" style="margin-bottom:20px">Most founders we work with are deep in the science and the engineering. We take the commercial, the capital and the build off your plate &mdash; so you can run the company, not the workshop.</p>
        <a class="btn btn-primary btn-lg" href="/brief">Get your free Design Dossier &rarr;</a>
      </div>
    </div>
  </div>
</section>

<!-- FOR MANUFACTURING PARTNERS -->
<section class="s partners" id="partners">
  <div class="wrap">
    <div class="s-head">
      <span class="eyebrow">The partner network &mdash; pillars two and three</span>
      <h2>The engineers who review your Dossier can build it too.</h2>
      <p class="lead">Our partner network isn&rsquo;t decoration &mdash; it <em>is</em> the second and third parts of the model. A small, curated panel of best-in-class design houses, engineering firms and contract manufacturers across Europe: their senior engineers review every Design Dossier, and their factories and workshops take the build. Deliberately just three per tier of complexity, from design and prototyping through to mid-volume and complex-systems integration.</p>
      <p class="pnote" style="margin-top:14px">We name partners here only once they&rsquo;ve formally joined &mdash; logos and one-liners appear as each firm confirms. The panel is being assembled now.</p>
    </div>
    <ul class="offer">
      <li><b>Funded deal flow</b><span>De-risked, funded, commercially-led product companies ready to build &mdash; orders that fill your lines, not just leads.</span></li>
      <li><b>A paid fractional bench</b><span>Paid advisory work for your senior engineers, helping our founders design for manufacture from day one &mdash; which brings the build to you.</span></li>
      <li><b>An equity option</b><span>On selected companies, a small equity stake in exchange for favourable build terms: real upside and locked-in future builds.</span></li>
    </ul>
    <div class="pact">
      <a class="btn btn-ghost btn-lg" href="mailto:tristan.fischer@fractionalforge.app?subject=Joining%20the%20Fractional%20Forge%20build%20panel">Talk to us about joining the panel &rarr;</a>
    </div>
  </div>
</section>

<!-- FOR TEAMS WHO QUOTE -->
<section class="s" id="teams" style="background:var(--surface)">
  <div class="wrap">
    <div class="s-head">
      <span class="eyebrow">For teams who quote</span>
      <h2>Quote faster than anyone &mdash; and win more.</h2>
      <p class="muted" style="margin-top:12px">If your team assesses briefs and quotes for customers, Anvil turns a project brief into a costed, engineer-checked proposal in days, not months &mdash; so you&rsquo;re back to the client before your competitors have finished scoping. The fastest credible quote usually wins the contract.</p>
    </div>
    <div class="axis-grid">
      <div class="axis"><span class="axis-k">Days, not months</span><p>A brief becomes a costed, engineer-checked proposal in days &mdash; faster still for work like something you&rsquo;ve done before.</p></div>
      <div class="axis"><span class="axis-k">Win the near-misses</span><p>Get a credible number back first. On most tenders the fastest sound quote takes the contract.</p></div>
      <div class="axis"><span class="axis-k">Right, not just fast</span><p>First-principles physics flags what a busy team can miss &mdash; and a human signs off every quote before it goes out.</p></div>
    </div>
    <div style="margin-top:30px"><a class="btn btn-ghost btn-lg" href="/quote">For teams who quote &rarr;</a></div>
  </div>
</section>

<!-- UNDER THE HOOD -->
<section class="s" id="under-the-hood" style="background:var(--surface)">
  <div class="wrap">
    <div class="s-head">
      <span class="eyebrow">Why you can trust the work</span>
      <h2>Real physics. Real data. Not a black box.</h2>
      <p class="muted" style="margin-top:12px">The Design Dossier isn&rsquo;t a chatbot guessing numbers. Anvil&rsquo;s engineering review runs <strong>over 200 calculation tools</strong> built on the same peer-reviewed, open physics libraries professional engineers use &mdash; and checks every part against real-world data. Each Dossier shows its workings <em>and</em> its sources.</p>
      <p class="muted" style="margin-top:14px">Because it works from first principles, Anvil flags what an experienced team can miss &mdash; a flow rate that ignores pipe friction, a heat load that forgets the pumps are warming the water. It will argue with the spec &mdash; and every disagreement is shown with its working, so you can check who&rsquo;s right. It&rsquo;s a rigorous first pass, not a guarantee &mdash; which is why every number is shown, and why senior engineers from our partner network review each Dossier before it ships.</p>
    </div>
    <div class="hood-grid">
      <div class="hood-col">
        <h3>Peer-reviewed engineering libraries</h3>
        <p class="lead">The maths behind your Dossier comes from published, citable science:</p>
        <div class="chips">
          <div class="chip"><b>PyBaMM</b><span>Battery electrochemistry &middot; open library, from Oxford research</span></div>
          <div class="chip"><b>PsychroLib</b><span>Psychrometrics &middot; ASHRAE formulations</span></div>
          <div class="chip"><b>CoolProp</b><span>Refrigerant &amp; thermophysical properties</span></div>
          <div class="chip"><b>OpenDSS &amp; PandaPower</b><span>Grid power-flow &middot; IEC 60909</span></div>
          <div class="chip"><b>IAPWS-IF97</b><span>Steam &amp; water properties &middot; intl. standard</span></div>
        </div>
        <p class="hood-note">Over 200 calculation tools across battery, thermal, fluids, power, chemical-process and structural domains &mdash; all open and citable. The full list is available on request.</p>
      </div>
      <div class="hood-col">
        <h3>Checked against real-world data</h3>
        <p class="lead">Every part and price is cross-checked against real sources:</p>
        <ul class="hood-list">
          <li><b>Continuously-refreshed component pricing</b> &mdash; from Mouser, Digi-Key, Farnell &amp; LCSC catalogues</li>
          <li><b>36,000-part</b> reference library with real manufacturer part numbers &mdash; cross-checked against distributor catalogues to catch invented part numbers before they reach you</li>
          <li><b>A database of 30,000+ UK &amp; EU suppliers</b> &mdash; filtered and matched to your module&rsquo;s category</li>
          <li><b>Jurisdiction standards</b> &mdash; BS EN, IEC, G99, UL, NFPA &mdash; checked against your target market</li>
          <li><b>Curated materials pricing</b> &mdash; steel, copper, aluminium, composites</li>
        </ul>
        <p class="hood-note">35 data sources in total &mdash; over 5 million reference records, kept current. Then a senior engineer from our partner network reviews the whole workbook before you see it.</p>
      </div>
    </div>
    <div class="hood-col" style="margin-top:26px">
      <h3>Check one yourself</h3>
      <p class="lead">Every calculation in a Dossier is shown like this &mdash; inputs, formula, source, result &mdash; so you can verify it by hand:</p>
      <div style="margin-top:16px;background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:18px 20px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13.5px;line-height:1.8;color:var(--ink-soft);overflow-x:auto">
        <div><b style="color:var(--ink)">Pump hydraulic power</b> &mdash; sizing a transfer pump</div>
        <div>Inputs: flow Q = 40 m&sup3;/h (0.0111 m&sup3;/s) &middot; head H = 35 m &middot; density &rho; = 998 kg/m&sup3; &middot; pump efficiency &eta; = 0.65</div>
        <div>Formula: P = &rho; &middot; g &middot; Q &middot; H / &eta;&ensp;(standard pump power equation &mdash; e.g. Sinnott &amp; Towler, <em>Chemical Engineering Design</em>, ch. 5)</div>
        <div>Working: 998 &times; 9.81 &times; 0.0111 &times; 35 / 0.65 = <b style="color:var(--ink)">5.85 kW</b> &rarr; next standard motor: <b style="color:var(--ink)">7.5 kW</b></div>
      </div>
      <p class="hood-note">An illustrative example of the method &mdash; your Dossier shows the same working for your numbers, with the library or standard cited on every line.</p>
    </div>
  </div>
</section>

<!-- ABOUT -->
<section class="s" id="about">
  <div class="wrap">
    <div class="about">
      <img class="ava" src="/images/site/tristan.webp" alt="Tristan Fischer, Founder of Fractional Forge" width="108" height="108" />
      <div>
        <span class="eyebrow">Behind Fractional Forge</span>
        <h2 style="margin-top:10px">I&rsquo;ve built the factories, raised the money, and sat on both sides of the table.</h2>
        <p>I&rsquo;m Tristan Fischer. Over twenty-five years I&rsquo;ve been a founder, chief executive, executive chairman and board director of capital-intensive technology businesses &mdash; across solar, wind, tidal, batteries, vertical farming and carbon capture. I&rsquo;ve also worked in project finance at Citigroup, corporate venture capital at Shell Technology Ventures, as an angel investor, and I took a company public on AIM. Across my own and advised companies I&rsquo;ve helped raise around &pound;200 million.</p>
        <p>Most recently I spent a decade building and running Fischer Farms, one of the world&rsquo;s largest vertical farms. I know what it takes to get a physical product designed, funded and built &mdash; because I&rsquo;ve done it, repeatedly, and from every seat at the table. Fractional Forge is the front end I wish founders had had.</p>
        <div class="essays">
          <span class="lbl">I write about why hardware is hard, and how to fix it:</span>
          <a href="/insights/the-eighteen-month-trap-why-hardware-startups-are-structurally-slow">The Eighteen-Month Trap &rarr;</a>
          <a href="/insights/from-basement-servers-to-billion-users-what-software-learned-that-hardware-hasnt">Hardware Needs Its AWS Moment &rarr;</a>
          <a href="/insights/the-fifteen-minute-factory-why-proximity-still-wins">The Fifteen-Minute Factory &rarr;</a>
        </div>
        <a class="btn btn-primary" href="https://calendly.com/tristan-fischer-wjlf/30min" target="_blank" rel="noopener">Book a call with me</a>
        <p class="sign">&mdash; Tristan, Founder, Fractional Forge</p>
      </div>
    </div>
  </div>
</section>

<!-- PRICING -->
<section class="s" id="pricing" style="background:var(--surface)">
  <div class="wrap">
    <div class="s-head">
      <span class="eyebrow">How we work</span>
      <h2>Start with a free Dossier. Go deeper when it&rsquo;s worth it.</h2>
    </div>
    <div class="price">
      <div class="plan feat-plan">
        <span class="tag-pill tag-ember">Start here</span>
        <h3 style="margin-top:14px">The Design Dossier</h3>
        <div class="price-big">Free<small>your first Dossier &mdash; hand-built and engineer-checked</small></div>
        <ul>
          <li>One paragraph in, an auditable Design Dossier out</li>
          <li>Architecture, a traceable bill-of-materials ledger &amp; full costs</li>
          <li>Engineering drawings and a live financial model</li>
          <li>Manufacturer shortlist and investor matches</li>
          <li>Reviewed by a senior engineer from our partner network before you see it</li>
        </ul>
        <a class="btn btn-primary" href="/brief">Get your free Design Dossier</a>
      </div>
      <div class="plan">
        <span class="tag-pill tag-grey">Work with me</span>
        <h3 style="margin-top:14px">Advisory, capital &amp; build</h3>
        <div class="price-big" style="font-size:24px;line-height:1.25">Scoped to you<small>advisory &middot; fundraising &middot; build introductions</small></div>
        <ul>
          <li>We work through your Dossier together</li>
          <li>Pressure-test the design, the costs &amp; the sourcing</li>
          <li>Fundraising on an introducer / success-fee basis &mdash; no raise, no fee</li>
          <li>Introductions to the curated build network</li>
        </ul>
        <a class="btn btn-ghost" href="https://calendly.com/tristan-fischer-wjlf/30min" target="_blank" rel="noopener">Book a call</a>
      </div>
    </div>
    <p class="price-note"><b>No self-serve, for now.</b> Every Dossier is hand-built and reviewed by a senior engineer from our partner network &mdash; a self-serve version is on the roadmap. We take on a small number of engagements each quarter. Anything beyond the free Dossier is scoped to your project; there&rsquo;s no standard price list, because no two hardware companies are the same.</p>
  </div>
</section>

<!-- FAQ -->
<section class="s">
  <div class="wrap" style="max-width:820px">
    <div class="s-head"><span class="eyebrow">Questions</span><h2>Good to know.</h2></div>
    <details open>
      <summary>Is Fractional Forge just the Dossier?</summary>
      <div class="body">No &mdash; the Design Dossier is how we start. From there we work on your commercial strategy, raise capital on an introducer / success-fee basis, and connect you to a curated network of European manufacturing partners so you don&rsquo;t have to build your own factory.</div>
    </details>
    <details>
      <summary>How does the build network work?</summary>
      <div class="body">We&rsquo;re assembling a curated, tiered panel of European design houses and contract manufacturers &mdash; deliberately just three per tier of complexity. When your product is ready to build, we match you to the right partner for your stage and complexity. We name partners only once they&rsquo;ve joined.</div>
    </details>
    <details>
      <summary>I&rsquo;m a manufacturer &mdash; how do I join?</summary>
      <div class="body">We bring you de-risked, funded, commercially-led companies ready to build. If you&rsquo;re a best-in-class design house or contract manufacturer in Europe, <a href="#partners">get in touch about joining the panel</a>.</div>
    </details>
    <details>
      <summary>How accurate are the costs and the investor list?</summary>
      <div class="body">The Design Dossier is a rigorous first pass, not a guarantee. Costs are indicative and the maths is shown so you can check every number &mdash; and a senior engineer from our partner network reviews the whole workbook before you see it.</div>
    </details>
    <details>
      <summary>Is my brief confidential?</summary>
      <div class="body">Yes. Your brief is reviewed by a senior engineer from our partner network, never used to train any model, and never shared with a manufacturing or investor partner without your explicit consent. An NDA is available on request &mdash; just ask.</div>
    </details>
    <details>
      <summary>Who owns the IP I create?</summary>
      <div class="body">You do. 100%. Fractional Forge provides the tools, the Dossier and the introductions, but all intellectual property, designs and ideas belong entirely to you. This is baked into our terms.</div>
    </details>
  </div>
</section>

<!-- FINAL CTA -->
<section class="final" id="get-started">
  <div class="wrap">
    <h2>Designed, reviewed, built.</h2>
    <p>Two ways in: tell us what you&rsquo;re building, or join the curated partner network.</p>
    <div class="paths">
      <div class="plan">
        <span class="tag-pill tag-ember">Founders</span>
        <h3 style="margin-top:12px">Tell us what you&rsquo;re building.</h3>
        <p>Write a short brief and get your first Design Dossier free &mdash; a costed, buildable design reviewed by senior engineers from our partner network, who can then build it.</p>
        <a class="btn btn-primary" href="/brief">Get your free Design Dossier &rarr;</a>
      </div>
      <div class="plan">
        <span class="tag-pill tag-grey">Manufacturing partners</span>
        <h3 style="margin-top:12px">Join the build panel.</h3>
        <p>De-risked, funded, commercially-led companies ready to build &mdash; plus paid fractional work and, on selected companies, equity upside.</p>
        <a class="btn btn-ghost" href="mailto:tristan.fischer@fractionalforge.app?subject=Joining%20the%20Fractional%20Forge%20build%20panel">Talk to us about the panel &rarr;</a>
      </div>
    </div>
  </div>
</section>

<footer>
  <div class="wrap foot-grid">
    <div class="foot-brand">
      <span class="brand" style="font-size:18px"><span class="flame"><svg viewBox="0 0 24 24"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg></span> Fractional Forge</span>
      <p>The front end for hardware. Anvil turns your brief into a costed, buildable design; senior engineers from our curated partner network review it; the same network can build it. And we help you raise the capital too. Your first Design Dossier is free.</p>
    </div>
    <div class="foot-col">
      <h4>Explore</h4>
      <a href="/brief">Start a brief</a>
      <a href="/sample-package">Example package</a>
      <a href="/pricing">How it works</a>
    </div>
    <div class="foot-col">
      <h4>Company</h4>
      <a href="/about">About</a>
      <a href="/contact">Contact</a>
    </div>
  </div>
  <div class="wrap foot-bottom">
    <span>&copy; 2026 Fractional Forge Ltd. All rights reserved.</span>
    <span class="foot-legal"><a href="/">Home</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a></span>
  </div>
</footer>

`;

// Mirrors the rendered FAQ in the HTML above — keep the two in step.
const FAQ_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "Is Fractional Forge just the Dossier?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "No — the Design Dossier is how we start. From there we work on your commercial strategy, raise capital on an introducer / success-fee basis, and connect you to a curated network of European manufacturing partners so you don't have to build your own factory.",
      },
    },
    {
      "@type": "Question",
      name: "How does the build network work?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "We're assembling a curated, tiered panel of European design houses and contract manufacturers — deliberately just three per tier of complexity. When your product is ready to build, we match you to the right partner for your stage and complexity. We name partners only once they've joined.",
      },
    },
    {
      "@type": "Question",
      name: "I'm a manufacturer — how do I join?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "We bring you de-risked, funded, commercially-led companies ready to build. If you're a best-in-class design house or contract manufacturer in Europe, get in touch about joining the panel.",
      },
    },
    {
      "@type": "Question",
      name: "How accurate are the costs and the investor list?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The Design Dossier is a rigorous first pass, not a guarantee. Costs are indicative and the maths is shown so you can check every number — and a senior engineer from our partner network reviews the whole workbook before you see it.",
      },
    },
    {
      "@type": "Question",
      name: "Is my brief confidential?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. Your brief is reviewed by a senior engineer from our partner network, never used to train any model, and never shared with a manufacturing or investor partner without your explicit consent. An NDA is available on request — just ask.",
      },
    },
    {
      "@type": "Question",
      name: "Who owns the IP I create?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "You do. 100%. Fractional Forge provides the tools, the Dossier and the introductions, but all intellectual property, designs and ideas belong entirely to you. This is baked into our terms.",
      },
    },
  ],
};

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSON_LD) }}
      />
      <div dangerouslySetInnerHTML={{ __html: HTML }} />
      {/* Workbook email gate (P1-c) — React island between the two HTML chunks */}
      <section className="examples" style={{ background: "var(--surface)", padding: "0 0 64px", marginTop: "-30px" }}>
        <div className="wrap">
          <WorkbookGate source="homepage" />
          <div style={{ textAlign: "center", marginTop: "16px" }}>
            <a className="btn btn-ghost" href="/cost/water-treatment-plant">
              Read the worked cost breakdown &rarr;
            </a>
          </div>
          <p className="ex-note">
            A worked example (a water-treatment plant): open it and change an assumption to watch
            the model recompute. The same engine has been pointed at grid-scale battery storage,
            vertical farms, CO&#8322; capture and power-to-liquid aviation fuel. Yours covers your
            idea.
          </p>
        </div>
      </section>
      <div dangerouslySetInnerHTML={{ __html: HTML_AFTER_GATE }} />
      <HeroNavScroll />
    </>
  );
}
