"use strict";
// ================================================================== ПОМИДОРКИ (сверху в DAY)
// До 31.12.2026: час = 50 мин дело + 10 отдых (слоты в :00). С 2027: 25/5 (слоты в :00 и :30).
// Слоты идут через час после старта утра и до 24:00, кроме времени дел с ⛔ (работа, дорога, сон).
// Конец слота: дело в плане → ✅/❌; дела нет → ❌. После ❌ — «ЧТО ДЕЛАЛ?». Спрашивается только последний слот, без накопления.
const pcfg = day => day <= "2026-12-31" ? {len: 60, work: 50} : {len: 30, work: 25};
let pLastKey = null;
const pPopShown = new Set();
const pomoLogs = day => T("pomo_log").filter(l => l.day === day);
const isPend = l => l.status === null || (l.status === "no" && l.did === undefined);
const slotLbl = l => { const c = pcfg(l.day); return m2hm(l.slot) + "–" + m2hm(l.slot + c.work); };

function pomoDayStart(day) {                      // когда начался день: старт утреннего блока, иначе первое открытие
  const r = S.run && isoDay(new Date(S.run.startedAt)) === day ? S.run : S.runs.filter(x => x.day === day).pop();
  if (r) {
    if (r.startedAt) { const d = new Date(r.startedAt); return d.getHours() * 60 + d.getMinutes(); }
    const m = hm2m(r.start); if (m != null) return m;
  }
  S.pStart = S.pStart || {};
  if (S.pStart[day] == null) { if (day !== today()) return null; S.pStart[day] = Math.max(300, nowMin()); save(); }
  return S.pStart[day];
}
const pomoEvents = (day, s) => planOf(day).filter(e => e.from < s + pcfg(day).work && e.to > s);
function pomoTitle(day, s) {
  const t = pomoEvents(day, s).filter(e => !e.nopomo).map(e => e.title);
  return t.length ? t.join(" + ") : null;
}
function pomoSlots(day) {
  if ((S.pomoOff || {})[day]) return [];
  const ds = pomoDayStart(day); if (ds == null) return [];
  const c = pcfg(day), out = [];
  for (let s = Math.ceil((ds + 60) / c.len) * c.len; s + c.len <= 1440; s += c.len)
    if (!pomoEvents(day, s).some(e => e.nopomo)) out.push(s);
  return out;
}
function pomoEnsure() {                           // закончившиеся слоты получают запись; старые без ответа закрываются ❌
  const day = today(), nm = nowMin(), c = pcfg(day); let ch = false;
  const have = new Set(pomoLogs(day).map(l => l.slot)), ended = pomoSlots(day).filter(s => s + c.work <= nm);
  ended.forEach(s => {
    if (have.has(s)) return;
    const t = pomoTitle(day, s);
    T("pomo_log").push({id: nextId("pomo_log"), day, slot: s, plan: t || "", status: t ? null : "no"}); ch = true;
  });
  const last = ended.length ? ended[ended.length - 1] : null;
  T("pomo_log").forEach(l => {
    if (!isPend(l) || (l.day === day && l.slot === last)) return;
    if (l.status === null) l.status = "no";
    if (l.did === undefined) l.did = "";
    ch = true;
  });
  if (ch) save();
}
const pomoPending = () => pomoLogs(today()).filter(isPend);
function pomoPhase() {
  const n = new Date(), day = today(), c = pcfg(day), m = n.getHours() * 60 + n.getMinutes(), sc = m * 60 + n.getSeconds();
  const slots = pomoSlots(day), s = Math.floor(m / c.len) * c.len;
  if (slots.includes(s)) { const el = sc - s * 60; return el < c.work * 60 ? {ph: "work", left: c.work * 60 - el, s} : {ph: "rest", left: c.len * 60 - el, s}; }
  const nx = slots.find(x => x * 60 > sc);
  return {ph: "idle", left: nx == null ? null : nx * 60 - sc, s: nx};
}

