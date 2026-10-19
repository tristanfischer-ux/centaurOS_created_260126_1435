import { CSS, CSS2, CSS3, MARK, TICK, esc } from "@/lib/lumicity/html";
import { GAINS, GAINS_CSS } from "@/lib/home/gains";
import { AVATAR_SIZES, AVATAR_WIDTHS, CARD_SIZES, CARD_WIDTHS, CTA_SIZES, CTA_WIDTHS, responsiveImg } from "@/lib/home/images";

// Fractional Forge homepage: a short front door to the four services.
// Copy drafted by an OpenRouter writer/critic loop (13 Oct 2026) against a fixed fact sheet; no invented claims.

export const MAIL = "tristan.fischer@fractionalforge.app";

const FF_MARK = `<svg viewBox="0 0 32 32" width="20" height="20" aria-hidden="true"><path d="M16 4c1.5 4.5 6 6.5 6 12a6 6 0 0 1-12 0c0-2.6 1.2-4.3 2.6-5.6.3 2 1.3 3.2 2.6 3.6C14.6 10.4 15 7 16 4z" fill="currentColor"/></svg>`;
const DD_MARK = `<svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true"><path d="M5 25h22M8 25V13l6-4v16M14 25V9l10 5v11M18 17h2M18 21h2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ARROW = `<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M4 10h11m0 0l-4-4m4 4l-4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

type Svc = {
  key: string; name: string; href: string; imgBase: string; mark: string;
  acc: string; accD: string; accS: string; accM: string;
  who: string; what: string; price: string; mo?: string; time: string; example: [string, string];
};

const SERVICES: Svc[] = [
  { key: "condition-desk", name: "Condition Desk", href: "/condition-desk", imgBase: "/ff/films/condition-desk", mark: MARK["condition-desk"],
    acc: "var(--rust)", accD: "var(--rust)", accS: "var(--rust-soft)", accM: "var(--rust-line)",
    who: "For housebuilders and land promoters",
    what: "Send the decision notice. Get every planning condition in plain English, with the ones that block a start on site picked out and covering letters drafted.",
    price: "£400 per permission", mo: "£1,000 a month for five live sites", time: "Usually within a day", example: ["26", "numbered conditions plus the biodiversity gain condition. 7 before work starts"] },
  { key: "habitat-draft", name: "Habitat Draft", href: "/habitat-draft", imgBase: "/ff/films/habitat-draft", mark: MARK["habitat-draft"],
    acc: "var(--moss)", accD: "var(--moss)", accS: "var(--moss-soft)", accM: "var(--moss)",
    who: "For ecology consultancies",
    what: "A two-page desk study before the walkover: protected sites within 600 m, a first habitat map, tree and hedge heights, and the parcels to check. Your ecologist signs everything.",
    price: "£150 per desk study", mo: "£1,000 a month for eight", time: "Usually within a day", example: ["", "Know which parcels matter before the walkover"] },
  { key: "bid-check", name: "Bid Check", href: "/bid-check", imgBase: "/ff/films/bid-check", mark: MARK["bid-check"],
    acc: "var(--rust)", accD: "var(--rust)", accS: "var(--rust-soft)", accM: "var(--rust-line)",
    who: "For firms that bid for public contracts",
    what: "Send the tender pack. Get a bid at a glance: every pass-or-fail condition, every document to submit, how bids are scored and the key dates, each quoted from the tender.",
    price: "£600 per tender", mo: "£1,500 a month for three", time: "Usually within a day", example: ["30", "bidder-facing requirements: 16 specification points, 4 items to submit, 4 contract deliverables, 6 scored criteria"] },
  { key: "design-dossier", name: "Design Dossier", href: "/design-dossier", imgBase: "/ff/img/dd-card", mark: DD_MARK,
    acc: "var(--rust)", accD: "var(--rust)", accS: "var(--rust-soft)", accM: "var(--rust-line)",
    who: "For hardware and deep-tech founders",
    what: "Send a short brief. Get a buildable, costed engineering design: bill of materials, true cost and financial model, drawings, worked calculations and a risk and regulatory register, in a live Excel workbook where every number is a traceable formula.",
    price: "£2,500 per Dossier", mo: "£6,000 a month for three", time: "A few days", example: ["6", "parts: buildable design, costed bill of materials, true cost and financial model, drawings, worked calculations, risk and regulatory register"] },
];

