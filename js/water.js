const WATER_CUP_LITERS=0.24;

function waterEntriesForDay(d=day()){
  if(!Array.isArray(d.waterEntries))d.waterEntries=[];
  return d.waterEntries;
}

function waterEntryLiters(entry){
  const amount=Math.max(0,Number(entry?.amount)||0);
  return entry?.unit==='cups'?amount*WATER_CUP_LITERS:amount;
}

function waterTotalLiters(d=day()){
  return waterEntriesForDay(d).reduce((sum,entry)=>sum+waterEntryLiters(entry),0);
}

function formatWaterAmount(n){
  const value=Number(n)||0;
  return Number.isInteger(value)?String(value):value.toFixed(2).replace(/0+$/,'').replace(/\.$/,'');
}

function renderWater(d=day()){
  const total=waterTotalLiters(d);
  const totalEl=$('#waterTotalLiters');
  const list=$('#waterEntries');
  const clear=$('#clearWaterBtn');
  if(!totalEl||!list||!clear)return;

  totalEl.textContent=total.toFixed(2)+' L';
  const entries=waterEntriesForDay(d);
  clear.hidden=!entries.length;

  if(!entries.length){
    list.innerHTML='<div class="water-empty">No water logged yet today.</div>';
    return;
  }

  list.innerHTML=entries.map((entry,index)=>{
    const amount=formatWaterAmount(entry.amount);
    const liters=waterEntryLiters(entry);
    const main=entry.unit==='cups'?(amount+' cup'+(Number(entry.amount)===1?'':'s')):(amount+' L');
    const detail=entry.unit==='cups'?('≈ '+liters.toFixed(2)+' L'):'';
    return `<div class="water-entry"><span><b>${main}</b>${detail?` <small>${detail}</small>`:''}</span><button type="button" onclick="removeWaterEntry(${index})" aria-label="Remove water entry" title="Remove">✕</button></div>`;
  }).join('');
}

window.removeWaterEntry=index=>{
  const entries=waterEntriesForDay();
  if(index<0||index>=entries.length)return;
  entries.splice(index,1);
  save();
};

(function bindWaterUi(){
  const form=$('#waterForm');
  const amount=$('#waterAmount');
  const unit=$('#waterUnit');
  const clear=$('#clearWaterBtn');
  if(!form||!amount||!unit||!clear)return;

  form.addEventListener('submit',event=>{
    event.preventDefault();
    const value=Number(amount.value);
    if(!Number.isFinite(value)||value<=0){
      amount.focus();
      return;
    }
    waterEntriesForDay().push({amount:value,unit:unit.value==='cups'?'cups':'liters'});
    amount.value='';
    save();
    amount.focus();
  });

  clear.addEventListener('click',()=>{
    const entries=waterEntriesForDay();
    if(!entries.length)return;
    if(confirm('Clear all water entries for this day?')){
      day().waterEntries=[];
      save();
    }
  });
})();
