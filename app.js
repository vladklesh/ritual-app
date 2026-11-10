"use strict";
// ================================================================== ХРАНИЛИЩЕ
const LS = "ritual.v2";
const YES = "✅", NO = "❌";
let S = load();
function load() {
  try {
    const d = JSON.parse(localStorage.getItem(LS) || "null");
    if (d && d.db) return d;
  } catch (e) {}
  let runs = [];
  try { const o = JSON.parse(localStorage.getItem("ritual.v1") || "null"); if (o && o.runs) runs = o.runs; } catch (e) {}
  return {db: {}, runs, run: null, lastExport: null, timers: {}, last: null, seeded: false};
}
function save() { try { localStorage.setItem(LS, JSON.stringify(S)); } catch (e) {} }
try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {}
const T = n => (S.db[n] = S.db[n] || []);

// ================================================================== УТИЛИТЫ
const $app = document.getElementById("app");
const pad = n => String(n).padStart(2, "0");
const isoDay = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const today = () => isoDay(new Date());
const hmNow = () => { const n = new Date(); return pad(n.getHours()) + ":" + pad(n.getMinutes()); };
const fmt = s => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
const esc = t => String(t == null ? "" : t).replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));
const daysBetween = (a, b) => Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8)) -
  Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8))) / 864e5);
const nextId = t => T(t).reduce((m, r) => Math.max(m, r.id || 0), 0) + 1;
const parseDur = t => {
  t = String(t).trim().replace(",", ".");
  let m = t.match(/^(\d+):(\d{1,2})$/);
  if (m) return +m[1] * 60 + +m[2];
  m = t.match(/^(\d+(?:\.\d+)?)$/);
  return m ? Math.round(parseFloat(m[1]) * 60) : null;
};
let audioCtx = null, wake = null, screen = "day", tab = "day", timer = null;
function beep(n) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    for (let i = 0; i < (n || 1); i++) {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(audioCtx.destination);
      const t = audioCtx.currentTime + i * 0.28;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      o.start(t); o.stop(t + 0.25);
    }
  } catch (e) {}
  try { navigator.vibrate && navigator.vibrate(n === 3 ? [200, 100, 200, 100, 200] : 200); } catch (e) {}
}
async function lock(on) {
  try {
    if (on && "wakeLock" in navigator) wake = await navigator.wakeLock.request("screen");
    else if (wake) { await wake.release(); wake = null; }
  } catch (e) {}
}
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && S.run && !S.run.pausedAt) lock(true);
  tickAll();
});

