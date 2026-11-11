"use strict";
// ================================================================== 🫴🏻 МНЕ ДОЛЖНЫ (с % годовых), «ЗП НЕ ЗАБРАЛ», СОН
const ZP_TITLES = {zp: "📥 ЗП НЕ ЗАБРАЛ", maslov: "👤 МАСЛОВ ДИМА ЗП"};
const ymCur = () => today().slice(0, 7);
const ymfmt = ym => ym.slice(5, 7) + "." + ym.slice(2, 4);
const depNames = () => Object.fromEntries(T("debtors").filter(d => d.active !== 0).map(d => [d.id, d.name]));

function depSeries(ymTo) {                       // баланс = прошлый × (1 + ставка/12) + дал в долг − вернули
  const adj = {};
  T("dep_adj").filter(r => r.ym <= ymTo).forEach(r => { const k = r.debtor_id + "|" + r.ym; adj[k] = (adj[k] || 0) + r.amount; });
  const keys = Object.keys(adj); if (!keys.length) return [];
  const rates = T("dep_rate").slice().sort((a, b) => a.ym.localeCompare(b.ym));
  const rateAt = m => { let v = 0; rates.forEach(r => { if (r.ym <= m) v = r.rate; }); return v; };
  const dids = [...new Set(keys.map(k => +k.split("|")[0]))];
  let m = keys.map(k => k.split("|")[1]).sort()[0];
  const bal = Object.fromEntries(dids.map(d => [d, 0])), out = [];
  while (m <= ymTo) {
    const rt = rateAt(m);
    dids.forEach(d => { bal[d] = bal[d] * (1 + rt / 1200) + (adj[d + "|" + m] || 0); });
    out.push([m, rt, Object.assign({}, bal)]); m = ymAdd(m, 1);
  }
  return out;
}
const depNow = () => { const s = depSeries(ymCur()); return s.length ? s[s.length - 1] : [ymCur(), 0, {}]; };
function depPay(did, amount, day) {              // возврат до 10 числа — в этом месяце, позже — в следующем
  let ym = day.slice(0, 7); if (+day.slice(8) > 10) ym = ymAdd(ym, 1);
  T("dep_adj").push({id: nextId("dep_adj"), debtor_id: did, ym, amount: -amount, day, note: "возврат"}); save(); return ym;
}
function depAdd(did, amount, day) {
  const ym = day.slice(0, 7);
  T("dep_adj").push({id: nextId("dep_adj"), debtor_id: did, ym, amount, day, note: "дал"}); save(); return ym;
}
function parseAmountDate(text) {
  let t = String(text || "").trim(), day = today();
  const m = t.match(/^(.+?)\s+(\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?|вчера|позавчера|сегодня)$/i);
  if (m) { day = parseDateText(m[2].replace("/", ".")); t = m[1]; }
  const a = parseSum(t);
  return a == null || !day ? null : [a, day];
}
const zpRows = g => T("unpaid_items").filter(r => r.grp === g && !r.paid_on).sort((a, b) => (a.day || "").localeCompare(b.day || "") || a.id - b.id);

