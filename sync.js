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
  const r = await fetch(ghUrl(path), {headers: Object.assign({Accept: "application/vnd.github.raw+json"}, ghHead()), cache: "no-store"});
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
async function syncNow(manual, shopOnly) {         // shop bot — при каждом открытии (не чаще раза в 20 мин), копия — раз в день
  if (syncBusy || !S.gh || !S.gh.token) return;
  syncBusy = true; S.sync = S.sync || {};
  try {
    const shop = await ghGetJson("shop.json");
    if (shop && Array.isArray(shop.rows)) {                 // сервер — источник правды для shop_inc
      S.db.shop_inc = shop.rows.map(r => ({ref: r.ref, day: r.day, amount: +r.amount || 0}));
      S.sync.shopAt = shop.at || null;
    }
    await pullInbox();
    try { await pushReviewOutbox(); S.sync.reviewErr = null; } catch (e) { S.sync.reviewErr = String(e && e.message || e).slice(0, 80); }
    S.sync.pullAt = Date.now();
    if (shopOnly) { S.sync.err = null; save(); if (tab === "work" || screen === "set") render(); return; }
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
  const days = T("plan").filter(e => e && e.day && e.day >= cutoffDay)
    .map(e => ({id:e.id, day:e.day, title:String(e.title || "").slice(0,100),
      from:e.from, to:e.to, progress:e.progress == null ? null : e.progress,
      actual:!!e.actual, source:e.inboxSrc || null, sphere:e.sph || null}));
  const payload = JSON.stringify({version:1,updatedAt:new Date().toISOString(),notes,calendar:days});
  const fingerprint = payload.replace(/"updatedAt":"[^"]+"/,'"updatedAt":""');
  if (S.sync && S.sync.outboxFingerprint === fingerprint) return;
  await ghPut("outbox/dayk-review.json",payload,"DayK review "+today());
  S.sync.outboxFingerprint = fingerprint;
  S.sync.outboxAt = Date.now();
}
// 📥 Задачи от Claude (инвест-дайджест и др.): inbox/tasks.json = [{id, text, day?}], каждая добавляется один раз
async function pullInbox() {
  const box = await ghGetJson("inbox/tasks.json");
  if (!Array.isArray(box)) return;
  S.inboxSeen = S.inboxSeen || [];
  const fresh = box.filter(x => x && x.id && x.text && !S.inboxSeen.includes(String(x.id)));
  if (!fresh.length) return;
  fresh.forEach(x => {
    const day = /^\d{4}-\d{2}-\d{2}$/.test(x.day || "") ? x.day : today();
    T("tasks").push({id: nextId("tasks"), day, text: String(x.text).slice(0, 80), project_id: -1, done: 0, src: String(x.id)});
    // Календарь: создаём отдельный блок только для новых задач, не трогая существующие события.
    // Выбираем свободный вечерний час; не накладываем задачи друг на друга.
    if (!T("plan").some(e => e.inboxSrc === String(x.id))) {
      const match = String(x.text).match(/(?:^|\\s)([1-9])\\s*помидорк/i);
      const cycles = match ? Math.min(4, +match[1]) : 1;
      const duration = cycles * 60;
      const occupied = T("plan").filter(e => e.day === day && Number.isFinite(e.from) && Number.isFinite(e.to));
      let from = 18 * 60;
      while (from + duration <= 1440 && occupied.some(e => from < e.to && from + duration > e.from)) from += 30;
      if (from + duration > 1440) from = 20 * 60; // запасной вариант, перенос доступен вручную
      T("plan").push({id: nextId("plan"), day, from, to: Math.min(1440, from + duration),
        title: String(x.text).slice(0, 80), detail: "Задача AI-Control-Center · " + cycles + " × 50/10",
        color: "#4a78d6", sph: "p", nopomo: false, inboxSrc: String(x.id)});
    }
    S.inboxSeen.push(String(x.id));
  });
  S.inboxSeen = S.inboxSeen.slice(-500); save();
  toast("📥 НОВЫЕ ЗАДАЧИ ОТ CLAUDE: " + fresh.length + "\n" + fresh.map(x => String(x.text).slice(0, 60)).join("\n"));
}
function syncTick() {
  if (!S.gh || !S.gh.token || syncBusy || Date.now() < syncNext) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  const sy = S.sync || {}, daily = sy.day !== today(), pull = !sy.pullAt || Date.now() - sy.pullAt > 20 * 60000;
  if (!daily && !pull) return;
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
  sheetOf(b => `<div class="stt">🔄 SHOP BOT → ПРИЛОЖЕНИЕ: ПРИ ОТКРЫТИИ\nКОПИЯ ДАННЫХ → ${GH_REPO}: РАЗ В ДЕНЬ\nСЕРВЕР ВЫЛОЖИЛ SHOP BOT: ${shopT}${sy.err ? "\n⚠ КОПИЯ: " + esc(sy.err) : ""}\n📤 ОТЧЁТ ДЛЯ АНАЛИЗА: ${sy.outboxAt ? new Date(sy.outboxAt).toLocaleString("ru-RU") : "ЕЩЁ НЕ ОТПРАВЛЕН"}${sy.reviewErr ? "\n⚠ ОТЧЁТ: " + esc(sy.reviewErr) : ""}</div>` +
    (on ? b("🔄 СЕЙЧАС", () => { closeTop(); syncNow(true); }, "btn") : "") +
    (on ? b("📤 ОТПРАВИТЬ ОТЧЁТ", () => { closeTop(); S.sync = S.sync || {}; S.sync.outboxFingerprint = null; pushReviewOutbox().then(() => { save(); toast("📤 ОТЧЁТ ОТПРАВЛЕН"); }).catch(e => { S.sync.reviewErr = String(e.message || e).slice(0,80); save(); toast("⚠ ОТЧЁТ: " + S.sync.reviewErr); }); }, "btn") : "") +
    b(on ? "🔑 СМЕНИТЬ ТОКЕН" : "🔑 ВСТАВИТЬ ТОКЕН", () => { closeTop(); askText("ТОКЕН GITHUB (github_pat_…)", t => {
      t = t.trim(); if (!/^(github_pat_|ghp_)\w+/.test(t)) { toast("ЭТО НЕ ТОКЕН"); return false; }
      S.gh = {token: t, repo: GH_REPO}; S.sync = {}; save(); syncNow(true); return true; }); }, "btn") +
    (on ? b("✕ ОТКЛЮЧИТЬ", () => { S.gh = null; save(); closeTop(); render(); }, "btn") : ""));
}
if (typeof window !== "undefined" && window.addEventListener) window.addEventListener("online", () => { syncNext = 0; });