// ================================================================== ТАБЛИЦЫ ПРИВЫЧЕК
const N_START = "СТАРТ", TRAINING = "Тренировка", MEAL = "Еда";
const SPECIAL = ["СТАРТ", "ВСТАЛ В", "ЗАПИШИ СОН", "ЗАВТРА РАБОТАЕТ?", "ЗАВТРА РАБОТАЮ?", "ЛЕГ СПАТЬ В", "ТРАТЫ"];
const isAbstain = n => /воздерж/i.test(n);
const habits = () => T("habits");
function statusMap(day) {
  const m = {};
  T("habit_logs").forEach(r => { if (r.day === day) m[r.habit_id] = r.status; });
  return m;
}
function setStatus(hid, status, day) {
  day = day || today();
  const L = T("habit_logs"), r = L.find(x => x.habit_id === hid && x.day === day);
  if (r) r.status = status; else L.push({habit_id: hid, day, status});
  save();
}
function quitDays(h) { return h.since ? daysBetween(h.since, today()) : 0; }
function dayItems(day) {
  day = day || today();
  const st = statusMap(day), wd = (new Date(day + "T12:00:00").getDay() + 6) % 7;
  const act = habits().filter(h => h.active !== 0 && (!h.on_date || h.on_date === day));
  const by = k => act.filter(h => h.kind === k);
  const sortRemind = (a, b) => ((a.remind ? 0 : 1) - (b.remind ? 0 : 1)) || String(a.remind || "").localeCompare(b.remind || "") || a.id - b.id;
  const mk = (h, at) => ({id: h.id, kind: h.kind, name: h.name, at, minutes: h.minutes || 0, status: st[h.id] || null, h});
  const items = [];
  by("morning").filter(h => !(wd === 6 && h.name === TRAINING))
    .sort((a, b) => (a.seq || 0) - (b.seq || 0) || a.id - b.id).forEach(h => items.push(mk(h, "00:00")));
  by("daily").sort(sortRemind).forEach(h => items.push(mk(h, h.remind || "00:00")));
  by("evening").sort(sortRemind).forEach(h => items.push(mk(h, h.remind || "00:00")));
  T("weight_flags").filter(f => f.day === day).forEach(f => items.push({typ: "w", id: f.id, kind: "wflag", name: f.exercise,
    at: "19:00", minutes: 0, status: f.status || null}));
  by("quit").sort((a, b) => a.id - b.id).forEach(h => items.push(Object.assign(mk(h, "00:00"), {days: quitDays(h)})));
  by("night").sort((a, b) => a.id - b.id).forEach(h => items.push(mk(h, "00:00")));
  return items;
}
function itemLabel(it) {
  if (it.typ === "w") return "ДОБАВИТЬ ВЕС: " + it.name.toUpperCase() + " (СЕЙЧАС " + (getKg(it.name, null) ?? 0) + " КГ)\nНАПИШИ, СКОЛЬКО КГ ДОБАВИЛ";
  if (it.kind === "quit") {
    const kc = isAbstain(it.name) ? T("abstain_log").filter(a => a.habit_id === it.id && a.kind === "sex").length : 0;
    return it.name + " · " + it.days + " ДН." + (kc ? " · 💋" + kc : "");
  }
  if (it.name === N_START) return "☀ НАЧАТЬ ДЕНЬ";
  return it.name;
}
function itemButtons(it) {
  if (it.kind === "quit" && isAbstain(it.name)) return [["y", YES], ["s", "💋"], ["n", NO]];
  if (it.kind === "quit" || SPECIAL.includes(it.name)) return [["y", YES], ["n", NO]];
  return [["y", YES], ["m", /прайминг/i.test(it.name) ? "🎧📴" : "⚡"], ["n", NO]];
}
function answer(it, a) {
  const day = today();
  if (it.typ === "w") { const f = T("weight_flags").find(x => x.id === it.id); if (f) f.status = "no"; save(); return false; }
  if (it.kind === "quit") {
    if (a === "y") setStatus(it.id, "yes");
    else {                                    // срыв: счётчик в ноль, рекорд сохраняется
      T("quit_log").push({habit_id: it.id, day, streak: quitDays(it.h)});
      it.h.since = day; setStatus(it.id, "no");
      if (isAbstain(it.name)) T("abstain_log").push({id: nextId("abstain_log"), habit_id: it.id, day, kind: a === "s" ? "sex" : "slip", at: null});
    }
    save(); return false;
  }
  if (a === "m") {
    setStatus(it.id, "yes");
    T("min_log").push({habit_id: it.id, day});
    dropSkip(it.id, day); save(); return false;
  }
  setStatus(it.id, a === "y" ? "yes" : "no");
  if (a === "y") { dropSkip(it.id, day); }
  save();
  return a === "n" && !SPECIAL.includes(it.name);   // true = спросить причину
}
function dropSkip(hid, day) { S.db.skip_log = T("skip_log").filter(r => !(r.habit_id === hid && r.day === day)); }
const REASONS = [
  ["t", "😴", "НЕТ СИЛ", "ТЕЛО НЕ ВОССТАНАВЛИВАЕТСЯ: поздние смены + физическая работа. Нужен ресурс, а не воля: в такие дни ⚡, полный объём — в выходной."],
  ["v", "⏱", "НЕ УСПЕЛ", "ПРОБЛЕМА РАСПИСАНИЯ: привычка не привязана к якорю. Привяжи к тому, что и так делаешь, и дай ей время."],
  ["s", "🌫", "НЕТ СМЫСЛА", "СВЯЗЬ С ЦЕЛЬЮ ПОТЕРЯНА: пункт стал обязанностью. Оставь 3 главных на сегодня, остальное убери."],
  ["f", "🧠", "ЗАБЫЛ", "НЕТ СИГНАЛА: нужны время и якорь, а не сила воли."],
  ["b", "🧱", "СЛИШКОМ БОЛЬШОЕ", "ВСЁ ИЛИ НИЧЕГО: если нельзя идеально, мозг выбирает ноль. ⚡ минимум решает именно это."],
  ["a", "🌀", "ПЕРЕГРУЗ", "СЛИШКОМ МНОГО РЕШЕНИЙ: ❌ — самый дешёвый ответ при усталости. Урежь список на день."]
];
function askReason(it) {
  const day = today();
  T("skip_log").push({habit_id: it.id, day, reason: null}); save();
  const sh = document.createElement("div");
  sh.className = "sheet";
  sh.innerHTML = `<div><div class="title" style="padding:4px 0">ПОЧЕМУ ❌?</div>
    <div class="reasons">${REASONS.map(r => `<button data-r="${r[0]}">${r[1]}<small>${r[2]}</small></button>`).join("")}
    <button data-r="m">⚡<small>ТОГДА МИНИМУМ</small></button><button data-r="-">·<small>ПРОПУСТИТЬ</small></button></div></div>`;
  sh.querySelectorAll("button").forEach(b => b.onclick = () => {
    const r = b.dataset.r;
    if (r === "m") { answer(it, "m"); S.db.skip_log = T("skip_log").filter(x => !(x.habit_id === it.id && x.day === day)); }
    else if (r !== "-") { const row = T("skip_log").find(x => x.habit_id === it.id && x.day === day); if (row) row.reason = r; }
    save(); sh.remove(); render();
  });
  document.body.appendChild(sh);
}

