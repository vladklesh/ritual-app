"use strict";
// ================================================================== РАБОТА · ЗП · ПЕРЕВОДЫ · ТРАТЫ (перенос из бота)
const TAX_RATE = 0.06;                           // налог удерживает только MCG
const SPEND_CATS = [["e", "🍱"], ["h", "🏠"], ["s", "📱"], ["b", "💊"], ["t", "🚇"], ["w", "😍"], ["v", "🛍️"]];
const CAT_ICON = Object.fromEntries(SPEND_CATS);
const fmtN = x => String(Math.round(x || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
const fmtRub = x => fmtN(x) + "₽";
const ddmm = iso => iso.slice(8) + "." + iso.slice(5, 7);
const gnum = x => String(Math.round(x * 100) / 100);
const kvGet = k => (S.kv || {})[k];
const kvPut = (k, v) => { S.kv = S.kv || {}; S.kv[k] = v; save(); };

// ---------------------------------------------------------------- разбор ввода
function parseSum(t) {                           // «456», «560+670+750», «1 200 + 300»
  t = String(t || "").trim().replace(/\s*\+\s*/g, "+");
  let total = 0;
  for (let p of t.split("+")) {
    p = p.trim();
    if (/^\d{1,3}(?: \d{3})+(?:,\d+)?$/.test(p)) p = p.replace(/ /g, "");
    if (!/^\d+(?:[,.]\d+)?$/.test(p)) return null;
    total += parseFloat(p.replace(",", "."));
  }
  return Math.round(total * 100) / 100;
}
function parseHours(t) {                           // «7 30» = 7ч30м, «7,5», «8»
  t = String(t).trim().replace(",", ".");
  let m = t.match(/^(\d{1,2})[\s:](\d{1,2})$/), x = null;
  if (m) { const h = +m[1], mi = +m[2]; x = mi < 60 ? h + mi / 60 : null; }
  else if (/^\d{1,2}(?:\.\d{1,2})?$/.test(t)) x = parseFloat(t);
  return x == null || !(x > 0 && x <= 24) ? null : Math.round(x * 100) / 100;
}
function parseRange(t) {                         // «7:00 - 3:00» → ["07:00","03:00",часы], через полночь считается сам
  const m = String(t || "").match(/^\s*(\d{1,2})(?:[:.](\d{2}))?\s*[-–—]\s*(\d{1,2})(?:[:.](\d{2}))?\s*$/);
  if (!m) return null;
  const h1 = +m[1], m1 = +(m[2] || 0), h2 = +m[3], m2 = +(m[4] || 0);
  if (h1 > 23 || h2 > 23 || m1 > 59 || m2 > 59) return null;
  const mins = (((h2 * 60 + m2) - (h1 * 60 + m1)) % 1440 + 1440) % 1440;
  if (!mins) return null;
  return [pad(h1) + ":" + pad(m1), pad(h2) + ":" + pad(m2), Math.round(mins / 60 * 100) / 100];
}
function parseStart(t) {                         // «11», «11:30», «11 30»
  const m = String(t || "").match(/^\s*(\d{1,2})(?:[:.\s](\d{2}))?\s*$/);
  if (!m || +m[1] > 23 || +(m[2] || 0) > 59) return null;
  return pad(+m[1]) + ":" + (m[2] || "00");
}
function parseDateText(t) {                      // «05.11», «вчера», «завтра»
  t = String(t || "").trim().toLowerCase();
  const k = {"сегодня": 0, "вчера": -1, "позавчера": -2, "завтра": 1, "послезавтра": 2}[t];
  if (k !== undefined) return addDays(today(), k);
  const m = t.match(/^(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?$/);
  if (!m) return null;
  let y = m[3] ? +m[3] : new Date().getFullYear(); if (y < 100) y += 2000;
  const d = +m[1], mo = +m[2];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const iso = y + "-" + pad(mo) + "-" + pad(d);
  return isoDay(dObj(iso)) === iso ? iso : null;
}
function parsePlace(t) {                         // «MCG 500/ч» почасово, «ОЗОН 6000» за смену
  const m = String(t).trim().match(/^(.+?)\s+(\d+(?:[.,]\d+)?)\s*(?:₽|р|руб\.?)?\s*(\/?\s*(?:ч|час|смен\S*))?$/i);
  if (!m) return null;
  const unit = (m[3] || "").replace(/^[/\s]+/, "").toLowerCase().startsWith("ч") ? "hour" : "shift";
  return [m[1].trim().slice(0, 30), parseFloat(m[2].replace(",", ".")), unit];
}

// ---------------------------------------------------------------- данные работы
const places = () => T("work_places").filter(p => p.active !== 0);
const getPlace = id => T("work_places").find(p => p.id === id);
const placeLabel = p => p.rate ? `${p.name} · ${p.rate}₽/${p.unit === "hour" ? "Ч" : "СМЕНА"}` : p.name;
const workRow = id => T("work_days").find(w => w.id === id);
const wplace = w => getPlace(w.place_id) || {name: "?", rate: 0, unit: "shift"};
const due = w => (w.earned || 0) + (w.exp || 0);
const isHourly = p => !!p && (p.unit === "hour" || /mcg|манифик/i.test(p.name || ""));
const ceilH = h => Math.ceil(h - 1e-9);                // часы смены округляются вверх
const defH = w => isMCG(wplace(w)) ? 10 : 8;          // смена по умолчанию в 📅: MCG 10 ч, остальные 8 ч
const isMCG = p => !!p && /mcg|манифик/i.test(p.name || "");
function calcEarn(w) {                             // MCG: до 10 ч — минималка 5000₽, дальше 500₽/ч
  const p = wplace(w); if (!isHourly(p) || w.hours == null) return;
  const r = p.rate || 500;
  w.earned = Math.round((isMCG(p) ? Math.max(w.hours, 10) * r : w.hours * r) * 100) / 100;
}
const WORK_VIEWS = ["main", "shifts", "shift", "places", "pay", "rep", "year", "rmenu"];
const taxRate = pid => { const p = pid ? getPlace(pid) : null; return p && p.name.trim().toUpperCase() === "MCG" ? TAX_RATE : 0; };

function savePlace(name, rate, unit) {
  const p = T("work_places").find(x => x.name.toLowerCase() === name.toLowerCase());
  if (p) { p.rate = rate; p.unit = unit; p.active = 1; save(); return p.id; }
  const id = nextId("work_places");
  T("work_places").push({id, name, rate, unit, active: 1, owed: 0}); save(); return id;
}
function planWork(day, pid) {                    // одна смена в день; смена места пересчитывает сумму
  const p = getPlace(pid), r = T("work_days").find(w => w.day === day);
  if (r) {
    r.earned = p.unit === "hour" && r.hours != null ? r.hours * p.rate : r.earned;
    r.place_id = pid; save(); return r.id;
  }
  const id = nextId("work_days");
  T("work_days").push({id, day, place_id: pid, hours: null, earned: null, tips: null, t_from: null, t_to: null, exp: null, paid_on: null, note: null});
  save(); return id;
}
function workStage(w) {
  if (w.hours == null) return "hours";
  if (w.earned == null && isHourly(wplace(w))) { calcEarn(w); save(); }
  if (w.earned == null) return "earned";
  if (w.tips == null) return "tips";
  return "done";
}
function workPending() {
  return T("work_days").filter(w => w.day <= today() && !w.src && (w.hours == null ||
    (!isHourly(wplace(w)) && w.earned == null) || (w.tips == null && shiftOver(w)))).sort((a, b) => a.day.localeCompare(b.day));
}
function workPrompt(w) {
  const p = wplace(w), head = `РАБОТА ${ddmm(w.day)} · ${p.name.toUpperCase()}`, st = workStage(w);
  if (st === "hours") return w.day >= today()
    ? `${head}\nСО СКОЛЬКО НАЧИНАЕШЬ? ПРИМЕР: 7 ИЛИ 7:30\nВ 📅 ПОСТАВЛЮ ${defH(w)} Ч, ДОЛЬШЕ — ТЯНИ В КАЛЕНДАРЕ (ИЛИ СРАЗУ 7:00 - 1:00)`
    : `${head}\nВРЕМЯ СМЕНЫ? ПРИМЕР: 7:00 - 3:00 ИЛИ 8`;
  if (st === "earned") return `${head} · ${gnum(w.hours)} Ч\nСКОЛЬКО ЗАРАБОТАЛ (СТАВКА)? НАПИШИ СУММУ` + (p.rate ? ` (+ = ${p.rate}₽)` : "");
  return `${head} · ${gnum(w.hours)} Ч · ${fmtRub(w.earned)}\nБОНУСЫ КРОМЕ SHOP BOT? (1500 ИЛИ 500+1000)\nSHOP BOT ПОДТЯНЕТСЯ САМ`;
}
function applyWorkText(w, text) {                // ввод часов / суммы / бонусов; вернёт подтверждение или null
  const st = workStage(w), p = wplace(w), nm = `${ddmm(w.day)} ${p.name}`;
  if (st === "hours") {
    const ts = w.day >= today() ? parseStart(text) : null;
    if (ts) {
      w.t_from = ts; w.hours = defH(w); w.t_to = m2hm((hm2m(ts) + defH(w) * 60) % 1440); calcEarn(w); kvPut("alarm:" + w.id, ""); save(); workPlanSyncAll();
      return `${nm}: С ${ts} · В 📅 СМЕНА ${defH(w)} Ч, ДОЛЬШЕ — ТЯНИ В КАЛЕНДАРЕ`;
    }
    const rg = parseRange(text), h = rg ? ceilH(rg[2]) : parseHours(text);
    if (h == null) return null;
    w.hours = h; calcEarn(w); w.t_from = rg ? rg[0] : null; w.t_to = rg ? rg[1] : null; save(); workPlanSyncAll();
    return `${nm}: ${gnum(h)} Ч${rg ? ` (${rg[0]}–${rg[1]})` : ""}${w.earned != null ? " = " + fmtRub(w.earned) : ""}`;
  }
  if (st === "earned") {
    const a = String(text).trim() === "+" ? (p.rate || null) : parseSum(text);
    if (a == null) return null;
    w.earned = a; save(); return `${nm}: ${fmtRub(a)}`;
  }
  const a = parseSum(text);
  if (a == null) return null;
  w.tips = a; save(); return `${nm}: БОНУСЫ ${fmtRub(a)}`;
}
function setShiftEnd(w, tTo) {                   // t_from уже есть, конец известен
  const rg = parseRange(`${w.t_from} - ${tTo}`); if (!rg) return null;
  const p = wplace(w);
  w.hours = ceilH(rg[2]); w.t_to = rg[1]; calcEarn(w);
  kvPut("endok:" + w.id, "1"); return [rg[0], rg[1], w.hours];
}
function wakeAlarm(day, tFrom) {                 // подъём за 2 часа до начала (час ритуалы + час дорога)
  if (!tFrom || day < today()) return "";
  const [h, m] = tFrom.split(":").map(Number), mins = ((h * 60 + m - 120) % 1440 + 1440) % 1440;
  if (day === today() && mins <= nowMin()) return "";
  const when = [today(), addDays(today(), 1)].includes(day) ? "" : " НА " + ddmm(day);
  return `ПОСТАВЬ ⏰ ${Math.floor(mins / 60)}:${pad(mins % 60)}${when}`;
}

// ---------------------------------------------------------------- деньги месяца
const ymAdd = (ym, n) => { const k = +ym.slice(0, 4) * 12 + +ym.slice(5, 7) - 1 + n; return String(Math.floor(k / 12)).padStart(4, "0") + "-" + pad(k % 12 + 1); };
function monthMoney(ym) {
  const a = ym + "-01", b = ymAdd(ym, 1) + "-01";
  const ws = T("work_days").filter(w => w.day >= a && w.day < b && (w.hours != null || w.earned != null));
  const sum = f => ws.reduce((s, w) => s + (f(w) || 0), 0);
  const spend = T("spend_log").filter(r => r.day >= a && r.day < b).reduce((s, r) => s + (r.amount || 0), 0);
  const last = [addDays(b, -1), addDays(today(), -1)].sort()[0];
  const all = T("work_days").map(w => w.day).sort()[0];
  const start = all && all > a ? all : a;
  const elapsed = Math.max(daysBetween(start, last) + 1, 0);
  const worked = new Set(T("work_days").filter(w => w.day >= start && w.day <= last && ((w.hours || 0) > 0 || (w.earned || 0) > 0)).map(w => w.day)).size;
  const shop = T("shop_inc").filter(r => r.day >= a && r.day < b).reduce((s, r) => s + (r.amount || 0), 0);
  const e = sum(w => w.earned), t = sum(w => w.tips) + shop;
  return {n: ws.length, h: sum(w => w.hours), e, t, spend, net: e + t - spend, chill: Math.max(elapsed - worked, 0)};
}
function reportText(ym) {
  const m = monthMoney(ym), name = MON[+ym.slice(5, 7) - 1];
  return [`💼 ${name} ${ym.slice(0, 4)}`, `СМЕН: ${m.n}   — ОТДЫХ: ${m.chill} ДН.`, `➕ ${fmtRub(m.e)}`, `🎁 ${fmtRub(m.t)}`, `➖ ${fmtRub(m.spend)}`, `ЧИСТЫЙ 💰 ${fmtRub(m.net)}`].join("\n");
}
function yearText(yy) {
  const L = [`🗓 ${yy}`, "МЕС · СМЕН · СТАВКА+БОНУСЫ − ТРАТЫ = ИТОГО"], tot = {n: 0, e: 0, t: 0, spend: 0, net: 0, chill: 0};
  for (let m = 1; m <= 12; m++) {
    const x = monthMoney(`${yy}-${pad(m)}`);
    if (!(x.n || x.spend)) continue;
    L.push(`${MON[m - 1].slice(0, 3)} · ${x.n} · ${fmtN(x.e + x.t)} − ${fmtN(x.spend)} = ${fmtN(x.net)}₽`);
    Object.keys(tot).forEach(k => tot[k] += x[k]);
  }
  L.push(`ВСЕГО: ${tot.n} СМ. · ИТОГО ${fmtRub(tot.net)} (СТАВКА ${fmtRub(tot.e)}, БОНУСЫ ${fmtRub(tot.t)}, ТРАТЫ −${fmtRub(tot.spend)}) · ЧИЛ ${tot.chill} ДН.`);
  const unp = unpaidRows().filter(r => r.day.slice(0, 4) === yy);
  if (unp.length) L.push(`СТАВКА НЕ ПОЛУЧЕНА: ${fmtRub(unp.reduce((s, r) => s + r.earned, 0))} (${unp.length} СМ.)`);
  return L.join("\n");
}
function unpaidRows(pid) {
  return T("work_days").filter(w => w.earned != null && !w.paid_on && (!pid || w.place_id === pid)).sort((a, b) => a.day.localeCompare(b.day));
}
function unpaidLine(unp, ym) {                   // ждём ставку и ➖ (траты внутри компании приходят с ЗП)
  const yy = ym.slice(0, 4), cur = unp.filter(r => r.day.slice(0, 7) === ym), yr = unp.filter(r => r.day.slice(0, 4) === yy);
  const L = ["ЖДЁТ ВЫПЛАТЫ (СТАВКА + ➖):", `${MON[+ym.slice(5, 7) - 1]}: ${fmtRub(cur.reduce((s, r) => s + due(r), 0))} (${cur.length} СМ.)`,
    `${yy} ГОД: ${fmtRub(yr.reduce((s, r) => s + due(r), 0))} (${yr.length} СМ.)`];
  const ex = yr.reduce((s, r) => s + (r.exp || 0), 0);
  if (ex) L.push(`В ТОМ ЧИСЛЕ ➖: ${fmtRub(ex)}`);
  return L.join("\n");
}
const owedLine = p => {                          // внутренняя история, видна только в ЗП
  const o = p.owed || 0; if (!o) return null;
  return `${o > 0 ? "+" : "−"}${fmtRub(Math.abs(o))} ${p.name} должон`;
};
const pendingTransfers = () => T("transfers").filter(t => !t.done);

// ---------------------------------------------------------------- ЗП: налог со всей суммы, потом вычитаются чужие деньги
function payFinalize(st) {
  const tr = taxRate(st.place), gross = st.gross_all, tax = Math.round(gross * tr);
  st.gross = gross; st.tax = tax; st.tr = tr; st.after_tax = gross - tax;
  st.net = Math.round((gross - tax - st.others.reduce((s, o) => s + o[1], 0)) * 100) / 100;
}
function payConfirm(st) {                        // «ПОЛУЧИЛ ✅»: смены оплачены, остаток → долг компании, чужие → переводы
  const sel = unpaidRows().filter(w => st.sel.includes(w.id)); let extra = "";
  sel.forEach(w => { w.paid_on = today(); });
  if (st.net != null && st.place) {
    const left = Math.round((st.net - sel.reduce((s, w) => s + due(w), 0)) * 100) / 100, p = getPlace(st.place);
    if (left) { p.owed = Math.round(((p.owed || 0) + left) * 100) / 100; extra += `ОСТАТОК ${fmtN(left)}₽ → ${owedLine(p) || ""}\n`; }
  }
  (st.others || []).forEach(o => {
    T("transfers").push({id: nextId("transfers"), name: o[0], amount: o[1], note: o[2], day: today(), done: 0});
    extra += `ПЕРЕВЕДИ: ${o[0].toUpperCase()} ${fmtN(o[1])}₽\n`;
  });
  save(); return extra;
}

// ---------------------------------------------------------------- траты
function parseSpendInput(text, base) {
  let t = String(text || "").trim(), day = base || today();
  const m = t.match(/^(\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?|вчера|позавчера|сегодня)\s+(.+)$/i);
  if (m) { day = parseDateText(m[1].replace("/", ".")); t = m[2]; }
  const amt = parseSum(t);
  if (!day || amt == null || day > today() || daysBetween(day, today()) > 800) return null;
  return [day, amt, t];
}
function addSpendText(text, day, cat) {          // «400+500» хранится слагаемыми
  const sp = parseSpendInput(text, day); if (!sp) return null;
  const terms = /\d\s*\+\s*\d/.test(sp[2]) ? sp[2].split("+").map(parseSum) : null;
  const put = a => T("spend_log").push({id: nextId("spend_log"), day: sp[0], amount: a, note: null, cat: cat || null});
  if (terms && terms.length > 1 && !terms.includes(null) && Math.abs(terms.reduce((s, x) => s + x, 0) - sp[1]) < 0.01) terms.forEach(put);
  else put(sp[1]);
  save(); return sp;
}
const spendCount = day => T("spend_log").filter(r => r.day === day).length;
const spendSum = day => T("spend_log").filter(r => r.day === day).reduce((s, r) => s + (r.amount || 0), 0);
const daySpends = day => T("spend_log").filter(r => r.day === day && r.amount > 0);
function spendSumline(items) {                   // 🍱400+500=900₽
  const tot = items.reduce((s, r) => s + r.amount, 0);
  if (items.length > 1) {
    let prev = null;
    return items.map(r => { const s = (r.cat !== prev ? (CAT_ICON[r.cat] || "") : "") + gnum(r.amount); prev = r.cat; return s; }).join("+") + `=${fmtN(tot)}₽`;
  }
  return (CAT_ICON[items[0].cat] || "") + fmtN(tot) + "₽";
}

// ================================================================== ИНТЕРФЕЙС
let _acts = [], wv = {v: "main"};
const WEXT = {};                                  // экраны из других файлов (долги и т. д.)
const B = (label, fn, cls) => `<button class="${cls || "btn"}" data-a="${_acts.push(fn) - 1}">${label}</button>`;
function W(html) {
  shell(html);
  document.querySelectorAll("[data-a]").forEach(b => b.onclick = () => _acts[+b.dataset.a]());
}
const wgo = (v, o) => { wv = Object.assign({v}, o || {}); renderWork(); };
const refresh = () => { if (screen === "work") renderWork(); };

function sheetOf(build) {                        // build(B) → html; кнопки B(...) привязываются к листу
  const w = document.createElement("div"); w.className = "sheet"; document.body.appendChild(w);
  w.onclick = e => { if (e.target === w) w.remove(); };
  const acts = [], b = (label, fn, cls) => `<button class="${cls || ""}" data-s="${acts.push(fn) - 1}">${label}</button>`;
  w.innerHTML = "<div>" + build(b) + "</div>";
  w.querySelectorAll("[data-s]").forEach(x => x.onclick = () => acts[+x.dataset.s]());
  w.close = () => w.remove();
  return w;
}
function askText(title, ok, o) {                 // поле ввода: ok(text) → true закрыть, false оставить
  o = o || {};
  const w = sheetOf(b => `<div class="stt">${esc(title)}</div>${o.ml ? `<textarea class="ai" rows="5" placeholder="${esc(o.ph || "")}">${esc(o.val || "")}</textarea>` : `<input class="ai" placeholder="${esc(o.ph || "")}" value="${esc(o.val || "")}">`}
    <div class="acts">${(o.extra || []).map(x => b(x[0], () => { w.close(); x[1](); })).join("")}${b("✕", () => w.close())}${b("✅", () => go_())}</div>`);
  const inp = w.querySelector(".ai"), go_ = () => { const r = ok(inp.value); if (r !== false) w.close(); };
  try { inp.focus(); } catch (e) {}
  return w;
}
function choose(title, items, back) {            // items: [[label, fn]]
  sheetOf(b => `<div class="stt">${esc(title)}</div>` + items.map(x => b(x[0], () => { x[1](); }, "btn")).join(""));
}
function toast(text) { const w = sheetOf(b => `<div class="stt">${esc(text)}</div>` + b("✅", () => {}, "btn")); w.onclick = () => w.remove(); return w; }

// ---------------------------------------------------------------- цепочка заполнения смены
function shiftChain(wid) {
  const w = workRow(wid); if (!w) return;
  const st = workStage(w), p = wplace(w);
  if (st === "done" || (st !== "hours" && !shiftOver(w))) {   // смена ещё идёт или впереди: бонусы спрошу, когда закончится
    if (st !== "done" && w.day >= today()) { const a = wakeAlarm(w.day, w.t_from); if (a) alarmSheet(w, a); }
    return refresh();
  }
  const extra = [];
  if (st === "hours") extra.push(["❌ НЕ РАБОТАЛ", () => { S.db.work_days = T("work_days").filter(x => x.id !== wid); save(); refresh(); }]);
  if (st === "tips") extra.push(["НЕТ", () => { w.tips = 0; save(); shiftChain(wid); }]);
  askText(workPrompt(w), t => {
    const r = applyWorkText(w, t);
    if (r == null) { toast("НЕ ПОНЯЛ. ПОПРОБУЙ ЕЩЁ РАЗ"); return false; }
    setTimeout(() => shiftChain(wid), 30); return true;
  }, {extra});
}
function alarmSheet(w, txt) {
  if (kvGet("alarm:" + w.id) === "2") return;
  kvPut("alarm:" + w.id, "1");
  sheetOf(b => `<div class="stt">${esc(txt)}</div><div class="acts">${b("✅", () => { kvPut("alarm:" + w.id, "2"); document.querySelector(".sheet:last-of-type").remove(); })}</div>`);
}
function pickPlace(cb, withNew) {
  const ps = places();
  withNew = true;
  choose("ГДЕ РАБОТАЛ / БУДЕШЬ РАБОТАТЬ?", ps.map(p => [isHourly(p) ? placeLabel(p) : p.name, () => { closeTop(); cb(p.id); }])
    .concat(withNew ? [["➕ КОМПАНИЯ", () => { closeTop(); askText("КАК НАЗЫВАЕТСЯ КОМПАНИЯ?", t => {
      const n = t.trim().slice(0, 30); if (!n) return false;
      const r = parsePlace(n); cb(r ? savePlace(r[0], r[1], r[2]) : savePlace(n, 0, "shift"));
    }); }]] : []));
}
function closeTop() { const s = document.querySelectorAll(".sheet"); if (s.length) s[s.length - 1].remove(); }
function startShift(day, pid) {                  // описание → (ставка за смену) → время → сумма → бонусы
  const wid = planWork(day, pid), w = workRow(wid), p = wplace(w);
  askText(`${ddmm(day)} · ${p.name.toUpperCase()}\nОПИСАНИЕ СМЕНЫ?`, t => {
    if (!t.trim()) return false;
    w.note = t.trim().slice(0, 300); save();
    if (isHourly(p)) { setTimeout(() => shiftChain(wid), 30); return true; }
    setTimeout(() => askText(`СТАВКА ЗА СМЕНУ? НАПИШИ СУММУ${p.rate ? ` (+ = ${p.rate}₽)` : ""}`, s => {
      const a = s.trim() === "+" ? (p.rate || null) : parseSum(s);
      if (a == null) { toast("НЕ ПОНЯЛ. НАПИШИ СУММУ"); return false; }
      w.earned = a; p.rate = a; p.unit = "shift"; save(); setTimeout(() => shiftChain(wid), 30); return true;
    }), 30);
    return true;
  });
}
function tomorrowShift() { pickPlace(pid => startShift(addDays(today(), 1), pid), false); }
function addShiftOnDate() {
  pickPlace(pid => askText("КАКАЯ ДАТА? ПРИМЕР: 05.11 ИЛИ ВЧЕРА ИЛИ ЗАВТРА", t => {
    const d = parseDateText(t); if (!d) { toast("НЕ ПОНЯЛ ДАТУ"); return false; }
    setTimeout(() => startShift(d, pid), 30); return true;
  }), true);
}

// ---------------------------------------------------------------- «еду домой?»: 21:30, 00:00 и каждый час до 07:00
function workTick() {
  const nowT = Date.now(); if (nowT - (workTick.t || 0) < 15000) return; workTick.t = nowT;
  if (document.hidden || document.querySelector(".sheet") || screen === "run" || screen === "train") return;
  workPlanSyncAll();
  const n = new Date();
  if (n.getDay() === 0 && hmNow() >= "21:00" && !kvGet("bonusweek:" + today())) { kvPut("bonusweek:" + today(), "1"); bonusWeek(); return; }
  for (const w of T("work_days")) {
    if (!w.t_from || w.day < today()) continue;                             // будильник за 2 ч до старта
    if (!kvGet("alarm:" + w.id)) { const a = wakeAlarm(w.day, w.t_from); kvPut("alarm:" + w.id, "1"); if (a) { alarmSheet(w, a); return; } }
  }
  for (const w of T("work_days")) {                                          // смена закончилась (по 📅) → бонусы кроме shop bot
    if (w.tips != null || w.src || kvGet("tipsq:" + w.id)) continue;
    const end = shiftEnd(w); if (!end || end > n || n - end > 36 * 3600e3) continue;
    kvPut("tipsq:" + w.id, "1"); shiftChain(w.id); return;
  }
}
function endAsk(w) {
  sheetOf(b => `<div class="stt">🤵‍♂️ ${esc(wplace(w).name.toUpperCase())}${w.t_from ? " · С " + w.t_from : ""}\nРАБОТАЮ ЕЩЁ? ЕДУ ДОМОЙ?</div>
    <div class="acts">${b("🏠 ДОМОЙ", () => { closeTop(); goHome(w); })}${b("⏳ ЕЩЁ", closeTop)}${b("✏️", () => { closeTop(); editEnd(w); })}</div>`);
}
function goHome(w) {
  const n = new Date();
  if (!w.t_from) return editStartEnd(w);
  const r = setShiftEnd(w, pad(n.getHours()) + ":" + pad(Math.floor(n.getMinutes() / 5) * 5));
  if (!r) return;
  save(); const t = toast(`ДОМОЙ В ${r[1]} · ${w.t_from}–${r[1]} = ${gnum(r[2])} Ч${isHourly(wplace(w)) ? " = " + fmtRub(w.earned) : ""}`);
  setTimeout(() => { t.remove(); shiftChain(w.id); }, 1500);
}
function editEnd(w) {
  askText("ВО СКОЛЬКО ЗАКОНЧИЛ? ПРИМЕР: 1:30", t => {
    if (!w.t_from) return editStartEnd(w), true;
    const r = setShiftEnd(w, (parseStart(t) || ""));
    if (!r) { toast("НЕ ПОНЯЛ. НАПИШИ, НАПРИМЕР, 1:00"); return false; }
    save(); setTimeout(() => shiftChain(w.id), 30); return true;
  });
}
function editStartEnd(w) {
  askText("ВО СКОЛЬКО НАЧАЛ И ДО СКОЛЬКИ? (7:00 - 3:00)", t => {
    const rg = parseRange(t); if (!rg) { toast("НЕ ПОНЯЛ"); return false; }
    w.t_from = rg[0]; w.t_to = rg[1]; w.hours = ceilH(rg[2]); calcEarn(w);
    kvPut("endok:" + w.id, "1"); setTimeout(() => shiftChain(w.id), 30); return true;
  });
}

// ---------------------------------------------------------------- экраны
function renderWork() {
  _acts = []; workPlanSyncAll();
  ({main: wMain, shifts: wShifts, shift: wShift, pay: wPay, spend: wSpend, sday: wSday, rep: wRep, year: wYear, rmenu: wRmenu, ...WEXT}[wv.v] || wMain)();
}
function wMain() {
  const ym = today().slice(0, 7), unp = unpaidRows(), pend = pendingTransfers(), fill = workPending();
  let h = `<div class="pre">${esc(reportText(ym))}</div>`;
  if (unp.length) h += `<div class="dim" style="white-space:pre-line">${esc(unpaidLine(unp, ym))}</div>`;
  h += `<div class="r2 ic">${B("➕", addShiftOnDate)}${B("💰", payStart)}${B("📝", () => wgo("shifts"))}${B("📊", () => wgo("rmenu"))}</div>`;
  if (fill.length) h += B(`✍ ДОЗАПОЛНИТЬ: ${fill.length}`, () => shiftChain(fill[0].id));
  if (pend.length) {
    h += `<div class="sec">ПЕРЕВЕДИ</div>`;
    pend.forEach(t => h += B(`✅ ПЕРЕВЁЛ ${esc(t.name.slice(0, 14))} ${fmtN(t.amount)}₽${t.note ? " · " + esc(t.note) : ""}`, () => { t.done = 1; save(); renderWork(); }));
  }
  W(h);
}
function wShifts() {
  const rows = T("work_days").filter(w => !w.paid_on).sort((a, b) => b.day.localeCompare(a.day)).slice(0, 30);
  W(`<div class="title">СМЕНЫ</div>` + (rows.map(w => B(`${ddmm(w.day)} ${esc(wplace(w).name.slice(0, 12))} ${w.hours == null ? "?" : gnum(w.hours) + "Ч"}${w.earned == null ? "" : " " + fmtRub(w.earned)}`, () => wgo("shift", {id: w.id}))).join("") || `<div class="dim">ПУСТО</div>`) + B("⬅", () => wgo("main")));
}
function wShift() {
  const w = workRow(wv.id); if (!w) return wgo("shifts");
  const p = wplace(w), si = T("shop_inc").filter(r => r.day === w.day).reduce((s, r) => s + (r.amount || 0), 0);
  const L = [`${ddmm(w.day)} · ${p.name}${w.note ? " — " + w.note : ""}`, `${w.hours == null ? "?" : gnum(w.hours)} Ч${w.t_from ? ` · ${w.t_from}–${w.t_to || "?"}` : ""}`,
    `СТАВКА: ${w.earned == null ? "НЕТ" : fmtRub(w.earned)}`, `🫴🏻 БОНУСЫ: ${w.tips == null ? "НЕТ" : fmtRub(w.tips)}${si ? ` + 🛒 SHOP BOT ${fmtRub(si)}` : ""}`];
  if (w.exp) L.push(`➖ НА РАБОТЕ: ${fmtRub(w.exp)}`);
  if (w.paid_on) L.push(`СТАВКА ПОЛУЧЕНА: ${ddmm(w.paid_on)}`);
  const re = () => renderWork();
  const sumAsk = (title, cur, set) => askText(`${title} ${ddmm(w.day)}\nНОВАЯ СУММА (1500 ИЛИ 500+1000) ИЛИ +300, ЧТОБЫ ПРИБАВИТЬ`, t => {
    const add = t.trim().startsWith("+"), a = parseSum(add ? t.trim().slice(1) : t); if (a == null) { toast("НЕ ПОНЯЛ"); return false; }
    set(add ? (cur || 0) + a : a); save(); re(); return true; });
  W(`<div class="pre">${esc(L.join("\n"))}</div><div class="r2 ic">
    ${B("🫴🏻", () => sumAsk("🫴🏻 БОНУСЫ, ЧАЕВЫЕ, МОНЕТЫ (КРОМЕ SHOP BOT)", w.tips, v => w.tips = v))}
    ${B("➖", () => sumAsk("➖ РАСХОДЫ НА РАБОТЕ (ПРИДУТ С ЗП)", w.exp, v => w.exp = v || null))}
    ${B("✏️", () => shiftEdit(w))}
    ${B("🗑️", () => { if (confirm("УДАЛИТЬ СМЕНУ?")) { S.db.work_days = T("work_days").filter(x => x.id !== w.id); save(); workPlanSyncAll(); wgo("shifts"); } })}
    ${B("⬅", () => wgo("shifts"))}</div>`);
}
function shiftEdit(w) {                            // ✏️ место, описание, часы (часы двигают конец смены в 📅)
  const p = wplace(w);
  sheetOf(b => `<div class="stt">✏️ ${ddmm(w.day)}</div>` +
    b(`🏢 ${esc(p.name)}`, () => { closeTop(); pickPlace(pid => { w.place_id = pid; calcEarn(w); save(); renderWork(); }, true); }, "btn") +
    b(`📝 ${esc(w.note || "ОПИСАНИЕ")}`, () => { closeTop(); askText("ОПИСАНИЕ СМЕНЫ (НАПРИМЕР: РЖД)", t => { w.note = t.trim().slice(0, 300) || null; save(); renderWork(); return true; }, {val: w.note || ""}); }, "btn") +
    b(`⏱ ${w.hours == null ? "?" : gnum(w.hours)} Ч`, () => { closeTop(); askText("СКОЛЬКО ЧАСОВ?", t => {
      const h = parseHours(t); if (h == null) { toast("НЕ ПОНЯЛ"); return false; }
      w.hours = ceilH(h); if (w.t_from) w.t_to = m2hm((hm2m(w.t_from) + w.hours * 60) % 1440); calcEarn(w); save(); renderWork(); return true; }, {val: w.hours == null ? "" : gnum(w.hours)}); }, "btn") +
    `<div class="acts">${b("⬅", closeTop)}</div>`);
}
// ---- ЗП
function payStart() {
  const yy = today().slice(0, 4), yr = unpaidRows().filter(r => r.day.slice(0, 4) === yy);
  choose(`ОТ КОГО ПРИШЛА ЗП?\n${yy} ГОД: ${fmtRub(yr.reduce((s, r) => s + due(r), 0))} (${yr.length} СМ.)`,
    [["ВСЕ МЕСТА", () => { closeTop(); payBegin({place: null, sel: [], others: []}); }]].concat(places().map(p => [placeLabel(p), () => {
      closeTop();
      askText(`💰 ${p.name.toUpperCase()} · СКОЛЬКО ПРИШЛО?${taxRate(p.id) ? ` (БЕЗ ВЫЧЕТА НАЛОГА ${Math.round(TAX_RATE * 100)}%)` : ""}`, t => {
        const a = parseSum(t.replace(/[₽р]/g, "")); if (!a) { toast("НЕ ПОНЯЛ. НАПИШИ СУММУ, НАПРИМЕР 82450"); return false; }
        const st = {place: p.id, sel: [], gross_all: a, others: []}; payFinalize(st);
        setTimeout(() => unpaidRows(p.id).length ? otherQ(st) : toast("НЕТ СМЕН БЕЗ ВЫПЛАТЫ"), 30); return true;
      });
    }])));
}
function otherQ(st) {
  const L = st.others.length ? "ЕЩЁ КТО-ТО? (ЧУЖИЕ: " + st.others.map(o => `${o[0].toUpperCase()} ${fmtN(o[1])}₽`).join(", ") + ")" : `ПРИШЛО ${fmtN(st.gross_all)}₽\nЕСТЬ ДЕНЬГИ ДРУГОГО ЧЕЛОВЕКА?`;
  sheetOf(b => `<div class="stt">${esc(L)}</div><div class="acts">${b("✅ ДА", () => { closeTop(); otherAdd(st); })}${b("❌ НЕТ", () => { closeTop(); payFinalize(st); payBegin(st); })}</div>`);
}
function otherAdd(st) {
  askText("ИМЯ ЧЕЛОВЕКА?", n => {
    if (!n.trim()) return false;
    setTimeout(() => askText(`${n.trim().toUpperCase()} · СКОЛЬКО?`, s => {
      const a = parseSum(s.replace(/[₽р]/g, "")); if (!a) { toast("НЕ ПОНЯЛ. НАПРИМЕР 5000"); return false; }
      setTimeout(() => askText("КАК БЫЛО? ЗА ЧТО / КАК ПРИШЛО. «-» = ПРОПУСТИТЬ", c => {
        st.others.push([n.trim().slice(0, 40), a, c.trim() === "-" ? "" : c.trim().slice(0, 80)]); payFinalize(st);
        setTimeout(() => otherQ(st), 30); return true;
      }), 30); return true;
    }), 30); return true;
  });
}
function payBegin(st) {
  tab = "work"; screen = "work";
  if (!unpaidRows(st.place).length) { render(); return toast("НЕТ СМЕН С СУММОЙ, ЗА КОТОРЫЕ ЖДЁМ ВЫПЛАТУ"); }
  wv = {v: "pay", st}; render();
}
function wPay() {
  const st = wv.st, p = st.place ? getPlace(st.place) : null, unp = unpaidRows(st.place), sel = unp.filter(w => st.sel.includes(w.id));
  let money = "";
  if (st.net != null) {
    const left = st.net - sel.reduce((s, w) => s + due(w), 0);
    money = (st.tax ? `ПРИШЛО ${fmtN(st.gross)} − НАЛОГ ${Math.round(st.tr * 100)}% ${fmtN(st.tax)} = ${fmtN(st.after_tax)}₽\n` : `ПРИШЛО ${fmtN(st.gross)}₽ (БЕЗ НАЛОГА)\n`) +
      st.others.map(o => `− ЧУЖИЕ · ${o[0].toUpperCase()}: ${fmtN(o[1])}₽\n`).join("") + (st.others.length ? `= МОИ: ${fmtN(st.net)}₽\n` : "") + `ОСТАТОК: ${fmtN(left)}₽\n`;
  }
  const ols = places().filter(x => (x.owed || 0) && (!p || x.id === p.id)).map(owedLine).join("\n");
  const head = `💰 ЗП · ${p ? p.name.toUpperCase() : "ВСЕ МЕСТА"}\n${money}НЕ ПОЛУЧЕНО: ${fmtRub(unp.reduce((s, w) => s + due(w), 0))} (${unp.length} СМ.)\n${ols ? ols + "\n" : ""}ОТМЕТЬ СМЕНЫ, ЗА КОТОРЫЕ ПРИШЛИ ДЕНЬГИ (ПОСЛЕДНИЕ 30)\nВЫБРАНО: ${fmtRub(sel.reduce((s, w) => s + due(w), 0))} (${sel.length} СМ.)`;
  const tog = id => { const i = st.sel.indexOf(id); if (i < 0) st.sel.push(id); else st.sel.splice(i, 1); renderWork(); };
  const years = {}; unp.forEach(w => (years[w.day.slice(0, 4)] = years[w.day.slice(0, 4)] || []).push(w.id));
  W(`<div class="pre">${esc(head)}</div><div class="chk">` + unp.slice(-30).map(w => B(`${st.sel.includes(w.id) ? "☑" : "☐"} ${ddmm(w.day)} ${fmtRub(due(w))}`, () => tog(w.id), "btn sm")).join("") + `</div>` +
    `<div class="r2">` + Object.keys(years).sort().map(y => B(`${years[y].every(i => st.sel.includes(i)) ? "☑" : "☐"} ${y} (${years[y].length})`, () => {
      const all = years[y].every(i => st.sel.includes(i)); st.sel = st.sel.filter(i => !years[y].includes(i)); if (!all) st.sel = st.sel.concat(years[y]); renderWork(); })).join("") + `</div>` +
    `<div class="r2">${B("ВСЕ", () => { st.sel = unp.map(w => w.id); renderWork(); })}${B("ПОЛУЧИЛ ✅", () => { const ex = payConfirm(st); wgo("main"); if (ex) toast("ЗП ОТМЕЧЕНА ✅\n" + ex.trim()); })}</div>` + B("⬅", () => wgo("main")));
}
// ---- траты
function spendAdd(day) {
  sheetOf(b => `<div class="stt">➖ ${ddmm(day)} · КАТЕГОРИЯ?</div><div class="cats">${SPEND_CATS.map(c => b(c[1], () => { closeTop(); spendAsk(day, c[0]); })).join("")}</div>`);
}
function spendAsk(day, cat) {
  askText(`${CAT_ICON[cat] || ""} ${ddmm(day)} · СКОЛЬКО? (0 = НЕ ТРАТИЛ)`, t => {
    if (!addSpendText(t, day, cat)) { toast("НЕ ПОНЯЛ. ПРИМЕР: 450 ИЛИ 300+150 ИЛИ 05.11 200"); return false; }
    if (screen === "work") setTimeout(renderWork, 30); return true;
  });
}
function wSpend() {
  const costs = T("costs"), per = costs.reduce((s, c) => s + (c.per_day || 0), 0), L = [];
  if (per) L.push(`БАЗА = ${fmtN(per * 30)}/МЕС.`, "");
  L.push("➖ ТРАТЫ");
  for (let k = 13; k >= 0; k--) {
    const day = addDays(today(), -k), ev = daySpends(day);
    L.push(`${ddmm(day)}  ` + (ev.length ? spendSumline(ev) : spendCount(day) ? "0₽" : k === 0 ? "—" : "❓"));
  }
  W(`<div class="pre">${esc(L.join("\n"))}</div><div class="r2">${B("➕ " + ddmm(today()), () => spendAdd(today()))}${B("📅 ДРУГОЙ ДЕНЬ", () => choose("ЗА КАКОЙ ДЕНЬ ЗАПИСАТЬ?",
    [...Array(14).keys()].map(k => { const d = addDays(today(), -k); return [`${ddmm(d)} ${spendCount(d) ? "−" + fmtN(spendSum(d)) : "❓"}`, () => { closeTop(); spendAdd(d); }]; })))}</div>
    ${B("✏️ ПРАВКА", () => wgo("sday"))}`);
}
function wSday() {
  if (!wv.day) {
    const days = [...Array(14).keys()].map(k => addDays(today(), -k)).filter(spendCount);
    return W(`<div class="title">✏️ КАКОЙ ДЕНЬ ПРАВИМ?</div>` + (days.map(d => B(`${ddmm(d)} ${fmtN(spendSum(d))}`, () => wgo("sday", {day: d}))).join("") || `<div class="dim">ЗА 14 ДНЕЙ ТРАТ НЕТ</div>`) + B("⬅", () => wgo("spend")));
  }
  const ents = T("spend_log").filter(r => r.day === wv.day && r.amount > 0);
  W(`<div class="title">${ddmm(wv.day)} · ЖМИ ❌ ЧТОБЫ УДАЛИТЬ</div>` + (ents.map(r => B(`❌ ${CAT_ICON[r.cat] || ""}${gnum(r.amount)}`, () => { S.db.spend_log = T("spend_log").filter(x => x !== r); save(); wgo("sday", {day: wv.day}); })).join("") || `<div class="dim">ПУСТО</div>`) + B("⬅", () => wgo("sday")));
}
// ---- итоги
function wRmenu() {
  const yy = wv.yy || String(new Date().getFullYear()), cm = new Date(), top = +yy < cm.getFullYear() ? 12 : cm.getMonth() + 1;
  W(`<div class="title">📊 ИТОГ · ${yy}</div><div class="mon">` + [...Array(top).keys()].map(i => B(MON[i].slice(0, 3), () => wgo("rep", {ym: `${yy}-${pad(i + 1)}`}), "btn sm")).join("") + `</div>
    <div class="r2">${B("◀", () => wgo("rmenu", {yy: String(+yy - 1)}))}${B("🗓 ГОД " + yy, () => wgo("year", {yy}))}${+yy < cm.getFullYear() ? B("▶", () => wgo("rmenu", {yy: String(+yy + 1)})) : ""}</div>` + B("⬅", () => wgo("main")));
}
function wRep() { W(`<div class="pre">${esc(reportText(wv.ym))}</div><div class="r2">${B("◀", () => wgo("rep", {ym: ymAdd(wv.ym, -1)}))}${B("▶", () => wgo("rep", {ym: ymAdd(wv.ym, 1)}))}${B("🗓 ГОД", () => wgo("year", {yy: wv.ym.slice(0, 4)}))}</div>` + B("⬅", () => wgo("rmenu"))); }
function wYear() { W(`<div class="pre">${esc(yearText(wv.yy))}</div>` + B("⬅", () => wgo("rmenu", {yy: wv.yy}))); }

// ---------------------------------------------------------------- смена в 📅 (оранжевая), календарь — главный по времени
// Смена = одно дело в плане (role "shift", по умолчанию 8 ч, может идти за полночь) + дорога 1 ч туда и 1 ч обратно.
// Правишь время в 📅 → часы и сумма в 🤵‍♂️ пересчитываются сами. Правишь в 🤵‍♂️ → двигается дело в 📅.
const shiftEv = w => T("plan").find(e => e.work === w.id && e.role === "shift");
const shiftTitle = w => wplace(w).name + (w.note ? " — " + w.note : "");
const evSig = e => [e.day, e.from, e.to].join("|");
const wSig = w => [w.day, w.t_from, w.t_to, w.hours, w.place_id, w.note].join("|");
function shiftEnd(w) {
  const e = shiftEv(w); if (!e) return null;
  return new Date(dObj(e.day).getTime() + e.to * 60000);
}
const shiftOver = w => { const t = shiftEnd(w); return t ? t <= new Date() : w.day < today(); };
function roadsSync(w, e) {
  S.db.plan = T("plan").filter(x => !(x.work === w.id && x.role === "road"));
  if (!e) return;
  const road = (from, title) => {
    let day = e.day; while (from < 0) { day = addDays(day, -1); from += 1440; } while (from >= 1440) { day = addDays(day, 1); from -= 1440; }
    T("plan").push({id: nextId("plan"), day, from, to: from + 60, title, color: PCOL[6], nopomo: true, work: w.id, role: "road"});
  };
  road(e.from - 60, "🚇 НА РАБОТУ"); road(e.to, "🚇 ДОМОЙ");
}
function workPlanSync(w) {
  let e = shiftEv(w);
  if (e && e._sig !== evSig(e)) {                // время поменяли в календаре → в смену
    w.day = e.day; w.t_from = m2hm(e.from); w.t_to = m2hm(e.to % 1440); w.hours = ceilH((e.to - e.from) / 60); calcEarn(w);
  } else if (w._ps !== wSig(w)) {               // поменяли в 🤵‍♂️ → в календарь
    if (!w.t_from) { S.db.plan = T("plan").filter(x => x.work !== w.id); e = null; }
    else {
      const f = hm2m(w.t_from);
      let dur = w.t_to ? ((hm2m(w.t_to) - f) % 1440 + 1440) % 1440 : 0;
      if (!dur) dur = Math.max(defH(w) * 60, (w.hours || 0) * 60);
      if (!e) { e = {id: nextId("plan"), nopomo: true, work: w.id, role: "shift", color: PCOL[1]}; T("plan").push(e); }
      Object.assign(e, {day: w.day, from: f, to: f + dur});
      if (w.hours == null || !w.t_to) { w.t_to = m2hm((f + dur) % 1440); w.hours = ceilH(dur / 60); calcEarn(w); }
    }
  } else return false;
  if (e) { e.title = shiftTitle(w); e.color = PCOL[1]; e.nopomo = true; e._sig = evSig(e); }
  roadsSync(w, e);
  w._ps = wSig(w);
  return true;
}
function workPlanSyncAll() {
  let ch = false;
  const ids = new Set(T("work_days").map(w => w.id));
  if (T("plan").some(e => e.work && (!ids.has(e.work) || !e.role))) {        // старые куски смен и удалённые смены
    const old = new Set(T("plan").filter(e => e.work && !e.role).map(e => e.work));
    S.db.plan = T("plan").filter(e => e.work ? ids.has(e.work) && e.role : true);
    T("work_days").forEach(w => { if (old.has(w.id)) w._ps = null; }); ch = true;
  }
  const from = addDays(today(), -3);
  T("work_days").forEach(w => { if (w.day >= from || shiftEv(w)) ch = workPlanSync(w) || ch; });
  T("work_places").forEach(p => { if (/mcg|манифик/i.test(p.name || "") && (p.unit !== "hour" || !p.rate)) { p.unit = "hour"; p.rate = p.rate || 500; ch = true; } });
  if (ch) save();
}
// ---------------------------------------------------------------- вс вечером: бонусы за неделю (то, чего нет в shop bot)
function bonusWeek() {
  const ws = T("work_days").filter(w => w.day >= addDays(today(), -6) && w.day <= today()).sort((a, b) => a.day.localeCompare(b.day));
  sheetOf(b => `<div class="stt">💵 ЗАПИШИ БОНУСЫ ЗА НЕДЕЛЮ\n(ТО, ЧЕГО НЕТ В SHOP BOT)</div>` +
    (ws.map(w => b(`${ddmm(w.day)} ${esc(wplace(w).name)} · ${w.tips == null ? "—" : fmtRub(w.tips)}`, () => { closeTop(); askText(`БОНУСЫ ${ddmm(w.day)}: НОВАЯ СУММА ИЛИ +300`, t => {
      const add = t.trim().startsWith("+"), a = parseSum(add ? t.trim().slice(1) : t); if (a == null) { toast("НЕ ПОНЯЛ"); return false; }
      w.tips = add ? (w.tips || 0) + a : a; save(); setTimeout(bonusWeek, 30); return true; }); }, "btn")).join("") || `<div class="dim">СМЕН ЗА НЕДЕЛЮ НЕТ</div>`) +
    `<div class="acts">${b("✅", closeTop)}</div>`);
}
