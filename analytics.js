// =========================================================
// v30 ANALYTICS
// Daily = days of the selected week
// Weekly = weeks of the selected month
// Monthly = months of the selected year
// =========================================================
let analyticsMode='daily';
let analyticsAnchor=date;

function analyticsDateFromIso(value){return new Date(String(value)+'T12:00:00')}
function analyticsIso(d){const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),dayNum=String(d.getDate()).padStart(2,'0');return `${y}-${m}-${dayNum}`}
function analyticsAddDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x}
function analyticsStartOfWeek(d){const x=new Date(d);const offset=(x.getDay()+6)%7;x.setDate(x.getDate()-offset);return x}
function analyticsEndOfMonth(d){return new Date(d.getFullYear(),d.getMonth()+1,0,12,0,0)}
function analyticsFmtDate(d,opts){return d.toLocaleDateString(undefined,opts)}
function analyticsRangeLabel(start,end){
  if(start.getFullYear()!==end.getFullYear())return `${analyticsFmtDate(start,{day:'numeric',month:'short',year:'numeric'})} – ${analyticsFmtDate(end,{day:'numeric',month:'short',year:'numeric'})}`;
  if(start.getMonth()!==end.getMonth())return `${analyticsFmtDate(start,{day:'numeric',month:'short'})} – ${analyticsFmtDate(end,{day:'numeric',month:'short',year:'numeric'})}`;
  return `${start.getDate()}–${analyticsFmtDate(end,{day:'numeric',month:'short',year:'numeric'})}`;
}
function analyticsDayStats(d){
  if(!d)return{consumed:0,burned:0,balance:0,weight:null,recorded:false};
  let consumed=0;
  (d.meals||[]).flat().forEach(x=>{try{consumed+=calcItem(x).kcal||0}catch{}});
  const w=d.workout||{},mode=w.mode||'erg',secs=(+w.h||0)*3600+(+w.m||0)*60+(+w.s||0),lb=(+d.weight||75)*2.205,trueHour=(+w.calHour||0)-300+1.714*lb,ergAdjusted=Math.max(0,trueHour*secs/3600),adjusted=mode==='other'?Math.max(0,+w.otherCalories||0):ergAdjusted,burned=(+db.settings.bmr||1765)+adjusted;
  const weight=Number.isFinite(+d.weight)&&+d.weight>0?+d.weight:null;
  return{consumed,burned,balance:burned-consumed,weight,recorded:true};
}
function analyticsAggregate(start,end,label,shortLabel=label){
  let consumed=0,burned=0,recordedDays=0;const weights=[];
  for(let d=new Date(start);d<=end;d=analyticsAddDays(d,1)){
    const entry=db.days[analyticsIso(d)];
    if(!entry)continue;
    const s=analyticsDayStats(entry);consumed+=s.consumed;burned+=s.burned;recordedDays++;
    if(s.weight!==null)weights.push(s.weight);
  }
  const weight=weights.length?weights.reduce((a,b)=>a+b,0)/weights.length:null;
  return{start:new Date(start),end:new Date(end),label,shortLabel,consumed,burned,balance:burned-consumed,weight,weightCount:weights.length,recordedDays};
}
function analyticsPeriod(){
  const anchor=analyticsDateFromIso(analyticsAnchor);const segments=[];let start,end,title;
  if(analyticsMode==='daily'){
    start=analyticsStartOfWeek(anchor);end=analyticsAddDays(start,6);title=`Week · ${analyticsRangeLabel(start,end)}`;
    for(let i=0;i<7;i++){const d=analyticsAddDays(start,i);segments.push(analyticsAggregate(d,d,analyticsFmtDate(d,{weekday:'short',day:'numeric'}),analyticsFmtDate(d,{weekday:'short'})))}
  }else if(analyticsMode==='weekly'){
    start=new Date(anchor.getFullYear(),anchor.getMonth(),1,12,0,0);end=analyticsEndOfMonth(anchor);title=`Month · ${analyticsFmtDate(start,{month:'long',year:'numeric'})}`;
    let cursor=new Date(start),week=1;
    while(cursor<=end){const daysToSunday=6-((cursor.getDay()+6)%7);const segEnd=new Date(Math.min(analyticsAddDays(cursor,daysToSunday).getTime(),end.getTime()));const label=`${cursor.getDate()}–${segEnd.getDate()} ${analyticsFmtDate(segEnd,{month:'short'})}`;segments.push(analyticsAggregate(cursor,segEnd,label,`W${week}`));cursor=analyticsAddDays(segEnd,1);week++}
  }else{
    start=new Date(anchor.getFullYear(),0,1,12,0,0);end=new Date(anchor.getFullYear(),11,31,12,0,0);title=`Year · ${anchor.getFullYear()}`;
    for(let m=0;m<12;m++){const ms=new Date(anchor.getFullYear(),m,1,12,0,0),me=new Date(anchor.getFullYear(),m+1,0,12,0,0);segments.push(analyticsAggregate(ms,me,analyticsFmtDate(ms,{month:'short'}),analyticsFmtDate(ms,{month:'short'})))}
  }
  const total=analyticsAggregate(start,end,'Total','Total');
  return{segments,total,start,end,title};
}
function analyticsLineChart(rootId,segments){
  const root=$(rootId);if(!root)return;const values=segments.map(s=>s.weight);const valid=values.filter(v=>v!==null&&Number.isFinite(v));
  if(!valid.length){root.innerHTML='<div class="analytics-empty">No weight entries for this period.</div>';return}
  const W=760,H=220,L=46,R=18,T=18,B=38,plotW=W-L-R,plotH=H-T-B;let min=Math.min(...valid),max=Math.max(...valid);if(Math.abs(max-min)<0.2){min-=0.5;max+=0.5}else{const pad=(max-min)*0.12;min-=pad;max+=pad}
  const x=i=>segments.length===1?L+plotW/2:L+i*plotW/(segments.length-1);const y=v=>T+(max-v)*plotH/(max-min);
  let grid='';for(let i=0;i<4;i++){const yy=T+i*plotH/3,val=max-i*(max-min)/3;grid+=`<line x1="${L}" y1="${yy}" x2="${W-R}" y2="${yy}" stroke="#26324a" stroke-width="1"/><text x="${L-7}" y="${yy+4}" text-anchor="end" fill="#8090aa" font-size="10">${val.toFixed(1)}</text>`}
  const pts=segments.map((s,i)=>s.weight===null?null:[x(i),y(s.weight)]);let path='';let drawing=false;pts.forEach(p=>{if(!p){drawing=false;return}path+=(drawing?' L ':' M ')+p[0].toFixed(1)+' '+p[1].toFixed(1);drawing=true});
  const dots=pts.map((p,i)=>p?`<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="#b7aaff"><title>${escapeHtml(segments[i].label)}: ${segments[i].weight.toFixed(1)} kg</title></circle>`:'').join('');
  const labels=segments.map((s,i)=>`<text x="${x(i)}" y="${H-12}" text-anchor="middle" fill="#94a3b8" font-size="10">${escapeHtml(s.shortLabel)}</text>`).join('');
  root.innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Weight trend">${grid}<path d="${path}" fill="none" stroke="#b7aaff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>${dots}${labels}</svg>`;
}
function analyticsBarChart(rootId,segments,key){
  const root=$(rootId);if(!root)return;const vals=segments.map(s=>Math.max(0,+s[key]||0));const max=Math.max(...vals,0);
  if(max<=0){root.innerHTML='<div class="analytics-empty">No calorie data for this period.</div>';return}
  const W=760,H=220,L=46,R=18,T=18,B=38,plotW=W-L-R,plotH=H-T-B,n=segments.length,slot=plotW/n,barW=Math.max(8,slot*.58);
  let grid='';for(let i=0;i<4;i++){const yy=T+i*plotH/3,val=max-i*max/3;grid+=`<line x1="${L}" y1="${yy}" x2="${W-R}" y2="${yy}" stroke="#26324a" stroke-width="1"/><text x="${L-7}" y="${yy+4}" text-anchor="end" fill="#8090aa" font-size="10">${Math.round(val)}</text>`}
  const bars=segments.map((s,i)=>{const v=vals[i],h=v/max*plotH,bx=L+i*slot+(slot-barW)/2,by=T+plotH-h;return `<rect x="${bx}" y="${by}" width="${barW}" height="${h}" rx="4" fill="#7c5cff"><title>${escapeHtml(s.label)}: ${Math.round(v)} kcal</title></rect><text x="${L+i*slot+slot/2}" y="${H-12}" text-anchor="middle" fill="#94a3b8" font-size="10">${escapeHtml(s.shortLabel)}</text>`}).join('');
  root.innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Calorie trend">${grid}${bars}</svg>`;
}
function analyticsTableHtml(segments,total){
  const header=segments.map(s=>`<th>${escapeHtml(s.label)}</th>`).join('');
  const weight=segments.map(s=>`<td>${s.weight===null?'—':s.weight.toFixed(1)+' kg'}</td>`).join('');
  const consumed=segments.map(s=>`<td>${Math.round(s.consumed)}</td>`).join('');
  const burned=segments.map(s=>`<td>${Math.round(s.burned)}</td>`).join('');
  const balance=segments.map(s=>`<td>${Math.round(s.balance)}</td>`).join('');
  return `<table class="analytics-table"><thead><tr><th>Metric</th>${header}<th>Total</th></tr></thead><tbody><tr><td>Weight</td>${weight}<td>${total.weight===null?'—':total.weight.toFixed(1)+' kg avg'}</td></tr><tr><td>Calories consumed</td>${consumed}<td>${Math.round(total.consumed)}</td></tr><tr><td>Calories burned</td>${burned}<td>${Math.round(total.burned)}</td></tr><tr><td>Balance (burned − consumed)</td>${balance}<td>${Math.round(total.balance)}</td></tr></tbody></table>`;
}
function renderAnalytics(){
  const view=$('#analyticsView');if(!view)return;const p=analyticsPeriod();
  $('#analyticsPeriodTitle').textContent=p.title;
  ['daily','weekly','monthly'].forEach(mode=>{const id=mode==='daily'?'#analyticsDailyBtn':mode==='weekly'?'#analyticsWeeklyBtn':'#analyticsMonthlyBtn';$(id).className=analyticsMode===mode?'active':'ghost'});
  $('#analyticsWeightSummary').textContent=p.total.weight===null?'—':p.total.weight.toFixed(1)+' kg';
  $('#analyticsWeightDays').textContent=p.total.weightCount?`${p.total.weightCount} weight entr${p.total.weightCount===1?'y':'ies'}`:'No weight entries';
  $('#analyticsConsumedSummary').textContent=Math.round(p.total.consumed).toLocaleString();
  $('#analyticsBurnedSummary').textContent=Math.round(p.total.burned).toLocaleString();
  const bal=Math.round(p.total.balance);$('#analyticsBalanceSummary').textContent=(bal>0?'+':'')+bal.toLocaleString()+' kcal';$('#analyticsBalanceLabel').textContent=bal>0?'deficit over selected period':bal<0?'surplus over selected period':'balanced over selected period';
  $('#analyticsWeightChartTotal').textContent=p.total.weight===null?'No recorded weight':`Period avg ${p.total.weight.toFixed(1)} kg`;
  $('#analyticsConsumedChartTotal').textContent=`Period total ${Math.round(p.total.consumed).toLocaleString()} kcal`;
  $('#analyticsBurnedChartTotal').textContent=`Period total ${Math.round(p.total.burned).toLocaleString()} kcal`;
  analyticsLineChart('#analyticsWeightChart',p.segments);analyticsBarChart('#analyticsConsumedChart',p.segments,'consumed');analyticsBarChart('#analyticsBurnedChart',p.segments,'burned');
  $('#analyticsTableWrap').innerHTML=analyticsTableHtml(p.segments,p.total);
}
function shiftAnalyticsPeriod(direction){
  const d=analyticsDateFromIso(analyticsAnchor);if(analyticsMode==='daily')d.setDate(d.getDate()+7*direction);else if(analyticsMode==='weekly')d.setMonth(d.getMonth()+direction);else d.setFullYear(d.getFullYear()+direction);analyticsAnchor=analyticsIso(d);renderAnalytics();
}
function setAnalyticsMode(mode){analyticsMode=mode;renderAnalytics()}
$('#analyticsDailyBtn').onclick=()=>setAnalyticsMode('daily');
$('#analyticsWeeklyBtn').onclick=()=>setAnalyticsMode('weekly');
$('#analyticsMonthlyBtn').onclick=()=>setAnalyticsMode('monthly');
$('#analyticsPrev').onclick=()=>shiftAnalyticsPeriod(-1);
$('#analyticsNext').onclick=()=>shiftAnalyticsPeriod(1);
$('#analyticsCurrent').onclick=()=>{analyticsAnchor=new Date().toISOString().slice(0,10);renderAnalytics()};
