function renderSupportFoods(){const list=$('#customFoodList');if(!list)return;const q=($('#supportSearch').value||'').trim().toLowerCase();const rows=db.supportFoods.map((f,i)=>({f,i})).filter(({f})=>!q||f.name.toLowerCase().includes(q)||f.type.toLowerCase().includes(q)||String(f.description||'').toLowerCase().includes(q));list.innerHTML=rows.length?rows.map(({f,i})=>`<div class="custom-food-row"><div><b>${f.name}</b>${f.description?`<div class="meta" style="margin-top:3px">${escapeHtml(f.description)}</div>`:''}<div class="meta">${f.type} · ${f.serving} ${f.unit} · C ${f.carbs} / P ${f.protein} / F ${f.fat} · ${f.kcal} kcal${f.ratio?` · cooked ${conversionMode(f)==='multiply'?'×':'÷'} ${f.ratio}`:''}</div></div><button type="button" class="edit" onclick="editSupportFood(${i})">Edit</button><button type="button" class="delete" onclick="deleteSupportFood(${i})">✕</button></div>`).join(''):'<div class="empty">No matching foods.</div>'}
function openFoodEditor(i=null){editingFoodIndex=i;stopBarcodeCamera();if($('#barcodeScanBox'))$('#barcodeScanBox').hidden=true;if($('#barcodeManual'))$('#barcodeManual').value='';if($('#aiFoodQuery'))$('#aiFoodQuery').value='';if($('#aiFoodResults'))$('#aiFoodResults').innerHTML='';setAiFoodStatus('');const f=i===null?null:db.supportFoods[i];$('#foodEditorTitle').textContent=f?'Edit food':'Add food';$('#customName').value=f?.name||'';$('#customDescription').value=f?.description||'';$('#customType').value=f?.type||'Carbohydrates base';$('#customServing').value=f?.serving??100;$('#customUnit').value=f?.unit||'grams';$('#customCarbs').value=f?.carbs??'';$('#customProtein').value=f?.protein??'';$('#customFat').value=f?.fat??'';$('#customKcal').value=f?.kcal??'';$('#customRatio').value=f?.ratio??'';$('#customConversion').value=f?.conversion||conversionMode(f||{});$('#foodEditorDialog').showModal()}
$('#newFoodBtn').onclick=()=>openFoodEditor();$('#restoreSupportBtn').onclick=()=>{if(confirm('Restore the complete default Excel Support List? Your custom foods will be kept.')){const names=new Set(db.supportFoods.map(f=>String(f.name||'').trim().toLowerCase()));for(const f of DEFAULT_FOODS){const key=String(f.name||'').trim().toLowerCase();if(!names.has(key)){db.supportFoods.push(structuredClone(f));names.add(key)}}db.supportListIntentionallyCleared=false;localStorage.setItem(KEY,JSON.stringify(db));renderSupportFoods();render();alert('Default Support List restored.')}};$('#clearSupportBtn').onclick=()=>{if(confirm('Are you sure you want to clear all the existing support list?')){db.supportFoods=[];db.supportListIntentionallyCleared=true;localStorage.setItem(KEY,JSON.stringify(db));renderSupportFoods();render()}};window.editSupportFood=i=>openFoodEditor(i);window.deleteSupportFood=i=>{if(confirm(`Delete ${db.supportFoods[i].name} from the Support List?`)){db.supportFoods.splice(i,1);localStorage.setItem(KEY,JSON.stringify(db));renderSupportFoods()}};

$('#foodEditorForm').onsubmit=e=>{e.preventDefault();const mode=$('#customConversion').value,ratio=+$('#customRatio').value||null;const f={name:$('#customName').value.trim(),description:$('#customDescription').value.trim(),type:$('#customType').value,serving:+$('#customServing').value||1,unit:$('#customUnit').value,carbs:+$('#customCarbs').value||0,protein:+$('#customProtein').value||0,fat:+$('#customFat').value||0,kcal:+$('#customKcal').value||0,ratio:mode==='none'?null:ratio,conversion:mode};if(mode!=='none'&&(!ratio||ratio<1)){alert('Enter a conversion ratio of 1 or greater.');return}if(!f.name)return;if(editingFoodIndex===null)db.supportFoods.push(f);else db.supportFoods[editingFoodIndex]=f;localStorage.setItem(KEY,JSON.stringify(db));$('#foodEditorDialog').close();renderSupportFoods();render()};

