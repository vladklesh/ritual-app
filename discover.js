"use strict";
// 14-day interest experiments. Stored locally with existing DayK state.
const DISCOVER_START = "2026-11-22";
const DISCOVER_ITEMS = [
["Создание","Выбрать одну маленькую функцию для существующего приложения и описать результат"],
["Голос","Записать минутную речь и прочитать её выразительнее"],
["Творчество","Сделать пять осмысленных фотографий одной темы"],
["Навык","Освоить один практический приём для повседневной жизни"],
["Общение","Провести разговор с акцентом на слушание и уточняющие вопросы"],
["Создание","Собрать маленький работающий результат: прототип, скрипт или улучшение"],
["Оценка","Сравнить пять направлений по результату и желанию продолжить"],
["Создание","Улучшить выбранный мини-продукт"],
["Голос","Записать короткий рассказ с паузами и интонацией"],
["Творчество","Попробовать простой музыкальный или визуальный проект"],
["Общение","Самому начать короткий разговор"],
["Навык","Повторить и усложнить понравившийся практический навык"],
["Свободный выбор","Повторить занятие, к которому больше всего хочется вернуться"],
["Итоги","Выбрать одно-два направления на следующий месяц"]
];
function discoverDay(i) {
  const d = new Date(DISCOVER_START+"T12:00:00"); d.setDate(d.getDate()+i); return isoDay(d);
}
function discoverRecord(i) { return T("discover_reviews").find(x => x.day === discoverDay(i)); }
function ensureDiscoverPlan() {
  let changed = false;
  DISCOVER_ITEMS.forEach((item,i) => {
    const day = discoverDay(i), title = "🔎 Найти своё · "+item[0];
    const existing = T("plan").find(e => e.discoverIndex === i && e.discoverStart === DISCOVER_START);
    if (existing) return;
    // Do not overwrite a manually created event with the same title on the same day.
    if (T("plan").some(e => e.day === day && e.title === title)) return;
    T("plan").push({id:nextId("plan"),day,title,detail:item[1]+" · 20–30 мин (после тяжёлой смены 10 мин)",from:1140,to:1170,
      color:"#b79a20",sph:"l",nopomo:true,progress:null,discoverIndex:i,discoverStart:DISCOVER_START});
    changed = true;
  });
  if (changed) save();
}
function openDiscover(i) {
  i = Number(i);
  if (!Number.isInteger(i) || i < 0 || i >= DISCOVER_ITEMS.length) return;
  const item = DISCOVER_ITEMS[i], day = discoverDay(i), old = discoverRecord(i);
  const w = document.createElement("div"); w.className="sheet";
  w.innerHTML = '<div style="max-height:85vh;overflow:auto;padding:16px"><div class="title">🔎 НАЙТИ СВОЁ · '+(i+1)+'/14</div>'+
    '<div class="item">'+esc(item[0])+'</div><div class="dim" style="white-space:pre-wrap">'+esc(item[1])+'</div>'+
    '<div class="dim" style="margin:12px 0">20–30 минут · можно 10 минут после тяжёлой смены</div>'+
    '<label class="ev-label">ИНТЕРЕС ВО ВРЕМЯ ЗАНЯТИЯ (0–5)</label><div class="acts" id="di"></div>'+
    '<label class="ev-label">УДОВЛЕТВОРЕНИЕ ПОСЛЕ (0–5)</label><div class="acts" id="ds"></div>'+
    '<label class="ev-label">ХОЧЕТСЯ ПОВТОРИТЬ?</label><div class="acts" id="dr"><button data-v="yes">ДА</button><button data-v="maybe">НЕ ЗНАЮ</button><button data-v="no">НЕТ</button></div>'+
    '<div class="acts"><button id="dc">✕</button><button id="dok">💾 СОХРАНИТЬ</button></div></div>';
  document.body.appendChild(w);
  let interest = old ? old.interest : null, satisfaction = old ? old.satisfaction : null, repeat = old ? old.repeat : null;
  const fill = (id,selected,set) => {
    const el = w.querySelector("#"+id);
    for(let n=0;n<=5;n++){const b=document.createElement("button");b.textContent=String(n);b.style.cssText="min-width:0;flex:1;padding:10px 0";b.onclick=()=>{set(n);paint();};el.appendChild(b);}
  };
  const paint = () => {
    w.querySelectorAll("#di button").forEach((b,n)=>{b.style.outline=n===interest?"2px solid #fff":"";});
    w.querySelectorAll("#ds button").forEach((b,n)=>{b.style.outline=n===satisfaction?"2px solid #fff":"";});
    w.querySelectorAll("#dr button").forEach(b=>{b.style.outline=b.dataset.v===repeat?"2px solid #fff":"";});
  };
  fill("di",interest,n=>interest=n);fill("ds",satisfaction,n=>satisfaction=n);
  w.querySelectorAll("#dr button").forEach(b=>b.onclick=()=>{repeat=b.dataset.v;paint();});
  paint();
  w.querySelector("#dc").onclick=()=>w.remove();
  w.onclick=e=>{if(e.target===w)w.remove();};
  w.querySelector("#dok").onclick=()=>{
    if(interest===null||satisfaction===null||!repeat){alert("ОЦЕНИ ИНТЕРЕС, УДОВЛЕТВОРЕНИЕ И ЖЕЛАНИЕ ПОВТОРИТЬ");return;}
    const record={day,interest,satisfaction,repeat,topic:item[0],updatedAt:Date.now()};
    if(old) Object.assign(old,record); else T("discover_reviews").push(record);
    const event=T("plan").find(e=>e.discoverStart===DISCOVER_START&&e.discoverIndex===i);
    if(event)event.progress=100;
    save();w.remove();render();
  };
}

