function renderSeasons(){
  const root=$('#seasonsList'); if(!root)return;
  const entries=Object.entries(db.savedDays||{}).sort((a,b)=>b[0].localeCompare(a[0]));
  if(!entries.length){root.innerHTML='<div class="empty season-empty">No saved sheets yet. Enter a Training Phase in Meals and press Save.</div>';return}
  const groups={};
  for(const [d,snap] of entries){const phase=(snap.phase||'Uncategorized').trim()||'Uncategorized';(groups[phase] ||= []).push([d,snap])}
  const escapeSeasonName=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  root.innerHTML=Object.entries(groups).map(([phase,days])=>`<details class="season-group"><summary class="season-banner"><div><b>${escapeSeasonName(phase)}</b><small>${days.length} saved sheet${days.length===1?'':'s'}</small></div><span class="season-chevron" aria-hidden="true">⌄</span></summary><div class="season-days">${days.map(([d,snap])=>{let kcal=(snap.meals||[]).flat().reduce((a,x)=>a+calcItem(x).kcal,0);return `<button type="button" class="season-day" onclick="openSavedDay('${d}')"><span><b>${d}</b><small>${snap.weight||'—'} kg · ${Math.round(kcal)} kcal eaten</small></span><span>Open ›</span></button>`}).join('')}</div></details>`).join('')
}
window.openSavedDay=d=>{date=d;setTab('tracker');render()};
function existingPhases(){
  const phases=new Set();
  Object.values(db.savedDays||{}).forEach(s=>{const p=(s.phase||'').trim();if(p)phases.add(p)});
  Object.values(db.days||{}).forEach(s=>{const p=(s.phase||'').trim();if(p)phases.add(p)});
  return [...phases].sort((a,b)=>a.localeCompare(b,undefined,{sensitivity:'base'}));
}
function updateSeasonSaveMode(){const isNew=$('#seasonSaveMode').value==='new';$('#existingSeasonLabel').hidden=isNew;$('#newSeasonLabel').hidden=!isNew;if(isNew)setTimeout(()=>$('#newSeasonName').focus(),0)}
$('#saveDayBtn').onclick=()=>{
  const phases=existingPhases(), current=(day().phase||'').trim();
  $('#existingSeason').innerHTML=phases.map(p=>`<option value="${p.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;')}">${p.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</option>`).join('');
  if(current&&phases.includes(current))$('#existingSeason').value=current;
  $('#newSeasonName').value=current&&!phases.includes(current)?current:'';
  $('#seasonSaveMode').value=phases.length?'existing':'new';
  updateSeasonSaveMode();$('#saveSeasonDialog').showModal();
};
$('#seasonSaveMode').onchange=updateSeasonSaveMode;
$('#closeSaveSeason').onclick=()=>$('#saveSeasonDialog').close();
$('#saveSeasonForm').onsubmit=e=>{e.preventDefault();const isNew=$('#seasonSaveMode').value==='new';const phase=(isNew?$('#newSeasonName').value:$('#existingSeason').value).trim();if(!phase){alert(isNew?'Enter a name for the new Training Phase.':'There is no existing phase to select. Create a new one instead.');return}day().phase=phase;$('#phase').value=phase;db.savedDays[date]=structuredClone(day());localStorage.setItem(KEY,JSON.stringify(db));$('#saveSeasonDialog').close();renderSeasons();render();const b=$('#saveDayBtn'),old=b.textContent;b.textContent='Saved ✓';setTimeout(()=>b.textContent=old,1200)};