// ================================================================== УТРО-РИТУАЛ (по часам)
function morningSteps() {
  return dayItems().filter(i => i.kind === "morning" && i.name !== N_START && !i.status)
    .map(i => ({id: i.id, name: i.name, n: i.name.replace(/^Подъём: /, "").replace(/\s*\n\s*/g, " ").slice(0, 40),
      s: (i.minutes || (i.name === TRAINING ? 20 : 1)) * 60, note: ""}));
}
function cum(steps) { let t = 0; return steps.map(s => (t += s.s, t - s.s)); }
function total(steps) { return steps.reduce((a, s) => a + s.s, 0); }
function elapsed(r) { return ((r.pausedAt || Date.now()) - r.startedAt - r.pausedTotal) / 1000; }
function posOf(r) {
  const c = cum(r.steps), el = elapsed(r);
  if (el >= total(r.steps)) return {idx: r.steps.length, el, c};
  let i = 0;
  while (i + 1 < c.length && c[i + 1] <= el) i++;
  return {idx: i, el, c};
}
function startRun() {
  const steps = morningSteps();
  if (!steps.length) return;
  S.run = {id: Date.now(), startedAt: Date.now(), pausedAt: null, pausedTotal: 0, steps, marks: {}, seen: 0};
  save(); try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
  lock(true); screen = "run"; render(); beep(1);
}
function commit(r, i) {                       // шаг пройден → привычка отмечена ✅
  const st = statusMap(today())[r.steps[i].id];
  if (!st) setStatus(r.steps[i].id, "yes");
}
function markUpTo(r, idx, how) {
  for (let i = r.seen; i < idx; i++) {
    if (!r.marks[i]) r.marks[i] = {how, act: how === "auto" ? r.steps[i].s : null};
    commit(r, i);
  }
  r.seen = Math.max(r.seen, idx);
}
function tickRun() {
  const r = S.run;
  if (!r || screen !== "run") return;
  const p = posOf(r);
  if (p.idx < r.steps.length && r.steps[p.idx].name === TRAINING && !r.pausedAt && !S.train) {
    markUpTo(r, p.idx, "auto");                // всё до тренировки пройдено; ритуал ждёт
    r.pausedAt = Date.now(); r.waitTrain = p.idx; save();
    startTraining(false, "run"); return;
  }
  if (p.idx > r.seen) {
    markUpTo(r, p.idx, "auto"); save();
    if (p.idx >= r.steps.length) { finishRun(true); return; }
    if (document.visibilityState === "visible") beep(1);
  }
  paintRun(p);
}
function jump(r, sec) { r.startedAt = (r.pausedAt || Date.now()) - r.pausedTotal - sec * 1000; }
function next() {
  const r = S.run; if (!r) return;
  const p = posOf(r);
  if (p.idx >= r.steps.length) return;
  r.marks[p.idx] = {how: "next", act: Math.round(p.el - p.c[p.idx])};
  commit(r, p.idx);
  r.seen = Math.max(r.seen, p.idx + 1);
  if (p.idx + 1 >= r.steps.length) { finishRun(true); return; }
  jump(r, p.c[p.idx + 1]); save(); tickRun();
}
function prev() {
  const r = S.run; if (!r) return;
  const p = posOf(r), into = p.el - p.c[p.idx];
  const to = (into > 3 || p.idx === 0) ? p.idx : p.idx - 1;
  delete r.marks[to]; r.seen = Math.min(r.seen, to);
  jump(r, p.c[to]); save(); tickRun();
}
function togglePause() {
  const r = S.run; if (!r) return;
  if (r.pausedAt) { r.pausedTotal += Date.now() - r.pausedAt; r.pausedAt = null; lock(true); }
  else { r.pausedAt = Date.now(); lock(false); }
  save(); tickRun();
}
function finishRun(full) {
  const r = S.run; if (!r) return;
  const d = new Date(r.startedAt);
  const rec = {id: r.id, day: isoDay(d), start: pad(d.getHours()) + ":" + pad(d.getMinutes()), routine: "УТРО",
    full: !!full, planned: total(r.steps),
    steps: r.steps.map((s, i) => ({n: s.n, plan: s.s, how: (r.marks[i] || {}).how || "none", act: (r.marks[i] || {}).act}))};
  S.runs.push(rec); S.run = null; S.last = rec; save(); lock(false);
  if (full) beep(3);
  screen = "day"; tab = "day"; render();
}
function renderRun() {
  $app.innerHTML = `<button class="x" id="x">✕</button>
    <div class="big clock" id="clk">0:00</div><div class="list" id="lst"></div>
    <div class="foot"><button class="ic" id="pv">⏮</button><div class="big cnt" id="cn">1/1</div><button class="ic" id="nx">⏭</button></div>`;
  document.getElementById("pv").onclick = prev;
  document.getElementById("nx").onclick = next;
  document.getElementById("clk").onclick = togglePause;
  document.getElementById("x").onclick = () => { if (confirm("ЗАКОНЧИТЬ РАНЬШЕ?")) finishRun(false); };
  tickRun();
}
function paintRun(p) {
  const r = S.run, clk = document.getElementById("clk");
  if (!r || !clk) return;
  const idx = Math.min(p.idx, r.steps.length - 1), st = r.steps[idx];
  clk.textContent = fmt(p.c[idx] + st.s - p.el);
  clk.classList.toggle("paused", !!r.pausedAt);
  document.getElementById("cn").textContent = (idx + 1) + "/" + r.steps.length;
  document.getElementById("lst").innerHTML = r.steps.slice(idx).map((s, k) =>
    `<div class="row${k === 0 ? " cur" : ""}">${idx + k + 1}. ${esc(s.n)}: ${fmt(s.s)}${s.note ? " • " + esc(s.note) : ""}</div>`).join("");
}

