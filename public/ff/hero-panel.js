/* Every frame is a pure function of t (seek(t)). Port of mockups/hero-after.html. */
(function () {
  const S = [
    {
      tab: "Condition Desk",
      sub: "Sample: a new school scheme",
      doc: "Decision notice",
      out: "Plain-English conditions",
      n: 26,
      lab: "26 numbered conditions plus the biodiversity gain condition",
      hot: 7,
      hotLab: "Before start",
      coolLab: "Later",
      sum: "7 before work starts",
      sum2: "5 kinds of specialist needed before the start",
      price: "<b>£400 per permission</b> · Usually within a day",
      href: "/condition-desk#sample",
      showNum: true,
      showRowNums: true,
      showSeg: true,
      showTags: true,
      c: "var(--rust)",
      soft: "var(--rust-soft)",
      cl: "var(--rust-line)",
    },
    {
      tab: "Habitat Draft",
      sub: "Ecology desk study, first draft",
      doc: "Site boundary + public data",
      out: "Desk study, first draft",
      n: 8,
      lab: "Know which parcels matter before the walkover",
      hot: 3,
      hotLab: "Walkover",
      coolLab: "",
      sum: "Usually within a day",
      sum2: "",
      price: "<b>£150 per desk study</b> · Usually within a day",
      href: "/habitat-draft#sample",
      showNum: false,
      showRowNums: false,
      showSeg: false,
      showTags: true,
      c: "var(--moss)",
      soft: "var(--moss-soft)",
      cl: "var(--moss)",
    },
    {
      tab: "Bid Check",
      sub: "Sample: a parish council fencing tender",
      doc: "Tender pack",
      out: "Bid at a glance",
      n: 30,
      lab: "30 bidder-facing requirements",
      hot: 0,
      hotLab: "",
      coolLab: "",
      sum: "16 specification points, 4 items to submit, 4 contract deliverables, 6 scored criteria",
      sum2: "",
      bands: [16, 4, 4, 6],
      bandLabs: ["Specification", "To submit", "Contract", "Scored"],
      price: "<b>£600 per tender</b> · Usually within a day",
      href: "/bid-check#sample",
      showNum: true,
      showRowNums: true,
      showSeg: true,
      showTags: true,
      c: "var(--rust)",
      soft: "var(--rust-soft)",
      cl: "var(--rust-line)",
    },
  ];
  const D = 6,
    VIS = 5,
    FPS = 24,
    BLANK = 3 / FPS;
  const ease = (x) => (x < 0 ? 0 : x > 1 ? 1 : 1 - Math.pow(1 - x, 3));
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const inv = (k, n) => 1 - Math.cbrt(1 - clamp(k / n, 0, 1));
  const $ = (id) => document.getElementById(id);
  const w = (i) => 45 + ((i * 37) % 41);

  function beforeStartSet(n, hot) {
    const set = new Set();
    for (let k = 0; k < hot; k++) {
      let idx = Math.floor((k * n) / hot);
      while (set.has(idx) || idx === 10) idx = (idx + 1) % n;
      set.add(idx);
    }
    return set;
  }

  function bandOf(s, idx) {
    if (!s.bands) return -1;
    let acc = 0;
    for (let b = 0; b < s.bands.length; b++) {
      acc += s.bands[b];
      if (idx < acc) return b;
    }
    return s.bands.length - 1;
  }

  function init() {
    const panel = $("hp-panel");
    if (!panel || panel.dataset.ready) return;
    panel.dataset.ready = "1";
    const tabs = [...panel.querySelectorAll(".hp-tab")];
    const doclines = $("hp-doclines");
    if (doclines) {
      doclines.innerHTML = Array.from({ length: 30 }, (_, i) =>
        `<div class="hp-l" style="width:${55 + ((i * 53) % 45)}%"></div>`
      ).join("");
    }
    tabs.forEach((tb, k) => {
      const sm = tb.querySelector("small");
      if (sm && S[k]) sm.textContent = S[k].sub;
    });
    let cur = -1;
    function scene(i) {
      const s = S[i];
      cur = i;
      panel.style.setProperty("--c", s.c);
      panel.style.setProperty("--soft", s.soft);
      panel.style.setProperty("--cl", s.cl);
      $("hp-docname").textContent = s.doc;
      $("hp-outname").textContent = s.out;
      $("hp-numlabel").textContent = s.lab;
      $("hp-price").innerHTML = s.price;
      const sample = $("hp-sample");
      if (sample) sample.setAttribute("href", s.href);
      const count = $("hp-count");
      if (count) count.classList.toggle("no-num", !s.showNum);
      tabs.forEach((t, k) => t.setAttribute("aria-selected", k === i ? "true" : "false"));
      const hotSet = s.hot ? beforeStartSet(s.n, s.hot) : new Set();
      $("hp-rows").innerHTML = Array.from({ length: VIS }, (_, k) =>
        `<div class="hp-row" data-k="${k}"><span class="n"></span><span class="t"></span><span class="hp-tag"></span></div>`
      ).join("");
      s._hot = hotSet;
      $("hp-seg").innerHTML = s.showSeg
        ? Array.from({ length: s.n }, (_, k) => {
            const b = bandOf(s, k);
            const cls = hotSet.has(k) ? "hot" : b >= 0 ? "b" + b : "";
            return `<i class="${cls}"></i>`;
          }).join("")
        : "";
      const segwrap = $("hp-seg");
      if (segwrap) segwrap.style.display = s.showSeg ? "" : "none";
    }
    function seek(t) {
      if (!$("hp-num") || !$("hp-status") || !$("hp-seg") || !$("hp-rows")) return;
      const total = D * S.length;
      t = ((t % total) + total) % total;
      const i = Math.floor(t / D),
        lt = t - i * D,
        s = S[i];
      if (i !== cur) scene(i);
      const fade =
        lt <= BLANK || lt >= D - BLANK
          ? 0
          : lt < 0.35
            ? ease(clamp((lt - BLANK) / (0.35 - BLANK), 0, 1))
            : lt > D - 0.25
              ? clamp((D - BLANK - lt) / (0.25 - BLANK), 0, 1)
              : 1;
      const wrap = $("hp-fade");
      if (wrap) wrap.style.opacity = String(fade);
      const stage = $("hp-stage");
      if (stage) stage.style.opacity = "1";
      const prog = ease(clamp((lt - 0.6) / 2.6, 0, 1));
      const shown = Math.round(prog * s.n);
      $("hp-num").textContent = s.showNum ? String(shown) : "";
      $("hp-numlabel").style.visibility = prog < 1 && s.showNum ? "hidden" : "";
      $("hp-status").textContent = prog < 1 ? "Building…" : s.sum;
      $("hp-status").style.color = prog < 1 ? "" : "var(--c)";
      $("hp-status").style.fontWeight = prog < 1 ? "" : "700";
      const scan = $("hp-scan");
      if (scan) {
        scan.style.top = prog * 262 + "px";
        scan.style.opacity = prog < 1 && fade > 0.2 ? "1" : "0";
      }
      tabs.forEach((tb, k) => {
        const bar = tb.querySelector(".hp-bar");
        if (bar) bar.style.width = fade === 0 ? "0%" : (k === i ? clamp(lt / D, 0, 1) * 100 : 0) + "%";
      });
      if (s.showSeg) {
        [...$("hp-seg").children].forEach((el, k) => el.classList.toggle("on", k < shown));
      }
      const seglab = $("hp-seglab");
      if (seglab) {
        seglab.innerHTML = prog < 1 || !s.sum2 ? "" : s.sum2;
      }
      const start = Math.max(0, shown - VIS);
      [...$("hp-rows").children].forEach((r, k) => {
        const idx = start + k,
          on = idx < shown;
        const born = 0.6 + 2.6 * inv(idx + 1, s.n),
          a = on ? ease(clamp((lt - born) / 0.25, 0, 1)) : 0;
        r.style.opacity = on ? String(0.35 + 0.65 * a) : "0";
        r.style.transform = `translateY(${(1 - a) * 6}px)`;
        r.querySelector(".n").textContent = on && s.showRowNums ? String(idx + 1).padStart(2, "0") : "";
        r.querySelector(".t").style.width = w(idx) + "%";
        const tg = r.querySelector(".hp-tag");
        if (!s.showTags) {
          tg.textContent = "";
          tg.className = "hp-tag";
          return;
        }
        const b = bandOf(s, idx);
        const hot = s._hot.has(idx);
        if (b >= 0) {
          tg.textContent = s.bandLabs[b];
          tg.className = "hp-tag b" + b;
        } else {
          tg.textContent = hot ? s.hotLab : s.coolLab;
          tg.className = "hp-tag" + (hot ? " hot" : "");
        }
      });
    }
    window.seek = seek;
    window.DURATION = D * S.length;
    window.SCENES = S.map((s, i) => ({ name: s.tab, start: i * D, end: (i + 1) * D }));
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const params = new URLSearchParams(location.search);
    if (params.has("t")) {
      seek(+params.get("t"));
    } else if (reduce) {
      seek(D - 1);
      tabs.forEach((tb, k) => {
        tb.onclick = () => seek(k * D + D - 1);
      });
    } else {
      let offset = 0,
        paused = false,
        pauseAcc = 0,
        pausedAt = 0;
      const t0 = performance.now();
      const elapsed = () => (performance.now() - t0 - pauseAcc) / 1000;
      tabs.forEach((tb, k) => {
        tb.onclick = () => {
          offset = k * D - elapsed();
        };
      });
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
          paused = true;
          pausedAt = performance.now();
        } else {
          pauseAcc += performance.now() - pausedAt;
          paused = false;
        }
      });
      (function loop() {
        if (!paused) seek(elapsed() + offset);
        requestAnimationFrame(loop);
      })();
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
