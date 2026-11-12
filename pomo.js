"use strict";
// ================================================================== ТАЙМЕР 50/10 (внизу DAY)
// Старт дня = нажал ▶ утренний блок. Таймер начинается со следующего целого часа (старт 12:11 → с 13:00)
// и идёт по кругу до 24:00: 50 мин дело, 10 мин отдых (с 2027 — 25/5 по получасам). Без вопросов и без накопления.
const pcfg = day => day <= "2026-12-31" ? {len: 60, work: 50} : {len: 30, work: 25};
let pLastKey = null;

function pomoDayStart(day) {                      // минута старта дня или null
  if (S.run && isoDay(new Date(S.run.startedAt)) === day) { const d = new Date(S.run.startedAt); return d.getHours() * 60 + d.getMinutes(); }
  const r = S.runs.filter(x => x.day === day).pop();
  return r ? hm2m(r.start) : null;
}
function pomoFirst(day) {                         // первый слот: следующий целый час (или полчаса с 2027)
  const ds = pomoDayStart(day); if (ds == null) return null;
  const c = pcfg(day); return (Math.floor(ds / c.len) + 1) * c.len;
}
function pomoPhase() {
  const n = new Date(), day = today(), c = pcfg(day), sc = n.getHours() * 3600 + n.getMinutes() * 60 + n.getSeconds();
  const f = pomoFirst(day);
  if (f == null || (S.pomoOff || {})[day] || sc >= 86400 - 1) return {ph: "none"};
  if (sc < f * 60) return {ph: "wait", left: f * 60 - sc, s: f};
  const s = Math.floor(sc / 60 / c.len) * c.len, el = sc - s * 60;
  return el < c.work * 60 ? {ph: "work", left: c.work * 60 - el, s} : {ph: "rest", left: c.len * 60 - el, s};
}
function pomoTitle(day, s) {
  const t = planOf(day).filter(e => e.from <= s + 1 && e.to > s + 1 && !e.work).map(e => e.title);
  return t.length ? t.join(" + ") : "";
}
function pomoBar() {
  const day = today();
  if (pomoFirst(day) == null) return "";
  return `<div class="pbar" id="pbar"><span id="pph"></span><b id="pcd"></b><span id="pnow"></span></div>`;
}
function paintPomo() {
  const ph = document.getElementById("pph"); if (!ph) return;
  const bar = document.getElementById("pbar");
  if (bar && !bar.onclick) bar.onclick = () => {
    const off = !(S.pomoOff || {})[today()];
    if (!confirm(off ? "СЕГОДНЯ БЕЗ ТАЙМЕРА?" : "ВКЛЮЧИТЬ ТАЙМЕР?")) return;
    S.pomoOff = S.pomoOff || {}; S.pomoOff[today()] = off; save(); render();
  };
  const p = pomoPhase(), day = today(), nm = nowMin();
  const set = (a, b, c) => { ph.textContent = a; document.getElementById("pcd").textContent = b; document.getElementById("pnow").textContent = c; };
  if ((S.pomoOff || {})[day]) return set("⏸", "", "ТАЙМЕР ВЫКЛЮЧЕН");
  if (p.ph === "none") return set("🌙", "", "ДО ЗАВТРА");
  if (p.ph === "wait") return set("⏳", fmt(p.left), "СТАРТ В " + m2hm(p.s));
  set(p.ph === "work" ? "🍅" : "☕", fmt(p.left), pomoTitle(day, nm));
}
function pomoTick() {
  const p = pomoPhase(), key = p.ph + ":" + p.s;
  if (pLastKey !== null && key !== pLastKey && !document.hidden && (p.ph === "work" || p.ph === "rest")) beep(p.ph === "rest" ? 2 : 1);
  pLastKey = key;
  paintPomo();
  if (screen === "plan") { const nl = document.getElementById("nowl"); if (nl) nl.style.top = nowMin() / 60 * PHH + "px"; }
}
