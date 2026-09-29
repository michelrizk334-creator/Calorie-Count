function renderSupportFoods(){const list=$('#customFoodList');if(!list)return;const q=($('#supportSearch').value||'').trim().toLowerCase();const rows=db.supportFoods.map((f,i)=>({f,i})).filter(({f})=>!q||f.name.toLowerCase().includes(q)||f.type.toLowerCase().includes(q)||String(f.description||'').toLowerCase().includes(q));list.innerHTML=rows.length?rows.map(({f,i})=>`<div class="custom-food-row"><div><b>${f.name}</b>${f.description?`<div class="meta" style="margin-top:3px">${escapeHtml(f.description)}</div>`:''}<div class="meta">${f.type} · ${f.serving} ${f.unit} · C ${f.carbs} / P ${f.protein} / F ${f.fat} · ${f.kcal} kcal${f.ratio?` · cooked ${conversionMode(f)==='multiply'?'×':'÷'} ${f.ratio}`:''}</div></div><button type="button" class="edit" onclick="editSupportFood(${i})">Edit</button><button type="button" class="delete" onclick="deleteSupportFood(${i})">✕</button></div>`).join(''):'<div class="empty">No matching foods.</div>'}
function openFoodEditor(i=null){editingFoodIndex=i;stopBarcodeCamera();resetNutritionLabelScanner();if($('#barcodeScanBox'))$('#barcodeScanBox').hidden=true;if($('#barcodeManual'))$('#barcodeManual').value='';if($('#aiFoodQuery'))$('#aiFoodQuery').value='';if($('#aiFoodResults'))$('#aiFoodResults').innerHTML='';setAiFoodStatus('');const f=i===null?null:db.supportFoods[i];$('#foodEditorTitle').textContent=f?'Edit food':'Add food';$('#customName').value=f?.name||'';$('#customDescription').value=f?.description||'';$('#customType').value=f?.type||'Carbohydrates base';$('#customServing').value=f?.serving??100;$('#customUnit').value=f?.unit||'grams';$('#customCarbs').value=f?.carbs??'';$('#customProtein').value=f?.protein??'';$('#customFat').value=f?.fat??'';$('#customKcal').value=f?.kcal??'';$('#customRatio').value=f?.ratio??'';$('#customConversion').value=f?.conversion||conversionMode(f||{});$('#foodEditorDialog').showModal()}
$('#newFoodBtn').onclick=()=>openFoodEditor();$('#restoreSupportBtn').onclick=()=>{if(confirm('Restore the complete default Excel Support List? Your custom foods will be kept.')){const names=new Set(db.supportFoods.map(f=>String(f.name||'').trim().toLowerCase()));for(const f of DEFAULT_FOODS){const key=String(f.name||'').trim().toLowerCase();if(!names.has(key)){db.supportFoods.push(structuredClone(f));names.add(key)}}db.supportListIntentionallyCleared=false;localStorage.setItem(KEY,JSON.stringify(db));renderSupportFoods();render();alert('Default Support List restored.')}};$('#clearSupportBtn').onclick=()=>{if(confirm('Are you sure you want to clear all the existing support list?')){db.supportFoods=[];db.supportListIntentionallyCleared=true;localStorage.setItem(KEY,JSON.stringify(db));renderSupportFoods();render()}};window.editSupportFood=i=>openFoodEditor(i);window.deleteSupportFood=i=>{if(confirm(`Delete ${db.supportFoods[i].name} from the Support List?`)){db.supportFoods.splice(i,1);localStorage.setItem(KEY,JSON.stringify(db));renderSupportFoods()}};

$('#foodEditorForm').onsubmit=e=>{e.preventDefault();const mode=$('#customConversion').value,ratio=+$('#customRatio').value||null;const f={name:$('#customName').value.trim(),description:$('#customDescription').value.trim(),type:$('#customType').value,serving:+$('#customServing').value||1,unit:$('#customUnit').value,carbs:+$('#customCarbs').value||0,protein:+$('#customProtein').value||0,fat:+$('#customFat').value||0,kcal:+$('#customKcal').value||0,ratio:mode==='none'?null:ratio,conversion:mode};if(mode!=='none'&&(!ratio||ratio<1)){alert('Enter a conversion ratio of 1 or greater.');return}if(!f.name)return;if(editingFoodIndex===null)db.supportFoods.push(f);else db.supportFoods[editingFoodIndex]=f;localStorage.setItem(KEY,JSON.stringify(db));$('#foodEditorDialog').close();renderSupportFoods();render()};

