import type { LumicityKey } from "./html";

type Cond = { n: number; title: string; stage: string; plain: string; who: string; docs: string[] };
const STAGES: [string, string, string][] = [
  ["before_start", "Before work starts", "These must be approved before any building work or site works begin."],
  ["with_reserved_matters", "With the detailed plans", "Sent in with the detailed design application (called reserved matters)."],
  ["during_build", "During the build", "Needed at a later build stage, after work has started."],
  ["before_occupation", "Before people move in", "Needed before the homes are lived in."],
  ["start_deadline", "Time limit to start", "Sets the date by which building must begin."],
  ["if_event", "Only if something happens", "Applies only if a named event occurs, such as contamination being found."],
  ["compliance", "Rules to follow throughout", "Nothing to send in; these are rules to follow."],
];
const h = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[m]!);

async function load<T>(f: string): Promise<T> {
  const r = await fetch(`/lumicity/${f}.json`);
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}

function condition(root: HTMLElement, d: { conditions: Cond[] }) {
  const all = d.conditions;
  let filter = "all";
  const label = (s: string) => STAGES.find((x) => x[0] === s)?.[1] ?? s;
  const blockers = all.filter((c) => c.stage === "before_start");
  const render = () => {
    const list = all.filter((c) => filter === "all" || c.stage === filter);
    const chip = (k: string, t: string, n: number) =>
      `<button class="chip" type="button" data-f="${k}" aria-pressed="${filter === k}">${h(t)}<span>${n}</span></button>`;
    const who = [...new Set(blockers.map((b) => b.who))].length;
    root.innerHTML = `<div class="block"><h3>What blocks your start</h3><p>${blockers.length} of the ${all.length} conditions must be cleared before work can begin on site. They need ${who} different kinds of specialist, so a late report from any one of them holds up the start.</p><ul>${blockers.map((b) => `<li>${h(b.title)} <span class="tag">${h(b.who)}</span></li>`).join("")}</ul><p style="margin-top:8px"><button class="lnk" type="button" data-f="before_start">Show only these</button></p></div>
<div class="chips" role="group" aria-label="Filter conditions by stage">${chip("all", "All", all.length)}${STAGES.map((s) => chip(s[0], s[1], all.filter((c) => c.stage === s[0]).length)).join("")}</div>
<p class="priv" style="margin:0 0 10px" aria-live="polite">Showing ${list.length} of ${all.length} conditions. Select one to read it.</p>
<div class="cards">${list.map((c) => `<div class="cc" id="cc${c.n}"><button type="button" aria-expanded="false" aria-controls="b${c.n}" data-c="${c.n}"><span class="num">${c.n}</span><span style="min-width:0"><span class="t" style="display:block">${h(c.title)}</span><span class="meta" style="display:block">${h(label(c.stage))} · prepared by: ${h(c.who)}</span></span><span class="caret" aria-hidden="true">&#9662;</span></button>
<div class="body" id="b${c.n}"><p>${h(c.plain)}</p><h4>Who prepares it</h4><p>${h(c.who)}</p><h4>Documents</h4><ul>${c.docs.map((x) => `<li>${h(x)}</li>`).join("")}</ul></div></div>`).join("")}</div>`;
  };
  root.addEventListener("click", (e) => {
    const t = (e.target as HTMLElement).closest("[data-f],[data-c]") as HTMLElement | null;
    if (!t) return;
    if (t.dataset.f) { filter = t.dataset.f; render(); (root.querySelector(`.chip[data-f="${filter}"]`) as HTMLElement | null)?.focus(); }
    else { const card = t.closest(".cc")!; const o = card.classList.toggle("open"); t.setAttribute("aria-expanded", String(o)); }
  });
  render();
}

