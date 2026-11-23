"use strict";
// Nicotine taper tracker: daily liquid consumption, craving and first use.
// Targets are flexible planning guides, not prescribed medical doses.
const NICOTINE_START="2026-11-22";
const NICOTINE_LIMITS=[15,13.5,12,10.5,9,7.5,4.5,0];
function nicotineDayOffset(day){return Math.round((new Date(day+"T12:00:00")-new Date(NICOTINE_START+"T12:00:00"))/86400000);}
function nicotineWeek(day){return Math.floor(nicotineDayOffset(day)/7);}
function nicotineRecord(day){return T("nicotine_reviews").find(r=>r.day===day);}
function ensureNicotinePlan(){
  // Контроль никотина живёт в DAY, а не отдельными ежедневными событиями календаря.
  const old = T("plan").filter(e => e.nicotineDay && e.day >= today() && e.progress !== 100 && !e.actual);
  if (old.length) { S.db.plan = T("plan").filter(e => !old.includes(e)); save(); }
}

function openNicotine(day){
  if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(day))return;
  const old=nicotineRecord(day),week=nicotineWeek(day),limit=NICOTINE_LIMITS[Math.max(0,Math.min(7,week))];
  const start=isoDay(new Date(new Date(NICOTINE_START+"T12:00:00").getTime()+Math.max(0,week)*7*86400000));
  const sum=T("nicotine_reviews").filter(r=>r.day>=start&&nicotineWeek(r.day)===week).reduce((a,r)=>a+r.ml,0);
  const w=document.createElement("div");w.className="sheet";
  w.innerHTML='<div style="max-height:85vh;overflow:auto;padding:16px"><div class="title">🚭 КОНТРОЛЬ НИКОТИНА</div>'+
    '<div class="dim">'+esc(day)+' · неделя '+(week+1)+' · ориентир '+limit+' мл/нед. · записано '+sum.toFixed(2)+' мл</div>'+
    '<label class="ev-label">РАСХОД ЖИДКОСТИ ЗА ДЕНЬ, МЛ</label><input id="nml" type="number" inputmode="decimal" min="0" max="30" step="0.1" placeholder="0.0" style="width:100%;box-sizing:border-box;padding:12px;background:#292929;color:white;border:0;border-radius:9px">'+
    '<label class="ev-label">ПЕРВАЯ ЗАТЯЖКА ПОСЛЕ ПРОБУЖДЕНИЯ</label><select id="nfirst" style="width:100%;padding:12px;background:#292929;color:white"><option value="0-5">0–5 минут</option><option value="5-30">5–30 минут</option><option value="30-60">30–60 минут</option><option value="60+">Более часа</option><option value="none">Не парил</option></select>'+
    '<label class="ev-label">МАКСИМАЛЬНАЯ ТЯГА (0–10)</label><input id="ncrave" type="range" min="0" max="10" step="1" style="width:80%"><span id="nscore"></span>'+
    '<label class="ev-label">ОСНОВНОЙ ТРИГГЕР</label><select id="ntrigger" style="width:100%;padding:12px;background:#292929;color:white"><option>Автоматически</option><option>Скука</option><option>Стресс</option><option>Фильмы или игры</option><option>После еды</option><option>Тяги не было</option><option>Другое</option></select>'+
    '<div class="dim" style="margin-top:12px">Цель — постепенное снижение. При сильной отмене замедли темп и обратись к специалисту.</div>'+
    '<div class="acts"><button id="ncancel">✕</button><button id="nsave">💾 СОХРАНИТЬ</button></div></div>';
  document.body.appendChild(w);
  const ml=w.querySelector("#nml"),first=w.querySelector("#nfirst"),crave=w.querySelector("#ncrave"),trigger=w.querySelector("#ntrigger");
  if(old){ml.value=old.ml;first.value=old.first;crave.value=old.craving;trigger.value=old.trigger;}
  else crave.value=5;
  const score=w.querySelector("#nscore");const paint=()=>score.textContent=crave.value+"/10";crave.oninput=paint;paint();
  w.querySelector("#ncancel").onclick=()=>w.remove();w.onclick=e=>{if(e.target===w)w.remove();};
  w.querySelector("#nsave").onclick=()=>{
    const value=Number(ml.value.replace(",","."));if(!ml.value.trim()||!Number.isFinite(value)||value<0||value>30){alert("УКАЖИ РАСХОД ОТ 0 ДО 30 МЛ");return;}
    const record={day,ml:value,first:first.value,craving:Number(crave.value),trigger:trigger.value,updatedAt:Date.now()};
    if(old)Object.assign(old,record);else T("nicotine_reviews").push(record);
    const event=T("plan").find(e=>e.nicotineDay===day);if(event)event.progress=100;
    save();w.remove();render();
  };
}
