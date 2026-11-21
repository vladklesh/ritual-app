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
