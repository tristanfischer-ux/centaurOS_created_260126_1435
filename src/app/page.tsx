import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Fractional Forge — the front end for hardware",
  description:
    "Fractional Forge helps deep-tech and hardware founders get funded — and built. We bring the commercial strategy, the capital, and a curated network of Europe’s best manufacturing partners — so you can run like a software company. Your first Design Dossier is free.",
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

  header.nav{position:sticky;top:0;z-index:50;background:rgba(255,255,255,.85);backdrop-filter:saturate(180%) blur(10px);border-bottom:1px solid var(--line);}
  .nav-inner{display:flex;align-items:center;justify-content:space-between;height:68px;}
  .brand{display:flex;align-items:center;gap:10px;font-weight:800;font-size:18px;color:var(--ink);letter-spacing:-.02em;}
  .brand:hover{text-decoration:none;}
  .flame{width:26px;height:26px;border-radius:8px;background:linear-gradient(160deg,#f59e0b,#e2562a 60%,#c2410c);display:inline-block;}
  .nav-links{display:flex;gap:26px;align-items:center;}
  .nav-links a{color:var(--ink-soft);font-weight:600;font-size:15px;}
  @media(max-width:920px){.nav-links{display:none;} }

  .hero{padding:78px 0 64px;background:
     radial-gradient(900px 420px at 80% -10%, var(--ember-soft), transparent 60%),
     radial-gradient(700px 380px at 0% 0%, #eef4ff, transparent 55%);}
  .hero h1{margin:18px 0 0;max-width:20ch;}
  .hero .sub{font-size:clamp(18px,2.1vw,21px);color:var(--ink-soft);max-width:62ch;margin:22px 0 0;}
  .hero-cta{display:flex;gap:14px;flex-wrap:wrap;margin-top:32px;}
  .hero-trust{margin-top:18px;font-size:14px;color:var(--muted);display:flex;align-items:center;gap:8px;}
  .dot{width:6px;height:6px;border-radius:50%;background:var(--green);display:inline-block;}

  .hero-grid{display:grid;grid-template-columns:1.15fr .85fr;gap:48px;align-items:center;}
  .hero-copy .sub{max-width:52ch;}
  @media(max-width:900px){.hero-grid{grid-template-columns:1fr;} .hero-visual{display:none;} }
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
  .wb-visuals{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin:10px 0 36px;}
  .wb-visuals figure{margin:0;}
  .wb-visuals img{width:100%;border-radius:12px;border:1px solid var(--line);box-shadow:var(--shadow-sm);display:block;background:#fff;}
  .wb-visuals figcaption{font-size:12.5px;color:var(--muted);margin-top:9px;text-align:center;}
  @media(max-width:640px){.wb-visuals{grid-template-columns:1fr;} }
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

  footer{border-top:1px solid var(--line);padding:40px 0;color:var(--muted);font-size:14px;}
  .foot-inner{display:flex;justify-content:space-between;flex-wrap:wrap;gap:16px;}

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
    <a class="brand" href="#"><span class="flame"></span> Fractional&nbsp;Forge</a>
    <nav class="nav-links">
      <a href="#founders">For founders</a>
      <a href="#partners">For partners</a>
      <a href="#how">How it works</a>
      <a href="#examples">What&rsquo;s inside</a>
      <a href="/insights">Insights</a>
      <a href="#about">About</a>
    </nav>
    <a class="btn btn-primary" href="/brief">Work with us</a>
  </div>
</header>

<!-- HERO -->
<section class="hero">
  <div class="wrap hero-grid">
    <div class="hero-copy">
      <span class="eyebrow">For deep-tech &amp; hardware founders</span>
      <h1>The front end for hardware. Get funded &mdash; and built.</h1>
      <p class="sub">Fractional Forge helps deep-tech and hardware founders get funded &mdash; and built. We bring the commercial strategy, the capital, and a curated network of Europe&rsquo;s best manufacturing and design partners &mdash; so you can run like a software company instead of drowning in engineering and manufacturing.</p>
      <div class="hero-cta">
        <a class="btn btn-primary btn-lg" href="/brief">Work with us</a>
        <a class="btn btn-ghost btn-lg" href="#partners">Become a build partner</a>
      </div>
      <p class="hero-trust"><span class="dot"></span> Strategy and capital up front, a curated build network behind you &mdash; and your first Design Dossier free.</p>
    </div>
    <div class="hero-visual" aria-hidden="true">
      <div class="wb">
        <div class="wb-top"><span class="flame"></span> Design Dossier <span class="wb-file">water-treatment.xlsx</span></div>
        <div class="wb-tabs"><span class="wb-tab on">Cost waterfall</span><span class="wb-tab">Financial model</span><span class="wb-tab">BoM ledger</span><span class="wb-tab">Drawings</span></div>
        <div class="wb-rows">
          <div class="wb-row"><span>Reverse-osmosis skid</span><b>&pound;86,198</b></div>
          <div class="wb-row"><span>Storage &amp; tanks</span><b>&pound;40,845</b></div>
          <div class="wb-row"><span>Controls &amp; instrumentation</span><b>&pound;206,365</b></div>
          <div class="wb-row"><span>Pipework &amp; distribution</span><b>&pound;11,985</b></div>
          <div class="wb-row total"><span>Total installed</span><b>&pound;1.39M</b></div>
        </div>
        <div class="wb-foot"><span class="dot"></span> Every number is a live formula &middot; engineer-checked</div>
      </div>
    </div>
  </div>
</section>

<!-- THESIS: why hardware is harder than software -->
<section class="s">
  <div class="wrap">
    <div class="strip">
      <div>
        <span class="eyebrow">The missing layer</span>
        <h2 style="margin-top:10px">Hardware is harder than software &mdash; by design.</h2>
        <p>Software won partly because the hard infrastructure is rented. AWS and Azure run the compute; the app stores handle distribution. A founder can stay product- and customer-led and let someone else own the atoms. Hardware has no equivalent: founders must invent the product, engineer it, stand up a factory or supply chain, <em>and</em> raise the capital &mdash; all at once. It&rsquo;s why so many genuinely good hardware companies stall.</p>
        <p style="margin-top:16px"><a href="https://www.historyfuturenow.com/articles/from-basement-servers-to-billion-users-what-software-learned-that-hardware-hasnt" target="_blank">Read: Hardware Needs Its AWS Moment &rarr;</a></p>
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
      <h2>Three things, so you can behave like a software company.</h2>
      <p class="muted" style="margin-top:12px">We&rsquo;re the commercial front end and the orchestration layer for hardware. You stay product-, sales- and marketing-led; a curated build network does the rest.</p>
    </div>
    <div class="steps">
      <div class="step">
        <div class="n">1</div>
        <h3>Strategy &amp; commercial</h3>
        <p>We sharpen what you&rsquo;re building, for whom, and why they buy &mdash; the positioning, the route to market, and the team you need.</p>
        <p>It starts on day one with a free <strong>Design Dossier</strong>: an auditable engineering-and-costing model where every number traces back to a formula you can check.</p>
        <p><a href="#whats-in">See what&rsquo;s inside &darr;</a></p>
      </div>
      <div class="step">
        <div class="n">2</div>
        <h3>Capital</h3>
        <p>We raise the money. A curated investor network and an introducer / success-fee model &mdash; <strong>no raise, no fee</strong> &mdash; plus grants and non-dilutive routes.</p>
        <p>A built-in manufacturing story makes you far more fundable.</p>
      </div>
      <div class="step">
        <div class="n">3</div>
        <h3>Build</h3>
        <p>A curated, tiered network of Europe&rsquo;s best design houses and contract manufacturers &mdash; plus a fractional bench of senior manufacturing engineers.</p>
        <p>So you don&rsquo;t build a factory to ship a product.</p>
        <p><a href="#partners">For manufacturing partners &rarr;</a></p>
      </div>
    </div>
  </div>
</section>

<!-- DOSSIER ON-RAMP: what you get -->
<section class="s" id="whats-in" style="background:var(--surface)">
  <div class="wrap">
    <div class="s-head">
      <span class="eyebrow">Start here &mdash; the Design Dossier</span>
      <h2>Your day-one on-ramp: a full Design Dossier, free.</h2>
      <p class="muted" style="margin-top:12px">Describe your idea in a short brief &mdash; a paragraph to a page. Anvil, the engine inside Fractional Forge, builds your Design Dossier: an auditable Excel workbook &mdash; a buildable design, a costed bill-of-materials ledger, the true cost and a live financial model, the engineering drawings, and the risks and codes it must meet. Every number is a live formula you can trace, and it checks itself against a ship gate. It&rsquo;s how every founder relationship starts, and the basis for the conversations that follow.</p>
    </div>
    <div class="feat">
      <div class="card"><h3>A buildable design</h3><p>Your idea broken into modules, with every principal part sized and dimensioned &mdash; geometry that audits itself.</p></div>
      <div class="card"><h3>Costed bill of materials</h3><p>A full BoM ledger: every line costed, with the method, the confidence, and where each number came from.</p></div>
      <div class="card"><h3>True cost &amp; a financial model</h3><p>A cost waterfall from materials to installed price, and a live financial model &mdash; capex, opex, levelised cost &mdash; you can change.</p></div>
      <div class="card"><h3>Engineering drawings</h3><p>General arrangement, P&amp;ID, block-flow, single-line and HVAC &mdash; real, print-ready ISO A1 drawings &mdash; plus photoreal renders.</p></div>
      <div class="card"><h3>Worked calculations</h3><p>Every key number recomputed live in the sheet and checked &mdash; hand-verifiable, not a black box.</p></div>
      <div class="card"><h3>Risk &amp; regulatory</h3><p>A hazard and risk register, and the codes and standards the design was actually sized to.</p></div>
      <div class="card"><h3>Holds &amp; open questions</h3><p>The honest open-items list: what&rsquo;s assumed, what&rsquo;s excluded, and the exact questions to confirm with us.</p></div>
      <div class="card"><h3>It checks itself</h3><p>A quality-audit surface scoring every section, live invariant checks, an independent sense-check, and a ship verdict.</p></div>
    </div>
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
      <div class="card"><h3>It checks itself</h3><p>A scorecard, sense-check, connection trace and audit run before delivery &mdash; then a senior engineer reviews the whole workbook.</p></div>
    </div>
    <div style="text-align:center;margin-top:30px;display:flex;gap:12px;justify-content:center;flex-wrap:wrap"><a class="btn btn-ghost btn-lg" href="https://jyarhvinengfyrwgtskq.supabase.co/storage/v1/object/public/dossiers/example-water-treatment-dossier.xlsx">See a real example workbook &mdash; Excel &darr;</a><a class="btn btn-ghost btn-lg" href="/cost/water-treatment-plant">Read a worked cost breakdown &rarr;</a></div>
    <p class="ex-note">A worked example (a water-treatment plant): open it and change an assumption to watch the model recompute. Also built for grid-scale battery storage, vertical farms, CO&#8322; capture and power-to-liquid aviation fuel. Yours covers your idea.</p>
  </div>
</section>

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
        <a class="btn btn-primary btn-lg" href="/brief">Tell us what you&rsquo;re building &rarr;</a>
      </div>
    </div>
  </div>
</section>

<!-- FOR MANUFACTURING PARTNERS -->
<section class="s partners" id="partners">
  <div class="wrap">
    <div class="s-head">
      <span class="eyebrow">For manufacturing partners</span>
      <h2>Become one of our build partners.</h2>
      <p class="lead">We&rsquo;re assembling a small, curated panel of best-in-class build and engineering partners across Europe &mdash; deliberately just three per tier of complexity, from design and prototyping through to mid-volume and complex-systems integration.</p>
    </div>
    <ul class="offer">
      <li><b>Funded deal flow</b><span>De-risked, funded, commercially-led product companies ready to build &mdash; orders that fill your lines, not just leads.</span></li>
      <li><b>A paid fractional bench</b><span>Paid advisory work for your senior engineers, helping our founders design for manufacture from day one &mdash; which brings the build to you.</span></li>
      <li><b>An equity option</b><span>On selected companies, a small equity stake in exchange for favourable build terms: real upside and locked-in future builds.</span></li>
    </ul>
    <div class="pact">
      <a class="btn btn-primary btn-lg" href="mailto:tristan.fischer@fractionalforge.app?subject=Joining%20the%20Fractional%20Forge%20build%20panel">Talk to us about joining the panel &rarr;</a>
    </div>
    <p class="pnote">We name partners only once they&rsquo;ve joined &mdash; the panel is being assembled now.</p>
  </div>
</section>

<!-- UNDER THE HOOD -->
<section class="s" id="under-the-hood" style="background:var(--surface)">
  <div class="wrap">
    <div class="s-head">
      <span class="eyebrow">Why you can trust the work</span>
      <h2>Real physics. Real data. Not a black box.</h2>
      <p class="muted" style="margin-top:12px">The Design Dossier isn&rsquo;t a chatbot guessing numbers. Its engineering review runs <strong>231 calculation tools</strong> built on the same peer-reviewed, open physics libraries professional engineers use &mdash; and checks every part against live, real-world data. Each Dossier shows its workings <em>and</em> its sources.</p>
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
        <p class="hood-note">231 calculation tools across battery, thermal, fluids, power, chemical-process and structural domains &mdash; all open and citable.</p>
      </div>
      <div class="hood-col">
        <h3>Checked against real-world data</h3>
        <p class="lead">Every part and price is grounded in live sources, not invented:</p>
        <ul class="hood-list">
          <li><b>Live component pricing</b> &mdash; Mouser, Digi-Key, Farnell &amp; LCSC</li>
          <li><b>36,000-part</b> reference library with real manufacturer part numbers</li>
          <li><b>30,000 UK &amp; EU suppliers</b> &mdash; matched per module</li>
          <li><b>Jurisdiction standards</b> &mdash; BS EN, IEC, G99, UL, NFPA</li>
          <li><b>Curated materials pricing</b> &mdash; steel, copper, aluminium, composites</li>
        </ul>
        <p class="hood-note">35 data sources in total &mdash; over 5 million reference records, refreshed continuously.</p>
      </div>
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
          <a href="https://www.historyfuturenow.com/articles/the-eighteen-month-trap-why-hardware-startups-are-structurally-slow" target="_blank">The Eighteen-Month Trap &rarr;</a>
          <a href="https://www.historyfuturenow.com/articles/from-basement-servers-to-billion-users-what-software-learned-that-hardware-hasnt" target="_blank">Hardware Needs Its AWS Moment &rarr;</a>
          <a href="https://www.historyfuturenow.com/articles/the-fifteen-minute-factory-why-proximity-still-wins" target="_blank">The Fifteen-Minute Factory &rarr;</a>
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
          <li>Reviewed by a senior engineer before you see it</li>
        </ul>
        <a class="btn btn-primary" href="/brief">Start a brief</a>
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
    <p class="price-note"><b>No self-serve, for now.</b> Every Dossier is hand-built and reviewed by a senior engineer &mdash; a self-serve version is on the way. Anything beyond the free Dossier is scoped to your project; there&rsquo;s no standard price list, because no two hardware companies are the same.</p>
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
      <div class="body">The Design Dossier is a rigorous first pass, not a guarantee. Costs are indicative and the maths is shown so you can check every number. The investor list is <strong>investors who&rsquo;ve backed similar products</strong> &mdash; a researched starting point, not a promise of funding.</div>
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
    <h2>Get funded &mdash; and built.</h2>
    <p>Two ways in: tell us what you&rsquo;re building, or join the curated build panel.</p>
    <div class="paths">
      <div class="plan">
        <span class="tag-pill tag-ember">Founders</span>
        <h3 style="margin-top:12px">Tell us what you&rsquo;re building.</h3>
        <p>Write a short brief and get your first Design Dossier free &mdash; the architecture, the costs, the risks, and investors who&rsquo;ve backed similar products.</p>
        <a class="btn btn-primary" href="/brief">Get your brief &rarr;</a>
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
  <div class="wrap foot-inner">
    <div><span class="brand" style="font-size:16px"><span class="flame"></span> Fractional Forge</span></div>
    <div>&copy; 2026 Fractional Forge &middot; The front end for hardware &mdash; funded and built.</div>
  </div>
</footer>

`;

export default function HomePage() {
  return <div dangerouslySetInnerHTML={{ __html: HTML }} />;
}
