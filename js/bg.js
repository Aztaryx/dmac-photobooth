// Plays a BGStack package behind the page. If WebGL or the package is missing, it does nothing.
export async function mountBg(url = "bg/bgstack.json") {
  if (!window.BgStack) return;
  const cv = document.createElement("canvas");
  const dim = document.createElement("div");
  cv.id = "bg";
  dim.id = "bg-dim";
  cv.setAttribute("aria-hidden", "true");
  document.body.prepend(dim);
  document.body.prepend(cv);
  try {
    // keys:false stops the runtime from taking over the arrow keys, Space and Enter.
    const bg = BgStack.create(cv, {
      overlay: document.createElement("canvas"),
      scale: 3,
      keys: false,
    });
    await bg.loadPackage(url);
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    bg.start();
    if (still) return setTimeout(() => bg.stop(), 300); // one still frame
    document.addEventListener("visibilitychange", () => (document.hidden ? bg.stop() : bg.start()));
  } catch (e) {
    cv.remove();
    dim.remove();
    console.warn("Background skipped:", e.message || e);
  }
}
