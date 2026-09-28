function renderWorkout(d,t){
  const w=d.workout||{};
  $('#session').value=w.session||'';
  $('#workoutType').value=w.type||'RowErg';
  $('#calHour').value=w.calHour||'';
  $('#hours').value=w.h||0;
  $('#minutes').value=w.m||'';
  $('#seconds').value=w.s||'';
  $('#machineCals').textContent=Math.round(t.machine);
  $('#trueCals').textContent=Math.round((w.mode||'erg')==='other'?0:t.adjusted);
  $('#otherWorkoutCalories').value=w.otherCalories||'';
  $('#otherCalsDisplay').textContent=Math.round(+w.otherCalories||0);

  const otherType=$('#otherWorkoutType');
  if(otherType)otherType.value=w.otherType||'';

  setWorkoutMode(w.mode||'erg',false);

  if(typeof updateWorkoutCaloriesDateLabel==='function'){
    updateWorkoutCaloriesDateLabel();
  }
}

function setWorkoutMode(mode,doSave=true){
  let w=day().workout;
  w.mode=mode;
  $('#ergWorkoutFields').hidden=mode!=='erg';
  $('#otherWorkoutFields').hidden=mode!=='other';
  $('#ergTrainingBtn').className=mode==='erg'?'':'ghost';
  $('#otherWorkoutBtn').className=mode==='other'?'':'ghost';
  if(doSave)save();
}

$('#ergTrainingBtn').onclick=()=>setWorkoutMode('erg');
$('#otherWorkoutBtn').onclick=()=>setWorkoutMode('other');

['session','workoutType','calHour','hours','minutes','seconds'].forEach(id=>
  $('#'+id).oninput=e=>{
    let map={
      session:'session',
      workoutType:'type',
      calHour:'calHour',
      hours:'h',
      minutes:'m',
      seconds:'s'
    };
    day().workout[map[id]]=e.target.value;
    save();
  }
);

$('#otherWorkoutCalories').oninput=e=>{
  day().workout.otherCalories=e.target.value;
  save();
};

$('#weight').onchange=e=>{day().weight=+e.target.value;save()};
$('#bmr').onchange=e=>{db.settings.bmr=+e.target.value;save()};
$('#phase').onchange=e=>{day().phase=e.target.value;save()};


/* =========================================================
   WORKOUTS TAB
   - Monthly manual workout calendar
   - Existing calorie-burn calculator moved here from Meals
   - Calendar planning and calorie calculation remain separate
   ========================================================= */

