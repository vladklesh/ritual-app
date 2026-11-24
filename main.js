if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
const boot = () => { ensureRetinalHabit(); ensureCharismaGoal(); ensureDiscoverPlan(); ensureNicotinePlan(); if(typeof fillFreeDay==='function'){if(typeof workPlanSyncAll==='function')workPlanSyncAll();fillFreeDay(today(),true);fillFreeDay(addDays(today(),1),true);} if (S.train) screen = "train"; else if (S.run) screen = "run"; render(); if (typeof syncTick === "function") syncTick(); };
try {                                            // полная копия лежит в IndexedDB; берём более свежую
  idbGet("state").then(str => { if (str) { const d = JSON.parse(str); if (d && d.db && (d.savedAt || 0) >= (S.savedAt || 0)) S = d; } }).catch(() => {}).then(boot);
} catch (e) { boot(); }