// ================================================================== ЭКРАНЫ
const TABS = [["day", "DAY"], ["fail", "❗"], ["tasks", "🧳"], ["work", "🤵‍♂️"], ["set", "⚙"]];
function shell(inner) {
  $app.innerHTML = `<div class="scroll" id="body">${inner}</div><div class="tabs">` +
    TABS.map(t => `<button data-t="${t[0]}" class="${tab === t[0] ? "on" : ""}" style="${t[1] === "DAY" ? "font-size:16px;font-weight:700" : ""}">${t[1]}</button>`).join("") + `</div>`;
  $app.querySelectorAll(".tabs button").forEach(b => b.onclick = () => { tab = b.dataset.t; screen = tab; render(); });
}
function render() {
  clearInterval(timer);
  if (screen === "run" && S.run) { renderRun(); timer = setInterval(tickAll, 250); return; }
  if (screen === "train" && S.train) { renderTrain(); timer = setInterval(tickTrain, 250); return; }
  if (screen === "tstats") return renderTStats();
  if (screen === "tday") return renderTDay();
  if (screen === "edit") return renderEdit();
  if (screen === "why") return renderWhy();
  if (!S.seeded && !habits().length) return renderEmpty();
  if (tab === "day") renderDay();
  else if (tab === "fail") renderFail();
  else if (tab === "set") renderSet();
  else shell(`<div class="title">СКОРО</div><div class="dim">ЭТОТ РАЗДЕЛ ПЕРЕНОСИТСЯ СЛЕДУЮЩИМ ЭТАПОМ.<br>ПОКА ОН В БОТЕ.</div>`);
  timer = setInterval(tickAll, 1000);
}
function tickAll() {
  if (screen === "run") return tickRun();
  if (screen === "train") return tickTrain();
  const cd = document.getElementById("cd");
  if (cd) paintCountdown(cd);
}
function renderEmpty() {
  shell(`<div class="title">ПУСТО</div><div class="dim">В БОТЕ: ⚙ → 📱 ВЫГРУЗИТЬ В ПРИЛОЖЕНИЕ, ПОТОМ ЗДЕСЬ ⚙ → ЗАГРУЗИТЬ ИЗ БОТА</div>
    <button class="btn" id="imp">ЗАГРУЗИТЬ ИЗ БОТА</button><input type="file" id="file" accept=".json,application/json" hidden>`);
  document.getElementById("imp").onclick = () => document.getElementById("file").click();
  document.getElementById("file").onchange = importSeed;
}
let cdItem = null;
function renderDay() {
  const items = dayItems(), pend = items.filter(i => !i.status), first = pend[0];
  let body;
  cdItem = null;
  const doneN = items.filter(i => i.status).length;
  const head = `<div class="dim">${today().slice(8)}.${today().slice(5, 7)} · ${doneN}/${items.length}</div>`;
  if (!first) body = `${head}<div class="item">ВСЁ ВЫПОЛНЕНО ✅</div>`;
  else if (first.at > hmNow()) body = `${head}<div class="item">⏭️ ${first.at}</div>`;
  else {
    const mins = first.minutes && first.name !== TRAINING ? " · " + first.minutes + " МИН" : "";
    cdItem = first.minutes && first.name !== TRAINING ? first : null;
    const btns = (first.typ === "w" ? [["n", NO]] : itemButtons(first)).map(b => `<button data-a="${b[0]}">${b[1]}</button>`).join("");
    const winput = first.typ === "w" ? `<div class="acts"><input id="wkg" inputmode="decimal" placeholder="КГ" style="font-size:28px;text-align:center"><button id="wok">✅</button></div>` : "";
    const mornPending = pend.some(i => i.kind === "morning" && i.name !== N_START);
    body = `${head}<div class="item">▶ ${esc(itemLabel(first))}${mins}</div>
      ${cdItem ? '<div class="cd" id="cd"></div>' : ""}${winput}<div class="acts">${btns}</div>
      ${mornPending && first.kind === "morning" ? '<button class="btn go" id="run" style="font-size:26px;padding:18px">▶ УТРО</button>' : ""}`;
  }
  shell(body);
  document.querySelectorAll(".acts button").forEach(b => b.onclick = () => {
    if (first.name === TRAINING && first.typ !== "w" && b.dataset.a !== "n") { startTraining(b.dataset.a === "m"); return; }
    const ask = answer(first, b.dataset.a);
    if (ask) askReason(first); else render();
  });
  const wi = document.getElementById("wkg");
  if (wi) document.getElementById("wok").onclick = () => addWeight(first, wi.value);
  const run = document.getElementById("run");
  if (run) run.onclick = () => { if (S.run) { screen = "run"; render(); } else startRun(); };
  if (cdItem) { const k = cdItem.id + ":" + today(); if (!S.timers[k]) { S.timers[k] = Date.now(); save(); } paintCountdown(document.getElementById("cd")); }
}
function paintCountdown(el) {
  if (!cdItem || !el) return;
  const k = cdItem.id + ":" + today(), left = cdItem.minutes * 60 - (Date.now() - (S.timers[k] || Date.now())) / 1000;
  el.textContent = left > 0 ? fmt(left) : "⏰ ВРЕМЯ ВЫШЛО";
  if (left <= 0 && !S.timers[k + ":b"]) { S.timers[k + ":b"] = 1; save(); beep(2); }
}
function failedItems() {
  const day = today(), st = statusMap(day);
  return habits().filter(h => h.active !== 0 && (!h.on_date || h.on_date === day) && st[h.id] === "no" &&
    (h.kind === "quit" || (!SPECIAL.includes(h.name) && h.name !== TRAINING)));
}
function renderFail() {
  const f = failedItems();
  const rows = f.map(h => `<button class="btn" data-h="${h.id}">${YES} ${esc(h.name.slice(0, 40))}</button>`).join("");
  shell(f.length ? `<div class="title">ПРОВАЛЕННЫЕ СЕГОДНЯ: ${f.length}</div><div class="dim">НАЖМИ ${YES}, ЕСЛИ СДЕЛАЛ</div>${rows}`
    : `<div class="item">ПРОВАЛОВ НЕТ ✅</div>`);
  document.querySelectorAll("[data-h]").forEach(b => b.onclick = () => {
    const h = habits().find(x => x.id === +b.dataset.h), day = today();
    if (h.kind === "quit") {                  // отказ нажат ❌ по ошибке: вернуть счётчик
      const q = T("quit_log").filter(r => r.habit_id === h.id && r.day === day).pop();
      if (q) { const d = new Date(); d.setDate(d.getDate() - q.streak); h.since = isoDay(d); S.db.quit_log = T("quit_log").filter(r => r !== q); }
      S.db.abstain_log = T("abstain_log").filter(a => !(a.habit_id === h.id && a.day === day));
    }
    setStatus(h.id, "yes"); dropSkip(h.id, day); save(); render();
  });
}
function renderSet() {
  const unsynced = S.runs.filter(r => !r.synced).length;
  const due = !S.lastExport || (Date.now() - S.lastExport) > 7 * 864e5;
  shell(`<div class="title">⚙</div>
    ${due ? `<div class="warn">⬆ ПОРА ВЫГРУЗИТЬ ДАННЫЕ В БОТ</div>` : ""}
    <button class="btn" data-go="edit">♾️ ПРИВЫЧКИ</button>
    <button class="btn" data-go="tstats">📊💪 ТРЕНИРОВКИ</button>
    <button class="btn" data-go="why">🧠 ПРИЧИНЫ ПРОПУСКОВ</button>
    <button class="btn" id="ics">🔔 УВЕДОМЛЕНИЯ В КАЛЕНДАРЬ</button>
    <button class="btn" id="ex">⬆ ВЫГРУЗИТЬ${unsynced ? " · " + unsynced : ""}</button>
    <button class="btn" id="imp">⬇ ЗАГРУЗИТЬ ИЗ БОТА</button><input type="file" id="file" accept=".json,application/json" hidden>
    <div class="dim">ДАННЫЕ ХРАНЯТСЯ НА ТЕЛЕФОНЕ. БЕЗ ИНТЕРНЕТА ВСЁ РАБОТАЕТ.</div>`);
  document.querySelectorAll("[data-go]").forEach(b => b.onclick = () => { screen = b.dataset.go; render(); });
  document.getElementById("ex").onclick = exportAll;
  document.getElementById("ics").onclick = exportIcs;
  document.getElementById("imp").onclick = () => document.getElementById("file").click();
  document.getElementById("file").onchange = importSeed;
}
// ---------------------------------------------------------------- причины
function renderWhy() {
  const since = new Date(); since.setDate(since.getDate() - 13); const s0 = isoDay(since);
  const hs = new Set(habits().filter(h => h.kind !== "quit").map(h => h.id));
  const logs = T("habit_logs").filter(l => l.day >= s0 && hs.has(l.habit_id));
  const mins = T("min_log").filter(m => m.day >= s0 && hs.has(m.habit_id)).length;
  const yes = logs.filter(l => l.status === "yes").length, no = logs.filter(l => l.status === "no").length;
  const sk = T("skip_log").filter(r => r.day >= s0), cnt = {};
  sk.forEach(r => cnt[r.reason || "_"] = (cnt[r.reason || "_"] || 0) + 1);
  const known = REASONS.filter(r => cnt[r[0]]).sort((a, b) => cnt[b[0]] - cnt[a[0]]);
  let h = `<div class="title">🧠 ПРИЧИНЫ · 14 ДНЕЙ</div><div class="card">✅ ${Math.max(yes - mins, 0)} · ⚡ ${mins} · ❌ ${no}</div>`;
  if (!sk.length) h += `<div class="dim">ДАННЫХ ПОКА НЕТ. НАЖИМАЙ ❌ И ВЫБИРАЙ ПРИЧИНУ.</div>`;
  else {
    h += known.map(r => `<div class="card">${r[1]} ${r[2]}: ${cnt[r[0]]}</div>`).join("");
    if (cnt._) h += `<div class="card">▫️ БЕЗ ПРИЧИНЫ: ${cnt._}</div>`;
    h += `<div class="sec">ГЛУБИННОЕ</div>` + known.slice(0, 2).map(r => `<div class="card">${r[3]}</div>`).join("");
    if (sk.length >= 5 && (cnt._ || 0) / sk.length >= 0.5) h += `<div class="card">❌ БЕЗ ПРИЧИНЫ — АВТОПИЛОТ. ПОПРОБУЙ ⚡ ВМЕСТО ❌.</div>`;
  }
  $app.innerHTML = `<div class="scroll">${h}</div><button class="btn" id="back">⬅</button>`;
  document.getElementById("back").onclick = () => { screen = "set"; tab = "set"; render(); };
}
// ---------------------------------------------------------------- редактор привычек
const KINDS = [["morning", "🌞 УТРО"], ["daily", "☀️ ДЕНЬ"], ["evening", "🌙 ВЕЧЕР"], ["quit", "🚫 ОТКАЗ"]];
function renderEdit() {
  let h = `<div class="title">♾️ ПРИВЫЧКИ</div>`;
  KINDS.forEach(([k, nm]) => {
    const rows = habits().filter(x => x.kind === k && x.active !== 0 && !SPECIAL.includes(x.name))
      .sort((a, b) => k === "morning" ? (a.seq || 0) - (b.seq || 0) : String(a.remind || "99").localeCompare(b.remind || "99") || a.id - b.id);
    h += `<div class="sec">${nm}</div>` + rows.map(x => `<div class="card edit" data-id="${x.id}">
      <input data-k="name" value="${esc(x.name)}">
      <input data-k="${k === "morning" ? "minutes" : k === "quit" ? "since" : "remind"}" style="width:92px" placeholder="${k === "morning" ? "МИН" : k === "quit" ? "ДНЕЙ" : "ЧЧ:ММ"}"
        value="${k === "morning" ? (x.minutes || "") : k === "quit" ? quitDays(x) : esc(x.remind || "")}">
      <div class="mini" style="grid-column:1/3">${k === "morning" ? '<button data-a="up">▲</button><button data-a="dn">▼</button>' : ""}<button data-a="rm">✕</button></div>
    </div>`).join("") + `<button class="btn" data-add="${k}">➕</button>`;
  });
  $app.innerHTML = `<div class="scroll">${h}</div><button class="btn" id="back">⬅</button>`;
  $app.querySelectorAll("input").forEach(inp => inp.onchange = () => {
    const x = habits().find(r => r.id === +inp.closest(".card").dataset.id), k = inp.dataset.k;
    if (k === "name") x.name = inp.value.trim() || x.name;
    else if (k === "minutes") x.minutes = Math.max(0, parseInt(inp.value, 10) || 0);
    else if (k === "since") { const d = new Date(); d.setDate(d.getDate() - (parseInt(inp.value, 10) || 0)); x.since = isoDay(d); }
    else x.remind = /^\d{1,2}:\d{2}$/.test(inp.value.trim()) ? inp.value.trim().replace(/^(\d):/, "0$1:") : null;
    save();
  });
  $app.querySelectorAll(".mini button").forEach(b => b.onclick = () => {
    const x = habits().find(r => r.id === +b.closest(".card").dataset.id), a = b.dataset.a;
    if (a === "rm") { if (confirm("УДАЛИТЬ?")) x.active = 0; }
    else {
      const arr = habits().filter(r => r.kind === "morning" && r.active !== 0).sort((p, q) => (p.seq || 0) - (q.seq || 0) || p.id - q.id);
      const i = arr.indexOf(x), j = a === "up" ? i - 1 : i + 1;
      if (j >= 0 && j < arr.length) { arr.forEach((r, n) => r.seq = n + 1); const t = arr[i].seq; arr[i].seq = arr[j].seq; arr[j].seq = t; }
    }
    save(); renderEdit();
  });
  $app.querySelectorAll("[data-add]").forEach(b => b.onclick = () => {
    const k = b.dataset.add, mx = habits().reduce((m, r) => Math.max(m, r.seq || 0), 0);
    habits().push({id: nextId("habits"), user_id: 0, name: "Новый пункт", kind: k, active: 1, remind: null,
      minutes: k === "morning" ? 5 : k === "daily" ? 5 : 0, seq: k === "morning" ? mx + 1 : 0,
      since: k === "quit" ? today() : null, created: today(), on_date: null, custom: 1});
    save(); renderEdit();
  });
  document.getElementById("back").onclick = () => { screen = "set"; tab = "set"; render(); };
}
// ================================================================== ОБМЕН С БОТОМ
function importSeed(ev) {
  const f = ev.target.files && ev.target.files[0];
  if (!f) return;
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const d = JSON.parse(rd.result);
      if (d.format !== "ritual-seed") throw new Error("формат");
      if (S.seeded && !confirm("ЗАМЕНИТЬ ДАННЫЕ В ПРИЛОЖЕНИИ ДАННЫМИ ИЗ БОТА?")) return;
      S.db = d.tables; S.seeded = true; S.timers = {}; save();
      alert("ЗАГРУЖЕНО: " + (S.db.habits || []).length + " ПРИВЫЧЕК");
      screen = "day"; tab = "day"; render();
    } catch (e) { alert("НЕ ТОТ ФАЙЛ. НУЖЕН seed_ritual.json ИЗ БОТА"); }
  };
  rd.readAsText(f);
}
async function exportAll() {
  const name = "ritual_" + today() + ".json";
  const payload = JSON.stringify({v: 2, exportedAt: new Date().toISOString(), runs: S.runs, tables: S.db});
  let sent = false;
  try {
    const file = new File([payload], name, {type: "application/json"});
    if (navigator.canShare && navigator.canShare({files: [file]})) { await navigator.share({files: [file], title: name}); sent = true; }
  } catch (e) { if (e && e.name === "AbortError") return; }
  if (!sent) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([payload], {type: "application/json"}));
    a.download = name; document.body.appendChild(a); a.click(); a.remove(); sent = true;
  }
  S.runs.forEach(r => r.synced = true); S.lastExport = Date.now(); save(); render();
}