export const FAQS: [string, string][] = [
  ["Do I need to talk to anyone?", "No. There are no sales calls. Each service page has an enquiry form, or you can email the documents."],
  ["Who checks the work?", "Your own team does. Every report shows its sources so it can be checked: Condition Desk sets out each condition from the decision notice, Bid Check quotes the tender for every item, your ecologist checks and signs each Habitat Draft desk study, and every number in a Design Dossier is a traceable formula."],
  ["What do the reports use?", "Public documents and public data: the decision notice, the tender pack, national habitat and protected-site data, and the Environment Agency laser survey. Design Dossiers also use open engineering libraries and real component prices."],
  ["Can I see the work first?", "Yes. Every service page has a short film showing how it works."],
];

export const CSS_HOME = `
.home{--acc:var(--rust);--acc-d:var(--rust);--acc-s:var(--rust-soft);--acc-m:var(--rust-line)}
.home .logo .mk{background:var(--ink);color:var(--paper)}
.home .navlinks{gap:28px}
.mnav{display:block;position:relative}.mnav summary{list-style:none;cursor:pointer;border:1px solid var(--line);border-radius:999px;padding:8px 16px;font-weight:700;font-size:15px;background:var(--card);color:var(--ink);min-height:40px;display:flex;align-items:center}
.mnav summary::-webkit-details-marker{display:none}
.mnav[open] .mpanel{display:grid}.mpanel{display:none;position:absolute;right:0;top:52px;background:var(--card);border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow);padding:10px;min-width:230px;gap:2px;z-index:70}
.mpanel a{padding:10px 12px;border-radius:10px;color:var(--ink);font-weight:600;text-decoration:none}.mpanel a:hover{background:var(--surface)}
.home .nav .btn-primary{display:none}
.hh{position:relative;padding:36px 0 56px;background:radial-gradient(1100px 480px at 90% -10%,var(--rust-soft),transparent 60%),linear-gradient(180deg,var(--paper),var(--paper))}
.hh .grid{display:grid;gap:34px;align-items:center}
.hh h1{margin-top:16px;max-width:16ch;line-height:1.05;font-size:clamp(44px,4.6vw,60px);font-family:var(--serif);font-weight:600;font-variation-settings:"opsz" 144,"SOFT" 30}.hh h1 em{font-style:italic;font-weight:500;color:var(--rust)}
.hh .pic{position:relative}.hh .pic picture{display:block;width:100%}.hh .pic img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:26px;display:block;box-shadow:0 30px 60px -30px rgba(15,23,41,.45)}
.proof{background:var(--card);border:1px solid var(--line);border-radius:18px;box-shadow:0 24px 50px -20px rgba(15,23,41,.35);padding:12px 14px;margin-top:14px}.proof p{font-size:12.5px;font-weight:700;color:var(--muted);margin:0 0 6px;letter-spacing:.01em}.proof a{display:flex;align-items:center;gap:12px;padding:6px 2px;text-decoration:none;color:var(--ink-soft);border-top:1px solid var(--line);font-size:13px;line-height:1.3}.proof a:first-of-type{border-top:0}.proof b{font-family:var(--serif);font-size:26px;font-weight:600;min-width:40px}
.hh .sub{font-size:clamp(18px,2vw,20px);color:var(--ink-2);max-width:52ch;margin-top:18px}
.hh .meta{display:flex;flex-wrap:wrap;gap:10px 22px;margin-top:22px;font-size:14.5px;color:var(--ink-2);font-weight:600}.hh .meta span{display:inline-flex;align-items:center;gap:7px}.hh .meta svg{color:var(--rust)}
.svcs{display:grid;gap:22px}
.svc{display:flex;flex-direction:column;background:var(--card);border:1px solid var(--line);border-radius:24px;overflow:hidden;text-decoration:none;color:var(--ink);box-shadow:var(--shadow);transition:transform var(--t-quick) var(--ease-std),box-shadow var(--t-quick) var(--ease-std)}
.svc:hover{transform:translateY(-3px);box-shadow:0 26px 50px -24px rgba(15,23,41,.4)}.svc:focus-visible{outline:3px solid var(--sa);outline-offset:3px}
.svc .im{position:relative}.svc .im picture{display:block;width:100%}.svc .im img{width:100%;aspect-ratio:16/9;object-fit:cover;object-position:top center;display:block}
.svc .tag{position:absolute;left:14px;top:14px;background:var(--card);border-radius:999px;padding:6px 12px 6px 6px;display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:700;color:var(--ink);box-shadow:0 6px 16px rgba(15,23,41,.2)}
.svc .tag span{width:26px;height:26px;border-radius:50%;background:var(--sa);color:var(--on-rust);display:flex;align-items:center;justify-content:center}.svc .tag svg{width:16px;height:16px}
.svc .bd{padding:22px 22px 24px;display:flex;flex-direction:column;flex:1}
.svc h3{font-family:var(--serif);font-size:28px;font-weight:600}
.svc .who{color:var(--sd);font-weight:700;font-size:14.5px;margin-top:4px}
.svc .what{color:var(--ink-2);margin-top:12px;font-size:16px}
.svc .ex{display:flex;gap:12px;align-items:baseline;margin-top:16px;padding:12px 14px;border-radius:14px;background:var(--ss);border:1px solid var(--sm)}
.svc .ex b{font-family:var(--serif);font-size:26px;color:var(--sd);line-height:1;white-space:nowrap;font-variant-numeric:tabular-nums;flex:none;min-width:2ch}.svc .ex b:empty{display:none;min-width:0}.svc .ex small{font-size:13.5px;color:var(--ink-2)}
.svc .ft{display:flex;flex-direction:column;align-items:stretch;gap:14px;margin-top:auto;padding-top:18px}
.svc .pr{font-weight:800;font-size:18px;color:var(--ink)}.svc .pr small{display:block;font-weight:600;color:var(--muted);font-size:13px}.svc .pr small.mo{font-size:14px;line-height:1.4;color:var(--ink-2);margin-top:4px}
.svc .go{display:flex;justify-content:center;align-items:center;gap:8px;font-weight:700;color:var(--on-rust);background:var(--sd);border-radius:999px;padding:12px 18px;font-size:15.5px;min-height:46px}.svc:hover .go{background:var(--ink);color:var(--paper)}
.hsteps{display:grid;gap:18px;counter-reset:st;position:relative}
.hsteps-rail{display:none;background:var(--line);border-radius:2px;overflow:hidden}
.hsteps-fill{display:block;width:100%;height:100%;background:var(--rust);transform-origin:left center;transform:scaleX(1)}
.hstep{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:22px}
.hstep:before{counter-increment:st;content:counter(st);display:flex;width:34px;height:34px;border-radius:50%;background:var(--ink);color:var(--paper);font-weight:700;align-items:center;justify-content:center;font-family:var(--serif)}
.hstep h3{margin-top:12px;font-size:20px}.hstep p{color:var(--ink-2);margin-top:6px;font-size:16px}
@keyframes hsettle{from{opacity:.45;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes hfill-x{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes hfill-y{from{transform:scaleY(0)}to{transform:scaleY(1)}}
.who-band{display:grid;gap:26px;align-items:center;background:var(--band);color:var(--band-ink);border-radius:28px;padding:28px;overflow:hidden}
.who-band picture{display:block;width:100%;max-width:260px}.who-band img{width:100%;max-width:260px;aspect-ratio:1;object-fit:cover;border-radius:22px;display:block}
.who-band h2{color:var(--band-ink)}.who-band p{color:var(--band-muted);margin-top:12px;font-size:16px;line-height:1.6;max-width:60ch}
.who-band ul{list-style:none;padding:0;margin:20px 0 0;display:grid;grid-template-columns:1fr 1fr;gap:16px}
.who-band li b{display:block;font-family:var(--serif);font-size:30px;font-weight:600;line-height:1.05;color:var(--band-ink)}.who-band li span{font-size:15px;color:var(--band-muted);line-height:1.35;display:block;margin-top:4px}
.who-band a{color:var(--band-ink);font-weight:700;display:inline-flex;gap:6px;align-items:center;margin-top:20px}
.hfoot{background:var(--paper);border-top:1px solid var(--line);padding:44px 0 28px;font-size:15px}
.hfoot .cols{display:grid;grid-template-columns:1fr 1fr;gap:26px}
.hfoot h4{font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin:0 0 10px}
.hfoot a{display:block;color:var(--ink-2);text-decoration:none;padding:3px 0}.hfoot a:hover{color:var(--rust)}
.hfoot .line{margin-top:30px;color:var(--muted);font-size:13.5px}
.cta-photo .svc-row{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-top:26px}
.home .cta-photo{position:relative;background:var(--band)}.home .cta-photo picture.bg,.home .cta-photo img.bg{opacity:.4}.home .cta-photo:before{content:"";position:absolute;inset:0;background:linear-gradient(rgba(15,23,41,.82),rgba(15,23,41,.9));z-index:1}.home .cta-photo .wrap{position:relative;z-index:2}
.cta-photo .svc-row a{background:var(--card);color:var(--ink);font-weight:600;border-radius:999px;padding:12px 20px;text-decoration:none;min-height:44px;display:inline-flex;align-items:center}
.cta-photo .svc-row a:before{content:"";width:9px;height:9px;border-radius:50%;margin-right:8px;flex:none}.cta-photo .svc-row a:nth-child(1):before{background:#a8481a}.cta-photo .svc-row a:nth-child(2):before{background:#2f6b43}.cta-photo .svc-row a:nth-child(3):before{background:#b4400c}.cta-photo .svc-row a:nth-child(4):before{background:#d9461a}

/* Hero "report being built" panel — ported from hero-after.html */
.hp-panel{position:relative;background:var(--card);border:1px solid var(--line);border-radius:var(--r-lg);box-shadow:var(--shadow);overflow:hidden;min-height:600px}
.hp-fade{opacity:1}
.hp-tabs{display:flex;align-items:stretch;border-bottom:1px solid var(--line);background:var(--card-2);overflow:visible}
.hp-tab{flex:1;min-width:0;padding:14px 12px 16px;font-size:13px;font-weight:600;color:var(--muted);border:0;background:none;text-align:left;cursor:pointer;position:relative;font-family:inherit;line-height:1.25}
.hp-tab small{display:block;font-weight:500;font-size:11px;margin-top:3px;line-height:1.3;white-space:normal}
.hp-tab .hp-bar{position:absolute;left:0;bottom:-1px;height:2px;background:var(--c,var(--rust));width:0}
.hp-tab[aria-selected=true]{color:var(--ink)}
.hp-tab:focus-visible{outline:2px solid var(--rust);outline-offset:3px}
.hp-stage{display:grid;grid-template-columns:150px 1fr;gap:18px;padding:22px;min-height:356px}
.hp-doc{border:1px solid var(--line);border-radius:10px;padding:14px 12px;background:var(--card-2);position:relative;overflow:hidden;height:300px}
.hp-doc h6{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-bottom:10px;font-weight:700}
.hp-doc .hp-l{height:5px;border-radius:3px;background:var(--skel);margin:7px 0}
.hp-scan{position:absolute;left:0;right:0;height:38px;background:linear-gradient(180deg,transparent,rgba(178,58,18,.10),transparent);border-bottom:1.5px solid var(--c,var(--rust))}
.hp-out h5{font-size:12px;font-weight:600;color:var(--muted);display:flex;flex-direction:column;align-items:flex-start;justify-content:flex-start;margin-bottom:10px;gap:4px}
.hp-out h5 > span:first-child{white-space:nowrap}
.hp-count{display:flex;align-items:flex-end;flex-wrap:wrap;gap:8px 12px;margin-bottom:12px}
.hp-count b{font-family:var(--serif);font-size:56px;font-weight:600;line-height:1;color:var(--c,var(--rust));font-variant-numeric:tabular-nums;min-width:2ch}
.hp-count.no-num b{display:inline-block;visibility:hidden;min-width:2ch}
.hp-count span{font-size:14px;color:var(--ink-2);line-height:1.35;flex:1;min-width:12ch;max-width:34ch}
.hp-seg{display:flex;gap:2px;height:12px;margin:0 0 6px}.hp-seg i{flex:1;border-radius:2px;background:var(--skel);opacity:.55}.hp-seg i.on{opacity:1}.hp-seg i.on.hot{background:var(--c,var(--rust))}
.hp-seg i.on.b0{background:var(--c,var(--rust))}
.hp-seg i.on.b1{background:color-mix(in srgb,var(--c,var(--rust)) 70%, var(--ink))}
.hp-seg i.on.b2{background:color-mix(in srgb,var(--c,var(--rust)) 45%, var(--ink))}
.hp-seg i.on.b3{background:color-mix(in srgb,var(--c,var(--rust)) 30%, var(--muted))}
.hp-seglab{font-size:12px;color:var(--ink-2);margin-bottom:14px;min-height:16px;line-height:1.4}.hp-seglab b{color:var(--c,var(--rust))}
.hp-rows{display:flex;flex-direction:column;gap:7px}
.hp-row{display:grid;grid-template-columns:28px 1fr auto;gap:10px;align-items:center;padding:7px 10px;border:1px solid var(--line);border-radius:9px;background:var(--card)}
.hp-row .n{font:600 11px/1 var(--sans);color:var(--muted);font-variant-numeric:tabular-nums}
.hp-row .t{height:6px;border-radius:3px;background:var(--skel)}
.hp-tag{font-size:11px;font-weight:700;letter-spacing:.02em;padding:3px 7px;border-radius:999px;background:var(--card-2);border:1px solid var(--line);color:var(--muted);white-space:nowrap}
.hp-tag:empty{display:none}
.hp-tag.hot,.hp-tag.b0{background:var(--soft,var(--rust-soft));color:var(--c,var(--rust));border:1px solid var(--cl,var(--rust-line))}
.hp-tag.b1{background:color-mix(in srgb,var(--soft,var(--rust-soft)) 70%, var(--card));color:var(--ink);border:1px solid var(--line)}
.hp-tag.b2{background:color-mix(in srgb,var(--soft,var(--rust-soft)) 45%, var(--card));color:var(--ink);border:1px solid var(--line)}
.hp-tag.b3{background:var(--card-2);color:var(--muted);border:1px solid var(--line)}
.hp-out h5{line-height:1.35}
.hp-status{max-width:none;text-align:left;white-space:normal}
.hp-foot{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px 16px;border-top:1px solid var(--line);padding:14px 22px;font-size:13px;color:var(--ink-2);background:var(--card-2)}
.hp-foot > *{flex:none;white-space:nowrap}
.hp-foot b{color:var(--ink)}
.hp-foot a{color:var(--c,var(--rust));font-weight:600;text-decoration:none}
.hp-note{font-size:11px;color:var(--muted);margin-top:10px;text-align:right}

@media(min-width:760px){.mnav{display:none}.home .nav .btn-primary{display:inline-flex}.hh{padding:60px 0 64px}.hh .grid{grid-template-columns:minmax(0,1.02fr) minmax(0,1fr);gap:56px}.hh h1{font-size:clamp(40px,4.4vw,64px);max-width:13ch}.hh .pic{align-self:stretch}.hh .pic img{aspect-ratio:auto;height:500px}.proof{position:absolute;left:-44px;bottom:-36px;width:250px;margin:0}
.svcs{grid-template-columns:1fr 1fr}.hsteps{grid-template-columns:repeat(3,1fr)}
.hsteps-rail{display:block;grid-column:1/-1;height:3px;order:-1}
.who-band{grid-template-columns:260px 1fr;padding:40px;gap:44px}.who-band ul{grid-template-columns:repeat(4,1fr)}.hfoot .cols{grid-template-columns:2fr 1fr 1fr 1fr}}
#faq .wrap{max-width:768px;margin:0 auto}
@media(max-width:759px){
  .hh{padding:24px 0 40px}.hh .grid{grid-template-columns:1fr;gap:18px}
  .hh h1{font-size:clamp(32px,8.2vw,40px)}
  .hh .sub{font-size:16px;margin-top:12px}
  .cta-row{margin-top:16px}
  .hh .meta{margin-top:12px}
  .hp-stage{grid-template-columns:1fr;min-height:0;padding:14px}
  .hp-count b{font-size:40px}
  .hp-count span{font-size:13px;max-width:none}
  .hp-doc{display:none}
  .hp-tab{padding:8px 6px 12px;font-size:11px;line-height:1.25;overflow:visible}
  .hp-tab small{white-space:normal;overflow:visible;text-overflow:unset;font-size:11px;line-height:1.3}
  .hp-out h5{gap:4px}
  .hp-status{text-align:left;max-width:none}
  .hp-foot{flex-direction:column;align-items:flex-start;gap:6px}
  .hp-foot > *{white-space:normal}
  .hh .eyebrow{font-size:12px;white-space:normal;flex-wrap:wrap}
  .who-band{padding:48px 20px}.who-band picture,.who-band img{max-width:160px;aspect-ratio:1;border-radius:18px;margin-bottom:4px}.hh .pic img{aspect-ratio:16/10;height:auto;border-radius:20px}
  .cta-photo .svc-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}.cta-photo .svc-row a{width:100%;justify-content:center}
}
@media(max-width:759px){
  .hsteps{padding-left:22px}
  .hsteps-rail{display:block;position:absolute;left:8px;top:16px;bottom:16px;width:3px;height:auto}
  .hsteps-fill{transform-origin:center top;transform:scaleY(1)}
}
@supports (animation-timeline: view()) {
  @media (prefers-reduced-motion: no-preference) {
    .hsteps-fill{transform:scaleX(0);animation:hfill-x linear both;animation-timeline:view();animation-range:entry 0% cover 70%}
    .hstep{animation:hsettle var(--t-quick) var(--ease-out) both;animation-timeline:view();animation-range:entry 0% entry 35%}
    .hstep:nth-child(3){animation-range:entry 8% entry 43%}
    .hstep:nth-child(4){animation-range:entry 16% entry 51%}
  }
  @media (prefers-reduced-motion: no-preference) and (max-width:759px) {
    .hsteps-fill{transform:scaleY(0);animation-name:hfill-y;transform-origin:center top}
  }
}
@media(prefers-reduced-motion:reduce){
  .svc,.svc:hover{transition:none;transform:none}
}
`;

