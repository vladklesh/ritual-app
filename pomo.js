"use strict";
// ================================================================== ПОМИДОРКИ 25/5
// Слот = 30 минут (:00 и :30): 25 минут дело, 5 минут отдых. Слоты идут после утреннего часа до 24:00.
// Дело в плане на эти 25 минут → вопрос ✅/❌. Дела нет → сразу ❌. После ❌ спрашивает «ЧТО ДЕЛАЛ?».
const PW = 25;
let pLastKey = null, pQKey = null;
const pPopShown = new Set();
const pomoLogs = day => T("pomo_log").filter(l => l.day === day);
const isPend = l => l.status === null || (l.status === "no" && l.did === undefined);
const slotLbl = l => m2hm(l.slot) + "–" + m2hm(l.slot + PW);

function pomoDayStart(day) {                      // когда начался день: старт утреннего ритуала, иначе первое открытие
  const r = S.run && isoDay(new Date(S.run.startedAt)) === day ? S.run : S.runs.filter(x => x.day === day).pop();
  if (r) {
    if (r.startedAt) { const d = new Date(r.startedAt); return d.getHours() * 60 + d.getMinutes(); }
    const m = hm2m(r.start); if (m != null) return m;
  }
  S.pStart = S.pStart || {};
  if (S.pStart[day] == null) { if (day !== today()) return null; S.pStart[day] = Math.max(300, nowMin()); save(); }
  return S.pStart[day];
}
const pomoEvents = (day, s) => planOf(day).filter(e => e.from < s + PW && e.to > s);
function pomoTitle(day, s) {
  const t = pomoEvents(day, s).filter(e => !e.nopomo).map(e => e.title);
  return t.length ? t.join(" + ") : null;
}
function pomoSlots(day) {
  if ((S.pomoOff || {})[day]) return [];
  const ds = pomoDayStart(day); if (ds == null) return [];
  const out = [];
  for (let s = Math.ceil((ds + 60) / 30) * 30; s + 30 <= 1440; s += 30)
    if (!pomoEvents(day, s).some(e => e.nopomo)) out.push(s);
  return out;
}
function pomoEnsure() {                           // слоты, которые закончились, получают запись (даже если приложение было закрыто)
  const day = today(), nm = nowMin(); let ch = false;
  const have = new Set(pomoLogs(day).map(l => l.slot));
  pomoSlots(day).forEach(s => {
    if (s + PW > nm || have.has(s)) return;
    const t = pomoTitle(day, s);
    T("pomo_log").push({id: nextId("pomo_log"), day, slot: s, plan: t || "", status: t ? null : "no"}); ch = true;
  });
  if (ch) save();
}
function pomoPending() {
  const day = today(), ok = new Set(pomoSlots(day));
  return pomoLogs(day).filter(l => ok.has(l.slot) && isPend(l)).sort((a, b) => a.slot - b.slot);
}
function pomoPhase() {
  const n = new Date(), m = n.getHours() * 60 + n.getMinutes(), sc = m * 60 + n.getSeconds();
  const slots = pomoSlots(today()), s = Math.floor(m / 30) * 30;
  if (slots.includes(s)) { const el = sc - s * 60; return el < PW * 60 ? {ph: "work", left: PW * 60 - el, s} : {ph: "rest", left: 1800 - el, s}; }
  const nx = slots.find(x => x * 60 > sc);
  return {ph: "idle", left: nx == null ? null : nx * 60 - sc, s: nx};
}

// ---------------------------------------------------------------- вопросы
function pendHTML(l) {
  if (l.status === null)
    return `<div class="pq" data-l="${l.id}"><div class="pt">${slotLbl(l)}<br><b>${esc(l.plan)}</b></div><div class="acts"><button data-pa="yes">✅</button><button data-pa="no">❌</button></div></div>`;
  return `<div class="pq" data-l="${l.id}"><div class="pt">❌ ${slotLbl(l)} · ${l.plan ? esc(l.plan) : "НЕ БЫЛО В ПЛАНЕ"}<br><b>ЧТО ДЕЛАЛ?</b></div><input class="did" placeholder="ЧТО ДЕЛАЛ"><div class="acts"><button data-pa="did">✅</button><button data-pa="skip">⏭</button></div></div>`;
}
function bindPend(root, after) {
  root.querySelectorAll(".pq").forEach(q => {
    const l = T("pomo_log").find(x => x.id === +q.dataset.l);
    q.querySelectorAll("[data-pa]").forEach(b => b.onclick = () => {
      const a = b.dataset.pa;
      if (a === "yes") l.status = "yes";
      else if (a === "no") l.status = "no";
      else if (a === "did") l.did = q.querySelector(".did").value.trim();
      else if (a === "skip") l.did = "";
      save(); after();
    });
  });
}
function popAsk(l) {
  const w = document.createElement("div"); w.className = "sheet"; document.body.appendChild(w);
  w.onclick = ev => { if (ev.target === w) w.remove(); };
  const paint = () => {
    if (!isPend(l)) { w.remove(); if (screen === "pomo") paintPomoLists(); return; }
    w.innerHTML = "<div>" + pendHTML(l) + "</div>"; bindPend(w, paint);
  };
  paint();
}
function pomoPopup() {                            // вопрос всплывает, если слот закончился не больше 30 минут назад
  if (document.hidden || document.querySelector(".sheet") || screen === "run" || screen === "train") return;
  const nm = nowMin();
  const l = pomoPending().find(x => !pPopShown.has(x.id) && x.slot + PW >= nm - 30);
  if (l) { pPopShown.add(l.id); popAsk(l); }
}

