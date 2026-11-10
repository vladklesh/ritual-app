"use strict";
// ================================================================== 📊 СТАТИСТИКА · ИСТОРИЯ · ИТОГИ МЕСЯЦА · ВЕЧЕРНЯЯ СВОДКА · ПРАЙМИНГ
const lastN = (n) => [...Array(n).keys()].map(k => addDays(today(), -k));

// ---------------------------------------------------------------- привычки
function logIndex() {                            // habit_id → {yes:Set, no:Set}
  const m = {};
  T("habit_logs").forEach(r => { const o = m[r.habit_id] = m[r.habit_id] || {yes: new Set(), no: new Set(), first: r.day}; (r.status === "yes" ? o.yes : o.no).add(r.day); if (r.day < o.first) o.first = r.day; });
  return m;
}
function habitStat(o) {
  if (!o) return {streak: 0, y7: 0, n7: 0, y30: 0, best: 0, yAll: 0, nAll: 0, first: null};
  let d = o.yes.has(today()) ? today() : addDays(today(), -1), streak = 0;
  while (o.yes.has(d)) { streak++; d = addDays(d, -1); }
  const c = (s, n) => lastN(n).filter(x => s.has(x)).length;
  const days = [...o.yes].sort(); let best = 0, run = 0, prev = null;
  days.forEach(x => { run = prev && daysBetween(prev, x) === 1 ? run + 1 : 1; best = Math.max(best, run); prev = x; });
  return {streak, y7: c(o.yes, 7), n7: c(o.no, 7), y30: c(o.yes, 30), best, yAll: o.yes.size, nAll: o.no.size, first: o.first};
}
function morningCompleteDays(n) {
  let cnt = 0;
  lastN(n).forEach(d => {
    const wd = (dObj(d).getDay() + 6) % 7;
    const steps = habits().filter(h => h.active !== 0 && h.kind === "morning" && !h.custom && (!h.on_date || h.on_date === d) && !(wd === 6 && h.name === TRAINING));
    if (!steps.length) return;
    const st = statusMap(d);
    if (steps.every(h => st[h.id] === "yes")) cnt++;
  });
  return cnt;
}
const quitBest = h => Math.max(T("quit_log").filter(r => r.habit_id === h.id).reduce((m, r) => Math.max(m, r.streak || 0), 0), quitDays(h));

