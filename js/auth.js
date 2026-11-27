import { sb } from "./supabase.js";
import { startSync } from "./outbox.js";
export const operator = () => localStorage.getItem("dc_operator") || "";
const clean = s => s.toUpperCase().replace(/[-\s]/g, "");
export const lock = () => sb.auth.signOut().finally(() => location.reload());
export function boot(role, title) {
  document.body.insertAdjacentHTML("afterbegin", `<header class="bar"><img src="img/dmac-logo-orange-purple-bright.png" alt="DMAC"><h1>${title}</h1><button id="sync" class="ok">Synced</button><button id="lock">Lock</button></header>`);
  document.getElementById("lock").onclick = lock;
  return new Promise(done => {
    const g = document.createElement("div"); g.className = "gate";
    g.innerHTML = `<form><img src="img/dmac-logo-orange-purple-bright.png" alt="DMAC"><h2>${title}</h2>
      <label for="op">Your name</label><input id="op" type="text" autocomplete="off" required>
      <label for="pin">PIN</label><input id="pin" class="pin" type="password" autocomplete="off" maxlength="7" required>
      <p class="err" id="e"></p><button class="go" style="width:100%">Unlock</button></form>`;
    document.body.append(g); const f = g.querySelector("form"), e = g.querySelector("#e");
    f.op.value = operator();
    f.onsubmit = async ev => { ev.preventDefault(); e.textContent = "";
      const { data, error } = await sb.auth.signInWithPassword({ email: `${role}@booth.invalid`, password: clean(f.pin.value) });
      if (error) { e.textContent = /fetch|network/i.test(error.message) ? "No connection. Signing in needs internet." : "Wrong PIN. Check it and try again."; return; }
      if (data.user.app_metadata?.app_role !== role) { await sb.auth.signOut(); e.textContent = "This PIN belongs to a different page."; return; }
      localStorage.setItem("dc_operator", f.op.value.trim()); g.remove(); startSync(); done(f.op.value.trim());
    };
    (f.op.value ? f.pin : f.op).focus();
  });
}
export function ask(title, { label = "", type = "text", value = "" } = {}) {
  return new Promise(ok => { const d = document.createElement("dialog");
    d.innerHTML = `<form method="dialog"><h3>${title}</h3>${label ? `<label>${label}</label><input type="${type}" value="${value}" required>` : ""}<div class="row" style="margin-top:16px"><button class="go" value="y">Confirm</button><button value="n" formnovalidate>Cancel</button></div></form>`;
    document.body.append(d); d.showModal();
    d.onclose = () => { const v = d.returnValue === "y" ? (d.querySelector("input")?.value ?? true) : null; d.remove(); ok(v); };
  });
}
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
export const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]));
