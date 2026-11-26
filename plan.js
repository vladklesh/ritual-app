"use strict";
// ================================================================== ПЛАНИРОВЩИК (как Google Календарь, но внутри приложения)
const PCOL = ["#16845b", "#d97721", "#c13e58", "#3975e5", "#b79a20", "#8953ce", "#64748b"];
// сферы жизни в календаре: цвет + значок
const CATS = [
  {k:"h",ic:"💪",nm:"ЗДОРОВЬЕ",c:"#16845b"},
  {k:"p",ic:"📈",nm:"ЛИЧНОСТНЫЙ РОСТ",c:"#3975e5"},
  {k:"f",ic:"💰",nm:"КАПИТАЛ",c:"#c13e58"},
  {k:"l",ic:"☀️",nm:"ЯРКОСТЬ ЖИЗНИ",c:"#b79a20"},
  {k:"r",ic:"❤️",nm:"ОТНОШЕНИЯ И ОКРУЖЕНИЕ",c:"#8953ce"},
  {k:"e",ic:"🏠",nm:"СРЕДА И БЫТ",c:"#64748b"},
  {k:"j",ic:"🤵‍♂️",nm:"РАБОТА",c:"#d97721"}
];
const planSphereKey = k => ({m:"p",a:"l",c:"r",w:"j"}[k] || k);
const PHH = 52;
const isMb = e => !!e && !e.work && (e.mb || (/🚿/.test(e.title || "") && /🍳/.test(e.title || "")));   // утренний блок в 📅
const calendarEventLabel = e => {
  if (isMb(e)) return "Заряд⚡️Day";
  if (e.bundleItems && e.bundleItems.length && /^👛|^Мелочи$/.test(e.title)) return e.bundleItems.map(i=>i.text).join(" · ");
  if (!e.inboxSrc) return e.title;
  const raw = String(e.title || "");
  if (/пдд|билет|экзаменационн/i.test(raw)) return "10 билетов ПДД";
  if (/итог дня|прислать итог/i.test(raw)) return "Итог дня";
  if (/вейп|фильмов и игр/i.test(raw)) return "Учёт привычек";
  let t = raw.replace(/^[^\p{L}\p{N}]+/u, "");
  t = t.replace(/^[^:]{1,26}:\s*/, "");
  t = t.replace(/\s*[·—–-]\s*(?:🍅\s*)?\d+\s*(?:помидорк\S*|мин|×\S*)?.*$/i, "");
  t = t.replace(/\s*\(?50\/10\)?/gi, "").replace(/\s*🍅\s*\d+\s*$/u,"");
  return t.trim() || raw;
};
const progressColor = e => e.actual ? e.color : e.progress === 100 ? "#16a34a" : e.progress === 0 ? "#dc2626" : e.color;
const progressRing = p => {
  if (![0,25,50,75,100].includes(p)) return "";
  const circumference = 2 * Math.PI * 9;
  return '<svg width="24" height="24" viewBox="0 0 24 24" style="vertical-align:middle;flex-shrink:0" aria-label="'+p+'% выполнено">' +
    '<circle cx="12" cy="12" r="9" stroke="#a1a1aa" stroke-width="4" fill="#18181b"/>' +
    '<circle cx="12" cy="12" r="9" stroke="#22c55e" stroke-width="4" fill="none" stroke-dasharray="'+(circumference*p/100)+' '+circumference+'" transform="rotate(-90 12 12)"/>' +
    '</svg>';
};
const mbEvent = day => planOf(day).find(e => !e.spill && isMb(e)) || null;                                   // высота часа, px
const WD = ["ВС", "ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ"];
const MON = ["ЯНВАРЬ", "ФЕВРАЛЬ", "МАРТ", "АПРЕЛЬ", "МАЙ", "ИЮНЬ", "ИЮЛЬ", "АВГУСТ", "СЕНТЯБРЬ", "ОКТЯБРЬ", "НОЯБРЬ", "ДЕКАБРЬ"];
let pv = "3", pday = today(), pScroll = null;     // вид: "1" | "3" | "7" | "m"

