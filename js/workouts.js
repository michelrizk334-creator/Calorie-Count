/* =========================================================
   WORKOUTS — weekly vertical agenda
   Each session owns its own calorie calculator.
   Meals/Analytics use the sum of session calories for the day.
   ========================================================= */

const WORKOUT_ACTIVITY_TYPES = [
  {
    key:'rowing',
    label:'Rowing',
    image:'assets/workouts/rowing.png'
  },
  {
    key:'cycling',
    label:'Cycling',
    image:'assets/workouts/cycling.png'
  },
  {
    key:'indoor_cycling',
    label:'Indoor Cycling',
    image:'assets/workouts/indoor-cycling.png'
  },
  {
    key:'skierg',
    label:'SkiErg',
    image:'assets/workouts/skierg.png'
  },
  {
    key:'weights',
    label:'Weightlifting',
    image:'assets/workouts/weightlifting.png'
  },
  {
    key:'running',
    label:'Running',
    image:'assets/workouts/running.png'
  },
  {
    key:'swimming',
    label:'Swimming',
    image:'assets/workouts/swimming.png'
  },
  {
    key:'recovery',
    label:'Recovery',
    image:'assets/workouts/recovery.png',
    invert:true
  },
  {
    key:'stretching',
    label:'Stretching',
    image:'assets/workouts/stretching.png'
  }
];

const WORKOUT_TYPE_MAP = Object.fromEntries(
  WORKOUT_ACTIVITY_TYPES.map(item => [item.key, item])
);

function workoutEsc(value){
  return String(value ?? '')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#039;');
}