// ---------------------------------------------------------------- полоска в DAY
function pomoBar() {
  const day = today();
  if ((S.pomoOff || {})[day]) return `<div class="pbar" id="pbar"><span id="pph">⏸ БЕЗ 🍅</span><b id="pcd"></b><span id="pnow"></span></div>`;
  if (!pomoSlots(day).length) return "";
  return `<div class="pbar" id="pbar"><span id="pph"></span><b id="pcd"></b><span id="pnow"></span></div>`;
}
function paintPomo() {
  const ph = document.getElementById("pph"); if (!ph) return;
  const bar = document.getElementById("pbar");
  if (bar && !bar.onclick) bar.onclick = () => {
    const off = !(S.pomoOff || {})[today()];
    if (!confirm(off ? "СЕГОДНЯ БЕЗ ПОМИДОРОК?" : "ВКЛЮЧИТЬ ПОМИДОРКИ?")) return;
    S.pomoOff = S.pomoOff || {}; S.pomoOff[today()] = off; save(); render();
  };
  if ((S.pomoOff || {})[today()]) return;
  const p = pomoPhase(), day = today(), c = pcfg(day);
  ph.textContent = p.ph === "work" ? "🍅" : p.ph === "rest" ? "☕" : "⏸";
  document.getElementById("pcd").textContent = p.left == null ? "—" : fmt(p.left);
  let t = "";
  if (p.ph === "work") t = pomoTitle(day, p.s) || "НЕ ЗАПЛАНИРОВАНО";
  else if (p.s != null) { const nx = p.ph === "rest" ? p.s + c.len : p.s; t = "⏭ " + m2hm(nx) + " " + (pomoTitle(day, nx) || "НЕ ЗАПЛАНИРОВАНО"); }
  document.getElementById("pnow").textContent = t;
}

// ---------------------------------------------------------------- вопрос после слота
function pendHTML(l) {
  if (l.status === null)
    return `<div class="pq"><div class="pt">🍅 ${slotLbl(l)}<br><b>${esc(l.plan)}</b></div><div class="acts"><button data-pa="yes">✅</button><button data-pa="no">❌</button></div></div>`;
  return `<div class="pq"><div class="pt">❌ ${slotLbl(l)} · ${l.plan ? esc(l.plan) : "НЕ БЫЛО В ПЛАНЕ"}<br><b>ЧТО ДЕЛАЛ?</b></div><input class="did" placeholder="ЧТО ДЕЛАЛ"><div class="acts"><button data-pa="skip">⏭</button><button data-pa="did">✅</button></div></div>`;
}
function popAsk(l) {
  const w = document.createElement("div"); w.className = "sheet"; document.body.appendChild(w);
  const paint = () => {
    if (!isPend(l)) { w.remove(); return; }
    w.innerHTML = "<div>" + pendHTML(l) + "</div>";
    w.querySelectorAll("[data-pa]").forEach(b => b.onclick = () => {
      const a = b.dataset.pa;
      if (a === "yes") l.status = "yes";
      else if (a === "no") l.status = "no";
      else if (a === "did") l.did = w.querySelector(".did").value.trim();
      else l.did = "";
      save(); paint();
    });
  };
  paint();
}
function pomoPopup() {
  if (document.hidden || document.querySelector(".sheet") || screen === "run" || screen === "train") return;
  const l = pomoPending().pop();
  if (l && !pPopShown.has(l.id + ":" + l.status)) { pPopShown.add(l.id + ":" + l.status); popAsk(l); }
}
function pomoTick() {
  pomoEnsure();
  const p = pomoPhase(), key = p.ph + ":" + p.s;
  if (pLastKey !== null && key !== pLastKey && !document.hidden && p.ph !== "idle") beep(p.ph === "rest" ? 2 : 1);
  pLastKey = key;
  paintPomo();
  if (screen === "plan") { const nl = document.getElementById("nowl"); if (nl) nl.style.top = nowMin() / 60 * PHH + "px"; }
  pomoPopup();
}