function card(s: Svc): string {
  const vars = `--sa:${s.acc};--sd:${s.accD};--ss:${s.accS};--sm:${s.accM}`;
  const alt = s.key === "design-dossier"
    ? `${s.name} sample`
    : `${s.name} explainer film`;
  const img = s.key === "design-dossier"
    ? responsiveImg({
        base: s.imgBase,
        alt,
        width: 560,
        height: 315,
        widths: CARD_WIDTHS,
        sizes: CARD_SIZES,
        lazy: true,
      })
    : `<img src="${s.imgBase}.webp" width="1280" height="720" alt="${esc(alt)}" loading="lazy" decoding="async">`;
  return `<a class="svc" href="${s.href}" style="${vars}">
<div class="im">${img}<span class="tag"><span>${s.mark}</span>${esc(s.who.replace(/^For /, ""))}</span></div>
<div class="bd"><h3>${esc(s.name)}</h3><p class="who">${esc(s.who)}</p><p class="lead">${esc(GAINS[s.key as keyof typeof GAINS].lead)}</p><p class="what">${esc(s.what)}</p>
<div class="ex"><b>${esc(s.example[0])}</b><small>${esc(s.example[1])}</small></div>
<div class="ft"><p class="pr">${esc(s.price)}<small>${esc(s.time)}</small>${s.mo ? `<small class="mo">${esc(s.mo)}</small>` : ""}</p><span class="go">${s.key === "design-dossier" ? "Sample package and brief form" : "See the service"} ${ARROW}</span></div></div></a>`;
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

function heroPanel(): string {
  return `<div class="hp-panel" id="hp-panel" role="group" aria-label="Real examples, built from public documents">
      <div class="hp-fade" id="hp-fade">
      <div class="hp-tabs" role="tablist">
        <button class="hp-tab" role="tab" data-i="0" type="button">Condition Desk<small>Sample: a new school scheme</small><span class="hp-bar"></span></button>
        <button class="hp-tab" role="tab" data-i="1" type="button">Habitat Draft<small>Ecology desk study, first draft</small><span class="hp-bar"></span></button>
        <button class="hp-tab" role="tab" data-i="2" type="button">Bid Check<small>Sample: a parish council fencing tender</small><span class="hp-bar"></span></button>
      </div>
      <div class="hp-stage" id="hp-stage">
        <div class="hp-doc" aria-hidden="true"><h6 id="hp-docname">Decision notice</h6><div id="hp-doclines"></div><div class="hp-scan" id="hp-scan"></div></div>
        <div class="hp-out">
          <h5><span id="hp-outname">Plain-English conditions</span><span id="hp-status" class="hp-status">Building…</span></h5>
          <div class="hp-count" id="hp-count"><b id="hp-num">0</b><span id="hp-numlabel">26 numbered conditions plus the biodiversity gain condition</span></div>
          <div class="hp-seg" id="hp-seg" aria-hidden="true"></div><div class="hp-seglab" id="hp-seglab"></div>
          <div class="hp-rows" id="hp-rows" aria-hidden="true"></div>
        </div>
      </div>
      <div class="hp-foot"><span id="hp-price"><b>£400 per permission</b> · Usually within a day</span><a id="hp-sample" href="/condition-desk#explainer">Watch how it works →</a></div>
      </div>
    </div>
    <p class="hp-note">Real examples, built from public documents. Rows are a layout illustration, not report text.</p>`;
}

export function buildHomeHtml(): string {
  const faqs = FAQS.map(([q, a]) => `<details class="faq" open><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("");
  const svcLinks = SVC_LINKS();
  const tristan = responsiveImg({
    base: "/images/site/tristan",
    alt: "Tristan Fischer",
    width: 260,
    height: 260,
    widths: AVATAR_WIDTHS,
    sizes: AVATAR_SIZES,
    lazy: true,
  });
  const ctaBg = responsiveImg({
    base: "/lumicity/img/cd-cta",
    alt: "",
    width: 800,
    height: 342,
    widths: CTA_WIDTHS,
    sizes: CTA_SIZES,
    lazy: true,
    className: "bg",
  });
  return `<style>${CSS}${CSS2}${CSS3}${CSS_HOME}${GAINS_CSS}</style>
<div class="pg home">
${siteHeader()}

<section class="hh"><div class="wrap grid"><div>
<p class="eyebrow">Planning · Ecology · Tenders · Hardware</p>
<h1>Clear specialist reports, <em>at a fixed price.</em></h1>
<p class="sub">Four services for housebuilders, ecologists, bid teams and hardware founders. Send your documents by email or web form. Most reports are back within a day; Design Dossiers take a few days.</p>
<div class="cta-row"><a class="btn btn-primary" href="#services">Choose a service</a><a class="btn btn-ghost" href="#how">How it works</a></div>
<div class="meta"><span>${TICK} Fixed prices</span><span>${TICK} No sales calls</span><span>${TICK} A short film on every service page</span></div>
</div>
<div>${heroPanel()}</div>
</div></section>

<section class="s" id="services"><div class="wrap"><div class="s-head"><p class="eyebrow">Four services</p><h2>Pick the job you need done</h2>
<p class="lede">Each service has its own page with a short film showing how it works and an enquiry form.</p></div>
<div class="svcs">${SERVICES.map(card).join("")}</div></div></section>

<section class="s"><div class="wrap"><div class="who-band">
${tristan}
<div><p class="eyebrow" style="background:transparent;border-color:var(--band-muted);color:var(--band-muted)">Who is behind it</p>
<h2>Run by Tristan Fischer</h2>
<p>Tristan has been chief executive or a board director of fourteen companies, almost all hard technology: wind, solar, wave and tidal, batteries, carbon capture and controlled-environment agriculture. He started in project finance at Citigroup and ran corporate venture investments at Shell Technology Ventures.</p>
<p>He has built three greenfield industrial sites, including a 25,000 m² automated factory, Fischer Farms, one of the world's largest vertical farms.</p>
<ul><li><b>14</b><span>companies as chief executive or board director</span></li><li><b>3</b><span>greenfield industrial sites built</span></li><li><b>£200m</b><span>raised, approximately</span></li><li><b>AIM</b><span>took one company public</span></li></ul>
<a href="/about">More about Tristan ${ARROW}</a></div></div></div></section>

<section class="s alt" id="how"><div class="wrap"><div class="s-head"><p class="eyebrow">How it works</p><h2>Three steps, no calls</h2></div>
<div class="hsteps">
<div class="hsteps-rail" aria-hidden="true"><i class="hsteps-fill"></i></div>
<div class="hstep"><h3>Send the documents</h3><p>A decision notice, a site boundary, a tender pack or a short hardware brief, through the service's form or by email.</p></div>
<div class="hstep"><h3>The report is built</h3><p>Planning, ecology and tender reports are built from the public documents and data for your case. Design Dossiers are built from your brief, open engineering libraries and real component prices.</p></div>
<div class="hstep"><h3>Back by email</h3><p>Most reports arrive within a day; Design Dossiers take a few days.</p></div>
</div></div></section>



<section class="s alt" id="faq"><div class="wrap"><div class="s-head"><h2>Questions</h2></div>${faqs}</div></section>

<section class="cta-photo">${ctaBg}<div class="wrap"><h2>Start with the service that fits</h2>
<p>Every service page has a short film showing how it works. Not sure which one? Email <a class="mail" href="mailto:${MAIL}">${MAIL}</a>.</p>
<div class="svc-row">${svcLinks}</div></div></section>

${siteFooter()}
</div>`;
}