function statsText() {
  const L = ["📊 СТАТИСТИКА", ""], idx = logIndex();
  const runs = S.runs.filter(r => r.day >= addDays(today(), -6));
  if (runs.length) L.push(`📱 Утро в приложении: ${runs.length} запусков за 7 дн., до конца ${runs.filter(r => r.full).length}`, "");
  L.push(`☀ Утро полностью: ${morningCompleteDays(7)}/7 за неделю, ${morningCompleteDays(30)}/30 за месяц`, "");
  const hs = habits().filter(h => h.active !== 0 && ["daily", "evening"].includes(h.kind) && !SPECIAL.includes(h.name) && !h.on_date);
  if (hs.length) { L.push("Привычки (серия · ✅ 7 дн. · ❌ 7 дн. · % за 30 дн.):"); hs.forEach(h => { const s = habitStat(idx[h.id]); L.push(`• ${h.name}: 🔥${s.streak} · ${s.y7} · ${s.n7} · ${Math.round(s.y30 / 30 * 100)}%`); }); L.push(""); }
  const qs = habits().filter(h => h.active !== 0 && h.kind === "quit");
  if (qs.length) { L.push("Отказался от (дней подряд, рекорд):"); qs.forEach(h => L.push(`• ${h.name}: ${quitDays(h)} (рекорд ${quitBest(h)})`)); L.push(""); }
  const tk = T("tasks").filter(t => t.day && t.day >= addDays(today(), -6) && t.day <= today());
  L.push(`Задачи за 7 дней: ${tk.filter(t => t.done).length}/${tk.length}`);
  const pl = lastN(7).flatMap(d => T("pomo_log").filter(l => l.day === d));
  if (pl.length) L.push(`🍅 за 7 дней: ✅ ${pl.filter(l => l.status === "yes").length} · ❌ ${pl.filter(l => l.status === "no").length}`);
  const kiss = T("abstain_log").filter(r => r.kind === "sex" && r.day >= addDays(today(), -29)).length;
  if (kiss) L.push(`💋 за 30 дней: ${kiss}`);
  const sl = T("sleep_log").filter(r => r.day >= addDays(today(), -6) && r.sleep_h > 0), wk = T("sleep_log").filter(r => r.day >= addDays(today(), -6) && r.wake);
  const ns = T("sleep_log").filter(r => r.day >= addDays(today(), -29) && r.nosleep).length;
  if (sl.length || wk.length || ns) {
    L.push("", "Сон:");
    if (sl.length) L.push(`• средний за 7 дней: ${(sl.reduce((s, r) => s + r.sleep_h, 0) / sl.length).toFixed(1)} ч (${sl.length} зап.)`);
    if (wk.length) { const avg = Math.floor(wk.reduce((s, r) => s + hm2m(r.wake), 0) / wk.length); L.push(`• средний подъём: ${m2hm(avg)}`); }
    if (ns) L.push(`• дней без сна за 30 дней: ${ns}`);
  }
  const mm = monthMoney(today().slice(0, 7));
  if (mm.n || mm.spend) L.push("", `💼 ${MON[+today().slice(5, 7) - 1]}: ${mm.n} см. · ставка ${fmtRub(mm.e)} · бонусы ${fmtRub(mm.t)} · траты ${fmtRub(mm.spend)} · итого ${fmtRub(mm.net)}`);
  return L.join("\n");
}
// ---------------------------------------------------------------- вся история
function historyRows() {
  const days = [].concat(T("work_days").map(w => w.day), T("spend_log").map(r => r.day), T("set_logs").map(r => r.day), T("habit_logs").map(r => r.day)).filter(Boolean).sort();
  if (!days.length) return [];
  const y0 = +days[0].slice(0, 4), y1 = +today().slice(0, 4), out = [];
  const trainDays = {}; T("set_logs").forEach(r => { (trainDays[r.day.slice(0, 4)] = trainDays[r.day.slice(0, 4)] || new Set()).add(r.day); });
  for (let y = y1; y >= y0; y--) {
    const yy = String(y), ws = T("work_days").filter(w => w.day.startsWith(yy) && (w.hours != null || w.earned != null));
    const e = ws.reduce((s, w) => s + (w.earned || 0), 0), t = ws.reduce((s, w) => s + (w.tips || 0), 0), h = ws.reduce((s, w) => s + (w.hours || 0), 0);
    const sp = T("spend_log").filter(r => r.day.startsWith(yy)).reduce((s, r) => s + (r.amount || 0), 0);
    const hl = T("habit_logs").filter(r => r.day.startsWith(yy));
    out.push({yy, n: ws.length, h, e, t, sp, net: e + t - sp, train: trainDays[yy] ? trainDays[yy].size : 0, yes: hl.filter(r => r.status === "yes").length, no: hl.filter(r => r.status === "no").length});
  }
  return out;
}
function spendByCat(yy) {
  const m = {}; T("spend_log").filter(r => r.day.startsWith(yy) && r.amount > 0).forEach(r => { const k = r.cat || "—"; m[k] = (m[k] || 0) + r.amount; });
  return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${CAT_ICON[k] || "▫️"} ${fmtN(v)}`).join(" · ");
}
function renderStats() {
  _acts = [];
  const rows = historyRows(), idx = logIndex();
  const hs = habits().filter(h => h.active !== 0 && h.kind !== "morning" && !SPECIAL.includes(h.name));
  const all = hs.map(h => { const s = habitStat(idx[h.id]); return s.yAll + s.nAll ? `• ${esc(h.name.split("\n")[0].slice(0, 34))}: ✅${s.yAll} ❌${s.nAll} · ${Math.round(s.yAll / (s.yAll + s.nAll) * 100)}% · РЕКОРД 🔥${s.best}${s.first ? " · С " + s.first.slice(0, 7) : ""}` : ""; }).filter(Boolean);
  shell(`<div class="pre">${esc(statsText())}</div>
    <div class="sec">ИСТОРИЯ ПО ГОДАМ (ЖМИ ГОД — ИТОГИ ПО МЕСЯЦАМ)</div>
    <table class="tbl"><tr><th>ГОД</th><th>СМЕН</th><th>СТАВКА+БОН.</th><th>ТРАТЫ</th><th>ИТОГО</th><th>💪</th></tr>` +
    rows.map(r => `<tr><td>${r.yy}</td><td>${r.n}</td><td>${fmtN(r.e + r.t)}</td><td>${fmtN(r.sp)}</td><td>${fmtN(r.net)}</td><td>${r.train}</td></tr>`).join("") + `</table>` +
    `<div class="dim" style="text-align:left">💪 — ДНЕЙ ТРЕНИРОВОК. ПРИВЫЧКИ ЗА ГОД: ${rows.filter(r => r.yes + r.no).map(r => `${r.yy}: ✅${r.yes} ❌${r.no}`).join(" · ") || "—"}</div>` +
    rows.map(r => B(`🗓 ${r.yy} · ${r.n} СМ. · ${fmtN(r.net)}₽${spendByCat(r.yy) ? "" : ""}`, () => { tab = "work"; screen = "work"; wv = {v: "rmenu", yy: r.yy}; render(); })).join("") +
    (all.length ? `<div class="sec">ПРИВЫЧКИ ЗА ВСЁ ВРЕМЯ</div><div class="pre" style="font-size:15px">${all.join("\n")}</div>` : "") +
    `<div class="sec">ТРАТЫ ПО КАТЕГОРИЯМ</div><div class="pre" style="font-size:15px">${rows.map(r => spendByCat(r.yy) ? r.yy + ": " + spendByCat(r.yy) : "").filter(Boolean).join("\n") || "—"}</div>` +
    B("📊💪 ТРЕНИРОВКИ", () => { screen = "tstats"; render(); }) + B("⬅", () => { screen = "set"; tab = "set"; render(); }));
  document.querySelectorAll("[data-a]").forEach(b => b.onclick = () => _acts[+b.dataset.a]());
}

// ---------------------------------------------------------------- вечерняя сводка
function eveningSummary() {
  const d = today(), st = statusMap(d), mins = new Set(T("min_log").filter(r => r.day === d).map(r => r.habit_id));
  const hs = habits().filter(h => h.kind !== "quit" && st[h.id]);
  const yes = hs.filter(h => st[h.id] === "yes" && !mins.has(h.id)).length, mn = hs.filter(h => st[h.id] === "yes" && mins.has(h.id)).length, no = hs.filter(h => st[h.id] === "no").length;
  const wk = new Set(T("set_logs").filter(r => r.day >= addDays(d, -6)).map(r => r.day)).size;
  return `📊 СЕГОДНЯ: ✅ ${yes} · ⚡ ${mn} · ❌ ${no}\n💪 НЕДЕЛЯ: ${wk} ИЗ 6`;
}
function evTick() {
  if (document.hidden || document.querySelector(".sheet") || screen === "run" || screen === "train") return;
  const n = new Date(), hm = hmNow();
  if (hm >= "21:30" && !kvGet("evsum:" + today())) { kvPut("evsum:" + today(), "1"); toast(eveningSummary()); return; }
  // последнее воскресенье месяца: задача и приглашение на итоги
  const d = new Date(); const sun = d.getDay() === 0 && new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7).getMonth() !== d.getMonth();
  const ym = today().slice(0, 7);
  if (sun && !kvGet("rev_task:" + ym)) {
    kvPut("rev_task:" + ym, "1");
    T("tasks").push({id: nextId("tasks"), day: today(), text: "🗓 Итоги месяца", project_id: -1, done: 0}); save();
  }
  if (sun && hm >= "10:00" && !kvGet("rev_msg:" + ym)) {
    kvPut("rev_msg:" + ym, "1");
    sheetOf(b => `<div class="stt">🗓 СЕГОДНЯ ИТОГИ МЕСЯЦА: 1 ЧАС\nОПРОС ПО ${SPHERES.length} СФЕРАМ. ВСЁ ИЗ «ДАЛЬШЕ» СТАНЕТ ЗАДАЧАМИ НА СЛЕДУЮЩИЙ МЕСЯЦ</div><div class="acts">${b("▶ НАЧАТЬ", () => { closeTop(); reviewStart(); })}${b("⏳", closeTop)}</div>`);
  }
}

// ---------------------------------------------------------------- 🗓 итоги месяца
function reviewSteps() {
  const s = [];
  SPHERES.forEach(p => { s.push([p.k, "ach", `${p.ic} ${p.nm}\nЧЕГО ДОСТИГ ЗА МЕСЯЦ?`]); s.push([p.k, "next", `${p.ic} ${p.nm}\nЧТО ДЕЛАЕШЬ В СЛЕДУЮЩЕМ МЕСЯЦЕ? КАЖДЫЙ ШАГ С НОВОЙ СТРОКИ`]); });
  s.push([null, "block", "ЧТО МЕШАЛО В ЭТОМ МЕСЯЦЕ И НА ЧТО УШЛО ВРЕМЯ?"], [null, "lesson", "ГЛАВНЫЙ ВЫВОД МЕСЯЦА?"]);
  return s;
}
function reviewStart() {
  const steps = reviewSteps(), ym = today().slice(0, 7), next = [];
  S.db.reviews = T("reviews").filter(r => r.ym !== ym);
  const step = i => {
    if (i >= steps.length) return reviewFinish(next);
    const [k, kind, q] = steps[i];
    const done = t => { if (t && t.trim()) { T("reviews").push({id: nextId("reviews"), ym, sphere: k, kind, text: t.trim()}); if (kind === "next") t.split("\n").forEach(l => { l = l.replace(/^[\s\-•–—]+/, "").trim(); if (l) next.push([k, l.slice(0, 80)]); }); save(); } setTimeout(() => step(i + 1), 30); };
    askText(`ШАГ ${i + 1}/${steps.length}\n\n${q}`, t => { done(t); return true; }, {ml: true, extra: [["⏭ ПРОПУСТИТЬ", () => done("")]]});
  };
  step(0);
}
function reviewFinish(next) {
  const first = new Date(); first.setDate(1); first.setMonth(first.getMonth() + 1);
  const nm = isoDay(first), dim = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  next.forEach(([k, line], i) => {
    const day = addDays(nm, Math.min(Math.floor(i * dim / Math.max(next.length, 1)), dim - 1)), sp = SPHERES.find(s => s.k === k);
    T("tasks").push({id: nextId("tasks"), day, text: `${sp ? sp.ic : ""} ${line}`.trim(), project_id: -1, done: 0});
  });
  save(); toast(`✅ ИТОГИ СОХРАНЕНЫ\nЗАДАЧ НА СЛЕДУЮЩИЙ МЕСЯЦ: ${next.length}`);
  if (screen === "tasks") renderTasks();
}
function tRevs() {
  const yms = [...new Set(T("reviews").map(r => r.ym))].sort().reverse();
  W(`<div class="title">📜 ПРОШЛЫЕ ИТОГИ</div>` + (yms.map(ym => B(`${MON[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}`, () => tgo("rev", {ym}))).join("") || `<div class="dim">ПОКА НЕТ</div>`) + B("⬅", () => tgo("main")));
}
function tRev() {
  const rs = T("reviews").filter(r => r.ym === tv.ym), L = [`🗓 ${MON[+tv.ym.slice(5, 7) - 1]} ${tv.ym.slice(0, 4)}`];
  const kn = {ach: "ДОСТИГ", next: "ДАЛЬШЕ", block: "МЕШАЛО", lesson: "ВЫВОД"};
  rs.forEach(r => { const sp = SPHERES.find(s => s.k === r.sphere); L.push(`\n${sp ? sp.ic + " " : ""}${kn[r.kind]}:\n${r.text}`); });
  W(`<div class="pre" style="font-size:16px">${esc(L.join("\n"))}</div>` + B("⬅", () => tgo("revs")));
}
Object.assign(TEXT, {revs: tRevs, rev: tRev});

// ---------------------------------------------------------------- 🎧 прайминг внутри приложения
async function savePrimingFile(f) {
  const buf = await f.arrayBuffer();
  await idbPut("priming", {type: f.type || "audio/mpeg", name: f.name, buf});
  S.priming = {name: f.name, size: f.size}; save();
}
let primingEl = null;
async function playPriming() {
  if (primingEl && !primingEl.paused) { primingEl.pause(); return; }
  let o = null; try { o = await idbGet("priming"); } catch (e) {}
  if (!o) { toast("НЕТ ФАЙЛА. ⚙ → 🎧 ПРАЙМИНГ-ФАЙЛ"); return; }
  primingEl = new Audio(URL.createObjectURL(new Blob([o.buf], {type: o.type})));
  primingEl.play().catch(() => toast("НЕ УДАЛОСЬ ВКЛЮЧИТЬ ЗВУК"));
}
