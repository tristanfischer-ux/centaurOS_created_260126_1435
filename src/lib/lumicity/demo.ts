/** Service enquiry form handler. Interactive sample demos are retired. */

export function initEnquiry() {
  const f = document.querySelector<HTMLFormElement>("form.enq-f");
  if (!f || f.dataset.bound) return;
  f.dataset.bound = "1";
  const status = f.querySelector<HTMLElement>(".enq-s")!;
  const btn = f.querySelector<HTMLButtonElement>("button")!;
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f)) as Record<string, string>;
    status.className = "enq-s";
    if (!d.name?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email || "")) {
      status.textContent = "Please give your name and a valid email address.";
      status.classList.add("err");
      return;
    }
    btn.disabled = true;
    status.textContent = "Sending…";
    try {
      const r = await fetch("/api/service-enquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...d, service: f.dataset.service }),
      });
      if (!r.ok) throw new Error(String(r.status));
      f.reset();
      status.textContent = "Thank you. We have your request and will reply by email.";
      status.classList.add("ok");
    } catch {
      status.textContent = "Sorry, that did not send. Please email tristan.fischer@fractionalforge.app instead.";
      status.classList.add("err");
    } finally {
      btn.disabled = false;
    }
  });
}
