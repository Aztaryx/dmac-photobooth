// Small motion helpers shared by the booth pages. Every effect checks reduced motion first.
export const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// Touch ripple on every button. Skipped on the print layout page (html.dark).
if (!document.documentElement.classList.contains("dark")) {
  addEventListener(
    "pointerdown",
    (e) => {
      const b = e.target.closest?.("button:not(:disabled)");
      if (!b || reduced()) return;
      const r = b.getBoundingClientRect(),
        d = Math.max(r.width, r.height) * 2,
        s = document.createElement("span");
      s.className = "ripple";
      s.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
      b.append(s);
      s.addEventListener("animationend", () => s.remove(), { once: true });
    },
    { passive: true },
  );
}

// Give each matching child a --i index so CSS can stagger its entrance.
export function stagger(root, sel = ".fx") {
  root.querySelectorAll(sel).forEach((el, i) => el.style.setProperty("--i", i));
}

// Restart a CSS animation that is keyed to a class.
export function replay(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

// Set a counter's text and give it a little bump when the number changes.
export function setCount(el, n) {
  if (!el || el.textContent === String(n)) return;
  const had = el.textContent !== "";
  el.textContent = n;
  if (had) replay(el, "bump");
}

// Count numbers up from zero. Elements carry data-count="123".
export function countUp(root = document, ms = 900) {
  root.querySelectorAll("[data-count]").forEach((el) => {
    const to = +el.dataset.count || 0;
    if (reduced() || !to) return void (el.textContent = to);
    const t0 = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / ms);
      el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(tick);
    };
    el.textContent = "0";
    requestAnimationFrame(tick);
  });
}

// Keep a list of cards in sync with data without rebuilding it. Existing cards stay put,
// new ones animate in, removed ones animate out, and a card whose content changed flashes.
// This is what stops the 10 second refresh from replaying every entrance animation.
export function reconcile(box, items, { key, cls = () => "", html, empty }) {
  const first = !box.dataset.ready;
  box.dataset.ready = "1";
  const old = new Map(
    [...box.children].filter((c) => c.dataset.k && !c.classList.contains("leave")).map((c) => [c.dataset.k, c]),
  );
  let prev = null,
    i = 0;
  for (const it of items) {
    const k = String(key(it)),
      h = html(it),
      c = ("card " + cls(it)).trim();
    let el = old.get(k);
    if (el) {
      old.delete(k);
      if (el.dataset.h !== h) {
        el.innerHTML = h;
        el.dataset.h = h;
        replay(el, "flash");
      }
      if (el.dataset.c !== c) {
        el.dataset.c = c;
        el.className = c;
      }
    } else {
      el = document.createElement("div");
      el.className = c + " enter";
      el.dataset.k = k;
      el.dataset.c = c;
      el.dataset.h = h;
      el.innerHTML = h;
      el.style.setProperty("--i", first ? i : 0);
      el.addEventListener("animationend", () => el.classList.remove("enter"), { once: true });
    }
    i++;
    const ref = prev ? prev.nextSibling : box.firstChild;
    if (el !== ref) box.insertBefore(el, ref);
    prev = el;
  }
  for (const el of old.values()) {
    if (reduced()) el.remove();
    else {
      el.classList.add("leave");
      el.addEventListener("animationend", () => el.remove(), { once: true });
    }
  }
  const em = box.querySelector(":scope > .empty");
  if (items.length && em) em.remove();
  if (!items.length && !em && empty) box.insertAdjacentHTML("beforeend", `<p class="empty enter">${empty}</p>`);
}

// Confetti burst on a full-screen canvas. Fires from (x, y) in viewport pixels.
export function confetti(x, y, colors = ["#ffffff", "#17092f", "#c4b5fd", "#fde68a", "#8b5cf6"]) {
  if (reduced()) return;
  const cv = document.createElement("canvas"),
    dpr = Math.min(devicePixelRatio || 1, 2),
    W = innerWidth,
    H = innerHeight;
  cv.width = W * dpr;
  cv.height = H * dpr;
  cv.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:30";
  cv.setAttribute("aria-hidden", "true");
  document.body.append(cv);
  const g = cv.getContext("2d");
  g.scale(dpr, dpr);
  const ps = Array.from({ length: 110 }, () => {
    const a = Math.random() * Math.PI * 2,
      v = 6 + Math.random() * 13;
    return {
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v - 7,
      w: 6 + Math.random() * 8,
      h: 4 + Math.random() * 6,
      r: Math.random() * 6.28,
      vr: (Math.random() - 0.5) * 0.4,
      c: colors[(Math.random() * colors.length) | 0],
    };
  });
  const t0 = performance.now();
  (function frame(t) {
    const age = t - t0;
    g.clearRect(0, 0, W, H);
    for (const p of ps) {
      p.vy += 0.32;
      p.vx *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      p.r += p.vr;
      g.save();
      g.globalAlpha = Math.max(0, Math.min(1, (2400 - age) / 600));
      g.translate(p.x, p.y);
      g.rotate(p.r);
      g.fillStyle = p.c;
      g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      g.restore();
    }
    age < 2400 ? requestAnimationFrame(frame) : cv.remove();
  })(t0);
}