$('#closeFoodEditor').onclick=()=>{stopBarcodeCamera();resetNutritionLabelScanner();$('#foodEditorDialog').close();editingFoodIndex=null};
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


// =========================================================
// NUTRITION LABEL PHOTO SCANNER
// =========================================================

let nutritionLabelScanBusy=false;

function injectNutritionLabelScanner(){
  if($('#scanNutritionLabelBtn'))return;

  const barcodeBtn=$('#scanBarcodeBtn');
  if(!barcodeBtn)return;

  const wrapper=document.createElement('div');
  wrapper.id='nutritionLabelScanner';
  wrapper.innerHTML=`
    <button class="scan-label-btn" id="scanNutritionLabelBtn" type="button">
      📷 Scan nutrition label
    </button>

    <div class="scan-box" id="nutritionLabelScanBox" hidden>
      <p class="note">
        Take a clear photo of the nutrition table. The app will copy the serving amount, serving unit, calories, carbohydrates, protein and fat into the form below.
      </p>

      <div class="scan-actions">
        <button id="takeNutritionLabelPhoto" type="button">📷 Take photo</button>
        <button class="ghost" id="chooseNutritionLabelPhoto" type="button">Choose photo</button>
      </div>

      <input id="nutritionLabelCameraInput" type="file" accept="image/*" capture="environment" hidden/>
      <input id="nutritionLabelFileInput" type="file" accept="image/*" hidden/>

      <img id="nutritionLabelPreview" alt="Nutrition label preview" hidden style="width:100%;max-height:300px;object-fit:contain;border-radius:12px;background:#050914;margin-top:10px"/>

      <p class="scan-status" id="nutritionLabelStatus">
        Nothing is saved automatically. Review the extracted values before pressing Save food.
      </p>
    </div>
  `;

  barcodeBtn.parentNode.insertBefore(wrapper,barcodeBtn);

  $('#scanNutritionLabelBtn').onclick=()=>{
    const box=$('#nutritionLabelScanBox');
    box.hidden=!box.hidden;
  };

  $('#takeNutritionLabelPhoto').onclick=()=>{
    if(!nutritionLabelScanBusy)$('#nutritionLabelCameraInput').click();
  };

  $('#chooseNutritionLabelPhoto').onclick=()=>{
    if(!nutritionLabelScanBusy)$('#nutritionLabelFileInput').click();
  };

  $('#nutritionLabelCameraInput').onchange=e=>{
    const file=e.target.files?.[0];
    if(file)scanNutritionLabelFile(file);
    e.target.value='';
  };

  $('#nutritionLabelFileInput').onchange=e=>{
    const file=e.target.files?.[0];
    if(file)scanNutritionLabelFile(file);
    e.target.value='';
  };
}

function resetNutritionLabelScanner(){
  const box=$('#nutritionLabelScanBox');
  const preview=$('#nutritionLabelPreview');
  const status=$('#nutritionLabelStatus');

  nutritionLabelScanBusy=false;

  if(box)box.hidden=true;
  if(preview){
    preview.hidden=true;
    preview.removeAttribute('src');
  }
  if(status){
    status.textContent='Nothing is saved automatically. Review the extracted values before pressing Save food.';
    status.className='scan-status';
  }
}

function setNutritionLabelStatus(message,type=''){
  const el=$('#nutritionLabelStatus');
  if(!el)return;
  el.textContent=message||'';
  el.className='scan-status'+(type?' '+type:'');
}

