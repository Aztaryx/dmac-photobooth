import { sb } from "./supabase.js";
// Save on the device first, send next, delete only after the server confirms.
const open = () => new Promise((ok, no) => { const r = indexedDB.open("digiclick", 1);
  r.onupgradeneeded = () => r.result.createObjectStore("q", { keyPath: "id" });
  r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
async function tx(mode, fn) { const db = await open();
  return new Promise((ok, no) => { const t = db.transaction("q", mode), r = fn(t.objectStore("q"));
    t.oncomplete = () => ok(r.result); t.onerror = () => no(t.error); }); }
let busy = false, online = true, drift = 0, onSync = () => {};
export const onSynced = f => (onSync = f);
export async function send(rpc, args) {
  await tx("readwrite", s => s.put({ id: crypto.randomUUID(), at: Date.now(), rpc, args, failed: null }));
  await render(); return flush();
}
export async function flush() {
  if (busy || !(await sb.auth.getSession()).data.session) return; busy = true;
  try {
    const items = (await tx("readonly", s => s.getAll())).sort((a, b) => a.at - b.at);
    for (const it of items) {
      if (it.failed) continue;
      const { error } = await sb.rpc(it.rpc, it.args);
      if (!error) { await tx("readwrite", s => s.delete(it.id)); continue; }
      if (error.code) { it.failed = error.message; await tx("readwrite", s => s.put(it)); continue; }
      online = false; break;
    }
  } finally { busy = false; await render(); onSync(); }
}
async function render() {
  const el = document.getElementById("sync"); if (!el) return;
  const all = await tx("readonly", s => s.getAll()), bad = all.filter(i => i.failed), n = all.length - bad.length;
  el.className = bad.length || n ? "wait" : !online ? "off" : "ok";
  el.textContent = bad.length ? `Server refused: ${bad[0].failed} (tap to dismiss)`
    : n ? `Saved locally, waiting to sync (${n})` : !online ? "Offline" : Math.abs(drift) > 120000 ? "Synced, device clock is off" : "Synced";
  el.onclick = async () => { for (const i of bad) await tx("readwrite", s => s.delete(i.id)); render(); };
  window.__pending = n;
}
async function ping() {
  const t0 = Date.now(); const { data, error } = await sb.rpc("ping");
  online = !error; if (data) drift = Date.parse(data) - (t0 + Date.now()) / 2;
  if (online) await flush(); else render();
}
export function startSync() { render(); ping(); setInterval(ping, 15000); addEventListener("online", ping);
  addEventListener("beforeunload", e => { if (window.__pending) e.preventDefault(); }); }
