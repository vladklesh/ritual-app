"use strict";
// ================================================================== 🔄 СИНХРОНИЗАЦИЯ раз в день (первое открытие после 00:00)
// Приватный репозиторий vladklesh/ritual-data: сервер кладёт туда shop.json (доход из shop bot),
// приложение забирает его целиком (пропущенные дни подтянутся сами) и кладёт копию своих данных backup.json.
// Нет интернета — пробует снова каждые 10 минут, пока приложение открыто, и при каждом следующем открытии.
const GH_REPO = "vladklesh/ritual-data";
let syncBusy = false, syncNext = 0;

const ghUrl = path => `https://api.github.com/repos/${(S.gh && S.gh.repo) || GH_REPO}/contents/${path}`;
const ghHead = () => ({Authorization: "Bearer " + S.gh.token, "X-GitHub-Api-Version": "2022-11-28"});
function b64utf8(str) {                          // UTF-8 → base64 кусками (большие строки)
  const bytes = new TextEncoder().encode(str); let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
async function ghGetJson(path) {
  let r;
  try { r = await fetch(ghUrl(path), {headers: Object.assign({Accept: "application/vnd.github.raw+json"}, ghHead()), cache: "no-store"}); }
  catch (e) { throw new Error("СЕТЬ GET " + path + ": " + (e.message || e)); }
  if (r.status === 404) return null;
  if (!r.ok) throw new Error("GET " + path + " " + r.status);
  return r.json();
}
async function ghPut(path, text, msg) {
  let sha;
  const m = await fetch(ghUrl(path), {headers: Object.assign({Accept: "application/vnd.github+json"}, ghHead()), cache: "no-store"});
  if (m.ok) sha = (await m.json()).sha; else if (m.status !== 404) throw new Error("META " + m.status);
  const r = await fetch(ghUrl(path), {method: "PUT", headers: Object.assign({"Content-Type": "application/json"}, ghHead()),
    body: JSON.stringify({message: msg, content: b64utf8(text), sha})});
  if (!r.ok) throw new Error("PUT " + path + " " + r.status);
}
// Apple Health / Mi Fitness: import only explicit in-bed intervals, never overwrite manual entries.
async function pullHealthSleep() {
  const data = await ghGetJson("inbox/sleep.json");
  if (!data) return;
  if (data.version !== 1 || !Array.isArray(data.intervals) || data.intervals.length > 500) throw new Error("SLEEP FORMAT");
  const intervals = data.intervals.map(i => {
    if (!i || typeof i.start !== "string" || typeof i.end !== "string" || !/(Z|[+-]\d\d:\d\d)$/.test(i.start) || !/(Z|[+-]\d\d:\d\d)$/.test(i.end)) throw new Error("SLEEP DATE");
    const a=Date.parse(i.start), b=Date.parse(i.end);
    if (!Number.isFinite(a)||!Number.isFinite(b)||b<=a||b-a>86400000||b>Date.now()+60000) throw new Error("SLEEP INTERVAL");
    return [a,b];
  }).sort((a,b)=>a[0]-b[0]);
  const merged=[];
  for(const x of intervals){const last=merged[merged.length-1];if(last&&x[0]<=last[1])last[1]=Math.max(last[1],x[1]);else merged.push(x.slice());}
    for(const [a,b] of merged){
    const start=new Date(a), end=new Date(b), day=isoDay(start), from=start.getHours()*60+start.getMinutes();
    const to=end.getHours()*60+end.getMinutes()+(isoDay(end)!==day?1440:0);
    if(to<=from)continue;
    const overlaps=T("plan").filter(e=>e.healthSleep && !e.healthSleepEdited && Number.isFinite(e.healthStart)&&Number.isFinite(e.healthEnd)&&e.healthStart<b&&e.healthEnd>a);
    const manual=T("plan").filter(e=>!e.healthSleep && !e.hiddenDuplicate && /^(?:📝\s*)?(?:сон|спал|sleep)(?:\s|$|[💤:.,!?])/i.test(e.title||"") && (e.day===day&&e.from<to&&e.to>from || e.day===isoDay(end)&&e.day!==day&&e.from<to-1440 || e.day===addDays(day,-1)&&e.to>1440+from));
    const edited=T("plan").some(e=>e.healthSleepEdited && e.healthStart<b && e.healthEnd>a);
    if(edited)continue;
    const finished=manual.filter(e=>{const d=new Date(e.day+"T00:00:00");d.setMinutes(e.to);return d.getTime()<=Date.now();});
    if(manual.length!==finished.length)continue;
    if(finished.length){
      S.healthSleepOriginals=S.healthSleepOriginals||[];
      for(const e of finished){if(!S.healthSleepOriginals.some(x=>x.id===e.id))S.healthSleepOriginals.push(JSON.parse(JSON.stringify(e)));}
      S.db.plan=T("plan").filter(e=>!finished.includes(e));
    }
    if(overlaps.length===1&&overlaps[0].healthStart===a&&overlaps[0].healthEnd===b)continue;
    if(overlaps.some(e=>e.healthStart<a||e.healthEnd>b))continue;
    const entry={id:overlaps.length?overlaps[0].id:nextId("plan"),day,from,to,title:"Сон",detail:"Mi Fitness / Apple Health: время в постели",color:"#475569",sph:"h",nopomo:true,actual:true,healthSleep:true,healthStart:a,healthEnd:b};
    S.db.plan=T("plan").filter(e=>!overlaps.includes(e));T("plan").push(entry);
  }
  S.sync.sleepAt=Date.now();save();
}

async function syncNow(manual, shopOnly) {         // shop bot — при каждом открытии (не чаще раза в 20 мин), копия — раз в день
  if (syncBusy || !S.gh || !S.gh.token) return;
  syncBusy = true; S.sync = S.sync || {};
  try {
    // Независимые операции: ошибка shop.json не блокирует задачи и отчёт.
    try {
      const shop = await ghGetJson("shop.json");
      if (shop && Array.isArray(shop.rows)) {
        S.db.shop_inc = shop.rows.map(r => ({ref:r.ref, day:r.day, amount:+r.amount || 0}));
        S.sync.shopAt = shop.at || null;
      }
      S.sync.shopErr = null;
    } catch (e) { S.sync.shopErr = String(e.message || e).slice(0,80); }
    try { await pullHealthSleep(); S.sync.sleepErr=null; } catch(e) { S.sync.sleepErr=String(e.message||e).slice(0,80); }
    try { await pullInbox(); daykNormalizePlan(); daykPlanTomorrow(); S.sync.inboxErr = null; }
    catch (e) { S.sync.inboxErr = String(e.message || e).slice(0,80); }
    try { await pushReviewOutbox(); S.sync.reviewErr = null; }
    catch (e) { S.sync.reviewErr = String(e.message || e).slice(0,80); }
    S.sync.pullAt = Date.now();
    if (shopOnly) { S.sync.err = null; save(); if (tab === "work" || tab === "plan" || screen === "set") render(); return; }
    const payload = JSON.stringify({v: 2, exportedAt: new Date().toISOString(), runs: S.runs, tables: S.db});
    await ghPut("backup.json", payload, "backup " + today());
    S.sync.day = today(); S.sync.backupAt = Date.now(); S.sync.err = null; S.lastExport = Date.now();
    save(); if (manual) toast("🔄 ГОТОВО"); if (screen === "set" || tab === "work") render();
  } catch (e) {
    S.sync.err = String(e && e.message || e).slice(0, 80); save();
    syncNext = Date.now() + 10 * 60000;
    if (manual) toast("🔄 НЕ ВЫШЛО: " + S.sync.err + "\nПОПРОБУЮ ПОЗЖЕ САМ");
  } finally { syncBusy = false; }
}
// 📤 Отчёт для анализа: только заметки и календарные записи, без финансовых баз,
// токенов, личных настроек и истории привычек. Отдельный файл, backup.json не трогаем.
async function pushReviewOutbox() {
  const notes = T("idea_inbox").map(n => ({id:n.id, text:String(n.text || "").slice(0,2000), created:n.created}));
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 21);
  const cutoffDay = isoDay(cutoff);
  const days = T("plan").filter(e => e && !e.hiddenDuplicate && e.day && e.day >= cutoffDay)
    .map(e => ({id:e.id, day:e.day, title:String(e.title || "").slice(0,100),
      from:e.from, to:e.to, progress:e.progress == null ? null : e.progress,
      actual:!!e.actual, source:e.inboxSrc || null, sphere:e.sph || null, bundle:e.bundleItems || null}));
  const sleepEntry = e => /^(?:📝\s*)?(?:сон|спал|sleep)(?:\s|$|[💤:.,!?])/i.test(String(e.title||""));
  const workEntry = e => /^(?:mcg|работа|смена|work)\b/i.test(String(e.title||""));
  const sleep = days.filter(sleepEntry)
    .map(e => ({day:e.day,minutes:Math.max(0,(+e.to||0)-(+e.from||0)),recorded:true}))
    .filter(e=>e.minutes>0);
  const byDay = {};
  days.forEach(e => {
    const d = byDay[e.day] || (byDay[e.day] = {day:e.day, planned:0, completed:0, partial:0, missed:0, unmarked:0, recordedMinutes:0, sleepMinutes:0, workMinutes:0});
    const duration = Math.max(0,(+e.to||0)-(+e.from||0));
    if (sleepEntry(e)) { d.sleepMinutes += duration; return; }
    if (workEntry(e)) { d.workMinutes += duration; return; }
    if (e.actual) { d.recordedMinutes += duration; return; }
    d.planned++;
    if (e.progress === 100) d.completed++;
    else if (e.progress === 0) d.missed++;
    else if (e.progress > 0) d.partial++;
    else d.unmarked++;
  });
  const payload = JSON.stringify({version:6,rejectedTasks:S.daykRejected||[],updatedAt:new Date().toISOString(),notes,calendar:days,daily:Object.values(byDay).sort((a,b)=>a.day.localeCompare(b.day)),sleep,discoverReviews:T("discover_reviews").filter(r=>r.day>=cutoffDay).map(r=>({day:r.day,topic:r.topic,interest:r.interest,satisfaction:r.satisfaction,repeat:r.repeat})),nicotineReviews:T("nicotine_reviews").filter(r=>r.day>=cutoffDay).map(r=>({day:r.day,ml:r.ml,first:r.first,craving:r.craving,trigger:r.trigger})),nicotineBlocks:Object.entries(S.nicotineBlocks||{}).filter(([k])=>k.slice(0,10)>=cutoffDay).map(([slot,smoked])=>({slot,smoked})),smallTasks:T("plan").filter(e=>e.day>=cutoffDay&&e.bundleItems).map(e=>({day:e.day,title:e.title,items:e.bundleItems.map(i=>({text:i.text,minutes:i.minutes||null,done:!!i.done,completedAt:i.completedAt||null,actualMinutes:i.actualMinutes||null,result:i.result||null}))}))});
  const fingerprint = payload.replace(/"updatedAt":"[^"]+"/,'"updatedAt":""');
  if (S.sync && S.sync.outboxFingerprint === fingerprint) return;
  await ghPut("outbox/dayk-review.json",payload,"DayK review "+today());
  S.sync.outboxFingerprint = fingerprint;
  S.sync.outboxAt = Date.now();
}
// Сферы задач: цвет и значок берём из календарной палитры CATS.
// Сокращаем текст только в интерфейсе, исходный текст остаётся в GitHub.
function daykTaskLabel(raw) {
  const t = String(raw || "");
  if (/пдд|билет|экзаменационн/i.test(t)) return "10 билетов ПДД";
  if (/итог дня|прислать итог/i.test(t)) return "Итог дня";
  if (/вейп|фильмов и игр/i.test(t)) return "Учёт привычек";
  return t.replace(/^[^:]{1,24}:\\s*/, "").replace(/\\s*[·—–-]\\s*(?:🍅\\s*)?\\d+.*$/, "").slice(0,65).trim() || t.slice(0,65);
}
function daykRemoveObsolete() {
  const old = T("plan").filter(e => e && e.day >= today() && !e.actual && e.progress !== 100 &&
    (e.daykAutoFill && (/^Мелочи$|прогулки без телефона|10 билетов ПДД/i.test(e.title || "")) ||
     e.inboxSrc && (/^dayk-activation-|^dayk-pdd-/.test(String(e.inboxSrc)))));
  if (old.length) { S.db.plan = T("plan").filter(e => !old.includes(e)); save(); }
}
function daykNormalizePlan() {
  daykRemoveObsolete();
  const events = T("plan"), d = today();
  let changed = false;
  const byDay = new Map();
  events.forEach(e => {
    if (!e || e.actual || !e.inboxSrc || e.day < d || e.hiddenDuplicate) return;
    if (/пдд|билет|экзаменационн/i.test(e.title || "")) {
      const k = e.day;
      if (!byDay.has(k)) byDay.set(k, []);
      byDay.get(k).push(e);
    }
  });
  byDay.forEach(list => {
    if (!list.length) return;
    list.sort((a,b) => (b.progress===100)-(a.progress===100) || a.from-b.from);
    const keep = list[0];
    if (keep.progress !== 100 && (keep.to-keep.from) !== 30) {keep.to=keep.from+30;changed=true;}
    list.slice(1).forEach(e => {e.hiddenDuplicate=true;changed=true;});
  });
  // Короткие дела собираем в одну карточку с отдельными галочками.
  const shortByDay = new Map();
  events.forEach(e => {
    if (!e || e.actual || !e.inboxSrc || e.day < d || e.hiddenDuplicate || e.bundleItems || e.progress===100) return;
    if (/пдд|билет|экзаменационн/i.test(e.title || "")) return;
    const m = String(e.title||"").match(/(\\d{1,2})\\s*мин/i);
    if (!m || +m[1] > 15 || +m[1] < 1) return;
    if (!shortByDay.has(e.day)) shortByDay.set(e.day,[]);
    shortByDay.get(e.day).push(e);
  });
  shortByDay.forEach(list => {
    if (list.length < 2) return;
    list.sort((a,b)=>a.from-b.from);
    const keep=list[0], group=list.slice(0,5);
    keep.bundleItems=group.map(e=>({text:daykTaskLabel(e.title),done:false,source:e.inboxSrc}));
    keep.title="Мелочи";
    keep.to=Math.min(1440,keep.from+Math.max(15,group.reduce((n,e)=>n+(+(String(e.title).match(/(\\d{1,2})\\s*мин/i)||[])[1]||10),0)));
    group.slice(1).forEach(e=>{e.hiddenDuplicate=true;});
    changed=true;
  });
  if (changed) save();
}
function inboxSphere(x) {
  const key = String(x.sphere || x.sph || "").toLowerCase();
  const t = String(x.text || "").toLowerCase();
  const k = ["h","p","f","l","r","e","j"].includes(key) ? key :
    /пдд|права|автошкол|экзамен|обучен|теори|привычк|итог недели/.test(t) ? "p" :
    /инвест|облигац|налог|капитал|бюджет|финанс|купон|доход|остатк|резерв|крипт/.test(t) ? "f" :
    /бизнес|авито|товар|продаж|клиент|закупк|магазин/.test(t) ? "j" :
    /квартир|взнос|жиль|ипотек|audi|ауди|автодетал/.test(t) ? "e" :
    /трениров|вейп|курени|сон|здоров/.test(t) ? "h" : "p";
  return CATS.find(c => c.k === k) || CATS[1];
}
// 📥 Задачи от Claude (инвест-дайджест и др.): inbox/tasks.json = [{id, text, day?}], каждая добавляется один раз
async function pullInbox() {
  const box = await ghGetJson("inbox/tasks.json");
  if (!Array.isArray(box)) return;
  S.inboxSeen = S.inboxSeen || [];
  // Источник истины — актуальный inbox. Удалённые AI-задачи убираем только из будущего плана и списка;
  // историю, факты и выполненные записи сохраняем.
  const active = new Set(box.filter(x => x && x.id).map(x => String(x.id)));
  const removed = T("plan").filter(e => e.inboxSrc && !active.has(String(e.inboxSrc)) && !e.actual && e.progress !== 100 && e.day >= today());
  if (removed.length) S.db.plan = T("plan").filter(e => !removed.includes(e));
  S.db.tasks = T("tasks").filter(t => !t.src || active.has(String(t.src)) || t.done);
  S.inboxSeen = S.inboxSeen.filter(id => active.has(String(id)));

  // Восстанавливаем календарные блоки для ранее полученных задач, если их импортировали только в список.
  box.filter(x => x && x.id && S.inboxSeen.includes(String(x.id)) && !T("plan").some(e => e.inboxSrc === String(x.id)))
    .forEach(x => { S.inboxSeen = S.inboxSeen.filter(id => id !== String(x.id)); });
  const rejected = new Set(S.daykRejected || []);
  const pending = box.filter(x => x && x.id && x.text && !rejected.has(String(x.text)) && !rejected.has(String(x.text).slice(0,80)) && !rejected.has("inbox:"+String(x.id)) && !S.inboxSeen.includes(String(x.id)));
  // Обновляем цвет ранее импортированных блоков, не меняя их время и прогресс.
  let recolored = false;
  T("plan").forEach(e => { if (!e.inboxSrc) return; const x = box.find(x => String(x.id) === String(e.inboxSrc)); if (!x) return; const c = inboxSphere(x); if (e.sph !== c.k || e.color !== c.c) { e.sph = c.k; e.color = c.c; recolored = true; } });
  if (!pending.length) { S.sync.inboxAt = Date.now(); if (recolored || removed.length) save(); return; }
  const focusBusy=T("plan").some(e=>e.daykFocus&&!e.actual&&e.progress!==100);
  const selected=focusBusy?[]:pending.filter(x=>x.focus===true&&String(x.result||"").trim()).slice(0,1);
  selected.forEach(x => {
    const day = /^\d{4}-\d{2}-\d{2}$/.test(x.day || "") ? x.day : today();
    if (!T("tasks").some(t => t.src === String(x.id))) T("tasks").push({id: nextId("tasks"), day, text: String(x.text).slice(0, 80), project_id: -1, done: 0, src: String(x.id)});
    // Календарь: создаём отдельный блок только для новых задач, не трогая существующие события.
    // Выбираем свободный вечерний час; не накладываем задачи друг на друга.
    if (!T("plan").some(e => e.inboxSrc === String(x.id))) {
      let targetDay = day < today()?today():day;
      const match = String(x.text).match(/(?:^|\\s)([1-9])\\s*помидорк/i);
      const cycles = match ? Math.min(4, +match[1]) : 1;
      const duration = Number.isFinite(+x.minutes)&&+x.minutes>0 ? Math.min(120,Math.max(5,Math.ceil(+x.minutes/5)*5)) : /пдд|билет|экзаменационн/i.test(String(x.text)) ? 15 : cycles * 50;
      const occupied = T("plan").filter(e => e.day === targetDay && Number.isFinite(e.from) && Number.isFinite(e.to));
      let from = targetDay===today()?Math.max(540,Math.ceil(nowMin()/10)*10):540;
      while (from + duration <= 1440 && occupied.some(e => from < e.to && from + duration > e.from)) from += 30;
      if (from + duration > 1440) {
        // Не перекрываем занятые интервалы: пробуем следующий день.
        const next = new Date(day + "T12:00:00"); next.setDate(next.getDate() + 1);
        const nextDay = isoDay(next);
        const nextOccupied = T("plan").filter(e => e.day === nextDay && Number.isFinite(e.from) && Number.isFinite(e.to));
        from = 18 * 60;
        while (from + duration <= 1440 && nextOccupied.some(e => from < e.to && from + duration > e.from)) from += 30;
        if (from + duration > 1440) return;
        targetDay = nextDay;
      }
      const sphere = inboxSphere(x);
      T("plan").push({id: nextId("plan"), day: targetDay, from, to: Math.min(1440, from + duration),
        title: String(x.text).slice(0, 80), detail: String(x.result || x.detail || ""),
        color: sphere.c, sph: sphere.k, nopomo: false, daykFocus:true, inboxSrc: String(x.id)});
    }
    S.inboxSeen.push(String(x.id));
  });
  S.inboxSeen = S.inboxSeen.slice(-500); S.sync.inboxAt = Date.now(); save();
  if(selected.length)toast("⚡ "+String(selected[0].text).slice(0,80));
}
// Перенос только актуальных AI-задач: завершённые цепочки не возобновляем.
function daykCarryForward() {
  const d = today(), events = T("plan");
  const groups = new Map();
  events.forEach(e => {
    if (!e || !e.inboxSrc || e.actual || e.hiddenDuplicate) return;
    const key = String(e.inboxSrc);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  });
  const candidates = [];
  groups.forEach(chain => {
    chain.sort((a,b) => a.day.localeCompare(b.day) || (+a.id||0)-(+b.id||0));
    if (chain.some(e => e.progress === 100) || chain.some(e => e.day >= d)) return;
    const last = chain[chain.length-1];
    if (last && last.day < d) candidates.push(last);
  });
  candidates.sort((a,b) => b.day.localeCompare(a.day));
  let added = 0, todayCount = events.filter(e => e.day === d && e.carryFrom).length;
  for (const e of candidates) {
    if (added + todayCount >= 2) break;
    const duration = Math.min(120, Math.max(30, (+e.to||0)-(+e.from||0)));
    let from = 18*60;
    const busy = events.filter(n => n.day === d && Number.isFinite(n.from) && Number.isFinite(n.to));
    while (from + duration <= 1440 && busy.some(n => from < n.to && from + duration > n.from)) from += 30;
    if (from + duration > 1440) break;
    events.push({id:nextId("plan"),day:d,from,to:from+duration,title:e.title,
      detail:"Перенесено из "+e.day+" · "+String(e.detail||"").slice(0,180),
      color:e.color,sph:e.sph,nopomo:e.nopomo,inboxSrc:e.inboxSrc,carryFrom:e.id});
    added++;
  }
  if (added) save();
}
function daykPlanTomorrow() {
  const next = addDays(today(), 1);
  S.sync = S.sync || {};
  
  if (typeof fillFreeDay !== "function") return;
  if(typeof workPlanSyncAll==='function')workPlanSyncAll();
  fillFreeDay(today(), true);
  fillFreeDay(next, true);
  S.sync.plannedTomorrow = next;
  save();
}
function syncTick() {
  if (!S.gh || !S.gh.token || syncBusy || Date.now() < syncNext) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  const sy = S.sync || {}, daily = sy.day !== today(), pull = !sy.pullAt || Date.now() - sy.pullAt > 2 * 60000;
  if (!daily && !pull) return;
  // Перенос только вручную через кнопку ⏩.
  syncNext = Date.now() + 60000; syncNow(false, !daily);
}
function syncLabel() {
  if (!S.gh || !S.gh.token) return "ПОДКЛЮЧИТЬ";
  if (S.sync && S.sync.day === today()) return "СЕГОДНЯ ✅";
  if (S.sync && S.sync.day) return "БЫЛО " + S.sync.day.slice(8) + "." + S.sync.day.slice(5, 7);
  return "ЖДЁТ СЕТИ";
}
function syncSetup() {
  const on = S.gh && S.gh.token;
  const sy = S.sync || {}, shopT = sy.shopAt ? new Date(sy.shopAt).toLocaleString("ru-RU", {day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"}) : "—";
  sheetOf(b => `<div class="stt">🔄 SHOP BOT → ПРИЛОЖЕНИЕ: ПРИ ОТКРЫТИИ\nКОПИЯ ДАННЫХ → ${GH_REPO}: РАЗ В ДЕНЬ\nСЕРВЕР ВЫЛОЖИЛ SHOP BOT: ${shopT}${sy.err ? "\n⚠ КОПИЯ: " + esc(sy.err) : ""}\n📥 ЗАДАЧИ: ${sy.inboxErr ? "⚠ " + esc(sy.inboxErr) : (sy.inboxAt ? new Date(sy.inboxAt).toLocaleString("ru-RU") : "НЕ ПРОВЕРЕНО")}\n📤 ОТЧЁТ ДЛЯ АНАЛИЗА: ${sy.outboxAt ? new Date(sy.outboxAt).toLocaleString("ru-RU") : "ЕЩЁ НЕ ОТПРАВЛЕН"}${sy.reviewErr ? "\n⚠ ОТЧЁТ: " + esc(sy.reviewErr) : ""}</div>` +
    (on ? b("🔄 СЕЙЧАС", () => { closeTop(); syncNow(true); }, "btn") : "") +
    (on ? b("📥 ЗАГРУЗИТЬ ЗАДАЧИ", () => { closeTop(); pullInbox().then(() => { save(); toast("📥 ЗАДАЧИ ПРОВЕРЕНЫ"); if (tab === "plan") render(); }).catch(e => { S.sync = S.sync || {}; S.sync.inboxErr = String(e.message || e).slice(0,80); save(); toast("⚠ ЗАДАЧИ: " + S.sync.inboxErr); }); }, "btn") : "") +
    (on ? b("📤 ОТПРАВИТЬ ОТЧЁТ", () => { closeTop(); S.sync = S.sync || {}; S.sync.outboxFingerprint = null; pushReviewOutbox().then(() => { save(); toast("📤 ОТЧЁТ ОТПРАВЛЕН"); }).catch(e => { S.sync.reviewErr = String(e.message || e).slice(0,80); save(); toast("⚠ ОТЧЁТ: " + S.sync.reviewErr); }); }, "btn") : "") +
    b(on ? "🔑 СМЕНИТЬ ТОКЕН" : "🔑 ВСТАВИТЬ ТОКЕН", () => { closeTop(); askText("ТОКЕН GITHUB (github_pat_…)", t => {
      t = t.trim(); if (!/^(github_pat_|ghp_)\w+/.test(t)) { toast("ЭТО НЕ ТОКЕН"); return false; }
      S.gh = {token: t, repo: GH_REPO}; S.sync = {}; save(); syncNow(true); return true; }); }, "btn") +
    (on ? b("✕ ОТКЛЮЧИТЬ", () => { S.gh = null; save(); closeTop(); render(); }, "btn") : ""));
}
if (typeof window !== "undefined" && window.addEventListener) window.addEventListener("online", () => { syncNext = 0; syncTick(); });
if (typeof document !== "undefined") document.addEventListener("visibilitychange", () => { if (!document.hidden) { syncNext = 0; syncTick(); } });
