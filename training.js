"use strict";
// ================================================================== ТРЕНИРОВКА (этап 2)
const PROGRAM = {
  0: [["Тяга рюкзака в наклоне двумя руками", 23, "12", 3], ["Сгибание на бицепс стоя", 23, "12", 3], ["Молотковые сгибания", 16, "12", 3]],
  1: [["Отжимания с рюкзаком на спине", 16, "12", 3], ["Отжимания «алмаз» с рюкзаком", 16, "12", 3], ["Отжимания уголком (ноги на стуле)", null, "10", 3]],
  2: [["Тяга рюкзака одной рукой (каждая рука)", 23, "12", 3], ["Сгибание обратным хватом", 16, "12", 3], ["Удержание рюкзака на 90°", 16, "20 сек", 3]],
  3: [["Приседание с рюкзаком у груди", 23, "15", 3], ["Румынская тяга", 46, "15", 3], ["Ягодичный мост с рюкзаком", 23, "15", 3]],
  4: [["Тяга в наклоне с паузой 1 сек", 23, "10", 3], ["Медленное сгибание (опускание 4 сек)", 16, "10", 3], ["Шраги с рюкзаком", 46, "20/20/15", 3]]
};
const CIRCUIT_KG = 16, CIRCUIT_ROUNDS = 3, REST = 40, CIRCUIT_REST = 60;
const CIRCUIT = [["Приседания", "15"], ["Отжимания", "10"], ["Тяга в наклоне", "15"], ["Сгибания на бицепс", "12"]];
const TEMPO_DEFAULT = "темп 3-0-1 (вниз 3 с, вверх 1 с)";
const TEMPO_NOTE = {
  "Удержание рюкзака на 90°": "держи дольше (+5 с)",
  "Тяга в наклоне с паузой 1 сек": "пауза 2 с вверху, вниз 3 с",
  "Медленное сгибание (опускание 4 сек)": "опускание 5 с",
  "Шраги с рюкзаком": "пауза 2 с вверху, вниз 3 с",
  "Ягодичный мост с рюкзаком": "пауза 2 с вверху, вниз 3 с"
};
function defaultKg(ex) {
  for (const k in PROGRAM) for (const e of PROGRAM[k]) if (e[0] === ex) return e[1];
  return null;
}
function getKg(ex, def) { const r = T("weights").find(w => w.exercise === ex); return r ? r.kg : def; }
function setKg(ex, kg) {
  const r = T("weights").find(w => w.exercise === ex);
  if (r) r.kg = kg; else T("weights").push({user_id: 0, exercise: ex, kg});
}
function parseReps(r) { const m = /^\s*(\d+)\s*(.*)$/.exec(r); return m ? [parseInt(m[1], 10), m[2].trim()] : [null, ""]; }
function buildSteps(wd, minimal) {
  if (wd === 6) return null;
  const steps = [];
  if (wd === 5) {
    const rounds = minimal ? 1 : CIRCUIT_ROUNDS;
    for (let r = 1; r <= rounds; r++) steps.push({type: "round", round: r, total: rounds, items: CIRCUIT, rest: CIRCUIT_REST});
    steps[steps.length - 1].rest = 0;
    return steps;
  }
  for (const [name, kg, reps, sets] of PROGRAM[wd]) {
    const per = reps.split("/"), n = minimal ? 1 : sets;
    for (let s = 1; s <= n; s++) {
      const r = per.length === sets ? per[s - 1] : per[0], [target, unit] = parseReps(r);
      steps.push({type: "set", ex: name, default_kg: kg, target, unit, set_no: s, total: n, rest: REST});
    }
  }
  steps[steps.length - 1].rest = 0;
  return steps;
}
function lastReps(ex, setNo) {
  const rows = T("set_logs").filter(r => r.exercise === ex && r.set_no === setNo && r.day < today());
  if (!rows.length) return null;
  rows.sort((a, b) => a.day < b.day ? 1 : a.day > b.day ? -1 : 0);
  return rows[0].reps;
}
function noWeightNote(ex) {
  const days = T("set_logs").filter(r => r.exercise === ex && r.day < today()).map(r => r.day).sort();
  if (!days.length) return null;
  const last = days[days.length - 1];
  const f = T("weight_flags").filter(x => x.exercise === ex && x.day === last).pop();
  return f && f.status !== "yes" ? "*вес НЕ добавил, делай " + (TEMPO_NOTE[ex] || TEMPO_DEFAULT) : null;
}
function prepareStep(t) { const st = t.steps[t.i]; t.cur = st.type === "set" ? st.target : null; }
function startTraining(forceMin, back) {
  const wd = (new Date().getDay() + 6) % 7;
  let minimal = !!forceMin, why = forceMin ? "ТЫ ВЫБРАЛ ⚡" : "";
  const sl = T("sleep_log").find(r => r.day === today());
  if (sl && sl.nosleep) { minimal = true; why = "БЕЗ СНА"; }
  const steps = buildSteps(wd, minimal);
  if (!steps) { alert("ВОСКРЕСЕНЬЕ: ОТДЫХ 😴"); return; }
  S.train = {steps, i: 0, cur: null, restEnd: null, actual: {}, kgdef: {}, minimal, why, forced: !!forceMin, back: back || "day"};
  prepareStep(S.train); save(); screen = "train"; lock(true); render();
}
function trainHabit() { return habits().find(h => h.active !== 0 && h.kind === "morning" && h.name === TRAINING); }
function createWeightFlags(t) {
  for (const ex in t.actual) {
    if (t.kgdef[ex] == null) continue;                    // упражнение без веса
    if (t.actual[ex].some(([c, tg]) => tg != null && c > tg) &&
        !T("weight_flags").some(f => f.day === today() && f.exercise === ex))
      T("weight_flags").push({id: nextId("weight_flags"), user_id: 0, day: today(), exercise: ex, status: null});
  }
}
function finishTraining(skipped) {
  const t = S.train; if (!t) return;
  const h = trainHabit();
  if (skipped) { if (h) setStatus(h.id, "no"); }
  else {
    if (h) { setStatus(h.id, "yes"); if (t.forced) T("min_log").push({habit_id: h.id, day: today()}); }
    if (!t.minimal) createWeightFlags(t);
  }
  S.train = null; save(); lock(false);
  const r = S.run;
  if (r && r.waitTrain != null) {                        // вернуть утренний ритуал
    const idx = r.waitTrain; r.waitTrain = null;
    r.marks[idx] = {how: "train", act: null}; r.seen = Math.max(r.seen, idx + 1);
    r.pausedTotal += Date.now() - r.pausedAt; r.pausedAt = null;
    if (idx + 1 >= r.steps.length) { finishRun(true); }
    else { jump(r, cum(r.steps)[idx + 1]); save(); screen = "run"; lock(true); render(); }
    return;
  }
  screen = "day"; tab = "day"; render();
  if (skipped && h) askReason({id: h.id, name: h.name, h});
}
function renderTrain() {
  $app.innerHTML = `<button class="x" id="x">⏭️</button><div id="tv" class="scroll" style="display:flex;flex-direction:column"></div>`;
  document.getElementById("x").onclick = () => { if (confirm("ПРОПУСТИТЬ ТРЕНИРОВКУ?")) finishTraining(true); };
  paintTrain();
}
function tickTrain() {
  const t = S.train; if (!t) return;
  if (t.restEnd && Date.now() >= t.restEnd) { t.restEnd = null; save(); beep(2); paintTrain(); return; }
  if (t.restEnd) { const el = document.getElementById("rest"); if (el) el.textContent = Math.ceil((t.restEnd - Date.now()) / 1000); }
}
function paintTrain() {
  const t = S.train, tv = document.getElementById("tv");
  if (!t || !tv) return;
  const st = t.steps[t.i], head = t.minimal ? `<div class="dim">⚡ МИНИМАЛКА · ${esc(t.why)}</div>` : "";
  if (t.restEnd) {
    tv.innerHTML = `${head}<div class="dim" style="padding-top:8vh">ОТДЫХ</div><div class="big clock" id="rest">${Math.ceil((t.restEnd - Date.now()) / 1000)}</div>
      <div class="acts"><button id="rdy" style="font-size:24px">ГОТОВ</button></div>`;
    document.getElementById("rdy").onclick = () => { t.restEnd = null; save(); paintTrain(); };
    return;
  }
  if (st.type === "set") {
    const kg = getKg(st.ex, st.default_kg), unit = st.unit ? " " + st.unit.toUpperCase() : "";
    const prev = lastReps(st.ex, st.set_no), note = t.minimal ? null : noWeightNote(st.ex);
    tv.innerHTML = `${head}<div class="item" style="padding-top:5vh">${esc(st.ex.toUpperCase())} · ${st.set_no}/${st.total}</div>
      <div class="dim" style="font-size:22px">${kg != null ? kg + " КГ" : "БЕЗ ВЕСА"}</div>
      <div class="big clock" style="padding:2vh 0">${t.cur}</div><div class="dim" style="font-size:20px">${esc(unit.trim())}${t.cur !== st.target ? " (ПЛАН " + st.target + ")" : ""}</div>
      ${prev ? `<div class="dim">НА ПРОШЛОЙ: ${esc(String(prev).toUpperCase())}</div>` : ""}
      ${t.minimal ? `<div class="dim">ОСТАВЬ 2 ПОВТОРА В ЗАПАСЕ</div>` : ""}
      ${note ? `<div class="dim" style="color:#ffb3b3;font-style:italic">🔴 ${esc(note)}</div>` : ""}
      <div class="acts"><button data-d="-3">−3</button><button data-d="-1">−1</button><button data-d="1">+1</button><button data-d="3">+3</button></div>
      <button class="btn go" id="ok" style="font-size:22px;padding:18px">ПОДХОД СДЕЛАН</button>`;
    tv.querySelectorAll("[data-d]").forEach(b => b.onclick = () => { t.cur = Math.max(0, Math.min(99, t.cur + +b.dataset.d)); save(); paintTrain(); });
  } else {
    tv.innerHTML = `${head}<div class="item" style="padding-top:5vh">КРУГ ${st.round}/${st.total}</div>` +
      st.items.map(([n, r]) => `<div class="card">${esc(n.toUpperCase())} — ${getKg(n, CIRCUIT_KG)} КГ — ${esc(r.toUpperCase())}</div>`).join("") +
      `<button class="btn go" id="ok" style="font-size:22px;padding:18px">ВЫПОЛНИЛ КРУГ</button>`;
  }
  document.getElementById("ok").onclick = doneStep;
}
function doneStep() {
  const t = S.train; if (!t) return;
  const st = t.steps[t.i];
  if (st.type === "set") {
    const kg = getKg(st.ex, st.default_kg), reps = (t.cur + " " + st.unit).trim();
    T("set_logs").push({user_id: 0, day: today(), exercise: st.ex, set_no: st.set_no, kg, reps});
    (t.actual[st.ex] = t.actual[st.ex] || []).push([t.cur, st.target]); t.kgdef[st.ex] = st.default_kg;
  } else {
    st.items.forEach(([n, r]) => T("set_logs").push({user_id: 0, day: today(), exercise: n, set_no: st.round, kg: getKg(n, CIRCUIT_KG), reps: r}));
  }
  t.i++; try { navigator.vibrate && navigator.vibrate(60); } catch (e) {}
  if (t.i >= t.steps.length) { finishTraining(false); return; }
  prepareStep(t);
  if (st.rest > 0) t.restEnd = Date.now() + st.rest * 1000;
  save(); paintTrain();
}
function addWeight(it, v) {
  const x = parseFloat(String(v).replace(",", "."));
  if (!(x > 0 && x <= 50)) { alert("ПРИМЕР: 2.5"); return; }
  const f = T("weight_flags").find(r => r.id === it.id); if (!f) return;
  setKg(f.exercise, (getKg(f.exercise, defaultKg(f.exercise)) || 0) + x); f.status = "yes"; save(); render();
}
// ------------------------------------------------------------------ статистика и правка тренировок
function renderTStats() {
  const L = T("set_logs"), t = new Date();
  const since = n => { const d = new Date(); d.setDate(d.getDate() - n); return isoDay(d); };
  const cnt = s => [new Set(L.filter(r => r.day >= s).map(r => r.day)).size, L.filter(r => r.day >= s).length];
  const w7 = cnt(since(6)), w30 = cnt(since(29)), all = new Set(L.map(r => r.day)).size;
  const wk = [0, 1, 2, 3].map(i => new Set(L.filter(r => r.day >= since(6 + 7 * i) && r.day <= since(7 * i)).map(r => r.day)).size);
  const prog = [];
  new Set(L.map(r => r.exercise)).forEach(ex => {
    const rows = L.filter(r => r.exercise === ex && r.kg != null).sort((a, b) => a.day < b.day ? -1 : a.day > b.day ? 1 : 0);
    if (rows.length && rows[0].kg !== rows[rows.length - 1].kg) prog.push(`• ${esc(ex)}: ${rows[0].kg} → ${rows[rows.length - 1].kg} кг`);
  });
  const days = [...new Set(L.map(r => r.day))].sort().reverse().slice(0, 8);
  $app.innerHTML = `<div class="scroll"><div class="title">📊💪 ТРЕНИРОВКИ</div>
    <div class="card">7 ДНЕЙ: ${w7[0]} дн. · ${w7[1]} подх.<br>30 ДНЕЙ: ${w30[0]} дн. · ${w30[1]} подх.<br>ВСЕГО: ${all} дн.</div>
    <div class="card">ПО НЕДЕЛЯМ (НОВЫЕ → СТАРЫЕ): ${wk.join(" · ")} из 6</div>
    ${prog.length ? `<div class="sec">РОСТ ВЕСОВ</div><div class="card">${prog.join("<br>")}</div>` : ""}
    ${days.length ? `<div class="sec">ВЫБЕРИ ДЕНЬ, ЧТОБЫ ИСПРАВИТЬ</div><div class="week" style="flex-wrap:wrap">${days.map(d => `<div data-d="${d}" style="flex:0 0 22%;padding:12px 0;font-size:18px">${d.slice(8)}.${d.slice(5, 7)}</div>`).join("")}</div>` : ""}
    </div><button class="btn" id="back">⬅</button>`;
  $app.querySelectorAll("[data-d]").forEach(b => b.onclick = () => { S.tday = b.dataset.d; screen = "tday"; render(); });
  document.getElementById("back").onclick = () => { screen = "set"; tab = "set"; render(); };
}
function renderTDay() {
  const d = S.tday, rows = T("set_logs").filter(r => r.day === d);
  $app.innerHTML = `<div class="scroll"><div class="title">💪 ${d.slice(8)}.${d.slice(5, 7)}</div>` +
    rows.map((r, i) => `<div class="card edit" data-i="${i}"><div style="grid-column:1/3">${i + 1}. ${esc(r.exercise)}</div>
      <input data-k="kg" inputmode="decimal" value="${r.kg == null ? "" : r.kg}" placeholder="КГ"><input data-k="reps" value="${esc(r.reps)}" placeholder="ПОВТОРЫ"></div>`).join("") +
    `</div><button class="btn" id="del">🗑 УДАЛИТЬ ТРЕНИРОВКУ</button><button class="btn" id="back">⬅</button>`;
  $app.querySelectorAll("input").forEach(inp => inp.onchange = () => {
    const r = rows[+inp.closest(".card").dataset.i], k = inp.dataset.k;
    if (k === "kg") { const x = parseFloat(inp.value.replace(",", ".")); r.kg = isNaN(x) ? null : x; } else r.reps = inp.value.trim();
    save();
  });
  document.getElementById("del").onclick = () => { if (confirm("УДАЛИТЬ ТРЕНИРОВКУ " + d + "?")) { S.db.set_logs = T("set_logs").filter(r => r.day !== d); save(); screen = "tstats"; render(); } };
  document.getElementById("back").onclick = () => { screen = "tstats"; render(); };
}
