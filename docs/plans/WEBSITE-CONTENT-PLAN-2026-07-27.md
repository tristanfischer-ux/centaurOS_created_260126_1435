# fractionalforge.app — content plan
**2026-07-27 · based on reading the live site + an inventory of what we can actually show**

---

## 1. What is on the site now

The copy is strong and specific. The structure is: hero → what the Dossier contains → three-part model (Strategy / Capital / Build) → technical credibility → for partners → CTA.

The claims are concrete and quantified, which is the site's real strength:

- 231 calculation tools on peer-reviewed libraries (PyBaMM, CoolProp, PsychroLib)
- 36,000-part reference library with real manufacturer numbers
- 30,000 UK & EU suppliers matched per module
- Condenses "two-to-three months and £20k–£40k of upfront engineering study into one auditable workbook"

**Imagery today is three files:** an AI-generated hero illustration, one plant render (`dossier-render.webp`), one GA drawing (`dossier-ga.webp`), plus a founder photo.

**The site has not been touched since 2026-07-06** — the last homepage commit is `b967702a4`. Everything the engine has learned to do since then is invisible.

---

## 2. The gap, stated plainly

The site sells "a buildable design" but shows a **water-treatment plant** — a single sector, and the least representative of what the engine now does best.

Three weeks of work are unrepresented:

| Capability | On the site? |
|---|---|
| Benchtop **instruments** (bioreactor, colorimeter, potentiostat, syringe pump, microscope, thermocycler) | ✗ nothing |
| **Translucent cutaways** showing internal architecture | ✗ nothing |
| **Interactive 3D models** you can rotate | ✗ nothing |
| **PCB design** — schematic → layout → routed → fab-ready gerbers | ✗ nothing, and it is not mentioned in copy either |
| **Firmware** bring-up proof | ✗ nothing |
| Breadth — 13 archetypes from plant to handheld | ✗ implied, never shown |

PCB is the biggest omission. It is a whole capability the site does not claim at all, and it is the one a hardware founder will care about most, because it is the part they cannot fake with a CAD package.

---

## 3. What we can actually show — verified, not assumed

Inventoried from `out/organoid-9drive-r11-allfixes/` (the 9/10 workbook shipped this morning):

**Renders — 11 product images, all current**
`00-hero`, `04-product-exterior`, `05/06` left+right, `07-service`, and five translucent cutaways: `08` hero three-quarter, `09` side, `10` rear, `11` top-down, `12` front. Framing measured at 0.76–0.91 occupancy; all pass the render gates.

**Interactive 3D — works today**
`product-3d-shell-on.glb` / `-off.glb` (1.5 MB each) plus USDZ. A `<model-viewer>` embed would let a visitor rotate the actual product in the browser and toggle the shell. **No competitor site does this.**

**Drawings** — `ga-A1.pdf`, `ga-A1-sheet2.pdf`, `interconnect-A1.pdf`, plus SVG.

**PCB — renderable, proven this session**
3 routed boards (`wet_lab_hat`, `od_optics`, `wet_actuation`) as `.kicad_pcb`. `kicad-cli pcb render` produces a 3D image in 2.3 s — I test-rendered one and it shows a real routed board: QFP micro, headers, passives, traces.

**Workbook** — 28 tabs, live formulas, SHIPS at floor 9/10.

---

## 4. Naming and provenance rules — RESOLVED 2026-07-27

**(a) The design is ours.** Tristan: *"The organoid project does not exist at all. It is just mine, and I just made it up."* No client, no permission needed — the `out/organoid-for-simon` directory name is an internal artefact, not a customer.

Because it is an invented design rather than a delivered project, captions must describe **what it is** (engine output / reference design) and must never imply a client engagement. The site already gets this right on the plant render — *"built from the same model as the costs"* — so match that voice.

**(b) Two words must not appear in anything published.**