// ================================================================== УВЕДОМЛЕНИЯ (календарь iPhone, работает без интернета)
function icsEscape(t) { return String(t).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, " "); }
function buildIcs(days) {
  const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Ritual//RU", "CALSCALE:GREGORIAN"];
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const add = (day, hm, title, mins) => {
    const d = day.replace(/-/g, ""), t0 = hm.replace(":", "") + "00";
    const e = new Date(day + "T" + hm + ":00"); e.setMinutes(e.getMinutes() + (mins || 5));
    const de = isoDay(e).replace(/-/g, "") + "T" + pad(e.getHours()) + pad(e.getMinutes()) + "00";
    L.push("BEGIN:VEVENT", "UID:ritual-" + d + t0 + "-" + Math.abs([...title].reduce((a, c) => a * 31 + c.charCodeAt(0) | 0, 7)) + "@ritual",
      "DTSTAMP:" + stamp, "DTSTART:" + d + "T" + t0, "DTEND:" + de, "SUMMARY:" + icsEscape(title),
      "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + icsEscape(title), "TRIGGER:PT0M", "END:VALARM", "END:VEVENT");
  };
  for (let k = 0; k < days; k++) {
    const d = new Date(); d.setDate(d.getDate() + k); const day = isoDay(d);
    dayItems(day).filter(i => (i.kind === "daily" || i.kind === "evening") && i.at && i.at !== "00:00" && !(k === 0 && i.status))
      .forEach(i => add(day, i.at, i.name, 5));
    if (typeof extraIcs === "function") extraIcs(day, add);   // смены, будильники и т. д. (следующие этапы)
  }
  L.push("END:VCALENDAR");
  return L.join("\r\n");
}
async function exportIcs() {
  const txt = buildIcs(7), name = "ritual_alarms.ics";
  try {
    const file = new File([txt], name, {type: "text/calendar"});
    if (navigator.canShare && navigator.canShare({files: [file]})) { await navigator.share({files: [file], title: name}); return; }
  } catch (e) { if (e && e.name === "AbortError") return; }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([txt], {type: "text/calendar"}));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
}
