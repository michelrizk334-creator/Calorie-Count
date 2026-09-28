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
  setWorkoutMode(w.mode||'erg',false);
}
function setWorkoutMode(mode,doSave=true){let w=day().workout;w.mode=mode;$('#ergWorkoutFields').hidden=mode!=='erg';$('#otherWorkoutFields').hidden=mode!=='other';$('#ergTrainingBtn').className=mode==='erg'?'':'ghost';$('#otherWorkoutBtn').className=mode==='other'?'':'ghost';if(doSave)save()}
$('#ergTrainingBtn').onclick=()=>setWorkoutMode('erg');$('#otherWorkoutBtn').onclick=()=>setWorkoutMode('other');
['session','workoutType','calHour','hours','minutes','seconds'].forEach(id=>$('#'+id).oninput=e=>{let map={session:'session',workoutType:'type',calHour:'calHour',hours:'h',minutes:'m',seconds:'s'};day().workout[map[id]]=e.target.value;save()});
$('#otherWorkoutCalories').oninput=e=>{day().workout.otherCalories=e.target.value;save()};
$('#weight').onchange=e=>{day().weight=+e.target.value;save()};$('#bmr').onchange=e=>{db.settings.bmr=+e.target.value;save()};$('#phase').onchange=e=>{day().phase=e.target.value;save()};
