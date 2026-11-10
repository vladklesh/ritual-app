"use strict";
// ================================================================== 🧳 ЦЕЛИ · СФЕРЫ · ПРОЕКТЫ · ЗАДАЧИ
let tv = {v: "main"};
const tgo = (v, o) => { tv = Object.assign({v}, o || {}); renderTasks(); };
const sphIcon = g => (SPHERES.find(s => s.k === g.sphere) || {ic: "▫️"}).ic;
const goalsTop = () => T("goals").filter(g => g.grp === "top6").sort((a, b) => (a.pos || 0) - (b.pos || 0) || a.id - b.id);
const goalsAll = () => T("goals").filter(g => g.grp === "top100").sort((a, b) => (a.pos || 0) - (b.pos || 0) || a.id - b.id);
const PER = 6;

function renderTasks() {
  _acts = [];
  ({main: tMain, goals: tGoals, glist: tGlist, gedit: tGedit, gone: tGone, spheres: tSpheres, sph: tSph, projects: tProjects, tasks: tTasks}[tv.v] || tMain)();
}
function tMain() {
  const done = goalsAll().filter(g => g.done_on).length, open = T("tasks").filter(t => !t.done).length;
  W(`<div class="title">🧳</div>` + B(`🎯 ЦЕЛИ · ТОП-100: ${done}/${goalsAll().length}`, () => tgo("goals")) + B("🧭 СФЕРЫ ЖИЗНИ", () => tgo("spheres")) +
    B("🧳 ПРОЕКТЫ", () => tgo("projects")) + B(`✅ ЗАДАЧИ${open ? " · " + open : ""}`, () => tgo("tasks")) +
    B("♾️ ПРИВЫЧКИ", () => { screen = "edit"; render(); }));
}
// ---- цели
function tGoals() {
  const top = goalsTop(), done = goalsAll().filter(g => g.done_on).length;
  const L = ["🎯 ГЛАВНЫЕ ЦЕЛИ ПО ГОДАМ (НАЖМИ, ЧТОБЫ ОТМЕТИТЬ)"];
  top.forEach(g => L.push(`${g.done_on ? "✅" : "⬜"} ${sphIcon(g)} ${g.text}${g.detail ? "\n   ↳ " + g.detail.slice(0, 200) : ""}`));
  L.push(`\nТОП-100: ${done}/${goalsAll().length} ВЫПОЛНЕНО`);
  W(`<div class="pre">${esc(L.join("\n"))}</div>` + top.map(g => B(`${g.done_on ? "✅" : "⬜"} ${sphIcon(g)} ${esc(g.text.slice(0, 42))}`, () => { g.done_on = g.done_on ? null : today(); save(); renderTasks(); })).join("") +
    `<div class="r2">${B("📋 ВСЕ ЦЕЛИ", () => tgo("glist", {p: 0}))}${B("➕ ЦЕЛЬ", () => askText("НАПИШИ НОВУЮ ЦЕЛЬ", t => {
      if (!t.trim()) return false; const pos = goalsAll().reduce((m, g) => Math.max(m, g.pos || 0), 0) + 1;
      T("goals").push({id: nextId("goals"), grp: "top100", text: t.trim().slice(0, 300), detail: null, pos, done_on: null, sphere: null}); save(); renderTasks(); return true; }))}
    ${B("✏️", () => tgo("gedit", {top: true}))}</div>` + B("⬅", () => tgo("main")));
}
function tGlist() {
  const all = goalsAll(), pages = Math.max(Math.ceil(all.length / PER), 1), p = Math.min(Math.max(tv.p, 0), pages - 1), chunk = all.slice(p * PER, (p + 1) * PER);
  const L = [`📋 ЦЕЛИ · СТР. ${p + 1}/${pages}`];
  chunk.forEach((g, i) => L.push(`\n${p * PER + i + 1}. ${g.done_on ? "✅" : "⬜"} ${sphIcon(g)} ${g.text}${g.detail ? "\n" + g.detail.slice(0, 260) : ""}`));
  W(`<div class="pre">${esc(L.join("\n"))}</div><div class="chk">` + chunk.map((g, i) => B(`${g.done_on ? "✅" : "⬜"} ${p * PER + i + 1}`, () => { g.done_on = g.done_on ? null : today(); save(); renderTasks(); }, "btn sm")).join("") + `</div>
    <div class="r2">${p > 0 ? B("◀", () => tgo("glist", {p: p - 1})) : ""}${B("✏️", () => tgo("gedit", {top: false, p}))}${p < pages - 1 ? B("▶", () => tgo("glist", {p: p + 1})) : ""}</div>` + B("⬅", () => tgo("goals")));
}
function tGedit() {
  const list = tv.top ? goalsTop() : goalsAll().slice(tv.p * PER, (tv.p + 1) * PER);
  W(`<div class="title">✏️ КАКУЮ ЦЕЛЬ ПРАВИМ?</div>` + list.map(g => B(`${sphIcon(g)} ${esc(g.text.slice(0, 45))}`, () => tgo("gone", {id: g.id, top: tv.top, p: tv.p}))).join("") + B("⬅", () => tv.top ? tgo("goals") : tgo("glist", {p: tv.p})));
}
function tGone() {
  const g = T("goals").find(x => x.id === tv.id); if (!g) return tgo("goals");
  W(`<div class="pre">${esc(sphIcon(g) + " " + g.text + (g.detail ? "\n↳ " + g.detail : "\n↳ КОНКРЕТИКИ НЕТ"))}</div>
    <div class="r2">${B("✏️ НАЗВАНИЕ", () => askText("НОВОЕ НАЗВАНИЕ ЦЕЛИ?", t => { if (!t.trim()) return false; g.text = t.trim().slice(0, 300); save(); renderTasks(); return true; }, {val: g.text}))}
    ${B("📌 КОНКРЕТИКА", () => askText("КОНКРЕТИКА: ЧТО ИМЕННО ДОЛЖНО ПОЛУЧИТЬСЯ, КАК ИЗМЕРЮ, КАКИЕ ШАГИ?", t => { g.detail = t.trim() || null; save(); renderTasks(); return true; }, {val: g.detail || ""}))}</div>
    <div class="cats">${SPHERES.map(s => B(s.ic, () => { g.sphere = s.k; save(); renderTasks(); })).join("")}</div>
    <div class="r2">${B("🗑", () => { if (confirm("УДАЛИТЬ ЦЕЛЬ?")) { S.db.goals = T("goals").filter(x => x !== g); save(); tgo("goals"); } })}${B("⬅", () => tgo("gedit", {top: tv.top, p: tv.p}))}</div>`);
}
// ---- сферы
function tSpheres() {
  W(`<div class="title">🧭 СФЕРЫ ЖИЗНИ</div><div class="cats">${SPHERES.map(s => B(s.ic, () => tgo("sph", {k: s.k}))).join("")}</div>` +
    `<div class="dim">${SPHERES.map(s => s.ic + " " + s.nm).join("<br>")}</div>` + B("⬅", () => tgo("main")));
}
function tSph() {
  const s = SPHERES.find(x => x.k === tv.k), inf = SPH_INFO[tv.k], gl = T("goals").filter(g => g.sphere === tv.k).sort((a, b) => (a.pos || 0) - (b.pos || 0));
  const L = [`${s.ic} ${s.nm}`, inf.intro, "", "ЧТО ВАЖНО УЧЕСТЬ:", ...inf.qs.map(q => "• " + q), "", gl.length ? "ЦЕЛИ:" : "ЦЕЛЕЙ ПОКА НЕТ. ✏️ В 🎯 — НАЗНАЧИТЬ СФЕРУ", ...gl.map(g => `${g.done_on ? "✅" : "⬜"} ${g.text.slice(0, 90)}`)];
  W(`<div class="pre">${esc(L.join("\n"))}</div>` + B("⬅", () => tgo("spheres")));
}
// ---- проекты
function tProjects() {
  const ps = T("projects").filter(p => p.active !== 0), L = ["🧳 ПРОЕКТЫ (ПОДЦЕЛИ)"];
  ps.forEach(p => { const g = p.goal_id ? T("goals").find(x => x.id === p.goal_id) : null; L.push(`• ${p.name}${g ? " → 🎯 " + g.text.slice(0, 40) : ""}`); });
  if (!ps.length) L.push("ПРОЕКТОВ ПОКА НЕТ");
  W(`<div class="pre">${esc(L.join("\n"))}</div>` + ps.map(p => B(`❌ ${esc(p.name.slice(0, 30))}`, () => { if (confirm("УБРАТЬ ПРОЕКТ?")) { p.active = 0; save(); renderTasks(); } })).join("") +
    B("➕", () => askText("НАЗВАНИЕ ПРОЕКТА?", n => {
      if (!n.trim()) return false;
      const add = gid => { T("projects").push({id: nextId("projects"), name: n.trim().slice(0, 40), goal_id: gid || null, active: 1}); save(); renderTasks(); };
      setTimeout(() => choose("К КАКОЙ ЦЕЛИ ОТНОСИТСЯ?", goalsTop().map(g => [g.text.slice(0, 45), () => { closeTop(); add(g.id); }]).concat([["БЕЗ ЦЕЛИ", () => { closeTop(); add(null); }]])), 30);
      return true; })) + B("⬅", () => tgo("main")));
}
// ---- задачи (можно отправить в 📅 план)
function tTasks() {
  const ts = T("tasks").filter(t => !t.done).sort((a, b) => (a.day || "").localeCompare(b.day || "") || a.id - b.id);
  const pn = t => { const p = t.project_id > 0 ? T("projects").find(x => x.id === t.project_id) : null; return p ? p.name : t.project_id === 0 ? "♾️" : ""; };
  W(`<div class="title">✅ ЗАДАЧИ</div>` + (ts.map(t => B(`${t.day ? ddmm(t.day) + " " : ""}${esc(t.text.slice(0, 36))}${pn(t) ? " · " + esc(pn(t)) : ""}`, () => taskSheet(t))).join("") || `<div class="dim">ОТКРЫТЫХ НЕТ</div>`) +
    B("➕ ЗАДАЧА", taskNew) + B("⬅", () => tgo("main")));
}
function taskNew() {
  const ps = T("projects").filter(p => p.active !== 0);
  const go = pid => askText("НАЗВАНИЕ ЗАДАЧИ?", n => {
    if (!n.trim()) return false;
    setTimeout(() => askText("КОГДА? ПРИМЕР: 12.11 ИЛИ ЗАВТРА (ПУСТО = БЕЗ ДАТЫ)", d => {
      const day = d.trim() ? parseDateText(d) : null; if (d.trim() && !day) { toast("НЕ ПОНЯЛ ДАТУ"); return false; }
      T("tasks").push({id: nextId("tasks"), day, text: n.trim().slice(0, 80), project_id: pid, done: 0}); save(); renderTasks(); return true;
    }, {val: today()}), 30); return true;
  });
  choose("ПРОЕКТ?", ps.map(p => [p.name.slice(0, 40), () => { closeTop(); go(p.id); }]).concat([["♾️ ПРИВЫЧКИ", () => { closeTop(); go(0); }], ["⛓️‍💥 БЕЗ ПРОЕКТА", () => { closeTop(); go(-1); }]]));
}
function taskSheet(t) {
  sheetOf(b => `<div class="stt">${esc(t.text)}${t.day ? "\n" + ddmm(t.day) : ""}</div>
    ${b("✅ СДЕЛАНО", () => { t.done = 1; save(); closeTop(); renderTasks(); }, "btn")}
    ${b("📅 В ПЛАН", () => { closeTop(); askText("ВО СКОЛЬКО? ПРИМЕР: 14:00", s => {
      const f = parseClock(s); if (!f) { toast("НЕ ПОНЯЛ. ПРИМЕР: 14:00"); return false; }
      const m = hm2m(f), day = t.day && t.day >= today() ? t.day : today();
      T("plan").push({id: nextId("plan"), day, from: m, to: Math.min(1440, m + 25), title: t.text, color: PCOL[3], nopomo: false}); save(); toast("ДОБАВЛЕНО В 📅 " + ddmm(day) + " " + f); return true; }); }, "btn")}
    ${b("🗑", () => { S.db.tasks = T("tasks").filter(x => x !== t); save(); closeTop(); renderTasks(); }, "btn")}`);
}