function wDebts() {
  const [ym, rate, bal] = depNow(), names = depNames();
  const L = [`🫴🏻 МНЕ ДОЛЖНЫ · ${ymfmt(ym)} · ${gnum(rate)}% ГОДОВЫХ`]; let total = 0;
  Object.entries(bal).sort((a, b) => b[1] - a[1]).forEach(([d, b]) => { if (b >= 1) { L.push(`• ${names[d] || "?"}: ${fmtN(b)}₽`); total += b; } });
  L.push(`ИТОГО: ${fmtN(total)}₽ · ДОХОД ЗА МЕСЯЦ: ${fmtN(total * rate / 1200)}₽`);
  const pend = T("dep_adj").filter(r => r.ym > ym).sort((a, b) => a.ym.localeCompare(b.ym));
  if (pend.length) { L.push("", "ЗАЧТЁТСЯ В СЛЕДУЮЩИХ МЕСЯЦАХ:"); pend.forEach(r => L.push(`• ${ymfmt(r.ym)} ${names[r.debtor_id] || "?"}: ${r.amount > 0 ? "+" : ""}${fmtN(r.amount)}₽`)); }
  const owe = T("owe_items"); L.push("", `Я ДОЛЖЕН ПАЦАНАМ: ${fmtN(owe.reduce((s, i) => s + i.amount, 0))}₽ (${owe.length} ПУНКТ.)`);
  ["zp", "maslov"].forEach(g => { const z = zpRows(g); if (z.length) L.push(`${ZP_TITLES[g]}: ${fmtN(z.reduce((s, r) => s + r.amount, 0))}₽ (${z.length} СМ.)`); });
  const pickDebtor = (title, fn) => choose(title, Object.entries(names).map(([d, n]) => [`${n} · ${fmtN(bal[d] || 0)}₽`, () => { closeTop(); fn(+d); }]));
  W(`<div class="pre">${esc(L.join("\n"))}</div>
    <div class="r2">${B("💵 ВЕРНУЛИ", () => pickDebtor("КТО ВЕРНУЛ?", d => askText("СКОЛЬКО ВЕРНУЛ? ПРИМЕР: 20000 ИЛИ 20000 05.11\nДО 10 ЧИСЛА — СПИШЕТСЯ В ЭТОМ МЕСЯЦЕ, ПОСЛЕ — В СЛЕДУЮЩЕМ", t => {
      const r = parseAmountDate(t); if (!r) { toast("НЕ ПОНЯЛ. ПРИМЕР: 20000 ИЛИ 20000 05.11"); return false; }
      const m = depPay(d, r[0], r[1]); renderWork(); toast(`${names[d]}: ВЕРНУЛ ${fmtN(r[0])}₽. ЗАЧТЁТСЯ В ${ymfmt(m)}`); return true; })))}
    ${B("➕ ДАЛ В ДОЛГ", () => pickDebtor("КОМУ ДАЛ В ДОЛГ?", d => askText("СКОЛЬКО ДАЛ? ПРИМЕР: 100000 ИЛИ 100000 05.11", t => {
      const r = parseAmountDate(t); if (!r) { toast("НЕ ПОНЯЛ"); return false; }
      const m = depAdd(d, r[0], r[1]); renderWork(); toast(`${names[d]}: ДОЛГ +${fmtN(r[0])}₽ С ${ymfmt(m)}`); return true; })))}</div>
    <div class="r2">${B("% СТАВКА", () => askText(`% ГОДОВЫХ, КОТОРЫЙ КАПАЕТ НА ДОЛГ, С ${ymfmt(ymCur())}? ПРИМЕР: 13,5`, t => {
      const v = parseFloat(String(t).replace(",", ".")); if (!(v >= 0)) { toast("НЕ ПОНЯЛ"); return false; }
      const r = T("dep_rate").find(x => x.ym === ymCur()); if (r) r.rate = v; else T("dep_rate").push({ym: ymCur(), rate: v}); save(); renderWork(); return true; }))}
    ${B("🧾 Я ДОЛЖЕН", () => wgo("owe"))}</div>
    <div class="r2">${B(ZP_TITLES.zp, () => wgo("zp", {g: "zp", sel: []}))}${B(ZP_TITLES.maslov, () => wgo("zp", {g: "maslov", sel: []}))}</div>
    ${B("📜 ИСТОРИЯ", () => wgo("dhist"))}${B("⬅", () => { tab = screen = "set"; render(); })}`);
}
function wOwe() {
  const items = T("owe_items"), L = ["🧾 Я ДОЛЖЕН ПАЦАНАМ (ОТДАМ, КОГДА РУС ПОЛНОСТЬЮ ЗАКРОЕТ ДОЛГ)"];
  items.forEach(i => L.push(`• ${i.name}: ${fmtN(i.amount)}₽${i.note ? " — " + i.note : ""}`));
  L.push(`ИТОГО: ${fmtN(items.reduce((s, i) => s + i.amount, 0))}₽`);
  const [, , bal] = depNow(), rus = Object.entries(depNames()).filter(([, n]) => n === "Рус")[0];
  if (rus) L.push(`РУС ЕЩЁ ДОЛЖЕН МНЕ: ${fmtN(bal[rus[0]] || 0)}₽`);
  W(`<div class="pre">${esc(L.join("\n"))}</div>` + items.map(i => B(`💸 ОТДАЛ · ${esc(i.name)}`, () => askText("СКОЛЬКО ОТДАЛ? ПРИМЕР: 5000", t => {
    const a = parseSum(t); if (a == null) { toast("НЕ ПОНЯЛ"); return false; }
    const left = i.amount - a; if (left <= 0) S.db.owe_items = T("owe_items").filter(x => x !== i); else i.amount = left; save(); renderWork(); return true; }))).join("") +
    B("➕ ДОЛГ", () => askText("КОМУ И СКОЛЬКО? ПРИМЕР: ИВАН 15000", t => {
      const m = t.match(/^(.+?)\s+(\d[\d\s+]*)$/), a = m ? parseSum(m[2]) : null; if (!a) { toast("НЕ ПОНЯЛ. ПРИМЕР: ИВАН 15000"); return false; }
      T("owe_items").push({id: nextId("owe_items"), name: m[1].trim().slice(0, 40), amount: a, note: null}); save(); renderWork(); return true; })) + B("⬅", () => wgo("debts")));
}
function wZp() {
  const g = wv.g, rows = zpRows(g), sel = rows.filter(r => wv.sel.includes(r.id));
  const L = [`${ZP_TITLES[g]}: ${fmtN(rows.reduce((s, r) => s + r.amount, 0))}₽ (${rows.length} СМ.)`];
  rows.forEach(r => L.push(`• ${r.day ? ddmm(r.day) + "." + r.day.slice(2, 4) : ""} ${String(r.text || "").slice(0, 50)} — ${fmtN(r.amount)}₽`));
  L.push("", rows.length ? "КОГДА ОТДАЛИ: ОТМЕТЬ ДАТЫ, ЗАТЕМ «ОТДАЛИ ✅»" : "ПУСТО");
  if (sel.length) L.push(`ВЫБРАНО: ${fmtN(sel.reduce((s, r) => s + r.amount, 0))}₽ (${sel.length} СМ.)`);
  const tog = id => { const i = wv.sel.indexOf(id); if (i < 0) wv.sel.push(id); else wv.sel.splice(i, 1); renderWork(); };
  W(`<div class="pre">${esc(L.join("\n"))}</div><div class="chk">` + rows.map(r => B(`${wv.sel.includes(r.id) ? "☑" : "☐"} ${r.day ? ddmm(r.day) + "." + r.day.slice(2, 4) : ""} ${fmtN(r.amount)}`, () => tog(r.id), "btn sm")).join("") + `</div>
    <div class="r2">${B("ВСЕ", () => { wv.sel = rows.every(r => wv.sel.includes(r.id)) ? [] : rows.map(r => r.id); renderWork(); })}
    ${B("ОТДАЛИ ✅", () => { rows.filter(r => wv.sel.includes(r.id)).forEach(r => r.paid_on = today()); save(); wv.sel = []; renderWork(); })}</div>` + B("⬅", () => wgo("debts")));
}
function wDhist() {
  const L = ["📜 ПОСЛЕДНИЕ МЕСЯЦЫ: МЕС · % · ИТОГО · ДОХОД"];
  depSeries(ymCur()).slice(-12).forEach(([ym, rt, bal]) => { const tot = Object.values(bal).reduce((s, x) => s + x, 0); L.push(`${ymfmt(ym)} · ${gnum(rt)}% · ${fmtN(tot)}₽ · ${fmtN(tot * rt / 1200)}₽`); });
  W(`<div class="pre">${esc(L.join("\n"))}</div>` + B("⬅", () => wgo("debts")));
}
Object.assign(WEXT, {debts: wDebts, owe: wOwe, zp: wZp, dhist: wDhist});