- **"YURI"** — Tristan: *"zero mention of the word YURI"*, scoped to *"only … the things which go on to the website"*. Internal repo docs, code comments and git history are unaffected and must NOT be churned (I started renaming internal docs and reverted it — it would have broken CLAUDE.md's cross-references for no benefit). **Verified 2026-07-27: zero occurrences in `src/app`, `public/images/site` or the public text assets. It is not on the site today.** The live constraint is on NEW content: image filenames, alt text, captions and any workbook screenshot.
- **"organoid"** — call the product a **benchtop bioreactor**. That is already its `product_class` and already what the deliverable filenames and the Executive Summary say. The word survives only in: the Brief tab (quoting the original brief verbatim), a correct functional phrase in the Exec Summary ("live cell and organoid cultures"), and the Overview tab title.

**(c) The Overview tab leaks the build folder.** `Overview!A1` reads *"ForgeOS Review Workbook — organoid-9drive-r11-allfixes"* — the internal run-directory slug on a customer-facing tab. That is a defect independent of naming: a dossier should be titled by its PRODUCT. Fix at source (`build-excel-export.py:4203`) before any workbook screenshot goes on the site.

**(d) The PCB renders are bare boards.**
The footprints carry no 3D component models, so the render shows pads, traces and silkscreen but no components standing proud. It reads as a *fab-ready bare board* — which is honest and is exactly what we deliver — but it is less impressive than a populated board photo. Do not let anyone caption it as "the assembled board".

---

## 5. Proposed content — IMAGES ONLY (revised 2026-07-27)

**Decision (Tristan):** *"Maybe we are setting ourselves up for failure by putting this there. Can't we just have some images of various machines which it does, some PCB boards, but don't necessarily show the brief or the documentation or anything like that, and don't have the Excel spreadsheet?"*

Adopted. **No workbook, no brief, no documentation on the site.** Images only.

### Why this is the right call, with evidence

Publishing the workbook would make **every cell of 28 tabs a publishing surface**, policed forever. That is not theoretical: scrubbing one word out of the workbook today took the dossier floor from **9/10 to 0/10**, because a blanket string replacement hit PCB net identifiers as well as prose. The word survived in five more cells regenerated from cached artefacts I had not touched.

An image has ONE surface — what you can see in it. A spreadsheet has thousands, and they regenerate.

### What goes on the site

1. **Product renders** — the machines. Exterior three-quarter, plus the translucent cutaway showing the internals. These carry no text at all.
2. **PCB renders** — the boards, from `kicad-cli`. Bare fab-ready boards; no silkscreen product names visible at the sizes we would publish, but **check each render before it ships** (see §4d).
3. **Interactive 3D model** — optional, high impact, still text-free.

### What does NOT go on the site

- the Excel workbook, or any screenshot of it
- the brief, or any quotation from it
- GA drawings **unless the title block is checked** — drawings carry a title block with product name, part names and a schedule, so they are a text surface like the workbook, just smaller. If we want one, crop to the drawing body and away from the title block, or regenerate it with a neutral title.
- BoM extracts (real part numbers are fine; the surrounding prose is the risk)

### The copy carries the claims, the images carry the proof

The site already states the numbers well (231 tools, 36,000 parts, £20k–£40k compressed). It does not need a spreadsheet to prove them — it needs to look like the work of people who build machines. Renders and boards do that; a screenshot of a spreadsheet does not.

## 6. Sequence

| # | Step | Depends on |
|---|---|---|
| 1 | ~~Decide provenance~~ — RESOLVED: our own design, publish freely | done |
| 2 | Render the 3 PCBs properly — tight crop, better camera, consistent lighting | — |
| 3 | Build the "one product, end to end" section + assets | 1, 2 |
| 4 | Write the PCB/firmware copy with the honest status line | 1 |
| 5 | Embed the interactive 3D model | 1 |
| 6 | Swap the hero | 1 |
| 7 | Re-bake the other archetypes, then the breadth strip | — |

Steps 2 and 7 are engine-side and need no decision — I can start those now. Steps 3–6 all wait on §4a.

---

## 7. What I have not done

- Not audited the sub-pages (`/brief`, `/insights`, `/about`, partner page) — this covers the homepage only
- Not looked at mobile layout
- Not measured page weight; adding a 1.5 MB GLB and several renders needs a budget check before it ships
- Did not find any separate written website notes beyond the git history; if there is a doc I have missed, point me at it and I will fold it in
