"use strict";
// ================================================================== ПЛАНИРОВЩИК (как Google Календарь, но внутри приложения)
const PCOL = ["#2f8f5b", "#d17a2a", "#c04a47", "#4a78d6", "#b59a2e", "#8a5cc2", "#6b6b6b"];
const PHH = 52;                                   // высота часа, px
const WD = ["ВС", "ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ"];
const MON = ["ЯНВАРЬ", "ФЕВРАЛЬ", "МАРТ", "АПРЕЛЬ", "МАЙ", "ИЮНЬ", "ИЮЛЬ", "АВГУСТ", "СЕНТЯБРЬ", "ОКТЯБРЬ", "НОЯБРЬ", "ДЕКАБРЬ"];
let pv = "3", pday = today(), pScroll = null;     // вид: "1" | "3" | "7" | "m"

const hm2m = s => { const m = String(s || "").match(/^(\d{1,2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : null; };
const m2hm = m => pad(Math.floor(m / 60) % 24) + ":" + pad(m % 60);
const dObj = day => new Date(day + "T00:00:00");
const addDays = (day, n) => { const d = dObj(day); d.setDate(d.getDate() + n); return isoDay(d); };
const nowMin = () => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); };
const planOf = day => T("plan").filter(e => e.day === day);

function planDays() {
  if (pv === "1") return [pday];
  if (pv === "3") return [0, 1, 2].map(k => addDays(pday, k));
  const ws = addDays(pday, -((dObj(pday).getDay() + 6) % 7));
  return [0, 1, 2, 3, 4, 5, 6].map(k => addDays(ws, k));
}
function layout(evs) {                            // раскладка пересекающихся дел по колонкам
  const s = evs.slice().sort((a, b) => a.from - b.from || b.to - a.to), out = [];
  let cl = [], end = -1;
  const flush = () => {
    const ends = [];
    const part = cl.map(e => { let l = ends.findIndex(x => x <= e.from); if (l < 0) { l = ends.length; ends.push(e.to); } else ends[l] = e.to; return {e, l}; });
    part.forEach(p => { p.n = ends.length; out.push(p); }); cl = [];
  };
  s.forEach(e => { if (cl.length && e.from >= end) { flush(); end = -1; } cl.push(e); end = Math.max(end, e.to); });
  if (cl.length) flush();
  return out;
}

function renderPlan() {
  const month = pv === "m", days = month ? [] : planDays(), d0 = dObj(month ? pday : days[0]);
  const head = `<div class="phead"><button id="pp">‹</button><div class="pt">${MON[d0.getMonth()]} ${d0.getFullYear()}</div><button id="pt0">●</button><button id="pn">›</button></div>
    <div class="pviews">${[["1", "1"], ["3", "3"], ["7", "7"], ["m", "М"]].map(v => `<button data-v="${v[0]}" class="${pv === v[0] ? "on" : ""}">${v[1]}</button>`).join("")}</div>`;
  let body;
  if (month) {
    const first = dObj(pday); first.setDate(1);
    const start = addDays(isoDay(first), -((first.getDay() + 6) % 7)), cells = [];
    for (let k = 0; k < 42; k++) {
      const day = addDays(start, k), ev = planOf(day), out = dObj(day).getMonth() !== first.getMonth();
      cells.push(`<button class="mc${out ? " out" : ""}${day === today() ? " td" : ""}" data-d="${day}">${+day.slice(8)}<br>${ev.slice(0, 4).map(e => `<i style="background:${e.color}"></i>`).join("")}</button>`);
    }
    body = `<div class="pgrid"><div class="pmon">${["ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ", "ВС"].map(w => `<div class="wd">${w}</div>`).join("")}${cells.join("")}</div></div>`;
  } else {
    const n = days.length, big = n <= 3;
    const dh = `<div class="pdays">${days.map(d => `<div class="${d === today() ? "td" : ""}" data-d="${d}">${WD[dObj(d).getDay()]}<br><b>${+d.slice(8)}</b></div>`).join("")}</div>`;
    const hours = Array.from({length: 24}, (_, h) => h ? `<span style="top:${h * PHH}px">${pad(h)}:00</span>` : "").join("");
    const cols = days.map(d => {
      const evs = layout(planOf(d)).map(p => {
        const e = p.e, h = Math.max(16, (e.to - e.from) / 60 * PHH - 1);
        return `<div class="ev" data-id="${e.id}" style="top:${e.from / 60 * PHH}px;height:${h}px;left:calc(${p.l / p.n * 100}% + 1px);width:calc(${100 / p.n}% - 2px);background:${e.color};${big ? "font-size:14px" : ""}">${e.nopomo ? "⛔ " : ""}${esc(e.title)}${big && h > 40 ? `<br><small>${m2hm(e.from)}–${m2hm(e.to)}</small>` : ""}</div>`;
      }).join("");
      const now = d === today() ? `<div class="nowl" id="nowl" style="top:${nowMin() / 60 * PHH}px"></div>` : "";
      return `<div class="pcol" data-d="${d}" style="background-size:100% ${PHH}px">${evs}${now}</div>`;
    }).join("");
    body = dh + `<div class="pgrid" id="pg"><div class="pin" style="height:${24 * PHH}px"><div class="gut">${hours}</div><div class="pcols" style="grid-template-columns:repeat(${n},1fr)">${cols}</div></div></div>`;
  }
  shell(head + body);
  document.getElementById("body").classList.add("flexy");
  const step = k => {
    if (month) { const d = dObj(pday); d.setDate(1); d.setMonth(d.getMonth() + k); pday = isoDay(d); }
    else pday = addDays(pday, k * (pv === "m" ? 0 : +pv));
    pScroll = pScroll; renderPlan();
  };
  document.getElementById("pp").onclick = () => step(-1);
  document.getElementById("pn").onclick = () => step(1);
  document.getElementById("pt0").onclick = () => { pday = today(); pScroll = null; renderPlan(); };
  document.querySelectorAll(".pviews button").forEach(b => b.onclick = () => { pv = b.dataset.v; renderPlan(); });
  document.querySelectorAll(".mc").forEach(b => b.onclick = () => { pday = b.dataset.d; pv = "1"; renderPlan(); });
  document.querySelectorAll(".pdays [data-d]").forEach(b => b.onclick = () => { pday = b.dataset.d; pv = "1"; renderPlan(); });
  const pg = document.getElementById("pg");
  if (pg) {
    pg.scrollTop = pScroll != null ? pScroll : Math.max(0, ((days.includes(today()) ? nowMin() / 60 : 6) - 1.5) * PHH);
    pg.onscroll = () => { pScroll = pg.scrollTop; };
    pg.onclick = e => {
      const ev = e.target.closest(".ev");
      if (ev) return openEv(+ev.dataset.id);
      const col = e.target.closest(".pcol");
      if (!col) return;
      const y = e.clientY - col.getBoundingClientRect().top;
      openEv(null, col.dataset.d, Math.max(0, Math.min(1410, Math.floor(y / PHH * 2) * 30)));
    };
  }
}

// ---------------------------------------------------------------- карточка дела
function openEv(id, day, from) {
  const e = id ? T("plan").find(x => x.id === id) : {day, from, to: Math.min(1440, from + 30), title: "", color: PCOL[0], nopomo: false};
  if (!e) return;
  const w = document.createElement("div"); w.className = "sheet"; w.id = "evs";
  w.innerHTML = `<div>
    <input id="et" placeholder="ЧТО ДЕЛАЮ" value="${esc(e.title)}">
    <input type="date" id="ed" value="${e.day}" style="margin-top:8px">
    <div class="r2"><input type="time" id="ef" value="${m2hm(e.from)}"><input type="time" id="eto" value="${e.to >= 1440 ? "23:59" : m2hm(e.to)}"></div>
    <div class="chips">${[25, 30, 60, 120].map(n => `<button data-q="${n}">${n < 60 ? n + "М" : n / 60 + "Ч"}</button>`).join("")}</div>
    <div class="chips" id="ecol">${PCOL.map(c => `<button data-c="${c}" style="background:${c}"></button>`).join("")}</div>
    <button class="btn" id="enp" style="margin:8px 0 0"></button>
    <div class="acts">${id ? '<button id="edel">🗑</button>' : ""}<button id="ecl">✕</button><button id="eok">✅</button></div></div>`;
  document.body.appendChild(w);
  const g = i => document.getElementById(i);
  let color = e.color, np = !!e.nopomo;
  const paint = () => {
    g("enp").textContent = np ? "⛔ БЕЗ ПОМИДОРОК (РАБОТА, СОН, ДОРОГА)" : "🍅 ПОМИДОРКИ ЕСТЬ";
    w.querySelectorAll("[data-c]").forEach(b => b.textContent = b.dataset.c === color ? "●" : "");
  };
  paint();
  w.onclick = ev => { if (ev.target === w) w.remove(); };
  g("ecl").onclick = () => w.remove();
  g("enp").onclick = () => { np = !np; paint(); };
  w.querySelectorAll("[data-c]").forEach(b => b.onclick = () => { color = b.dataset.c; paint(); });
  w.querySelectorAll("[data-q]").forEach(b => b.onclick = () => {
    const f = hm2m(g("ef").value); if (f == null) return;
    const t = Math.min(1439, f + +b.dataset.q); g("eto").value = m2hm(t);
  });
  if (id) g("edel").onclick = () => { if (confirm("УДАЛИТЬ?")) { S.db.plan = T("plan").filter(x => x.id !== id); save(); w.remove(); renderPlan(); } };
  g("eok").onclick = () => {
    const title = g("et").value.trim();
    if (!title) { g("et").focus(); return; }
    const f = hm2m(g("ef").value); if (f == null) return;
    let t = hm2m(g("eto").value);
    if (t === 0) t = 1440; else if (t == null || t <= f) t = Math.min(1440, f + 30);
    e.title = title; e.from = f; e.to = t; e.color = color; e.nopomo = np; e.day = g("ed").value || e.day;
    if (!id) { e.id = nextId("plan"); T("plan").push(e); }
    pday = e.day; save(); w.remove(); renderPlan();
  };
}