// ---------------------------------------------------------------- экран 🍅
function renderPomo() {
  shell(`<div class="phase" id="ph"></div><div class="cd" id="pcd"></div><div class="dim" id="pnow"></div>
    <div id="pq"></div><div class="sec" id="psum"></div><div class="sqs" id="psq"></div>
    <button class="btn" id="poff" style="margin-top:14px"></button><div class="sec">ПО ДНЯМ</div><div id="phist"></div>`);
  document.getElementById("poff").onclick = () => {
    S.pomoOff = S.pomoOff || {}; S.pomoOff[today()] = !S.pomoOff[today()]; save(); renderPomo();
  };
  pQKey = null; pomoEnsure(); paintPomo(); paintPomoLists();
}
function paintPomo() {
  const ph = document.getElementById("ph"); if (!ph) return;
  const p = pomoPhase(), day = today();
  ph.textContent = (S.pomoOff || {})[day] ? "⏸ СЕГОДНЯ БЕЗ ПОМИДОРОК" : p.ph === "work" ? "🍅 РАБОТА" : p.ph === "rest" ? "☕ ОТДЫХ" : "⏸ ДО СЛЕДУЮЩЕЙ";
  document.getElementById("pcd").textContent = p.left == null ? "—" : fmt(p.left);
  let t = "";
  if (p.ph === "work") t = "СЕЙЧАС: " + (pomoTitle(day, p.s) || "НЕ ЗАПЛАНИРОВАНО ❌");
  else if (p.s != null) { const nx = p.ph === "rest" ? p.s + 30 : p.s; t = m2hm(nx) + " · " + (pomoTitle(day, nx) || "НЕ ЗАПЛАНИРОВАНО ❌"); }
  document.getElementById("pnow").textContent = t;
}
function paintPomoLists() {
  const pq = document.getElementById("pq"); if (!pq) return;
  const day = today(), slots = pomoSlots(day), pend = pomoPending(), logs = pomoLogs(day);
  const didN = pend.filter(l => l.status === "no").length;
  pq.innerHTML = pend.map(pendHTML).join("") + (didN >= 2 ? `<button class="btn" id="pskip">⏭ ПРОПУСТИТЬ ВСЕ «ЧТО ДЕЛАЛ»</button>` : "");
  bindPend(pq, () => { pQKey = null; paintPomoLists(); });
  const sk = document.getElementById("pskip");
  if (sk) sk.onclick = () => { pend.filter(l => l.status === "no").forEach(l => l.did = ""); save(); paintPomoLists(); };
  const st = s => (logs.find(l => l.slot === s) || {}).status;
  const y = slots.filter(s => st(s) === "yes").length, n = slots.filter(s => st(s) === "no").length;
  document.getElementById("psum").textContent = `СЕГОДНЯ ✅ ${y} · ❌ ${n} · ВСЕГО ${slots.length}`;
  const cur = pomoPhase().s, nm = nowMin();
  document.getElementById("psq").innerHTML = slots.map(s => {
    const l = logs.find(x => x.slot === s), cls = l ? (l.status === "yes" ? "y" : l.status === "no" ? "n" : "p") : (s === cur ? "c" : "");
    return `<div class="sq ${cls}">${m2hm(s)}<b>${l ? (l.status === "yes" ? "✅" : l.status === "no" ? "❌" : "•") : "·"}</b></div>`;
  }).join("") || `<div class="dim">СЛОТОВ НЕТ</div>`;
  const hist = [];
  for (let k = 0; k < 7; k++) {
    const d = addDays(day, -k), ls = pomoLogs(d), a = ls.filter(l => l.status === "yes").length, b = ls.filter(l => l.status === "no").length;
    if (ls.length) hist.push(`<div class="dim" style="text-align:left">${d.slice(8)}.${d.slice(5, 7)} · ✅ ${a} · ❌ ${b}</div>`);
  }
  document.getElementById("phist").innerHTML = hist.join("") || `<div class="dim">ПОКА ПУСТО</div>`;
}
function pomoTick() {
  pomoEnsure();
  const p = pomoPhase(), key = p.ph + ":" + p.s;
  if (pLastKey !== null && key !== pLastKey && !document.hidden && p.ph !== "idle") beep(p.ph === "rest" ? 2 : 1);
  pLastKey = key;
  if (screen === "pomo") {
    paintPomo();
    const q = pomoPending().map(l => l.id + l.status + (l.did === undefined ? "u" : "d")).join(",") + ":" + pomoSlots(today()).length;
    if (q !== pQKey) { pQKey = q; if (!document.querySelector(".sheet")) paintPomoLists(); else pQKey = null; }
  }
  if (screen === "plan") { const nl = document.getElementById("nowl"); if (nl) nl.style.top = nowMin() / 60 * PHH + "px"; }
  pomoPopup();
}