// ---------------------------------------------------------------- сон: ВСТАЛ В / ЗАПИШИ СОН / ЛЕГ СПАТЬ В
function parseClock(t) {                         // «6 00», «6:00», «600», «23» → «HH:MM»
  t = String(t || "").trim(); let m = t.match(/^(\d{1,2})(?:[\s:.,-]+(\d{1,2}))?$/), h, mi;
  if (m) { h = +m[1]; mi = +(m[2] || 0); } else { m = t.match(/^(\d{1,2})(\d{2})$/); if (!m) return null; h = +m[1]; mi = +m[2]; }
  return h > 23 || mi > 59 ? null : pad(h) + ":" + pad(mi);
}
function sleepSet(day, k, v) {
  let r = T("sleep_log").find(x => x.day === day);
  if (!r) { r = {day, wake: null, sleep_h: null, bed: null, nosleep: 0}; T("sleep_log").push(r); }
  r[k] = v; save();
}
function sleepAsk(it) {                          // ✅ на шаге сна открывает ввод; шаг отмечается, когда ввод принят
  const done = msg => { setStatus(it.id, "yes"); render(); if (msg) toast(msg); };
  if (it.name === "ВСТАЛ В")
    askText("ВСТАЛ В? ПРИМЕР: 6 00", t => { const v = parseClock(t); if (!v) { toast("НЕ ПОНЯЛ. ПРИМЕР: 6 00"); return false; } sleepSet(today(), "wake", v); done("ВСТАЛ В " + v); return true; }, {val: hmNow()});
  else if (it.name === "ЗАПИШИ СОН")
    askText("СКОЛЬКО СПАЛ? ПРИМЕР: 7 30 ИЛИ 7,5", t => {
      const v = parseHours(t); if (v == null) { toast("НЕ ПОНЯЛ. ПРИМЕР: 7 30"); return false; }
      sleepSet(today(), "sleep_h", v); sleepSet(today(), "nosleep", 0); done(`СОН ${gnum(v)} Ч` + (v < 6 ? " · ТРЕНИРОВКА: МИНИМАЛКА" : "")); return true;
    }, {extra: [["🔥 БЕЗ СНА", () => { sleepSet(today(), "nosleep", 1); done("БЕЗ СНА · ТРЕНИРОВКА: МИНИМАЛКА"); }]]});
  else
    askText("ЛЁГ СПАТЬ В? ПРИМЕР: 23 30", t => { const v = parseClock(t); if (!v) { toast("НЕ ПОНЯЛ. ПРИМЕР: 23 30"); return false; } sleepSet(today(), "bed", v); done(`ЛЁГ СПАТЬ В ${v}. ДЕНЬ ЗАКРЫТ 🌙`); return true; }, {val: hmNow()});
}