function startDiscoverNextCycle(){
  const reviews=T("discover_reviews").filter(r=>r.day>=DISCOVER_START&&r.day<=discoverDay(13));
  if(reviews.length<14){toast("СНАЧАЛА ЗАВЕРШИ 14 ЭКСПЕРИМЕНТОВ");return;}
  const start=addDays(today(),1), old=T("plan");
  if(old.some(e=>e.discoverNextStart===start)){toast("НОВЫЙ ЦИКЛ УЖЕ СОЗДАН");return;}
  const groups={};reviews.forEach(r=>{const k=r.topic||"Навык";const g=groups[k]||(groups[k]={sum:0,n:0});g.sum+=Number(r.interest||0)+Number(r.satisfaction||0)+(r.repeat==="yes"?2:0);g.n++;});
  const top=Object.entries(groups).sort((a,b)=>b[1].sum/b[1].n-a[1].sum/a[1].n).slice(0,2).map(x=>x[0]);
  if(!top.length)return;
  for(let i=0;i<14;i++){
    const day=addDays(start,i),topic=top[i%top.length];
    if(old.some(e=>e.discoverNextStart===start&&e.discoverNextIndex===i))continue;
    old.push({id:nextId("plan"),day,title:"🔎 Найти своё · "+topic,detail:"Новый цикл: 20–30 мин. После занятия оцени интерес, удовлетворение и желание повторить.",from:1140,to:1170,color:"#b79a20",sph:"l",nopomo:true,progress:null,discoverNextStart:start,discoverNextIndex:i,discoverTopic:topic});
  }
  save();toast("НОВЫЙ ЦИКЛ СОЗДАН: "+top.join(" + "));render();
}
function openDiscoverNext(entry){
  const day=entry.day,old=T("discover_reviews").find(r=>r.day===day),w=document.createElement("div");w.className="sheet";
  w.innerHTML='<div style="padding:16px"><div class="title">🔎 '+esc(entry.discoverTopic)+'</div><div class="dim">'+esc(entry.detail)+'</div>'+
  '<label class="ev-label">ИНТЕРЕС (0–5)</label><input id="ni" type="range" min="0" max="5" step="1"><span id="niv"></span>'+
  '<label class="ev-label">УДОВЛЕТВОРЕНИЕ (0–5)</label><input id="ns" type="range" min="0" max="5" step="1"><span id="nsv"></span>'+
  '<label class="ev-label">ПОВТОРИТЬ?</label><select id="nr"><option value="maybe">Не знаю</option><option value="yes">Да</option><option value="no">Нет</option></select>'+
  '<div class="acts"><button id="cancel">✕</button><button id="save">💾 СОХРАНИТЬ</button></div></div>';
  document.body.appendChild(w);const i=w.querySelector("#ni"),s=w.querySelector("#ns"),rr=w.querySelector("#nr");
  i.value=old?old.interest:0;s.value=old?old.satisfaction:0;rr.value=old?old.repeat:"maybe";
  const paint=()=>{w.querySelector("#niv").textContent=i.value+"/5";w.querySelector("#nsv").textContent=s.value+"/5";};i.oninput=paint;s.oninput=paint;paint();
  w.querySelector("#cancel").onclick=()=>w.remove();w.querySelector("#save").onclick=()=>{
    const data={day,topic:entry.discoverTopic,interest:Number(i.value),satisfaction:Number(s.value),repeat:rr.value,updatedAt:Date.now()};
    if(old)Object.assign(old,data);else T("discover_reviews").push(data);
    entry.progress=100;save();w.remove();render();
  };
}