const hm2m = s => { const m = String(s || "").match(/^(\d{1,2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : null; };
const m2hm = m => pad(Math.floor(m / 60) % 24) + ":" + pad(m % 60);
const dObj = day => new Date(day + "T00:00:00");
const addDays = (day, n) => { const d = dObj(day); d.setDate(d.getDate() + n); return isoDay(d); };
const nowMin = () => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); };
const planOf = day => {                           // дело после полуночи (to > 1440) продолжается в следующем дне
  const prev = addDays(day, -1);
  return T("plan").filter(e => e.day === day && !e.hiddenDuplicate).concat(T("plan").filter(e => e.day === prev && e.to > 1440 && !e.hiddenDuplicate)
    .map(e => Object.assign({}, e, {from: 0, to: e.to - 1440, spill: true})));
};

function planDays() {
  if (pv === "1") return [pday];
  if (pv === "3") return [0, 1, 2].map(k => addDays(pday, k));
  return [0, 1, 2, 3, 4, 5, 6].map(k => addDays(pday, k));
}
function layout(evs) {                            // раскладка пересекающихся дел по колонкам
  const s = evs.slice().sort((a, b) => a.from - b.from || b.to - a.to), out = [];
  let cl = [], end = -1;
  const flush = () => {
    const ends = [];
    const part = cl.map(e => { let l = ends.findIndex(x => x <= e.from); if (l < 0) { l = ends.length; ends.push(e.to); } else ends[l] = e.to; return {e, l}; });
    part.forEach(p => { p.n = ends.length; out.push(p); }); cl = [];
  };
  s.forEach(e => { if (cl.length && e.from >= end) { flush(); end = -1; } cl.push(e); end = Math.max(end, e.to); });
  if (cl.length) flush();
  return out;
}

// Заполняем только действительно свободные интервалы, не трогая существующие записи.
function fillFreeDay(day, quiet = false) {
  if (day < today()) return;
  const events = T("plan"), wd = new Date(day+"T12:00:00").getDay();
  let migrated=false;
  for(let k=events.length-1;k>=0;k--){const e=events[k];if(e.day!==day||!e.daykHourly||e.actual||e.progress!=null||e.bundleItems?.some(i=>i.done))continue;if(e.bundleItems?.every(i=>/^Восстановление \/ резерв/.test(i.text))){events.splice(k,1);migrated=true;}else if(/^👛/.test(e.title)){e.title=e.bundleItems.map(i=>i.text).join(" · ");migrated=true;}}
  const pool = [
    ["ПДД: 1–2 билета",15,"Разобрать ошибки и запомнить одно правило","p"],
    ["Записать голосом историю дня",10,"Одна история с завязкой и концовкой","r"],
    ["Практика разговора с коллегой",10,"Один разговор с открытым вопросом и уточнением","r"],
    ["Пересказать интересную тему своими словами",20,"Три запомнившихся факта и объяснение за минуту","p"],
    ["Практика переговоров вслух",15,"Одна отработанная формулировка предложения и ответа на возражение","r"],
    ["Субаренда: написать собственнику выбранного объекта",25,"Отправить вопрос о разрешении субаренды и условиях договора; если объекта нет — не отправлять","f"],
    ["Тренировка памяти: пересказ без подсказок",15,"Воспроизвести пять ключевых мыслей","p"],
    ["Записать короткое видео с объяснением идеи",15,"Одна понятная запись до двух минут","r"],
    ["Практика английского: разговор вслух",20,"Пять фраз, произнесённых без подсказки","p"],
    ["DayK: проверить один сценарий на телефоне",15,"Проверить сохранение задачи и записать конкретную ошибку или успешный результат","p"],
    ["Свободное восстановление без экрана",20,"Отдохнуть и вернуться к делам без перегрузки","h"]
  ];
  const rejected = S.daykRejected || [];
  const estimate=(name,base)=>{const samples=events.filter(e=>e.day<day).sort((a,b)=>b.day.localeCompare(a.day)).flatMap(e=>e.bundleItems||[]).filter(i=>i.text===name&&i.done&&i.actualMinutes>0&&i.actualMinutes<=120).slice(0,7).map(i=>i.actualMinutes).sort((a,b)=>a-b);return samples.length>=3?Math.max(5,Math.min(50,Math.ceil(samples[Math.floor(samples.length/2)]*1.15/5)*5)):base;};
  const existing = planOf(day).filter(e=>!e.hiddenDuplicate);
  const used = new Set(existing.flatMap(e=>[e.title,...(e.bundleItems||[]).map(i=>i.text)]));
  const queue = [pool[0],...(wd===0?[["Навести порядок дома",45,"Одна выбранная зона полностью приведена в порядок","e"]]:[]),...pool.slice(1,-1).sort((a,b)=>0)];
  const rotated=queue.slice(wd%3).concat(queue.slice(0,wd%3));
  let added=0;
  for(let h=9;h<21;h++){
    const from=h*60, to=from+50;
    if(day===today() && from<nowMin()) continue;
    if(existing.some(e=>!(e.work && e.role==="shift") && e.from<to && e.to>from)) continue;
    let items=[], total=0;
    for(const x of rotated){
      const minutes=estimate(x[0],x[1]);if(used.has(x[0])||rejected.includes(x[0])||total+minutes>50)continue;
      if(/ПДД/.test(x[0])&&existing.some(e=>/ПДД|билет/i.test(e.title||"")))continue;
      items.push({text:x[0],minutes,result:x[2],done:false});used.add(x[0]);total+=minutes;
      if(items.length>=3)break;
    }
    if(!items.length) continue;
    const cat=CATS.find(c=>c.k==="p");
    const e={id:nextId("plan"),day,from,to:from+total,title:items.map(i=>i.text).join(" · "),detail:"",bundleItems:items,color:cat.c,sph:"p",daykAutoFill:true,daykHourly:true};
    events.push(e);existing.push(e);added++;
  }
  if(added||migrated)save();
  if(!quiet){toast(added?"ДОБАВЛЕНО: "+added:"ЗАДАЧИ УЖЕ ЕСТЬ");renderPlan();}
}

function renderPlan() {
  planRepFill(); if (typeof workPlanSyncAll === "function") workPlanSyncAll();
  const month = pv === "m", days = month ? [] : planDays(), d0 = dObj(month ? pday : days[0]);
  const head = `<div class="phead"><button id="pp">‹</button><div class="pt">${MON[d0.getMonth()]} ${d0.getFullYear()}</div><button id="pt0">●</button><button id="pn">›</button></div>
    <div class="pviews">${[["1", "1"], ["3", "3"], ["7", "7"], ["m", "М"]].map(v => `<button data-v="${v[0]}" class="${pv === v[0] ? "on" : ""}">${v[1]}</button>`).join("")}</div>`;
  let body;
  if (month) {
    const first = dObj(pday); first.setDate(1);
    const start = addDays(isoDay(first), -((first.getDay() + 6) % 7)), cells = [];
    for (let k = 0; k < 42; k++) {
      const day = addDays(start, k), ev = planOf(day), out = dObj(day).getMonth() !== first.getMonth();
      cells.push(`<button class="mc${out ? " out" : ""}${day === today() ? " td" : ""}" data-d="${day}">${+day.slice(8)}<br>${ev.slice(0, 4).map(e => `<i style="background:${progressColor(e)}"></i>`).join("")}</button>`);
    }
    body = `<div class="pgrid"><div class="pmon">${["ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ", "ВС"].map(w => `<div class="wd">${w}</div>`).join("")}${cells.join("")}</div></div>`;
  } else {
    const n = days.length, big = n <= 3;
    const dh = `<div class="pdays">${days.map(d => `<div class="${d === today() ? "td" : ""}" data-d="${d}">${WD[dObj(d).getDay()]}<br><b>${+d.slice(8)}</b></div>`).join("")}</div>`;
    const hours = Array.from({length: 24}, (_, h) => h ? `<span style="top:${h * PHH}px">${pad(h)}:00</span>` : "").join("");
    const cols = days.map(d => {
      // маленькое дело — поверх большого: сначала длинные, каждое следующее, если пересекается, сдвигается вправо и ложится сверху
      const all = planOf(d).slice().sort((a, b) => (b.to - b.from) - (a.to - a.from) || a.from - b.from), placed = [];
      const evs = all.map(e => {
        const depth = placed.filter(x => x.e.from < e.to && x.e.to > e.from).reduce((m, x) => Math.max(m, x.depth + 1), 0);
        placed.push({e, depth});
        const x0 = Math.min(depth * 20, 60), h = Math.max(16, (e.to - e.from) / 60 * PHH - 1);
        return `<div class="ev${e.spill ? " sp" : ""}${depth ? " top" : ""}" data-id="${e.id}" style="top:${e.from / 60 * PHH}px;height:${h}px;left:calc(${x0}% + 1px);width:calc(${88 - x0}% - 2px);background:${progressColor(e)};z-index:${depth + 1};${big ? "font-size:14px" : ""}">${e.actual ? "" : progressRing(e.progress)} ${esc(calendarEventLabel(e))}</div>`;
      }).join("");
      const now = d === today() ? `<div class="nowl" id="nowl" style="top:${nowMin() / 60 * PHH}px"></div>` : "";
      return `<div class="pcol" data-d="${d}" style="background-size:100% ${PHH}px">${evs}${now}</div>`;
    }).join("");
    body = dh + `<div class="pgrid" id="pg"><div class="pin" style="height:${24 * PHH}px"><div class="gut">${hours}</div><div class="pcols" style="grid-template-columns:repeat(${n},1fr)">${cols}</div></div></div>`;
  }
  // Быстрые действия: план и фактический журнал, без изменения старых записей.
  const quick = '<div style="position:sticky;bottom:8px;z-index:20;display:flex;justify-content:flex-end;gap:10px;padding:5px 14px;pointer-events:none">' +
    '<button id="pq-fill" title="Заполнить свободные окна" aria-label="Заполнить свободные окна" style="pointer-events:auto;border-radius:22px;padding:12px;background:#343434;color:white;font-size:20px">⚡</button>' +
    '<button id="pq-plan" title="Добавить задачу" aria-label="Добавить задачу" style="pointer-events:auto;border-radius:22px;padding:12px 18px;background:#343434;color:white;font-size:24px">➕</button>' +
    '<button id="pq-fact" title="Что делал" aria-label="Записать факт" style="pointer-events:auto;border-radius:22px;padding:12px 18px;background:#343434;color:white;font-size:24px">📝</button></div>';
  const showReview = nowMin() >= 20 * 60 && !T("dayk_evening_done").some(x => x.day === today());
  const review = showReview ? '<button id="dayk-review" class="btn">🌙 ИТОГ ДНЯ</button>' : "";
  shell(head + review + body + quick);
  const reviewBtn = document.getElementById("dayk-review");
  if (reviewBtn) reviewBtn.onclick = () => {
    const day = today(), pending = T("plan").filter(e => e.day === day && !e.actual && e.progress !== 100);
    if (pending.length && !confirm("ЕСТЬ " + pending.length + " НЕЗАВЕРШЁННЫХ ИЛИ НЕОТМЕЧЕННЫХ ЗАДАЧ. СОХРАНИТЬ ИТОГ ДНЯ?")) { pday = day; pv = "1"; renderPlan(); return; }
    T("dayk_evening_done").push({day,at:Date.now()}); save();
    if (typeof pushReviewOutbox === "function" && S.gh && S.gh.token) pushReviewOutbox().then(() => save()).catch(() => {});
    renderPlan(); toast("🌙 ИТОГ СОХРАНЁН");
  };
  document.getElementById("pq-fill").onclick = () => fillFreeDay(pday);
  document.getElementById("pq-plan").onclick = () => openEv(null, pday, Math.min(1380, Math.floor(nowMin()/30)*30));
  document.getElementById("pq-fact").onclick = () => openFact();
  document.getElementById("body").classList.add("flexy");
  const step = k => {
    if (month) { const d = dObj(pday); d.setDate(1); d.setMonth(d.getMonth() + k); pday = isoDay(d); }
    else pday = addDays(pday, k * (pv === "m" ? 0 : +pv));
    pScroll = pScroll; renderPlan();
  };
  // Horizontal swipe, without interfering with vertical scroll or long-press drag.
  const swipeArea=document.querySelector(".pgrid");
  if(swipeArea){
    swipeArea.style.touchAction="pan-y";
    let gesture=null;
    swipeArea.addEventListener("touchstart",ev=>{
      if(ev.touches.length!==1){gesture=null;return;}
      const t=ev.touches[0];gesture={x:t.clientX,y:t.clientY,at:Date.now(),horizontal:false};
    },{passive:true});
    swipeArea.addEventListener("touchmove",ev=>{
      if(!gesture||ev.touches.length!==1){gesture=null;return;}
      const t=ev.touches[0],dx=t.clientX-gesture.x,dy=t.clientY-gesture.y;
      if(!gesture.horizontal){
        if(Date.now()-gesture.at>=450||Math.abs(dy)>12&&Math.abs(dy)>=Math.abs(dx)){gesture=null;return;}
        if(Math.abs(dx)>14&&Math.abs(dx)>Math.abs(dy)*1.5)gesture.horizontal=true;
      }
      if(gesture.horizontal&&ev.cancelable)ev.preventDefault();
    },{passive:false});
    swipeArea.addEventListener("touchcancel",()=>{gesture=null;},{passive:true});
    swipeArea.addEventListener("touchend",ev=>{
      const g=gesture;gesture=null;
      if(!g||!g.horizontal||!ev.changedTouches.length)return;
      const t=ev.changedTouches[0],dx=t.clientX-g.x,dy=t.clientY-g.y;
      if(Math.abs(dx)<55||Math.abs(dx)<Math.abs(dy)*1.5)return;
      if(ev.cancelable)ev.preventDefault();
      const direction=dx<0?1:-1;
      if(month){step(direction);return;}
      pday=addDays(pday,direction);renderPlan();
    },{passive:false});
  }
  document.getElementById("pp").onclick = () => step(-1);
  document.getElementById("pn").onclick = () => step(1);
  document.getElementById("pt0").onclick = () => { pday = today(); pScroll = null; renderPlan(); };
  document.querySelectorAll(".pviews button").forEach(b => b.onclick = () => { pv = b.dataset.v; renderPlan(); });
  document.querySelectorAll(".mc").forEach(b => b.onclick = () => { pday = b.dataset.d; pv = "1"; renderPlan(); });
  document.querySelectorAll(".pdays [data-d]").forEach(b => b.onclick = () => { pday = b.dataset.d; pv = "1"; renderPlan(); });
  const pg = document.getElementById("pg");
  if (pg) {
    pg.scrollTop = pScroll != null ? pScroll : Math.max(0, ((days.includes(today()) ? nowMin() / 60 : 6) - 1.5) * PHH);
    pg.onscroll = () => { pScroll = pg.scrollTop; };
    bindDrag(pg);
    pg.onclick = e => {
      const ev = e.target.closest(".ev"), col = e.target.closest(".pcol");
      if (!col) return;
      const y = e.clientY - col.getBoundingClientRect().top, m = Math.max(0, Math.min(1410, Math.floor(y / PHH * 2) * 30));
      if (ev) { const entry = T("plan").find(x => x.id === +ev.dataset.id); if (entry && entry.discoverStart === DISCOVER_START) return openDiscover(entry.discoverIndex); if (entry && entry.nicotineDay) return openNicotine(entry.nicotineDay); if (entry && entry.discoverNextStart) return openDiscoverNext(entry); return openEv(+ev.dataset.id, col.dataset.d, m); }
      openEv(null, col.dataset.d, m);
    };
  }
}

// Краткая запись факта: отдельное событие, чтобы не подменять план выполнением.
function openFact() {
  const w = document.createElement("div"); w.className = "sheet";
  const time = m2hm(Math.floor(nowMin()/15)*15);
  w.innerHTML = '<div style="max-height:55vh;overflow:auto"><div class="stt">📝 ЧТО ДЕЛАЛ</div>' +
    '<input id="qtitle" placeholder="ЧТО ДЕЛАЛ?" maxlength="80">' +
    '<div class="r2"><input id="qday" type="date" value="'+today()+'"><input id="qtime" type="time" value="'+time+'" aria-label="С"><input id="qto" type="time" value="'+m2hm(Math.min(1439,hm2m(time)+15))+'" aria-label="До"></div>' +
    '<div class="ev-spheres" id="qsphere">'+CATS.map(c => '<button data-k="'+c.k+'" title="'+c.nm+'" aria-label="'+c.nm+'" style="--sphere-color:'+c.c+'">'+c.ic+'</button>').join("")+'</div>' +
    '<div class="acts"><button id="qclose">✕</button><button id="qsave">✅</button></div></div>';
  document.body.appendChild(w);
  let sphere = CATS[0];
  const paint = () => w.querySelectorAll("[data-k]").forEach(b => b.classList.toggle("on", b.dataset.k === sphere.k));
  paint();
  w.querySelectorAll("[data-k]").forEach(b => b.onclick = () => { sphere = CATS.find(c=>c.k===b.dataset.k) || sphere; paint(); });
  w.onclick = ev => { if (ev.target === w) w.remove(); };
  w.querySelector("#qclose").onclick = () => w.remove();
  w.querySelector("#qsave").onclick = () => {
    const title = w.querySelector("#qtitle").value.trim(), from = hm2m(w.querySelector("#qtime").value), rawTo = hm2m(w.querySelector("#qto").value);
    if (!title || from == null || rawTo == null) return;
    const day = w.querySelector("#qday").value || today();
    T("plan").push({id:nextId("plan"),day,from,to:rawTo > from ? rawTo : rawTo + 1440,title:"📝 "+title,
      detail:"Фактически выполнено",color:sphere.c,sph:sphere.k,nopomo:true,actual:true});
    save(); w.remove(); pday=day; renderPlan();
  };
}

// ---------------------------------------------------------------- повторы: правило в plan_rep, дела создаются на 60 дней вперёд
const REPS = [["", "НЕТ"], ["d", "КАЖДЫЙ ДЕНЬ"], ["wd", "БУДНИ"], ["w", "РАЗ В НЕДЕЛЮ"]];
const repHits = (r, day) => r.rule === "d" || (r.rule === "wd" && dObj(day).getDay() % 6 !== 0) || (r.rule === "w" && dObj(day).getDay() === r.wday);
function planRepFill() {
  const end = addDays(today(), 60); let ch = false;
  T("plan_rep").forEach(r => {
    let d = r.upto ? addDays(r.upto, 1) : r.start;
    const stop = r.until && r.until < end ? r.until : end;
    for (; d <= stop; d = addDays(d, 1)) {
      if (!repHits(r, d)) continue;
      T("plan").push({id: nextId("plan"), day: d, from: r.from, to: r.to, title: r.title, detail: r.detail || "", color: r.color, sph: r.sph, nopomo: r.nopomo, mb: r.mb, rep: r.id}); ch = true;
    }
    if (r.upto !== stop) { r.upto = stop; ch = true; }
  });
  if (ch) save();
}
function repNew(e, rule) {
  const id = nextId("plan_rep");
  T("plan_rep").push({id, rule, wday: dObj(e.day).getDay(), start: e.day, until: null, upto: null, from: e.from, to: e.to, title: e.title, detail: e.detail || "", color: e.color, sph: e.sph, nopomo: e.nopomo, mb: !!e.mb});
  S.db.plan = T("plan").filter(x => x !== e);           // первое дело создаст правило
  planRepFill();
}
function repEnd(rid, day) {                             // серия заканчивается перед day, будущие дела удаляются
  const r = T("plan_rep").find(x => x.id === rid); if (!r) return;
  r.until = addDays(day, -1);
  S.db.plan = T("plan").filter(x => !(x.rep === rid && x.day >= day));
  if (r.until < r.start) S.db.plan_rep = T("plan_rep").filter(x => x !== r);
}

// ---------------------------------------------------------------- карточка дела
function openShiftEv(e0, day, at) {             // смена (и дорога): время правится здесь или перетаскиванием; можно положить дело поверх
  const e = T("plan").find(x => x.work === e0.work && x.role === "shift") || e0, w = workRow(e.work);
  const sh = document.createElement("div"); sh.className = "sheet";
  sh.innerHTML = `<div><div class="stt">🤵‍♂️ СМЕНА</div>
    <label class="ev-label">КОМПАНИЯ</label><select id="sp">${T("work_places").map(p=>`<option value="${p.id}" ${p.id===w?.place_id?"selected":""}>${esc(p.name)}</option>`).join("")}</select><label class="ev-label">ОПИСАНИЕ</label><textarea id="st" rows="2">${esc(w?.note||"")}</textarea>
    <input type="date" id="sd" value="${e.day}" style="margin-top:8px">
    <div class="r2"><input type="time" id="sf" value="${m2hm(e.from)}"><input type="time" id="stt" value="${m2hm(e.to % 1440)}"></div>
    <div class="dim">КОНЕЦ РАНЬШЕ НАЧАЛА = СЛЕДУЮЩИЙ ДЕНЬ · ${gnum(Math.ceil((e.to - e.from) / 60 - 1e-9))} Ч</div>
<button class="btn" id="sopen">💵 СУММА, БОНУСЫ, ЗП</button>
    <div class="acts"><button id="sdel">🗑</button><button id="scl">✕</button><button id="sok">✅</button></div></div>`;
  document.body.appendChild(sh);
  const g = i => sh.querySelector("#" + i);
  sh.onclick = ev => { if (ev.target === sh) sh.remove(); };
  g("scl").onclick = () => sh.remove();
  g("sopen").onclick = () => { sh.remove(); tab = screen = "work"; wv = {v: "shift", id: e.work}; render(); };
  g("sdel").onclick = () => { if (!confirm("УДАЛИТЬ СМЕНУ?")) return; S.db.work_days = T("work_days").filter(x => x.id !== e.work); S.db.plan = T("plan").filter(x => x.work !== e.work); save(); sh.remove(); renderPlan(); };
  g("sok").onclick = () => {
    const f = hm2m(g("sf").value), t0 = hm2m(g("stt").value); if (f == null || t0 == null) return;
    const nd=g("sd").value||e.day;
    if(T("work_days").some(x=>x!==w&&x.day===nd)){toast("НА ЭТУ ДАТУ УЖЕ ЕСТЬ СМЕНА");return;}
    if(!w)return;
    const pid=Number(g("sp").value);if(!getPlace(pid))return;
    if(pid!==w.place_id && (w.paid_on||w.src)){toast("НЕЛЬЗЯ МЕНЯТЬ КОМПАНИЮ ОПЛАЧЕННОЙ/ИМПОРТИРОВАННОЙ СМЕНЫ");return;}
    if(pid!==w.place_id){w.place_id=pid;w.earned=null;}
    w.note=g("st").value.trim();e.day=nd;e.from=f;e.to=t0>f?t0:t0+1440;e._sig=null;workPlanSync(w);
    save(); sh.remove(); renderPlan();
  };
}
function openEv(id, day, from) {
  const e = id ? T("plan").find(x => x.id === id) : {day, from, to: Math.min(1440, from + 60), title: "", color: PCOL[0], nopomo: false};
  if (!e) return;
  if (e.work) return openShiftEv(e, day, from);
  const r0 = e.rep ? T("plan_rep").find(x => x.id === e.rep) : null;
  const w = document.createElement("div"); w.className = "sheet"; w.id = "evs";
  w.innerHTML = `<div style="padding:14px"><style>#evs input:not([type=checkbox]),#evs textarea{font-size:16px;padding:8px;min-height:0}#evs .acts button{font-size:23px;padding:10px;min-height:44px}#evs .ev-label{font-size:11px;margin:4px 0}#evs #evprogress{padding:4px 0!important;margin:0;gap:4px}#evs>div{padding:12px 14px!important;max-height:88dvh;overflow:auto}#evs input:not([type=checkbox]),#evs textarea,#evs select{box-sizing:border-box;width:100%;font-size:16px!important;padding:8px 10px!important;min-height:38px!important;margin:0!important}#evs textarea{height:58px;resize:vertical}#evs .r2{gap:6px;margin:6px 0!important}#evs #evprogress button{padding:4px 1px!important;min-height:44px}#evs #evprogress svg{width:24px;height:24px}#evs .ev-spheres{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:5px;margin:4px 0}#evs .ev-spheres button{padding:4px!important;min-height:38px!important;height:38px!important;font-size:21px!important}#evs #ecn{font-size:11px;margin:2px 0 4px;min-height:12px}#evs .acts{gap:8px;margin-top:8px!important}#evs .acts button{height:48px!important;min-height:48px!important;padding:6px!important;font-size:24px!important}#evs details{margin:4px 0!important}#evs .ev-label{display:block;margin:5px 0 3px!important}#evs #evprogress button{height:36px!important;min-height:36px!important;display:flex;align-items:center;justify-content:center;font-size:23px}#evs #evprogress svg{width:23px;height:23px}#evs .r2 input[type=time]{height:36px!important;min-height:36px!important;padding:3px 6px!important;font-size:16px!important}#evs #evprogress{padding:3px 0!important}#evs .r2{margin:3px 0!important}#evs #edesc{margin-top:5px!important}#evs #ecn:empty{display:none}</style>
    ${isMb(e) && e.day === today() && !S.runs.some(r => r.day === today()) ? '<button class="btn go" id="emst">▶ НАЧАТЬ</button>' : ""}
    <div id="ework" style="display:none"><label class="ev-label">КОМПАНИЯ</label><select id="ewpid"><option value="">ВЫБРАТЬ</option>${places().map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join("")}<option value="new">➕ НОВАЯ КОМПАНИЯ</option></select><input id="ewnew" placeholder="Название компании" style="display:none"></div>
    <input id="et" placeholder="НАЗВАНИЕ" value="${esc(e.title)}">
    ${e.actual ? "" : `<div style="display:flex;justify-content:space-between;gap:4px;padding:10px 0" id="evprogress">
      ${[0,25,50,75,100].map(p => '<button type="button" data-progress="'+p+'" aria-label="'+(p===0?'Не выполнено':p+' процентов')+'" style="flex:1;min-width:0;background:#252525;border-radius:10px;padding:7px 1px;color:white">'+ (p===100?'✅':progressRing(p))+'</button>').join("")}
    </div>`}
    ${e.actual ? "" : '<div id="evhelp" style="display:none;padding:12px;border:1px solid #444;border-radius:12px;margin:8px 0"><div style="font-weight:600">Не получилось? Начни с малого</div><div style="margin:8px 0;font-size:13px">Цель: капитал 15–20 млн ₽ · свобода выбора, квартира, Audi A6</div><div id="evgoalphoto"></div><button type="button" id="evphoto" style="font-size:12px">🖼 Фото цели</button><div style="font-size:12px;color:#aaa;margin:8px 0">Правило 2 минут: начни с самого простого действия. План — не факт выполнения.</div><div class="r2"><button type="button" id="evtwo">▶ 2 минуты</button><button type="button" id="evlater">↪ Завтра</button></div><div style="font-size:12px;color:#aaa;margin-top:8px">Вложения полезны, если дают навык, инструмент или возможность. Больше расходов ≠ больше дохода.</div></div>'}
    <div class="r2"><input type="time" id="ef" value="${m2hm(e.from)}" aria-label="С"><input type="time" id="eto" value="${m2hm(e.to % 1440)}" aria-label="До"></div>\n    ${e.bundleItems && e.bundleItems.length ? `<div id="evbundle">${e.bundleItems.map((it,i)=>`<label style="display:grid;grid-template-columns:24px minmax(0,1fr);align-items:start;gap:8px;padding:7px 0"><input style="width:20px;height:20px;margin:3px 0;padding:0" type="checkbox" data-bi="${i}" ${it.done?"checked":""}><span style="font-size:15px;line-height:1.3">${esc(it.text)} <small style="color:#aaa">${it.minutes?it.minutes+" мин":""}</small>${it.result?`<span style="display:block;color:#aaa;font-size:13px">Результат: ${esc(it.result)}</span>`:""}</span></label>`).join("")}</div>` : ""}\n    
    <textarea id="edesc" rows="2" placeholder="Детали, ожидаемый результат">${esc(e.detail || "")}</textarea>
    <div class="ev-spheres" id="ecol">${CATS.map(c => `<button data-c="${c.c}" data-k="${c.k}" title="${c.nm}" aria-label="${c.nm}" style="--sphere-color:${c.c}">${c.ic}</button>`).join("")}</div>
    <div class="dim" id="ecn"></div>
    <details id="evmore"><summary style="padding:6px 0;color:#aaa;font-size:14px">⚙️ ДОПОЛНИТЕЛЬНО</summary><input type="date" id="ed" value="${e.day}" style="margin-top:8px">

    <div class="ev-durations">${[50, 60, 120, 480].map(n => `<button data-q="${n}">${n < 60 ? n + "М" : n / 60 + "Ч"}</button>`).join("")}</div>
    <div class="chips" id="erep">${REPS.map(x => `<button data-r="${x[0]}">${x[1]}</button>`).join("")}</div>
    <div class="ev-flags"><button id="enp" aria-label="Помодоро" title="Помодоро">🍅</button><span id="enpl" class="dim"></span></div>
    </details><div class="acts">${id ? '<button id="edel">🗑</button>' : ""}${id && !e.actual && e.progress !== 100 ? '<button id="emove" type="button" title="Перенести на завтра">⏩</button>' : ""}<button id="ecl">✕</button><button id="eok">✅</button></div></div>`;
  document.body.appendChild(w);
  const g = i => w.querySelector("#" + i);
  let progress = e.progress, mb = isMb(e), color = e.color, sph = planSphereKey(e.sph || (CATS.find(c => c.c === e.color) || {}).k || "") || null, np = !!e.nopomo, rule = r0 ? r0.rule : "";
  const paint = () => {
    g("ework").style.display=sph==="j"&&!e.actual&&!id?"block":"none";
    w.querySelectorAll("[data-progress]").forEach(b => { b.style.outline = +b.dataset.progress === progress ? "2px solid #22c55e" : "none"; });
    g("enp").textContent = np ? "🚫" : "🍅";
    g("enpl").textContent = np ? "БЕЗ ПОМИДОРО" : "ПОМИДОРО ВКЛЮЧЕНО";
    w.querySelectorAll("[data-k]").forEach(b => b.classList.toggle("on", b.dataset.k === sph));
    const cc = CATS.find(c => c.k === sph); w.querySelector("#ecn").textContent = cc ? cc.nm : "";
    w.querySelectorAll("[data-r]").forEach(b => { b.style.background = b.dataset.r === rule ? "#fff" : ""; b.style.color = b.dataset.r === rule ? "#000" : ""; });
  };
  g("ewpid").onchange=()=>{g("ewnew").style.display=g("ewpid").value==="new"?"block":"none";};
  paint();
  w.querySelectorAll("[data-bi]").forEach(b => b.onchange = () => { const it = e.bundleItems[+b.dataset.bi]; if (it) { it.done = b.checked; if(it.done){it.completedAt=Date.now();if(it.startedAt||it.elapsedMs)it.actualMinutes=Math.max(1,Math.round(((it.elapsedMs||0)+(it.startedAt?it.completedAt-it.startedAt:0))/60000));delete it.startedAt;}else{delete it.completedAt;delete it.actualMinutes;delete it.elapsedMs;} e.progress = Math.round(e.bundleItems.filter(x=>x.done).length / e.bundleItems.length * 100 / 25)*25; progress=e.progress; save(); paint(); } });
  w.onclick = ev => { if (ev.target === w) w.remove(); };
  g("ecl").onclick = () => w.remove();
  if (g("emst")) g("emst").onclick = () => { w.remove(); if (S.run) { screen = "run"; render(); } else startRun(); };
  w.querySelectorAll("[data-progress]").forEach(b => b.onclick = () => { progress = +b.dataset.progress; if (g("evhelp")) g("evhelp").style.display = progress === 0 ? "block" : "none"; paint(); });
  const goalPhoto = () => { const url = String(S.daykGoalPhoto || ""); const el = g("evgoalphoto"); if (el) el.innerHTML = /^https:\/\/[^\s"'<>]+$/i.test(url) ? '<img alt="Моя цель" style="max-width:100%;max-height:180px;object-fit:contain;border-radius:10px" src="' + esc(url) + '">' : ""; };
  goalPhoto();
  if (g("evphoto")) g("evphoto").onclick = () => { const url = prompt("HTTPS-ссылка на своё фото цели. Пустое значение уберёт фото.", S.daykGoalPhoto || ""); if (url === null) return; if (url.trim() && !/^https:\/\/[^\s"'<>]+$/i.test(url.trim())) { toast("Нужна HTTPS-ссылка"); return; } S.daykGoalPhoto = url.trim(); save(); goalPhoto(); };
  if (g("evtwo")) g("evtwo").onclick = () => { const t = String(g("et").value || e.title || "задача").trim(); toast("2 МИНУТЫ: начни «" + t.slice(0,45) + "» прямо сейчас"); g("evhelp").style.display = "none"; };
  if (g("evlater")) g("evlater").onclick = () => { const next = addDays(e.day, 1); g("ed").value = next; g("evhelp").style.display = "none"; toast("Дата выбрана: " + next + ". Нажми ✅ для сохранения"); };
  g("enp").onclick = () => { np = !np; paint(); };
  w.querySelectorAll("[data-k]").forEach(b => b.onclick = () => { color = b.dataset.c; sph = b.dataset.k; paint(); });
  w.querySelectorAll("[data-r]").forEach(b => b.onclick = () => { rule = b.dataset.r; paint(); });
  w.querySelectorAll("[data-q]").forEach(b => b.onclick = () => {
    const f = hm2m(g("ef").value); if (f == null) return;
    g("eto").value = m2hm((f + +b.dataset.q) % 1440);
  });
  const scope = (q, one, all) => {                       // для повторяющегося дела: только это или все следующие
    const s = document.createElement("div"); s.className = "sheet";
    s.innerHTML = `<div><div class="stt">${q}</div><button class="btn" id="s1">ТОЛЬКО ЭТО</button><button class="btn" id="s2">ЭТО И ВСЕ СЛЕДУЮЩИЕ</button></div>`;
    document.body.appendChild(s);
    s.querySelector("#s1").onclick = () => { s.remove(); one(); };
    s.querySelector("#s2").onclick = () => { s.remove(); all(); };
  };
  const done = () => { save(); w.remove(); renderPlan(); };
  if (id) g("edel").onclick = () => {
    const one = () => {
      S.daykRejected = S.daykRejected || [];
      const names = e.bundleItems?.length ? e.bundleItems.map(i=>i.text) : [e.title]; if(e.inboxSrc)names.push("inbox:"+String(e.inboxSrc));
      for (const name of names) if (!S.daykRejected.includes(name)) S.daykRejected.push(name);
      S.db.plan = T("plan").filter(x => x.id !== id); done();
    };
    if (r0) scope("УДАЛИТЬ ПОВТОРЯЮЩЕЕСЯ ДЕЛО", one, () => { repEnd(r0.id, e.day); done(); });
    else if (confirm("УДАЛИТЬ?")) one();
  };
  if (g("emove")) g("emove").onclick = () => {
    const nd = addDays(e.day, 1), duration = Math.max(15, e.to - e.from);
    let from = e.from;
    const busy = T("plan").filter(x => x !== e && x.day === nd && !x.hiddenDuplicate);
    while (from + duration <= 1440 && busy.some(x => from < x.to && from + duration > x.from)) from += 15;
    if (from + duration > 1440) { toast("НЕТ СВОБОДНОГО ВРЕМЕНИ ЗАВТРА"); return; }
    // Для повторяющихся дел переносим только текущий экземпляр, не всю серию.
    e.day = nd; e.from = from; e.to = from + duration; e.progress = 0;
    save(); w.remove(); pday = nd; renderPlan();
  };
  g("eok").onclick = () => {
    const title = g("et").value.trim();
    if (!title && !(sph==="j"&&!id&&!e.actual)) { g("et").focus(); return; }
    const f = hm2m(g("ef").value); if (f == null) return;
    let t = hm2m(g("eto").value);
    if (t == null) return;
    if (t <= f) t += 1440; // любое окончание раньше начала — следующий день, включая сон
    const nd = g("ed").value || e.day;
    if(sph==="j"&&!id&&!e.actual){
      if(T("work_days").some(x=>x.day===nd)){toast("НА ЭТУ ДАТУ УЖЕ ЕСТЬ СМЕНА");return;}
      let pid=Number(g("ewpid").value);if(g("ewpid").value==="new"){const name=g("ewnew").value.trim();if(!name){g("ewnew").focus();return;}const old=T("work_places").find(p=>p.name.toLowerCase()===name.toLowerCase());pid=old?old.id:savePlace(name,0,"shift");}if(!getPlace(pid)){toast("ВЫБЕРИ КОМПАНИЮ");return;}
      const shift=workRow(planWork(nd,pid));shift.note=g("edesc").value.trim()||title;shift.t_from=m2hm(f);shift.t_to=m2hm(t%1440);shift.hours=ceilH((t-f)/60);calcEarn(shift);workPlanSync(shift);pday=nd;return done();
    }
    const apply = x => { x.detail = g("edesc").value.trim().slice(0,1000); x.title = title; x.from = f; x.to = t; x.color = color; x.sph = sph; x.nopomo = np; x.mb = mb; if (!x.actual) x.progress = progress; };
    pday = nd;
    if (!r0) {                                           // обычное дело (или становится повторяющимся)
      apply(e); e.day = nd;
      if (!id) { e.id = nextId("plan"); T("plan").push(e); }
      if (rule) repNew(e, rule);
      return done();
    }
    const one = () => { apply(e); e.day = nd; e.rep = rule === r0.rule ? e.rep : undefined; if (rule !== r0.rule && rule) { repNew(e, rule); } done(); };
    scope("ИЗМЕНИТЬ ПОВТОРЯЮЩЕЕСЯ ДЕЛО", one, () => {
      repEnd(r0.id, e.day);
      const x = {day: nd}; apply(x);
      if (rule) repNew(x, rule); else { x.id = nextId("plan"); T("plan").push(x); }
      done();
    });
  };
}

// ---------------------------------------------------------------- перенос дела: удерживай дело и тащи (по времени и на другой день)
function bindDrag(pg) {
  let d = null, tm = null, sx = 0, sy = 0, iv = null;
  const label = () => {
    const e = d.e, p = d.p;
    d.el.innerHTML = (e.nopomo ? "⛔ " : "") + esc(e.title) + `<br><small>${m2hm(p.m)}–${m2hm(p.m + e.to - e.from)}</small>`;
  };
  const place = () => {
    const cs = [...pg.querySelectorAll(".pcol")], r0 = cs[0].getBoundingClientRect(), dur = d.e.to - d.e.from;
    if (d.rs) {                                       // тянешь нижний край — меняешь конец
      const t = Math.max(d.e.from + 15, Math.min(1440, Math.round((d.y - r0.top) / PHH * 4) * 15));
      d.p = {m: d.e.from, to: t, col: d.el.parentNode};
      d.el.style.height = (t - d.e.from) / 60 * PHH + "px";
      d.el.innerHTML = esc(d.e.title) + `<br><small>${m2hm(d.e.from)}–${m2hm(t)}</small>`;
      return;
    }
    const ci = Math.max(0, Math.min(cs.length - 1, Math.floor((d.x - r0.left) / r0.width)));
    const m = Math.max(0, Math.min(d.e.work ? 1425 : 1440 - dur, Math.round((d.y - d.off - r0.top) / PHH * 4) * 15));
    d.p = {m, col: cs[ci]};
    d.el.style.left = "1px"; d.el.style.width = "calc(100% - 2px)"; d.el.style.top = m / 60 * PHH + "px";
    if (d.el.parentNode !== d.p.col) d.p.col.appendChild(d.el);
    label();
  };
  const stop = () => { clearTimeout(tm); clearInterval(iv); tm = iv = null; };
  pg.addEventListener("touchstart", ev => {
    const el = ev.target.closest && ev.target.closest(".ev");
    if (!el || ev.touches.length !== 1 || d) return;
    sx = ev.touches[0].clientX; sy = ev.touches[0].clientY;
    tm = setTimeout(() => {
      const e = T("plan").find(x => x.id === +el.dataset.id);
      if (!e || el.classList.contains("sp") || (e.work && e.role !== "shift")) return;
      const rc = el.getBoundingClientRect();
      d = {e, el, x: sx, y: sy, off: sy - rc.top, rs: false};                // только перенос; длительность меняется внутри дела
      el.style.zIndex = 5; el.style.opacity = ".9"; el.style.outline = "2px solid #fff";
      try { navigator.vibrate && navigator.vibrate(15); } catch (x) {}
      place();
      iv = setInterval(() => {                              // автопрокрутка у верхнего и нижнего края
        const r = pg.getBoundingClientRect();
        if (d.y < r.top + 50) pg.scrollTop -= 10; else if (d.y > r.bottom - 50) pg.scrollTop += 10; else return;
        place();
      }, 16);
    }, 500);
  }, {passive: true});
  pg.addEventListener("touchmove", ev => {
    const t = ev.touches[0];
    if (!d) { if (tm && Math.hypot(t.clientX - sx, t.clientY - sy) > 8) stop(); return; }
    ev.preventDefault(); d.x = t.clientX; d.y = t.clientY; place();
  }, {passive: false});
  const end = ok => ev => {
    stop();
    if (!d) return;
    ev.preventDefault();
    const x = d; d = null;
    if (ok && x.p) {
      if (x.rs) x.e.to = x.p.to;
      else { const dur = x.e.to - x.e.from; x.e.day = x.p.col.dataset.d; x.e.from = x.p.m; x.e.to = x.p.m + dur; }
      save();
    }
    renderPlan();
  };
  pg.addEventListener("touchend", end(true), {passive: false});
  pg.addEventListener("touchcancel", end(false), {passive: false});
}
