/* Every frame is a pure function of t (seek(t)). Port of mockups/hero-after.html. */
(function () {
  const S = [
    { tab: "Condition Desk", doc: "Decision notice", out: "Plain-English conditions", n: 38, lab: "planning conditions", hot: 11, hotLab: "Before start", coolLab: "Later",
      sum: "11 before work starts", price: "<b>£400 per permission</b> · Usually within a day", href: "/condition-desk#sample",
      c: "var(--rust)", soft: "var(--rust-soft)", cl: "var(--rust-line)" },
    { tab: "Habitat Draft", doc: "Site boundary + public data", out: "Desk study, habitat parcels", n: 15, lab: "habitat parcels", hot: 5, hotLab: "To check", coolLab: "Mapped",
      sum: "5 to check", price: "<b>£150 per desk study</b> · Usually within a day", href: "/habitat-draft#sample",
      c: "var(--moss)", soft: "var(--moss-soft)", cl: "var(--moss)" },
    { tab: "Bid Check", doc: "Tender pack", out: "Bid at a glance", n: 52, lab: "tender requirements", hot: 18, hotLab: "Pass / fail", coolLab: "Scored",
      sum: "18 pass or fail", price: "<b>£600 per tender</b> · Usually within a day", href: "/bid-check#sample",
      c: "var(--rust)", soft: "var(--rust-soft)", cl: "var(--rust-line)" }
  ];
  const D = 6, VIS = 5;
  const ease = (x) => (x < 0 ? 0 : x > 1 ? 1 : 1 - Math.pow(1 - x, 3));
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const inv = (k, n) => 1 - Math.cbrt(1 - clamp(k / n, 0, 1));
  const $ = (id) => document.getElementById(id);
  const w = (i) => 45 + ((i * 37) % 41);

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
      tabs.forEach((t, k) => t.setAttribute("aria-selected", k === i ? "true" : "false"));
      const hotSet = new Set(Array.from({ length: s.hot }, (_, k) => Math.floor((k * s.n) / s.hot)));
      $("hp-rows").innerHTML = Array.from({ length: VIS }, (_, k) =>
        `<div class="hp-row" data-k="${k}"><span class="n"></span><span class="t"></span><span class="hp-tag"></span></div>`
      ).join("");
      s._hot = hotSet;
      $("hp-seg").innerHTML = Array.from({ length: s.n }, (_, k) =>
        `<i class="${hotSet.has(k) ? "hot" : ""}"></i>`
      ).join("");
    }
    function seek(t) {
      if (!$("hp-num") || !$("hp-status") || !$("hp-seg") || !$("hp-rows")) return;
      const total = D * S.length;
      t = ((t % total) + total) % total;
      const i = Math.floor(t / D),
        lt = t - i * D,
        s = S[i];
      if (i !== cur) scene(i);
      const prog = ease(clamp((lt - 0.6) / 2.6, 0, 1));
      const shown = Math.round(prog * s.n);
      $("hp-num").textContent = String(shown);
      $("hp-status").textContent = prog < 1 ? "Building…" : s.sum;
      $("hp-status").style.color = prog < 1 ? "" : "var(--c)";
      $("hp-status").style.fontWeight = prog < 1 ? "" : "700";
      const scan = $("hp-scan");
      if (scan) {
        scan.style.top = prog * 262 + "px";
        scan.style.opacity = prog < 1 ? "1" : "0";
      }
      tabs.forEach((tb, k) => {
        const bar = tb.querySelector(".hp-bar");
        if (bar) bar.style.width = (k === i ? clamp(lt / D, 0, 1) * 100 : 0) + "%";
      });
      [...$("hp-seg").children].forEach((el, k) => el.classList.toggle("on", k < shown));
      const hotSoFar = [...s._hot].filter((k) => k < shown).length;
      $("hp-seglab").innerHTML =
        prog < 1
          ? `${hotSoFar} ${s.hotLab.toLowerCase()} so far`
          : `<b>${s.hot} of ${s.n}</b> marked “${s.hotLab}”`;
      const start = Math.max(0, shown - VIS);
      [...$("hp-rows").children].forEach((r, k) => {
        const idx = start + k,
          on = idx < shown;
        const born = 0.6 + 2.6 * inv(idx + 1, s.n),
          a = on ? ease(clamp((lt - born) / 0.25, 0, 1)) : 0;
        r.style.opacity = on ? String(0.35 + 0.65 * a) : "0";
        r.style.transform = `translateY(${(1 - a) * 6}px)`;
        r.querySelector(".n").textContent = on ? String(idx + 1).padStart(2, "0") : "";
        r.querySelector(".t").style.width = w(idx) + "%";
        const tg = r.querySelector(".hp-tag"),
          hot = s._hot.has(idx);
        tg.textContent = hot ? s.hotLab : s.coolLab;
        tg.className = "hp-tag" + (hot ? " hot" : "");
      });
      const fade =
        lt > D - 0.25 ? clamp((D - lt) / 0.25, 0, 1) : lt < 0.35 ? ease(clamp(lt / 0.35, 0, 1)) : 1;
      const stage = $("hp-stage");
      if (stage) stage.style.opacity = String(fade);
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