(()=>{
  const TYPES=[
    {
      key:'rowing',
      label:'Rowing',
      icon:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 16h16l-2 3H6z"/><path d="M7 5l10 10M17 5L7 15"/></svg>'
    },
    {
      key:'cycling',
      label:'Indoor Cycling',
      icon:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="17" r="4"/><circle cx="18" cy="17" r="4"/><path d="M6 17l4-7h4l4 7M10 10l4 7M9 7h4"/></svg>'
    },
    {
      key:'skierg',
      label:'SkiErg',
      icon:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="2"/><path d="M10 8l2 4 3 2M12 12l-3 7M14 14l3 5M8 9L4 18M16 9l4 9"/></svg>'
    },
    {
      key:'weights',
      label:'Weightlifting',
      icon:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9v6M6 7v10M18 7v10M21 9v6M6 12h12"/></svg>'
    },
    {
      key:'running',
      label:'Running',
      icon:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="14" cy="5" r="2"/><path d="M12 8l-3 4 4 2 2-4 3 2M13 14l-4 5M14 14l4 5"/></svg>'
    },
    {
      key:'swimming',
      label:'Swimming',
      icon:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="15" cy="7" r="2"/><path d="M4 13l5-3 4 3 3-2 4 2M3 17c2 2 4 2 6 0 2 2 4 2 6 0 2 2 4 2 6 0M3 20c2 2 4 2 6 0 2 2 4 2 6 0 2 2 4 2 6 0"/></svg>'
    },
    {
      key:'recovery',
      label:'Recovery',
      icon:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v6h-6"/><path d="M9 12l2 2 4-5"/></svg>'
    },
    {
      key:'stretching',
      label:'Stretching',
      icon:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="2"/><path d="M12 8v6M12 10L5 7M12 10l7-3M12 14l-5 6M12 14l5 6"/></svg>'
    }
  ];

  const TYPE_MAP=Object.fromEntries(TYPES.map(t=>[t.key,t]));
  let calendarAnchor=new Date();
  let selectedDate='';
  let selectedType='rowing';
  let editingId=null;

  function esc(value){
    return String(value??'')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#039;');
  }

  function ensureStore(){
    if(!db.workoutCalendar||typeof db.workoutCalendar!=='object'||Array.isArray(db.workoutCalendar)){
      db.workoutCalendar={};
    }
    return db.workoutCalendar;
  }

  function persistCalendar(){
    localStorage.setItem(KEY,JSON.stringify(db));
  }

  function isoDate(d){
    const y=d.getFullYear();
    const m=String(d.getMonth()+1).padStart(2,'0');
    const n=String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${n}`;
  }

  function parseIso(s){
    const [y,m,d]=String(s).split('-').map(Number);
    return new Date(y,m-1,d);
  }

  function prettyDate(s){
    return parseIso(s).toLocaleDateString(undefined,{
      weekday:'long',
      day:'numeric',
      month:'long',
      year:'numeric'
    });
  }

  function monthTitle(d){
    return d.toLocaleDateString(undefined,{month:'long',year:'numeric'});
  }

  function workoutsOn(dateKey){
    const store=ensureStore();
    if(!Array.isArray(store[dateKey]))store[dateKey]=[];
    return store[dateKey];
  }

  function iconFor(type){
    return (TYPE_MAP[type]||TYPE_MAP.rowing).icon;
  }

  function labelFor(type){
    return (TYPE_MAP[type]||TYPE_MAP.rowing).label;
  }

  function injectStyles(){
    if(document.getElementById('workoutCalendarStyles'))return;

    const style=document.createElement('style');
    style.id='workoutCalendarStyles';
    style.textContent=`
      #workoutCalendarView{width:100%}
      .workout-calendar-shell{
        background:#111a2d;
        border:1px solid #26324a;
        border-radius:18px;
        box-shadow:0 10px 30px #0003;
        margin:12px 18px;
        padding:18px
      }
      .workout-calendar-head{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:14px;
        margin-bottom:14px
      }
      .workout-calendar-head h2{font-size:24px;margin:0}
      .workout-calendar-head p{color:#9aa7bd;margin-top:4px}
      .workout-month-nav{display:flex;align-items:center;gap:8px}
      .workout-month-nav strong{min-width:155px;text-align:center;font-size:16px}
      .workout-month-nav button{min-width:44px}
      .workout-legend{
        display:grid;
        grid-template-columns:repeat(8,minmax(0,1fr));
        gap:7px;
        margin:8px 0 14px
      }
      .workout-legend-item{
        min-width:0;
        background:#0c1427;
        border:1px solid #26324a;
        border-radius:10px;
        padding:7px 5px;
        text-align:center;
        color:#b7c2d6;
        font-size:10px
      }
      .workout-icon{
        width:23px;
        height:23px;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        flex:0 0 auto
      }
      .workout-icon svg{
        width:100%;
        height:100%;
        fill:none;
        stroke:currentColor;
        stroke-width:1.8;
        stroke-linecap:round;
        stroke-linejoin:round
      }
      .workout-legend-item .workout-icon{
        display:flex;
        margin:0 auto 3px;
        color:#b7aaff
      }
      .workout-calendar-weekdays{
        display:grid;
        grid-template-columns:repeat(7,minmax(0,1fr));
        background:#0d1528;
        border:1px solid #26324a;
        border-bottom:0;
        border-radius:14px 14px 0 0;
        overflow:hidden
      }
      .workout-calendar-weekdays div{
        padding:9px 6px;
        text-align:center;
        color:#8f9bb0;
        font-size:11px;
        font-weight:800;
        text-transform:uppercase;
        letter-spacing:.05em;
        border-right:1px solid #26324a
      }
      .workout-calendar-weekdays div:last-child{border-right:0}
      .workout-calendar-grid{
        display:grid;
        grid-template-columns:repeat(7,minmax(0,1fr));
        border-left:1px solid #26324a;
        border-top:1px solid #26324a;
        border-radius:0 0 14px 14px;
        overflow:hidden
      }
      .workout-day{
        position:relative;
        min-height:112px;
        background:#0b1325;
        border-right:1px solid #26324a;
        border-bottom:1px solid #26324a;
        padding:7px;
        cursor:pointer;
        transition:.12s ease;
        text-align:left;
        overflow:hidden
      }
      .workout-day:hover{background:#101a31}
      .workout-day.outside{background:#09101e;color:#5d6980}
      .workout-day.today{box-shadow:inset 0 0 0 2px #7c5cff}
      .workout-day.selected{box-shadow:inset 0 0 0 2px #c084fc}
      .workout-day-number{
        display:flex;
        align-items:center;
        justify-content:space-between;
        font-size:12px;
        font-weight:800;
        margin-bottom:5px
      }
      .workout-day-add{opacity:0;color:#a99aff;font-size:14px}
      .workout-day:hover .workout-day-add{opacity:1}
      .workout-chip{
        width:100%;
        display:flex;
        align-items:center;
        gap:5px;
        background:linear-gradient(90deg,rgba(124,92,255,.24),rgba(199,72,255,.16));
        border:1px solid rgba(167,129,255,.34);
        border-radius:7px;
        padding:4px 5px;
        margin-top:4px;
        color:#eef2ff;
        font-size:9.5px;
        line-height:1.15;
        text-align:left;
        min-height:28px
      }
      .workout-chip:hover{
        border-color:#a98bff;
        background:linear-gradient(90deg,rgba(124,92,255,.38),rgba(199,72,255,.25))
      }
      .workout-chip .workout-icon{width:16px;height:16px;color:#c7b7ff}
      .workout-chip-text{min-width:0;overflow:hidden}
      .workout-chip-text b{
        display:block;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
        font-size:9.5px
      }
      .workout-chip-text span{
        display:block;
        color:#aeb9cc;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
        margin-top:1px
      }
      .workout-more{font-size:9px;color:#9f8cff;margin-top:4px;padding-left:3px}
      .workout-selected-note{
        margin:12px 18px 0;
        padding:11px 14px;
        border-radius:12px;
        border:1px solid #34415c;
        background:#0c1427;
        color:#aeb9cc
      }
      .workout-selected-note b{color:#eef2ff}
      #workoutPlannerDialog form{display:grid;gap:13px}
      .workout-type-picker{
        display:grid;
        grid-template-columns:repeat(4,minmax(0,1fr));
        gap:8px
      }
      .workout-type-btn{
        background:#0c1427;
        border:1px solid #26324a;
        color:#b7c2d6;
        border-radius:12px;
        padding:9px 6px;
        display:flex;
        flex-direction:column;
        align-items:center;
        justify-content:center;
        gap:5px;
        min-height:76px;
        font-size:11px
      }
      .workout-type-btn.active{
        background:rgba(124,92,255,.22);
        border-color:#7c5cff;
        color:#fff;
        box-shadow:inset 0 0 0 1px rgba(124,92,255,.25)
      }
      .workout-type-btn .workout-icon{width:28px;height:28px;color:#b7aaff}
      #workoutDescription{
        min-height:110px;
        resize:vertical;
        background:#0b1325;
        border:1px solid #34415c;
        color:white;
        border-radius:11px;
        padding:11px;
        font:inherit
      }
      #workoutDescription:focus{outline:none;border-color:#8d75ff}
      .workout-dialog-actions{display:flex;gap:8px;justify-content:flex-end}
      .workout-date-existing{border-top:1px solid #26324a;padding-top:12px}
      .workout-date-existing h3{font-size:14px;margin:0 0 7px}
      .workout-existing-row{
        display:grid;
        grid-template-columns:auto minmax(0,1fr) auto auto;
        gap:8px;
        align-items:center;
        padding:8px 0;
        border-top:1px solid #26324a
      }
      .workout-existing-row:first-of-type{border-top:0}
      .workout-existing-row .workout-icon{color:#b7aaff}
      .workout-existing-copy{min-width:0}
      .workout-existing-copy b,.workout-existing-copy small{display:block}
      .workout-existing-copy small{
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
        margin-top:2px
      }
      .workout-existing-row button{
        padding:7px 9px;
        min-height:34px;
        font-size:11px
      }
      .workout-delete-btn{background:transparent!important;color:#ff8f9f!important}
      #workoutCalendarView .panel{
        margin-top:12px;
        margin-bottom:12px
      }
      #workoutCalendarView #otherWorkoutFields .grid{
        grid-template-columns:repeat(2,minmax(0,1fr))!important
      }
      @media(max-width:700px){
        .workout-calendar-head{align-items:flex-start;flex-direction:column}
        .workout-month-nav{width:100%;justify-content:space-between}
        .workout-legend{grid-template-columns:repeat(4,minmax(0,1fr))}
        .workout-day{min-height:98px;padding:5px}
      }
    `;
    document.head.appendChild(style);
  }

  function injectOtherWorkoutType(){
    const otherFields=document.getElementById('otherWorkoutFields');
    if(!otherFields||document.getElementById('otherWorkoutType'))return;

    const grid=otherFields.querySelector('.grid');
    if(!grid)return;

    const label=document.createElement('label');
    label.innerHTML='Workout type<input id="otherWorkoutType" placeholder="e.g. Running, Weightlifting, Swimming"/>';
    grid.prepend(label);

    const input=label.querySelector('input');
    input.oninput=e=>{
      day().workout.otherType=e.target.value;
      save();
    };
  }

  function moveExistingWorkoutPanel(){
    const ergBtn=document.getElementById('ergTrainingBtn');
    const view=document.getElementById('workoutCalendarView');
    if(!ergBtn||!view)return;

    const panel=ergBtn.closest('section.panel');
    if(!panel)return;

    const head=panel.querySelector('.section-head');
    if(head){
      const h2=head.querySelector('h2');
      const p=head.querySelector('p');
      if(h2)h2.textContent='Daily workout calories';
      if(p){
        p.id='workoutCaloriesDate';
        p.textContent='';
      }
    }

    view.appendChild(panel);
    injectOtherWorkoutType();
    updateWorkoutCaloriesDateLabel();
  }

  function injectUi(){
    if(document.getElementById('workoutCalendarTab'))return;

    injectStyles();

    const nav=document.querySelector('.app-tabs');
    const seasonsTab=document.getElementById('seasonsTab');
    if(!nav||!seasonsTab)return;

    const tab=document.createElement('button');
    tab.className='tab';
    tab.id='workoutCalendarTab';
    tab.type='button';
    tab.textContent='Workouts';
    seasonsTab.after(tab);

    const main=document.querySelector('main');
    const view=document.createElement('div');
    view.id='workoutCalendarView';
    view.hidden=true;
    view.innerHTML=`
      <section class="workout-calendar-shell">
        <div class="workout-calendar-head">
          <div>
            <h2>Workout Calendar</h2>
            <p>Plan your training manually. Click any date to add a workout.</p>
          </div>
          <div class="workout-month-nav">
            <button class="ghost" id="workoutPrevMonth" type="button" aria-label="Previous month">‹</button>
            <strong id="workoutMonthTitle"></strong>
            <button class="ghost" id="workoutNextMonth" type="button" aria-label="Next month">›</button>
            <button class="ghost" id="workoutTodayMonth" type="button">Today</button>
          </div>
        </div>
        <div class="workout-legend" id="workoutLegend"></div>
        <div class="workout-calendar-weekdays">
          <div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div><div>Sun</div>
        </div>
        <div class="workout-calendar-grid" id="workoutCalendarGrid"></div>
      </section>
      <div class="workout-selected-note">
        Daily calorie logging below is for <b id="workoutSelectedDate"></b>.
        Planned calendar descriptions stay separate from calorie calculations for now.
      </div>
    `;
    main.appendChild(view);

    const dialog=document.createElement('dialog');
    dialog.id='workoutPlannerDialog';
    dialog.innerHTML=`
      <form id="workoutPlannerForm" method="dialog">
        <div class="section-head">
          <div>
            <h2 id="workoutDialogTitle">Add workout</h2>
            <p id="workoutDialogDate"></p>
          </div>
          <button aria-label="Close" class="ghost" id="closeWorkoutPlanner" type="button">✕</button>
        </div>
        <div>
          <label style="margin-bottom:7px">Workout type</label>
          <div class="workout-type-picker" id="workoutTypePicker"></div>
        </div>
        <label>Workout description
          <textarea id="workoutDescription" placeholder="e.g. 4 × 2 km at threshold pace, 3 min recovery"></textarea>
        </label>
        <div class="workout-dialog-actions">
          <button class="ghost" id="cancelWorkoutPlanner" type="button">Cancel</button>
          <button id="saveWorkoutPlanner" type="submit">Save workout</button>
        </div>
        <div class="workout-date-existing" id="workoutExistingBlock">
          <h3>Workouts on this date</h3>
          <div id="workoutExistingList"></div>
        </div>
      </form>
    `;
    document.body.appendChild(dialog);

    document.getElementById('workoutLegend').innerHTML=TYPES.map(t=>`
      <div class="workout-legend-item">
        <span class="workout-icon">${t.icon}</span>
        <span>${esc(t.label)}</span>
      </div>
    `).join('');

    document.getElementById('workoutTypePicker').innerHTML=TYPES.map(t=>`
      <button class="workout-type-btn${t.key===selectedType?' active':''}" type="button" data-workout-type="${t.key}">
        <span class="workout-icon">${t.icon}</span>
        <span>${esc(t.label)}</span>
      </button>
    `).join('');

    moveExistingWorkoutPanel();
    bindUi();
  }

  window.updateWorkoutCaloriesDateLabel=function(){
    const d=typeof date==='string'?date:isoDate(new Date());
    const text=prettyDate(d);

    const label=document.getElementById('workoutCaloriesDate');
    if(label)label.textContent='Calorie calculation for '+text+'.';

    const selected=document.getElementById('workoutSelectedDate');
    if(selected)selected.textContent=text;
  };

  function selectCalendarDate(dateKey,rerender=true){
    selectedDate=dateKey;
    date=dateKey;

    if(rerender)render();

    calendarAnchor=new Date(parseIso(dateKey).getFullYear(),parseIso(dateKey).getMonth(),1);
    updateWorkoutCaloriesDateLabel();
    renderCalendar();
  }

  function openWorkoutTab(){
    ['trackerView','seasonsView','supportView','recipeView','analyticsView'].forEach(id=>{
      const el=document.getElementById(id);
      if(el)el.hidden=true;
    });

    document.querySelectorAll('.app-tabs .tab').forEach(btn=>btn.classList.remove('active'));

    const view=document.getElementById('workoutCalendarView');
    view.hidden=false;
    document.getElementById('workoutCalendarTab').classList.add('active');

    const current=parseIso(typeof date==='string'?date:isoDate(new Date()));
    if(Number.isFinite(current.getTime())){
      calendarAnchor=new Date(current.getFullYear(),current.getMonth(),1);
      selectedDate=isoDate(current);
    }

    updateWorkoutCaloriesDateLabel();
    renderCalendar();
    window.dispatchEvent(new Event('resize'));
  }

  function hideWorkoutViewForOtherTabs(event){
    const btn=event.target.closest('.tab');
    if(!btn||btn.id==='workoutCalendarTab')return;

    const view=document.getElementById('workoutCalendarView');
    const tab=document.getElementById('workoutCalendarTab');

    if(view)view.hidden=true;
    if(tab)tab.classList.remove('active');
  }

  function renderCalendar(){
    ensureStore();

    const title=document.getElementById('workoutMonthTitle');
    const grid=document.getElementById('workoutCalendarGrid');
    if(!title||!grid)return;

    title.textContent=monthTitle(calendarAnchor);

    const year=calendarAnchor.getFullYear();
    const month=calendarAnchor.getMonth();
    const first=new Date(year,month,1);

    const mondayOffset=(first.getDay()+6)%7;
    const gridStart=new Date(year,month,1-mondayOffset);
    const todayKey=isoDate(new Date());

    let html='';

    for(let i=0;i<42;i++){
      const cellDate=new Date(
        gridStart.getFullYear(),
        gridStart.getMonth(),
        gridStart.getDate()+i
      );

      const key=isoDate(cellDate);
      const outside=cellDate.getMonth()!==month;
      const entries=workoutsOn(key);
      const shown=entries.slice(0,3);

      html+=`
        <div class="workout-day${outside?' outside':''}${key===todayKey?' today':''}${key===date?' selected':''}" data-calendar-date="${key}">
          <div class="workout-day-number">
            <span>${cellDate.getDate()}</span>
            <span class="workout-day-add">＋</span>
          </div>

          ${shown.map(item=>`
            <button class="workout-chip" type="button"
                    data-calendar-date="${key}"
                    data-workout-id="${esc(item.id)}"
                    title="${esc(item.description||labelFor(item.type))}">
              <span class="workout-icon">${iconFor(item.type)}</span>
              <span class="workout-chip-text">
                <b>${esc(labelFor(item.type))}</b>
                ${item.description?`<span>${esc(item.description)}</span>`:''}
              </span>
            </button>
          `).join('')}

          ${entries.length>3
            ? `<div class="workout-more">+${entries.length-3} more</div>`
            : ''
          }
        </div>
      `;
    }

    grid.innerHTML=html;
  }

  function setSelectedType(type){
    selectedType=TYPE_MAP[type]?type:'rowing';

    document.querySelectorAll('.workout-type-btn').forEach(btn=>{
      btn.classList.toggle('active',btn.dataset.workoutType===selectedType);
    });
  }

  function renderExisting(){
    const block=document.getElementById('workoutExistingBlock');
    const list=document.getElementById('workoutExistingList');
    const entries=workoutsOn(selectedDate);

    block.hidden=!entries.length;

    list.innerHTML=entries.map(item=>`
      <div class="workout-existing-row">
        <span class="workout-icon">${iconFor(item.type)}</span>

        <div class="workout-existing-copy">
          <b>${esc(labelFor(item.type))}</b>
          <small>${esc(item.description||'No description')}</small>
        </div>

        <button class="ghost" type="button" data-edit-workout="${esc(item.id)}">Edit</button>
        <button class="workout-delete-btn" type="button" data-delete-workout="${esc(item.id)}">Delete</button>
      </div>
    `).join('');
  }

  function openDialog(dateKey,id=null){
    selectCalendarDate(dateKey,true);
    editingId=id;

    let item=null;
    if(id){
      item=workoutsOn(dateKey).find(x=>x.id===id)||null;
    }

    setSelectedType(item?.type||'rowing');
    document.getElementById('workoutDescription').value=item?.description||'';
    document.getElementById('workoutDialogTitle').textContent=item?'Edit workout':'Add workout';
    document.getElementById('saveWorkoutPlanner').textContent=item?'Save changes':'Save workout';
    document.getElementById('workoutDialogDate').textContent=prettyDate(dateKey);

    renderExisting();
    document.getElementById('workoutPlannerDialog').showModal();
  }

  function saveDialogWorkout(){
    const description=document.getElementById('workoutDescription').value.trim();
    const entries=workoutsOn(selectedDate);

    if(editingId){
      const item=entries.find(x=>x.id===editingId);

      if(item){
        item.type=selectedType;
        item.description=description;
      }
    }else{
      entries.push({
        id:'w_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7),
        type:selectedType,
        description
      });
    }

    persistCalendar();
    editingId=null;
    renderCalendar();
  }

  function deleteWorkout(id){
    const entries=workoutsOn(selectedDate);
    const index=entries.findIndex(x=>x.id===id);

    if(index<0)return;

    if(confirm('Delete this planned workout?')){
      entries.splice(index,1);

      if(!entries.length){
        delete ensureStore()[selectedDate];
      }

      persistCalendar();
      editingId=null;
      renderCalendar();
      renderExisting();

      document.getElementById('workoutDescription').value='';
      setSelectedType('rowing');
      document.getElementById('workoutDialogTitle').textContent='Add workout';
      document.getElementById('saveWorkoutPlanner').textContent='Save workout';
    }
  }

  function bindUi(){
    const nav=document.querySelector('.app-tabs');
    nav.addEventListener('click',hideWorkoutViewForOtherTabs,true);

    document.getElementById('workoutCalendarTab').addEventListener('click',openWorkoutTab);

    document.getElementById('workoutPrevMonth').addEventListener('click',()=>{
      calendarAnchor=new Date(
        calendarAnchor.getFullYear(),
        calendarAnchor.getMonth()-1,
        1
      );
      renderCalendar();
    });

    document.getElementById('workoutNextMonth').addEventListener('click',()=>{
      calendarAnchor=new Date(
        calendarAnchor.getFullYear(),
        calendarAnchor.getMonth()+1,
        1
      );
      renderCalendar();
    });

    document.getElementById('workoutTodayMonth').addEventListener('click',()=>{
      const now=new Date();
      calendarAnchor=new Date(now.getFullYear(),now.getMonth(),1);
      selectCalendarDate(isoDate(now),true);
    });

    document.getElementById('workoutCalendarGrid').addEventListener('click',event=>{
      const chip=event.target.closest('[data-workout-id]');

      if(chip){
        event.stopPropagation();
        openDialog(chip.dataset.calendarDate,chip.dataset.workoutId);
        return;
      }

      const cell=event.target.closest('[data-calendar-date]');

      if(cell){
        openDialog(cell.dataset.calendarDate);
      }
    });

    document.getElementById('workoutTypePicker').addEventListener('click',event=>{
      const btn=event.target.closest('[data-workout-type]');
      if(btn)setSelectedType(btn.dataset.workoutType);
    });

    document.getElementById('closeWorkoutPlanner').addEventListener('click',()=>{
      document.getElementById('workoutPlannerDialog').close();
    });

    document.getElementById('cancelWorkoutPlanner').addEventListener('click',()=>{
      document.getElementById('workoutPlannerDialog').close();
    });

    document.getElementById('workoutPlannerForm').addEventListener('submit',event=>{
      event.preventDefault();
      saveDialogWorkout();
      document.getElementById('workoutPlannerDialog').close();
    });

    document.getElementById('workoutExistingList').addEventListener('click',event=>{
      const edit=event.target.closest('[data-edit-workout]');

      if(edit){
        openDialog(selectedDate,edit.dataset.editWorkout);
        return;
      }

      const del=event.target.closest('[data-delete-workout]');

      if(del){
        deleteWorkout(del.dataset.deleteWorkout);
      }
    });
  }

  ensureStore();
  injectUi();
})();