type Parcel = { id: string; habitat: string; area_ha: number | null; length_m: number | null; distinctiveness: string; confidence: string };
type Check = { parcel: string; priority: string; what: string; why: string };
function habitat(root: HTMLElement, d: { parcels: Parcel[]; checks: Check[]; area_ha: number }) {
  let sel = d.parcels[0].id;
  const order: Record<string, number> = { High: 0, Medium: 1, Low: 2 };
  const checks = [...d.checks].sort((a, b) => (order[a.priority] ?? 3) - (order[b.priority] ?? 3));
  const clean = (s: string) => h(s.replace(/\s+and \.$/, ".").replace(/\s+\./g, "."));
  const short = (k: Check) => { const p = d.parcels.find((x) => x.id === k.parcel); return /^Grassland grade uncertain/.test(k.what) ? "check whether the grassland is farmed or semi-natural" : p ? `confirm ${p.habitat.toLowerCase()} and score its condition` : "check on site"; };
  const render = () => {
    const p = d.parcels.find((x) => x.id === sel)!;
    const ck = d.checks.find((x) => x.parcel === sel);
    const size = p.area_ha != null ? `${p.area_ha} hectares` : "A line of trees or a hedge (length not measured)";
    root.innerHTML = `<div class="hd"><figure class="map"><img src="/lumicity/romsey-map.png" alt="First habitat map of the Romsey site, drawn from national data, with the site boundary in red and parcels labelled G1 to G3 and W1 to W12." width="600" height="800"><figcaption>First habitat map, draft and unchecked. The site is ${d.area_ha} hectares in total.</figcaption></figure>
<div><div class="plist" role="group" aria-label="Choose a parcel">${d.parcels.map((x) => `<button class="pbtn" type="button" data-p="${x.id}" aria-pressed="${x.id === sel}"><span class="dot ${x.confidence}"></span>${x.id}</button>`).join("")}</div>
<div class="pdetail" aria-live="polite"><h3>Parcel ${p.id}: ${h(p.habitat)}</h3><dl><dt>Size</dt><dd>${size}</dd><dt>Confidence</dt><dd><span class="pill ${p.confidence}">${h(p.confidence[0].toUpperCase() + p.confidence.slice(1))}</span> how sure the national data makes us</dd><dt>Value</dt><dd>${h(p.distinctiveness)} distinctiveness (how important this type of habitat is for wildlife)</dd></dl>
${ck ? `<p class="chk"><b>Check on site (${h(ck.priority.toLowerCase())} priority):</b> ${clean(ck.what)}</p>${ck.why ? `<p class="chk">${clean(ck.why)}</p>` : ""}` : ""}</div>
<div class="pri"><h3>Priority checks for the walkover</h3><ol>${checks.slice(0, 6).map((k) => `<li><button type="button" data-p="${h(k.parcel)}">${h(k.parcel)}</button> (${h(k.priority.toLowerCase())}): ${short(k)}</li>`).join("")}</ol><p class="priv">The full desk study lists all ${d.checks.length} checks.</p></div></div></div>`;
  };
  root.addEventListener("click", (e) => {
    const t = (e.target as HTMLElement).closest("[data-p]") as HTMLElement | null;
    if (!t) return; sel = t.dataset.p!; render();
    (root.querySelector(`.pbtn[data-p="${sel}"]`) as HTMLElement | null)?.focus();
  });
  render();
}

type Item = { kind: string; text: string; source: string };
function bid(root: HTMLElement, d: { items: Item[]; title: string; buyer: string; closing: string }) {
  const G: [string[], string, string][] = [
    [["gate"], "Pass or fail", "Conditions the tender sets. Fail one and the bid can be rejected."],
    [["return_item"], "Documents to submit", "Things the buyer wants to receive with your bid."],
    [["scored"], "How it is scored", "The criteria the buyer marks your bid against."],
    [["deadline", "other"], "Key dates and other", "Deadlines and other requirements."],
  ];
  const done = new Set<number>();
  const total = d.items.length;
  root.innerHTML = `<div class="prog"><div class="row"><span>Ready to bid</span><span id="pt" aria-live="polite">0 of ${total} ticked (0%)</span></div><div class="bar" role="progressbar" aria-label="Ready to bid" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i id="pb"></i></div></div>
<p class="priv" style="margin:0 0 6px">${h(d.title)} for ${h(d.buyer)}, closing ${h(d.closing)}. ${total} requirements found. Tick each one as you deal with it.</p>
${G.map((g) => { const its = d.items.map((x, i) => [x, i] as const).filter(([x]) => g[0].includes(x.kind));
  return `<div class="grp"><h3>${g[1]} (${its.length})</h3><p class="gd">${g[2]}</p>${its.map(([x, i], n) => `<div class="it${n >= 6 ? " extra" : ""}" id="it${i}"${n >= 6 ? " hidden" : ""}><input type="checkbox" id="c${i}" data-i="${i}"><label for="c${i}">${h(x.text)}<span class="src">Source: ${h(x.source)}</span></label></div>`).join("")}${its.length > 6 ? `<button class="chip more" type="button" aria-expanded="false">Show all ${its.length}</button>` : ""}</div>`; }).join("")}
<p class="priv">Ticks stay in your browser and are not sent to us.</p>`;
  root.addEventListener("click", (e) => {
    const m = (e.target as HTMLElement).closest(".more") as HTMLElement | null; if (!m) return;
    const open = m.getAttribute("aria-expanded") !== "true"; m.setAttribute("aria-expanded", String(open));
    m.parentElement!.querySelectorAll(".extra").forEach((x) => ((x as HTMLElement).hidden = !open));
    m.textContent = open ? "Show fewer" : "Show all " + (m.parentElement!.querySelectorAll(".it").length);
  });
  root.addEventListener("change", (e) => {
    const t = e.target as HTMLInputElement; if (!t.dataset.i) return;
    const i = +t.dataset.i; t.checked ? done.add(i) : done.delete(i);
    document.getElementById("it" + i)!.classList.toggle("done", t.checked);
    const pc = Math.round((done.size / total) * 100);
    (document.getElementById("pb") as HTMLElement).style.width = pc + "%";
    document.getElementById("pt")!.textContent = `${done.size} of ${total} ticked (${pc}%)`;
    root.querySelector(".bar")!.setAttribute("aria-valuenow", String(pc));
  });
}

export async function initDemo(key: LumicityKey) {
  const root = document.getElementById("demo-root");
  if (!root) return;
  try {
    const d: any = await load(key);
    root.innerHTML = "";
    if (key === "condition-desk") condition(root, d);
    else if (key === "habitat-draft") habitat(root, d);
    else bid(root, d);
  } catch {
    root.innerHTML = "<p>The example could not load. Please refresh the page, or email us and we will send it.</p>";
  }
}
