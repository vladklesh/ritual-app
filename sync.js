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
  sheetOf(b => `<div class="stt">🔄 SHOP BOT → ПРИЛОЖЕНИЕ: ПРИ ОТКРЫТИИ\nКОПИЯ ДАННЫХ → ${GH_REPO}: РАЗ В ДЕНЬ\nСЕРВЕР ВЫЛОЖИЛ SHOP BOT: ${shopT}${sy.err ? "\n⚠ " + esc(sy.err) : ""}</div>` +
    (on ? b("🔄 СЕЙЧАС", () => { closeTop(); syncNow(true); }, "btn") : "") +
    b(on ? "🔑 СМЕНИТЬ ТОКЕН" : "🔑 ВСТАВИТЬ ТОКЕН", () => { closeTop(); askText("ТОКЕН GITHUB (github_pat_…)", t => {
      t = t.trim(); if (!/^(github_pat_|ghp_)\w+/.test(t)) { toast("ЭТО НЕ ТОКЕН"); return false; }
      S.gh = {token: t, repo: GH_REPO}; S.sync = {}; save(); syncNow(true); return true; }); }, "btn") +
    (on ? b("✕ ОТКЛЮЧИТЬ", () => { S.gh = null; save(); closeTop(); render(); }, "btn") : ""));
}
if (typeof window !== "undefined" && window.addEventListener) window.addEventListener("online", () => { syncNext = 0; });