async function nutritionLabelImageDataUrl(file){
  if(!file?.type?.startsWith('image/')){
    throw new Error('Choose a photo of the nutrition label.');
  }

  if(file.size>20*1024*1024){
    throw new Error('This image is too large. Choose a photo smaller than 20 MB.');
  }

  const objectUrl=URL.createObjectURL(file);

  try{
    const img=await new Promise((resolve,reject)=>{
      const image=new Image();
      image.onload=()=>resolve(image);
      image.onerror=()=>reject(new Error('Could not read this image.'));
      image.src=objectUrl;
    });

    const maxSide=2800;
    const scale=Math.min(1,maxSide/Math.max(img.naturalWidth||img.width,img.naturalHeight||img.height));
    const width=Math.max(1,Math.round((img.naturalWidth||img.width)*scale));
    const height=Math.max(1,Math.round((img.naturalHeight||img.height)*scale));

    const canvas=document.createElement('canvas');
    canvas.width=width;
    canvas.height=height;

    const ctx=canvas.getContext('2d',{alpha:false});
    if(!ctx)throw new Error('Could not prepare the image.');

    ctx.fillStyle='#fff';
    ctx.fillRect(0,0,width,height);
    ctx.drawImage(img,0,0,width,height);

    return canvas.toDataURL('image/jpeg',0.95);
  }finally{
    URL.revokeObjectURL(objectUrl);
  }
}

function fillNutritionLabelForm(label){
  if(!label||typeof label!=='object')return [];

  const missing=[];

  if(label.product_name){
    $('#customName').value=label.product_name;
  }else if(!$('#customName').value.trim()){
    missing.push('product name');
  }

  if(label.portion_description){
    $('#customDescription').value=label.portion_description;
  }

  const serving=Number(label.serving_amount);
  if(Number.isFinite(serving)&&serving>0){
    $('#customServing').value=serving;
  }else{
    $('#customServing').value='';
    missing.push('serving amount');
  }

  const unitMap={grams:'grams',milliliters:'ml',units:'Unit'};
  const appUnit=unitMap[label.serving_unit];
  if(appUnit){
    $('#customUnit').value=appUnit;
  }else{
    missing.push('serving unit');
  }

  const fields=[
    ['carbs_g','#customCarbs','carbohydrates'],
    ['protein_g','#customProtein','protein'],
    ['fat_g','#customFat','fat'],
    ['calories_kcal','#customKcal','calories']
  ];

  for(const [key,selector,labelName] of fields){
    const value=Number(label[key]);
    if(Number.isFinite(value)&&value>=0){
      $(selector).value=value;
    }else{
      $(selector).value='';
      missing.push(labelName);
    }
  }

  const c=Number(label.carbs_g);
  const p=Number(label.protein_g);
  const f=Number(label.fat_g);
  if(Number.isFinite(c)&&Number.isFinite(p)&&Number.isFinite(f)){
    $('#customType').value=dominantBase(c,p,f);
  }

  $('#customRatio').value='';
  $('#customConversion').value='none';

  return missing;
}

async function scanNutritionLabelFile(file){
  if(nutritionLabelScanBusy)return;

  nutritionLabelScanBusy=true;

  const takeBtn=$('#takeNutritionLabelPhoto');
  const chooseBtn=$('#chooseNutritionLabelPhoto');
  if(takeBtn)takeBtn.disabled=true;
  if(chooseBtn)chooseBtn.disabled=true;

  setNutritionLabelStatus('Reading nutrition label…');

  try{
    const image=await nutritionLabelImageDataUrl(file);

    const preview=$('#nutritionLabelPreview');
    if(preview){
      preview.src=image;
      preview.hidden=false;
    }

    const endpoint=aiEndpoint();
    const response=await fetch(endpoint+'/label-scan',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({image})
    });

    let data={};
    try{data=await response.json();}catch{}

    if(!response.ok){
      throw new Error(data.error||'Could not read this nutrition label.');
    }

    const label=data.label;
    if(!label)throw new Error('No nutrition label data was returned.');

    const missing=fillNutritionLabelForm(label);
    const warning=String(label.warnings||'').trim();

    if(missing.length){
      setNutritionLabelStatus(
        `Label read, but ${missing.join(', ')} could not be read clearly. Fill those fields manually before saving.${warning?' '+warning:''}`,
        'error'
      );
    }else{
      setNutritionLabelStatus(
        `Nutrition label read successfully. Review the filled values below before saving.${warning?' '+warning:''}`,
        'ok'
      );
    }
  }catch(error){
    console.error('Nutrition label scan error:',error);
    setNutritionLabelStatus(error.message||'Could not read this nutrition label.','error');
  }finally{
    nutritionLabelScanBusy=false;
    if(takeBtn)takeBtn.disabled=false;
    if(chooseBtn)chooseBtn.disabled=false;
  }
}

injectNutritionLabelScanner();