$('#closeFoodEditor').onclick=()=>{stopBarcodeCamera();$('#foodEditorDialog').close();editingFoodIndex=null};
// =========================================================
// AI FOOD / READY-MEAL LOOKUP
// =========================================================

let aiFoodSearchResults=[];

function escapeHtml(value){
  return String(value??'').replace(/[&<>"']/g,ch=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[ch]);
}

function setAiFoodStatus(message,type=''){
  const el=$('#aiFoodStatus');
  if(!el)return;
  el.textContent=message||'';
  el.className='scan-status'+(type?' '+type:'');
}

function renderAiFoodResults(){
  const root=$('#aiFoodResults');
  if(!root)return;
  root.innerHTML=aiFoodSearchResults.map((item,i)=>`
    <div class="ai-food-result">
      <div class="ai-food-result-head">
        <div>
          <b>${escapeHtml(item.name||'Food')}</b>
          <div class="meta">${escapeHtml(item.basis_label||'')} · ${Math.round(Number(item.calories_kcal)||0)} kcal · C ${(Number(item.carbs_g)||0).toFixed(1)} g · P ${(Number(item.protein_g)||0).toFixed(1)} g · F ${(Number(item.fat_g)||0).toFixed(1)} g</div>
        </div>
        <button type="button" onclick="addAiFoodResult(${i})">Add item</button>
      </div>
      ${item.description?`<div class="assumption"><b>Portion:</b> ${escapeHtml(item.description)}</div>`:''}
      ${item.assumptions?`<div class="assumption"><b>Estimate:</b> ${escapeHtml(item.assumptions)}</div>`:''}
    </div>
  `).join('');
}

window.addAiFoodResult=i=>{
  const item=aiFoodSearchResults[i];
  if(!item)return;
  $('#customName').value=item.name||'';
  $('#customDescription').value=item.description||$('#aiFoodQuery').value.trim();
  $('#customServing').value=Number(item.reference_amount)||1;
  $('#customUnit').value=item.unit==='milliliters'?'ml':item.unit==='units'?'Unit':'grams';
  $('#customCarbs').value=Number(item.carbs_g)||0;
  $('#customProtein').value=Number(item.protein_g)||0;
  $('#customFat').value=Number(item.fat_g)||0;
  $('#customKcal').value=Number(item.calories_kcal)||0;
  $('#customType').value=dominantBase(Number(item.carbs_g)||0,Number(item.protein_g)||0,Number(item.fat_g)||0);
  $('#customRatio').value='';
  $('#customConversion').value='none';
  setAiFoodStatus('Added to the form below. Review the values, then press Save food.','ok');
};

async function searchAiFood(){
  const query=$('#aiFoodQuery').value.trim();
  if(!query){setAiFoodStatus('Describe a food or meal first.','error');return;}
  const btn=$('#aiFoodSearchBtn');
  btn.disabled=true;
  aiFoodSearchResults=[];
  $('#aiFoodResults').innerHTML='';
  setAiFoodStatus('Looking up nutrition…');
  try{
    const endpoint=aiEndpoint();
    const response=await fetch(endpoint+'/food-search',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({query})
    });
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||'Food lookup failed.');
    aiFoodSearchResults=Array.isArray(data.results)?data.results:[];
    if(!aiFoodSearchResults.length)throw new Error('No nutrition result was returned.');
    renderAiFoodResults();
    setAiFoodStatus('Choose Add item to fill the existing food form. Nutrition is an estimate; review it before saving.','ok');
  }catch(error){
    console.error('AI food lookup error:',error);
    setAiFoodStatus(error.message||'Could not look up this food.','error');
  }finally{btn.disabled=false;}
}

$('#aiFoodSearchBtn').onclick=searchAiFood;
$('#aiFoodQuery').addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();searchAiFood();}
});