function workoutIsoDate(d){
  const y=d.getFullYear();
  const m=String(d.getMonth()+1).padStart(2,'0');
  const n=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${n}`;
}

function workoutParseIso(value){
  const [y,m,d]=String(value).split('-').map(Number);
  return new Date(y,m-1,d);
}

function workoutStartOfWeek(input){
  const d=new Date(input.getFullYear(),input.getMonth(),input.getDate());
  const offset=(d.getDay()+6)%7; // Monday = 0
  d.setDate(d.getDate()-offset);
  return d;
}

function workoutPrettyDate(dateKey){
  return workoutParseIso(dateKey).toLocaleDateString('en-GB',{
    weekday:'long',
    day:'numeric',
    month:'long',
    year:'numeric'
  });
}

function workoutShortDate(dateKey){
  return workoutParseIso(dateKey).toLocaleDateString('en-GB',{
    weekday:'long',
    day:'numeric',
    month:'short'
  });
}

function workoutWeekRangeLabel(start){
  const end=new Date(start.getFullYear(),start.getMonth(),start.getDate()+6);
  const sameMonth=start.getMonth()===end.getMonth() && start.getFullYear()===end.getFullYear();

  if(sameMonth){
    return `${start.getDate()} – ${end.getDate()} ${end.toLocaleDateString('en-GB',{month:'short',year:'numeric'})}`;
  }

  const left=start.toLocaleDateString('en-GB',{day:'numeric',month:'short'});
  const right=end.toLocaleDateString('en-GB',{
    day:'numeric',
    month:'short',
    year:start.getFullYear()===end.getFullYear()?'numeric':'numeric'
  });
  return `${left} – ${right}`;
}

function workoutActivityLabel(type){
  return (WORKOUT_TYPE_MAP[type]||WORKOUT_TYPE_MAP.rowing).label;
}

function workoutActivityIcon(type){
  const item=WORKOUT_TYPE_MAP[type]||WORKOUT_TYPE_MAP.rowing;
  return `<img class="workout-activity-image${item.invert?' workout-activity-image-invert':''}" src="${item.image}" alt="" aria-hidden="true"/>`;
}

function ensureWorkoutCalendar(){
  if(!db.workoutCalendar || typeof db.workoutCalendar!=='object' || Array.isArray(db.workoutCalendar)){
    db.workoutCalendar={};
  }
  return db.workoutCalendar;
}

function workoutSessionsForDate(dateKey,create=true){
  const store=ensureWorkoutCalendar();
  if(!Array.isArray(store[dateKey])){
    if(!create)return [];
    store[dateKey]=[];
  }
  return store[dateKey];
}

function workoutWeightForDate(dateKey){
  const stored=Number(db.days?.[dateKey]?.weight);
  if(Number.isFinite(stored) && stored>0)return stored;
  const fallback=Number(latestWeight(dateKey));
  return Number.isFinite(fallback) && fallback>0 ? fallback : 75;
}

function workoutSessionMetrics(session,dateKey){
  const mode=session?.calcMode==='erg'?'erg':'other';

  if(mode==='erg'){
    const calHour=Math.max(0,Number(session?.calHour)||0);
    const h=Math.max(0,Number(session?.h)||0);
    const m=Math.max(0,Number(session?.m)||0);
    const s=Math.max(0,Number(session?.s)||0);
    const seconds=h*3600+m*60+s;
    const hours=seconds/3600;

    const weightKg=workoutWeightForDate(dateKey);
    const weightLb=weightKg*2.205;

    const machine=Math.max(0,calHour*hours);
    const adjustedHour=calHour-300+1.714*weightLb;
    const adjusted=Math.max(0,adjustedHour*hours);

    return {mode,machine,adjusted,total:adjusted};
  }

  const manual=Math.max(0,Number(session?.manualCalories)||0);
  return {mode,machine:0,adjusted:manual,total:manual};
}

function workoutCaloriesForDate(dateKey){
  return workoutSessionsForDate(dateKey,false)
    .reduce((sum,session)=>sum+workoutSessionMetrics(session,dateKey).total,0);
}

window.workoutCaloriesForDate=workoutCaloriesForDate;


/* ---------------------------------------------------------
   Migrate older planner + old single daily workout data once.
   --------------------------------------------------------- */

(function migrateWorkoutData(){
  const store=ensureWorkoutCalendar();

  // v30.3.12: before Cycling was split into outdoor + indoor, the key
  // "cycling" meant Indoor Cycling. Preserve those existing sessions.
  if(!db.workoutCyclingSplitMigratedV1){
    Object.values(store).forEach(sessions=>{
      if(!Array.isArray(sessions))return;
      sessions.forEach(session=>{
        if(session && session.type==='cycling'){
          session.type='indoor_cycling';
        }
      });
    });
    db.workoutCyclingSplitMigratedV1=true;
  }

  // Normalize existing calendar planner entries created in earlier versions.
  Object.entries(store).forEach(([dateKey,sessions])=>{
    if(!Array.isArray(sessions)){
      store[dateKey]=[];
      return;
    }

    sessions.forEach(session=>{
      session.id ||= 'w_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8);
      session.type = WORKOUT_TYPE_MAP[session.type] ? session.type : 'rowing';
      session.description ||= '';

      if(session.calcMode!=='erg' && session.calcMode!=='other'){
        session.calcMode='other';
      }

      session.ergType ||= session.type==='indoor_cycling'
        ? 'BikeErg'
        : session.type==='skierg'
          ? 'SkiErg'
          : 'RowErg';

      session.calHour ??= '';
      session.h ??= 0;
      session.m ??= '';
      session.s ??= '';

      session.otherType ||= workoutActivityLabel(session.type);
      session.manualCalories ??= '';
    });
  });

  // Convert the previous one-workout-per-day calculator into calendar sessions.
  if(!db.workoutAgendaMigratedV1){
    Object.entries(db.days||{}).forEach(([dateKey,dayData])=>{
      const legacy=dayData?.workout;
      if(!legacy || typeof legacy!=='object')return;

      const mode=legacy.mode||'erg';

      const hasErg=
        mode==='erg' &&
        (
          Number(legacy.calHour)>0 ||
          Number(legacy.h)>0 ||
          Number(legacy.m)>0 ||
          Number(legacy.s)>0 ||
          String(legacy.session||'').trim()
        );

      const hasOther=
        mode==='other' &&
        (
          Number(legacy.otherCalories)>0 ||
          String(legacy.otherType||'').trim()
        );

      if(!hasErg && !hasOther)return;

      const sessions=workoutSessionsForDate(dateKey);

      if(sessions.some(item=>item.legacyDailyWorkout===true))return;

      if(hasErg){
        const ergType=legacy.type||'RowErg';
        const activityType=ergType==='BikeErg'
          ? 'indoor_cycling'
          : ergType==='SkiErg'
            ? 'skierg'
            : 'rowing';

        sessions.push({
          id:'legacy_'+dateKey.replace(/-/g,''),
          type:activityType,
          description:String(legacy.session||'').trim(),
          calcMode:'erg',
          ergType,
          calHour:legacy.calHour||'',
          h:legacy.h||0,
          m:legacy.m||'',
          s:legacy.s||'',
          otherType:workoutActivityLabel(activityType),
          manualCalories:'',
          legacyDailyWorkout:true
        });
      }else{
        const raw=String(legacy.otherType||'').trim();
        const low=raw.toLowerCase();

        let activityType='recovery';
        if(/run/.test(low))activityType='running';
        else if(/swim/.test(low))activityType='swimming';
        else if(/weight|lift|gym/.test(low))activityType='weights';
        else if(/cycle|bike/.test(low))activityType='cycling';
        else if(/row/.test(low))activityType='rowing';
        else if(/ski/.test(low))activityType='skierg';
        else if(/stretch|mobility|yoga/.test(low))activityType='stretching';

        sessions.push({
          id:'legacy_'+dateKey.replace(/-/g,''),
          type:activityType,
          description:raw,
          calcMode:'other',
          ergType:'RowErg',
          calHour:'',
          h:0,
          m:'',
          s:'',
          otherType:raw||workoutActivityLabel(activityType),
          manualCalories:legacy.otherCalories||'',
          legacyDailyWorkout:true
        });
      }
    });

    db.workoutAgendaMigratedV1=true;
  }

  localStorage.setItem(KEY,JSON.stringify(db));
})();


/* ---------------------------------------------------------
   Meals / Analytics calorie source:
   BMR + sum of session calories for that date.
   --------------------------------------------------------- */

const legacyTotalsWithoutWorkoutAgenda=totals;

totals=function(){
  const base=legacyTotalsWithoutWorkoutAgenda();
  const workoutCalories=workoutCaloriesForDate(date);
  const burned=(+db.settings.bmr||1765)+workoutCalories;

  return {
    ...base,
    machine:0,
    adjusted:workoutCalories,
    burned,
    deficit:burned-base.kcal
  };
};


/* ---------------------------------------------------------
   Core render hook.
   The old single daily calculator panel no longer exists.
   --------------------------------------------------------- */

function renderWorkout(){
  if(typeof renderWorkoutAgenda==='function'){
    renderWorkoutAgenda();
  }
}


/* Keep Progress controls working exactly as before. */
$('#weight').onchange=e=>{
  day().weight=+e.target.value;
  save();
};

$('#bmr').onchange=e=>{
  db.settings.bmr=+e.target.value;
  save();
};

$('#phase').onchange=e=>{
  day().phase=e.target.value;
  save();
};


/* ---------------------------------------------------------
   Weekly agenda UI.
   --------------------------------------------------------- */

let workoutWeekAnchor=workoutStartOfWeek(workoutParseIso(date));
let workoutEditingDate='';
let workoutEditingId=null;
let workoutSelectedActivity='rowing';
let workoutSelectedCalcMode='other';

function removeOldWorkoutPanel(){
  const oldButton=document.getElementById('ergTrainingBtn');
  const panel=oldButton?.closest('section.panel');
  if(panel)panel.remove();
}

function injectWorkoutStyles(){
  if(document.getElementById('workoutAgendaStyles'))return;

  const style=document.createElement('style');
  style.id='workoutAgendaStyles';
  style.textContent=`
    #workoutCalendarView{width:100%}

    .workout-agenda-shell{
      margin:12px 18px;
      background:#111a2d;
      border:1px solid #26324a;
      border-radius:18px;
      box-shadow:0 10px 30px #0003;
      overflow:hidden
    }

    .workout-agenda-top{
      padding:18px;
      border-bottom:1px solid #26324a;
      background:linear-gradient(135deg,rgba(91,66,220,.16),rgba(124,92,255,.06))
    }

    .workout-agenda-topline{
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:16px
    }

    .workout-agenda-top h2{
      margin:0;
      font-size:24px
    }

    .workout-agenda-top p{
      margin-top:4px;
      color:#9aa7bd
    }

    .workout-week-nav{
      display:flex;
      align-items:center;
      gap:8px
    }

    #workoutWeekTitle{
      min-width:185px;
      text-align:center;
      font-size:16px
    }

    .workout-week-jump{
      display:flex;
      align-items:end;
      gap:8px;
      margin-top:13px
    }

    .workout-week-jump label{
      flex:1;
      max-width:280px
    }

    .workout-agenda-days{
      display:grid;
      gap:0
    }

    .workout-agenda-day{
      padding:15px 18px 16px;
      border-top:1px solid #26324a;
      background:#0d1528
    }

    .workout-agenda-day:first-child{
      border-top:0
    }

    .workout-agenda-day.today{
      background:linear-gradient(90deg,rgba(124,92,255,.12),#0d1528 42%)
    }

    .workout-agenda-day.selected{
      box-shadow:inset 4px 0 0 #7c5cff
    }

    .workout-day-head{
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:12px;
      margin-bottom:10px
    }

    .workout-day-title{
      min-width:0
    }

    .workout-day-title strong{
      display:block;
      font-size:17px;
      color:#eef2ff
    }

    .workout-day-title small{
      display:block;
      margin-top:2px
    }

    .workout-add-session{
      white-space:nowrap
    }

    .workout-session-stack{
      display:grid;
      gap:8px
    }

    .workout-session-card{
      width:100%;
      display:flex;
      align-items:center;
      gap:12px;
      min-height:58px;
      padding:10px 12px;
      text-align:left;
      background:#111a2d;
      border:1px solid #2c3851;
      border-radius:13px;
      color:#eef2ff
    }

    .workout-session-card:hover{
      border-color:#7c5cff;
      background:#151e35
    }

    .workout-session-icon{
      width:38px;
      height:38px;
      border-radius:11px;
      display:flex;
      align-items:center;
      justify-content:center;
      flex:0 0 auto;
      color:#c7b7ff;
      background:rgba(124,92,255,.14);
      border:1px solid rgba(167,129,255,.24)
    }

    .workout-session-icon .workout-activity-image{
      width:31px;
      height:31px;
      object-fit:contain;
      display:block;
      pointer-events:none;
      mix-blend-mode:screen
    }

    .workout-activity-image-invert{
      filter:invert(1)
    }

    .workout-session-name{
      flex:1;
      min-width:0;
      font-weight:800;
      font-size:14px
    }

    .workout-empty-day{
      color:#68758c;
      padding:8px 2px;
      font-size:12px
    }

    .workout-day-total{
      display:flex;
      justify-content:flex-end;
      margin-top:9px;
      font-size:11px;
      color:#aeb9cc
    }

    .workout-day-total b{
      color:#d8dfff;
      margin-left:5px
    }

    #workoutSessionDialog form{
      display:grid;
      gap:14px
    }

    .workout-type-picker{
      display:grid;
      grid-template-columns:repeat(4,minmax(0,1fr));
      gap:8px
    }

    .workout-type-btn{
      min-height:78px;
      padding:8px 5px;
      display:flex;
      flex-direction:column;
      align-items:center;
      justify-content:center;
      gap:5px;
      background:#0c1427;
      border:1px solid #26324a;
      color:#b7c2d6;
      font-size:10.5px
    }

    .workout-type-btn.active{
      background:rgba(124,92,255,.22);
      border-color:#7c5cff;
      color:#fff
    }

    .workout-type-btn .workout-activity-image{
      width:34px;
      height:34px;
      object-fit:contain;
      display:block;
      pointer-events:none;
      mix-blend-mode:screen
    }

    #workoutDescription{
      min-height:95px;
      resize:vertical;
      width:100%;
      background:#0b1325;
      border:1px solid #34415c;
      color:white;
      border-radius:11px;
      padding:11px;
      font:inherit
    }

    #workoutDescription:focus{
      outline:none;
      border-color:#8d75ff
    }

    .workout-calc-card{
      background:#0c1427;
      border:1px solid #26324a;
      border-radius:14px;
      padding:13px
    }

    .workout-calc-card h3{
      margin:0 0 4px;
      font-size:16px
    }

    .workout-calc-mode{
      display:grid;
      grid-template-columns:1fr 1fr;
      gap:8px;
      margin:11px 0 13px
    }

    .workout-calc-mode button.active{
      background:#7c5cff;
      color:#fff
    }

    .workout-calc-grid{
      display:grid;
      grid-template-columns:repeat(3,minmax(0,1fr));
      gap:9px
    }

    .workout-calc-grid.two{
      grid-template-columns:repeat(2,minmax(0,1fr))
    }

    .workout-calc-result{
      margin-top:11px;
      display:flex;
      gap:10px;
      flex-wrap:wrap
    }

    .workout-calc-result div{
      flex:1;
      min-width:135px;
      padding:10px;
      border-radius:11px;
      background:#111a2d;
      border:1px solid #26324a
    }

    .workout-calc-result small,
    .workout-calc-result strong{
      display:block
    }

    .workout-calc-result strong{
      margin-top:3px;
      font-size:18px
    }

    .workout-session-actions{
      display:flex;
      align-items:center;
      gap:8px
    }

    .workout-session-actions .spacer{
      flex:1
    }

    #deleteWorkoutSession{
      background:transparent;
      color:#ff8f9f
    }

    @media(max-width:700px){
      .workout-agenda-topline{
        align-items:flex-start;
        flex-direction:column
      }

      .workout-week-nav{
        width:100%;
        justify-content:space-between
      }

      #workoutWeekTitle{
        min-width:0;
        flex:1
      }

      .workout-week-jump{
        align-items:stretch
      }

      .workout-day-head{
        align-items:flex-start
      }

      .workout-type-picker{
        grid-template-columns:repeat(4,minmax(0,1fr))
      }

      .workout-calc-grid:not(.two){
        grid-template-columns:repeat(6,minmax(0,1fr))
      }

      .workout-calc-grid:not(.two) > label:nth-child(1),
      .workout-calc-grid:not(.two) > label:nth-child(2){
        grid-column:span 3
      }

      .workout-calc-grid:not(.two) > label:nth-child(3),
      .workout-calc-grid:not(.two) > label:nth-child(4),
      .workout-calc-grid:not(.two) > label:nth-child(5){
        grid-column:span 2
      }
    }
  `;

  document.head.appendChild(style);
}

function injectWorkoutUi(){
  const oldTab=document.getElementById('workoutCalendarTab');
  const oldView=document.getElementById('workoutCalendarView');
  const oldDialog=document.getElementById('workoutPlannerDialog');

  if(oldTab)oldTab.remove();
  if(oldView)oldView.remove();
  if(oldDialog)oldDialog.remove();

  injectWorkoutStyles();

  const seasonsTab=document.getElementById('seasonsTab');
  if(!seasonsTab)return;

  const tab=document.createElement('button');
  tab.className='tab';
  tab.id='workoutCalendarTab';
  tab.type='button';
  tab.textContent='Workouts';
  seasonsTab.after(tab);

  const view=document.createElement('div');
  view.id='workoutCalendarView';
  view.hidden=true;
  view.innerHTML=`
    <section class="workout-agenda-shell">
      <div class="workout-agenda-top">
        <div class="workout-agenda-topline">
          <div>
            <h2>Workout Planner</h2>
            <p>One week at a time. Each session stores its own calorie calculation.</p>
          </div>

          <div class="workout-week-nav">
            <button class="ghost" id="workoutPrevWeek" type="button" aria-label="Previous week">‹</button>
            <strong id="workoutWeekTitle"></strong>
            <button class="ghost" id="workoutNextWeek" type="button" aria-label="Next week">›</button>
            <button class="ghost" id="workoutCurrentWeek" type="button">Current week</button>
          </div>
        </div>

        <div class="workout-week-jump">
          <label>
            Jump to a week
            <input id="workoutWeekPicker" type="date"/>
          </label>
        </div>
      </div>

      <div class="workout-agenda-days" id="workoutAgendaDays"></div>
    </section>
  `;

  document.querySelector('main')?.appendChild(view);

  const dialog=document.createElement('dialog');
  dialog.id='workoutSessionDialog';
  dialog.innerHTML=`
    <form id="workoutSessionForm" method="dialog">
      <div class="section-head">
        <div>
          <h2 id="workoutSessionDialogTitle">Add workout</h2>
          <p id="workoutSessionDate"></p>
        </div>
        <button class="ghost" id="closeWorkoutSession" type="button" aria-label="Close">✕</button>
      </div>

      <div>
        <label style="margin-bottom:7px">Workout</label>
        <div class="workout-type-picker" id="workoutTypePicker"></div>
      </div>

      <label>
        Workout description
        <textarea id="workoutDescription" placeholder="e.g. 4 × 2 km at threshold pace, 3 min recovery"></textarea>
      </label>

      <section class="workout-calc-card">
        <h3>Calorie calculator</h3>
        <p class="note">Choose Erg Training for the adjusted Concept2 calculation, or Other to enter calories manually.</p>

        <div class="workout-calc-mode">
          <button id="sessionErgMode" type="button">Erg Training</button>
          <button id="sessionOtherMode" class="ghost" type="button">Other</button>
        </div>

        <div id="sessionErgFields">
          <div class="workout-calc-grid">
            <label>
              Erg type
              <select id="sessionErgType">
                <option>RowErg</option>
                <option>BikeErg</option>
                <option>SkiErg</option>
              </select>
            </label>

            <label>
              Cal/hour on PM
              <input id="sessionCalHour" min="0" inputmode="decimal" type="number"/>
            </label>

            <label>
              Hours
              <input id="sessionHours" min="0" type="number" value="0"/>
            </label>

            <label>
              Minutes
              <input id="sessionMinutes" min="0" max="59" type="number"/>
            </label>

            <label>
              Seconds
              <input id="sessionSeconds" min="0" max="59" type="number"/>
            </label>
          </div>

          <div class="workout-calc-result">
            <div>
              <small>Machine calories</small>
              <strong id="sessionMachineCalories">0</strong>
            </div>

            <div>
              <small>Adjusted calories</small>
              <strong id="sessionAdjustedCalories">0</strong>
            </div>
          </div>

          <p class="note" style="margin-top:9px">
            Adjusted Cal/h = PM Cal/h − 300 + 1.714 × bodyweight (lb).
          </p>
        </div>

        <div id="sessionOtherFields" hidden>
          <div class="workout-calc-grid two">
            <label>
              Workout type
              <input id="sessionOtherType" placeholder="e.g. Running"/>
            </label>

            <label>
              Total calories burned
              <input id="sessionManualCalories" min="0" inputmode="decimal" type="number" placeholder="e.g. 450"/>
            </label>
          </div>
        </div>
      </section>

      <div class="workout-session-actions">
        <button id="deleteWorkoutSession" type="button" hidden>Delete</button>
        <span class="spacer"></span>
        <button class="ghost" id="cancelWorkoutSession" type="button">Cancel</button>
        <button id="saveWorkoutSession" type="submit">Save workout</button>
      </div>
    </form>
  `;

  document.body.appendChild(dialog);

  document.getElementById('workoutTypePicker').innerHTML=
    WORKOUT_ACTIVITY_TYPES.map(item=>`
      <button
        class="workout-type-btn"
        type="button"
        data-workout-type="${item.key}">
        ${workoutActivityIcon(item.key)}
        <span>${workoutEsc(item.label)}</span>
      </button>
    `).join('');

  bindWorkoutAgendaUi();
}

function workoutSetActivity(type){
  workoutSelectedActivity=WORKOUT_TYPE_MAP[type]?type:'rowing';

  document.querySelectorAll('.workout-type-btn').forEach(btn=>{
    btn.classList.toggle(
      'active',
      btn.dataset.workoutType===workoutSelectedActivity
    );
  });

  const otherType=document.getElementById('sessionOtherType');
  if(otherType && !otherType.value.trim()){
    otherType.value=workoutActivityLabel(workoutSelectedActivity);
  }

  const ergType=document.getElementById('sessionErgType');
  if(ergType){
    if(workoutSelectedActivity==='indoor_cycling')ergType.value='BikeErg';
    else if(workoutSelectedActivity==='skierg')ergType.value='SkiErg';
    else if(workoutSelectedActivity==='rowing')ergType.value='RowErg';
  }

  updateWorkoutSessionCalculator();
}

function workoutSetCalcMode(mode){
  workoutSelectedCalcMode=mode==='erg'?'erg':'other';

  const ergFields=document.getElementById('sessionErgFields');
  const otherFields=document.getElementById('sessionOtherFields');
  const ergBtn=document.getElementById('sessionErgMode');
  const otherBtn=document.getElementById('sessionOtherMode');

  if(ergFields)ergFields.hidden=workoutSelectedCalcMode!=='erg';
  if(otherFields)otherFields.hidden=workoutSelectedCalcMode!=='other';

  if(ergBtn)ergBtn.className=workoutSelectedCalcMode==='erg'?'':'ghost';
  if(otherBtn)otherBtn.className=workoutSelectedCalcMode==='other'?'':'ghost';

  updateWorkoutSessionCalculator();
}

function currentWorkoutDialogMetrics(){
  const fakeSession={
    calcMode:workoutSelectedCalcMode,
    calHour:document.getElementById('sessionCalHour')?.value||'',
    h:document.getElementById('sessionHours')?.value||0,
    m:document.getElementById('sessionMinutes')?.value||'',
    s:document.getElementById('sessionSeconds')?.value||'',
    manualCalories:document.getElementById('sessionManualCalories')?.value||''
  };

  return workoutSessionMetrics(fakeSession,workoutEditingDate||date);
}

function updateWorkoutSessionCalculator(){
  const metrics=currentWorkoutDialogMetrics();

  const machine=document.getElementById('sessionMachineCalories');
  const adjusted=document.getElementById('sessionAdjustedCalories');

  if(machine)machine.textContent=Math.round(metrics.machine);
  if(adjusted)adjusted.textContent=Math.round(metrics.adjusted);
}

function renderWorkoutAgenda(){
  const container=document.getElementById('workoutAgendaDays');
  const title=document.getElementById('workoutWeekTitle');
  const picker=document.getElementById('workoutWeekPicker');

  if(!container || !title)return;

  title.textContent=workoutWeekRangeLabel(workoutWeekAnchor);
  if(picker)picker.value=workoutIsoDate(workoutWeekAnchor);

  const todayKey=workoutIsoDate(new Date());
  let html='';

  for(let i=0;i<7;i++){
    const d=new Date(
      workoutWeekAnchor.getFullYear(),
      workoutWeekAnchor.getMonth(),
      workoutWeekAnchor.getDate()+i
    );

    const key=workoutIsoDate(d);
    const sessions=workoutSessionsForDate(key,false);
    const dailyTotal=workoutCaloriesForDate(key);

    html+=`
      <section class="workout-agenda-day${key===todayKey?' today':''}${key===date?' selected':''}">
        <div class="workout-day-head">
          <div class="workout-day-title">
            <strong>${workoutEsc(workoutShortDate(key))}</strong>
            <small>${sessions.length} session${sessions.length===1?'':'s'}</small>
          </div>

          <button
            class="workout-add-session"
            type="button"
            data-add-workout-date="${key}">
            + Add workout
          </button>
        </div>

        <div class="workout-session-stack">
          ${
            sessions.length
              ? sessions.map(session=>`
                  <button
                    class="workout-session-card"
                    type="button"
                    data-workout-date="${key}"
                    data-workout-session="${workoutEsc(session.id)}">
                    <span class="workout-session-icon">
                      ${workoutActivityIcon(session.type)}
                    </span>

                    <span class="workout-session-name">
                      ${workoutEsc(workoutActivityLabel(session.type))} session
                    </span>
                  </button>
                `).join('')
              : '<div class="workout-empty-day">No workout sessions planned.</div>'
          }
        </div>

        ${
          sessions.length
            ? `<div class="workout-day-total">
                 Daily workout total:
                 <b>${Math.round(dailyTotal)} kcal</b>
               </div>`
            : ''
        }
      </section>
    `;
  }

  container.innerHTML=html;
}

function workoutSelectDate(dateKey){
  date=dateKey;
  render();
}

function openWorkoutSessionDialog(dateKey,id=null){
  workoutEditingDate=dateKey;
  workoutEditingId=id;

  workoutSelectDate(dateKey);

  const sessions=workoutSessionsForDate(dateKey);
  const session=id
    ? sessions.find(item=>item.id===id)
    : null;

  workoutSelectedActivity=session?.type||'rowing';
  workoutSelectedCalcMode=session?.calcMode==='erg'?'erg':'other';

  document.getElementById('workoutSessionDialogTitle').textContent=
    session?'Edit workout':'Add workout';

  document.getElementById('workoutSessionDate').textContent=
    workoutPrettyDate(dateKey);

  document.getElementById('workoutDescription').value=
    session?.description||'';

  document.getElementById('sessionErgType').value=
    session?.ergType||(
      workoutSelectedActivity==='indoor_cycling'
        ? 'BikeErg'
        : workoutSelectedActivity==='skierg'
          ? 'SkiErg'
          : 'RowErg'
    );

  document.getElementById('sessionCalHour').value=
    session?.calHour??'';

  document.getElementById('sessionHours').value=
    session?.h??0;

  document.getElementById('sessionMinutes').value=
    session?.m??'';

  document.getElementById('sessionSeconds').value=
    session?.s??'';

  document.getElementById('sessionOtherType').value=
    session?.otherType||workoutActivityLabel(workoutSelectedActivity);

  document.getElementById('sessionManualCalories').value=
    session?.manualCalories??'';

  document.getElementById('deleteWorkoutSession').hidden=!session;

  workoutSetActivity(workoutSelectedActivity);
  workoutSetCalcMode(workoutSelectedCalcMode);
  updateWorkoutSessionCalculator();

  document.getElementById('workoutSessionDialog').showModal();
}

function saveWorkoutSessionFromDialog(){
  const sessions=workoutSessionsForDate(workoutEditingDate);

  let session=workoutEditingId
    ? sessions.find(item=>item.id===workoutEditingId)
    : null;

  if(!session){
    session={
      id:'w_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8)
    };
    sessions.push(session);
  }

  session.type=workoutSelectedActivity;
  session.description=document.getElementById('workoutDescription').value.trim();
  session.calcMode=workoutSelectedCalcMode;

  session.ergType=document.getElementById('sessionErgType').value;
  session.calHour=document.getElementById('sessionCalHour').value;
  session.h=document.getElementById('sessionHours').value;
  session.m=document.getElementById('sessionMinutes').value;
  session.s=document.getElementById('sessionSeconds').value;

  session.otherType=document.getElementById('sessionOtherType').value.trim();
  session.manualCalories=document.getElementById('sessionManualCalories').value;

  localStorage.setItem(KEY,JSON.stringify(db));
  render();

  workoutEditingId=null;
  renderWorkoutAgenda();
}

function deleteWorkoutSessionFromDialog(){
  if(!workoutEditingId)return;

  const sessions=workoutSessionsForDate(workoutEditingDate);
  const index=sessions.findIndex(item=>item.id===workoutEditingId);

  if(index<0)return;

  if(!confirm('Delete this workout session?'))return;

  sessions.splice(index,1);

  if(!sessions.length){
    delete ensureWorkoutCalendar()[workoutEditingDate];
  }

  localStorage.setItem(KEY,JSON.stringify(db));
  document.getElementById('workoutSessionDialog').close();

  workoutEditingId=null;
  render();
  renderWorkoutAgenda();
}

function openWorkoutAgendaTab(){
  [
    'trackerView',
    'seasonsView',
    'supportView',
    'recipeView',
    'analyticsView'
  ].forEach(id=>{
    const el=document.getElementById(id);
    if(el)el.hidden=true;
  });

  document.querySelectorAll('.app-tabs .tab').forEach(btn=>{
    btn.classList.remove('active');
  });

  const view=document.getElementById('workoutCalendarView');
  if(view)view.hidden=false;

  const tab=document.getElementById('workoutCalendarTab');
  if(tab)tab.classList.add('active');

  workoutWeekAnchor=workoutStartOfWeek(workoutParseIso(date));
  renderWorkoutAgenda();

  window.dispatchEvent(new Event('resize'));
}

function bindWorkoutAgendaUi(){
  const nav=document.querySelector('.app-tabs');

  nav?.addEventListener('click',event=>{
    const tab=event.target.closest('.tab');
    if(!tab || tab.id==='workoutCalendarTab')return;

    const view=document.getElementById('workoutCalendarView');
    const workoutTab=document.getElementById('workoutCalendarTab');

    if(view)view.hidden=true;
    if(workoutTab)workoutTab.classList.remove('active');
  },true);

  document.getElementById('workoutCalendarTab')
    ?.addEventListener('click',openWorkoutAgendaTab);

  document.getElementById('workoutPrevWeek')
    ?.addEventListener('click',()=>{
      workoutWeekAnchor=new Date(
        workoutWeekAnchor.getFullYear(),
        workoutWeekAnchor.getMonth(),
        workoutWeekAnchor.getDate()-7
      );
      renderWorkoutAgenda();
    });

  document.getElementById('workoutNextWeek')
    ?.addEventListener('click',()=>{
      workoutWeekAnchor=new Date(
        workoutWeekAnchor.getFullYear(),
        workoutWeekAnchor.getMonth(),
        workoutWeekAnchor.getDate()+7
      );
      renderWorkoutAgenda();
    });

  document.getElementById('workoutCurrentWeek')
    ?.addEventListener('click',()=>{
      const now=new Date();
      workoutWeekAnchor=workoutStartOfWeek(now);
      renderWorkoutAgenda();
    });

  document.getElementById('workoutWeekPicker')
    ?.addEventListener('change',event=>{
      if(!event.target.value)return;
      workoutWeekAnchor=workoutStartOfWeek(
        workoutParseIso(event.target.value)
      );
      renderWorkoutAgenda();
    });

  document.getElementById('workoutAgendaDays')
    ?.addEventListener('click',event=>{
      const add=event.target.closest('[data-add-workout-date]');

      if(add){
        openWorkoutSessionDialog(add.dataset.addWorkoutDate);
        return;
      }

      const session=event.target.closest('[data-workout-session]');

      if(session){
        openWorkoutSessionDialog(
          session.dataset.workoutDate,
          session.dataset.workoutSession
        );
      }
    });

  document.getElementById('workoutTypePicker')
    ?.addEventListener('click',event=>{
      const btn=event.target.closest('[data-workout-type]');
      if(btn)workoutSetActivity(btn.dataset.workoutType);
    });

  document.getElementById('sessionErgMode')
    ?.addEventListener('click',()=>workoutSetCalcMode('erg'));

  document.getElementById('sessionOtherMode')
    ?.addEventListener('click',()=>workoutSetCalcMode('other'));

  [
    'sessionCalHour',
    'sessionHours',
    'sessionMinutes',
    'sessionSeconds',
    'sessionManualCalories'
  ].forEach(id=>{
    document.getElementById(id)
      ?.addEventListener('input',updateWorkoutSessionCalculator);
  });

  document.getElementById('closeWorkoutSession')
    ?.addEventListener('click',()=>{
      document.getElementById('workoutSessionDialog').close();
    });

  document.getElementById('cancelWorkoutSession')
    ?.addEventListener('click',()=>{
      document.getElementById('workoutSessionDialog').close();
    });

  document.getElementById('deleteWorkoutSession')
    ?.addEventListener('click',deleteWorkoutSessionFromDialog);

  document.getElementById('workoutSessionForm')
    ?.addEventListener('submit',event=>{
      event.preventDefault();
      saveWorkoutSessionFromDialog();
      document.getElementById('workoutSessionDialog').close();
    });
}


removeOldWorkoutPanel();
injectWorkoutUi();
renderWorkoutAgenda();
