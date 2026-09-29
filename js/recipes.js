// =========================================================
// v30.5 — RECIPE GENERATOR + FULL SAVED MEAL LIBRARY
// =========================================================

let generatedRecipe=null;
let recipePendingAdd=null;
let recipeGenerating=false;
let mealActionsIndex=null;
let savedMealImportTarget=null;
let savedMealEditorIndex=null;
let savedMealEditorDraft=null;

function recipeNumber(id){
  const raw=$(id)?.value?.trim();
  if(!raw)return null;
  const n=Number(raw);
  return Number.isFinite(n)&&n>0?n:null;
}

function recipeTargets(){
  return {
    protein_g:recipeNumber('#recipeProtein'),
    carbs_g:recipeNumber('#recipeCarbs'),
    fat_g:recipeNumber('#recipeFat'),
    calories_kcal:recipeNumber('#recipeCalories')
  };
}

function hasRecipeTarget(t){
  return Object.values(t).some(v=>v!==null)
}

function setRecipeStatus(message,type=''){
  const el=$('#recipeStatus');
  if(!el)return;
  el.textContent=message||'';
  el.className='scan-status'+(type?' '+type:'');
}

function compactSupportFoods(){
  return (db.supportFoods||[]).slice(0,250).map(f=>({
    name:String(f.name||'').slice(0,120),
    description:String(f.description||'').slice(0,180),
    type:f.type||'',
    serving:Number(f.serving)||1,
    unit:f.unit||'grams',
    carbs:Number(f.carbs)||0,
    protein:Number(f.protein)||0,
    fat:Number(f.fat)||0,
    kcal:Number(f.kcal)||0,
    ratio:Number(f.ratio)||null,
    conversion:f.conversion||'none'
  }));
}

function recipeTotals(recipe){
  const t={kcal:0,c:0,p:0,fat:0};
  (recipe?.ingredients||[]).forEach(x=>{
    const q=calcItem(x);
    t.kcal+=q.kcal;
    t.c+=q.c;
    t.p+=q.p;
    t.fat+=q.fat;
  });
  return t;
}

function mealTotalsFromItems(items){
  return recipeTotals({ingredients:Array.isArray(items)?items:[]});
}

function requestedRecipeText(targets){
  const parts=[];
  if(targets?.protein_g)parts.push(`P ${Number(targets.protein_g).toFixed(1)} g`);
  if(targets?.carbs_g)parts.push(`C ${Number(targets.carbs_g).toFixed(1)} g`);
  if(targets?.fat_g)parts.push(`F ${Number(targets.fat_g).toFixed(1)} g`);
  if(targets?.calories_kcal)parts.push(`${Math.round(Number(targets.calories_kcal))} kcal`);
  return parts.join(' · ');
}

function recipeIngredientText(x){
  const qty=Number(x.qty)||0;
  const unit=x.food?.unit||'';
  const desc=x.food?.description?` — ${escapeHtml(x.food.description)}`:'';
  return `<div class="recipe-ingredient">
    <span><b>${escapeHtml(x.food?.name||'Ingredient')}</b>${desc}</span>
    <span>${qty} ${escapeHtml(unit)} · ${escapeHtml(x.state||'Raw')}</span>
  </div>`;
}

function recipeInstructionsHtml(recipe){
  const steps=Array.isArray(recipe?.instructions)?recipe.instructions:[];
  return steps.length
    ?`<div><b>Preparation</b><ol class="recipe-instructions">${steps.map(step=>`<li>${escapeHtml(step)}</li>`).join('')}</ol></div>`
    :'';
}

function makeSavedMealId(){
  return globalThis.crypto?.randomUUID
    ?globalThis.crypto.randomUUID()
    :String(Date.now())+'-'+Math.random().toString(16).slice(2);
}

function mealSnapshotSignature(items){
  return JSON.stringify((Array.isArray(items)?items:[]).map(x=>({
    qty:Number(x?.qty)||0,
    state:x?.state||'Raw',
    food:{
      name:x?.food?.name||'',
      description:x?.food?.description||'',
      type:x?.food?.type||'',
      serving:Number(x?.food?.serving)||0,
      unit:x?.food?.unit||'',
      carbs:Number(x?.food?.carbs)||0,
      protein:Number(x?.food?.protein)||0,
      fat:Number(x?.food?.fat)||0,
      kcal:Number(x?.food?.kcal)||0,
      ratio:Number(x?.food?.ratio)||null,
      conversion:x?.food?.conversion||'none'
    }
  })));
}

window.isDailyMealSaved=meal=>{
  if(!Array.isArray(meal)||!meal.length)return false;
  const sig=mealSnapshotSignature(meal);
  return (db.savedRecipes||[]).some(r=>r?.sourceMealSignature===sig);
};

window.saveCurrentMealAsTemplate=mealIndex=>{
  const meal=day().meals?.[mealIndex];

  if(!Array.isArray(meal)||!meal.length){
    alert(`Meal ${mealIndex+1} is empty. Add food before saving it.`);
    return;
  }

  const signature=mealSnapshotSignature(meal);

  if((db.savedRecipes||[]).some(r=>r?.sourceMealSignature===signature)){
    alert('This exact meal is already saved.');
    return;
  }

  const saved={
    id:makeSavedMealId(),
    name:`Meal ${mealIndex+1}`,
    ingredients:structuredClone(meal),
    instructions:[],
    assumptions:`Saved from Meals on ${date}.`,
    source:'daily-meal',
    sourceDate:date,
    sourceMealIndex:mealIndex,
    sourceMealSignature:signature,
    savedAt:new Date().toISOString()
  };

  db.savedRecipes ||= [];
  db.savedRecipes.unshift(saved);
  localStorage.setItem(KEY,JSON.stringify(db));

  renderSavedRecipes();
  render();

  setRecipeStatus(`Meal ${mealIndex+1} saved under Saved meals.`,'ok');
};

function renderGeneratedRecipe(){
  const root=$('#recipeResult');
  if(!root)return;

  if(!generatedRecipe){
    root.innerHTML='';
    return;
  }

  const t=recipeTotals(generatedRecipe);
  const requested=requestedRecipeText(generatedRecipe.targets||recipeTargets());

  root.innerHTML=`<div class="recipe-result-card">
    <div class="recipe-result-head">
      <div>
        <h3>${escapeHtml(generatedRecipe.name||'Generated meal')}</h3>
        <div class="recipe-requested">${requested?`Requested: ${escapeHtml(requested)}`:'Generated meal'}</div>
      </div>
      <div class="recipe-macros">
        <b>Estimated</b><br>
        P ${t.p.toFixed(1)} g · C ${t.c.toFixed(1)} g · F ${t.fat.toFixed(1)} g · ${Math.round(t.kcal)} kcal
      </div>
    </div>
    <div class="recipe-ingredients"><b>Ingredients</b>${(generatedRecipe.ingredients||[]).map(recipeIngredientText).join('')}</div>
    ${recipeInstructionsHtml(generatedRecipe)}
    ${generatedRecipe.assumptions?`<div class="note"><b>Estimate:</b> ${escapeHtml(generatedRecipe.assumptions)}</div>`:''}
    <div class="recipe-warning"><b>Note:</b> Actual calories and macros may differ from goal calories and macros because ingredient nutrition and practical serving sizes are estimates.</div>
    <div class="recipe-result-actions">
      <button type="button" id="regenerateRecipeBtn" class="ghost">Generate again</button>
      <button type="button" id="addGeneratedRecipeBtn">Add this meal</button>
      <button type="button" id="saveGeneratedRecipeBtn" class="ghost">Save meal</button>
    </div>
  </div>`;

  $('#regenerateRecipeBtn').onclick=generateRecipe;
  $('#addGeneratedRecipeBtn').onclick=()=>openRecipeAddDialog(generatedRecipe);
  $('#saveGeneratedRecipeBtn').onclick=saveGeneratedRecipe;
}

function renderSavedRecipes(){
  const root=$('#savedRecipesList');
  if(!root)return;

  const list=Array.isArray(db.savedRecipes)?db.savedRecipes:[];

  if(!list.length){
    root.innerHTML='<div class="recipe-empty">No saved meals yet.</div>';
    return;
  }

  root.innerHTML=list.map((recipe,i)=>{
    const t=recipeTotals(recipe);

    return `<details class="saved-recipe-card">
      <summary>
        <div>
          <b>${escapeHtml(recipe.name||'Saved meal')}</b>
          <div class="recipe-requested">
            P ${t.p.toFixed(1)} g · C ${t.c.toFixed(1)} g · F ${t.fat.toFixed(1)} g · ${Math.round(t.kcal)} kcal
          </div>
        </div>
        <span>⌄</span>
      </summary>

      <div class="saved-recipe-body">
        <div class="recipe-ingredients">${(recipe.ingredients||[]).map(recipeIngredientText).join('')}</div>
        ${recipeInstructionsHtml(recipe)}
        ${recipe.assumptions?`<div class="note"><b>Note:</b> ${escapeHtml(recipe.assumptions)}</div>`:''}

        <div class="saved-recipe-actions">
          <button type="button" onclick="addSavedRecipe(${i})">Add to today</button>
          <button type="button" class="ghost" onclick="editSavedRecipe(${i})">Edit</button>
          <button type="button" class="danger" onclick="deleteSavedRecipe(${i})">Delete</button>
        </div>
      </div>
    </details>`;
  }).join('');
}

function renderRecipeView(){
  ensureSavedMealUi();
  renderGeneratedRecipe();
  renderSavedRecipes();
}

async function generateRecipe(){
  if(recipeGenerating)return;

  recipeGenerating=true;
  const targets=recipeTargets();

  if(!hasRecipeTarget(targets)){
    recipeGenerating=false;
    setRecipeStatus('Enter at least one target: protein, carbohydrates, fats, or calories.','error');
    return;
  }

  const sourceMode=$('#recipeSourceMode').value;
  const supportFoods=sourceMode==='support'?compactSupportFoods():[];

  if(sourceMode==='support'&&!supportFoods.length){
    recipeGenerating=false;
    setRecipeStatus('Your Support List is empty. Add foods first or choose Use any foods.','error');
    return;
  }

  const btn=$('#generateRecipeBtn');
  const regen=$('#regenerateRecipeBtn');

  btn.disabled=true;
  if(regen)regen.disabled=true;

  generatedRecipe=null;
  renderGeneratedRecipe();
  setRecipeStatus('Generating a meal idea…');

  try{
    const response=await fetch(aiEndpoint()+'/recipe-generate',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({mode:sourceMode,targets,supportFoods})
    });

    const data=await response.json();

    if(!response.ok)throw new Error(data.error||'Recipe generation failed.');
    if(!data.recipe||!Array.isArray(data.recipe.ingredients)||!data.recipe.ingredients.length){
      throw new Error('No usable recipe was returned.');
    }

    generatedRecipe=data.recipe;
    generatedRecipe.targets=targets;
    renderGeneratedRecipe();
    setRecipeStatus('Meal generated. Review it, add it directly to a meal, save it for later, or generate again.','ok');
  }catch(error){
    console.error('Recipe generation error:',error);
    setRecipeStatus(error.message||'Could not generate a recipe.','error')
  }finally{
    btn.disabled=false;
    recipeGenerating=false
  }
}

function saveGeneratedRecipe(){
  if(!generatedRecipe)return;

  const saved=structuredClone(generatedRecipe);
  saved.id=makeSavedMealId();
  saved.savedAt=new Date().toISOString();
  saved.source='generated-recipe';
  saved.sourceMealSignature=mealSnapshotSignature(saved.ingredients);

  db.savedRecipes ||= [];
  db.savedRecipes.unshift(saved);

  localStorage.setItem(KEY,JSON.stringify(db));
  renderSavedRecipes();
  render();
  setRecipeStatus('Meal saved under Saved meals.','ok');
}

function todayMealChoiceHtml(selectedIndex=0){
  const meals=day().meals||[];

  return meals.map((meal,i)=>{
    const t=mealTotalsFromItems(meal);
    const foodCount=meal.length;
    const status=foodCount
      ?`${foodCount} food${foodCount===1?'':'s'} · ${Math.round(t.kcal)} kcal · C ${t.c.toFixed(1)} · P ${t.p.toFixed(1)} · F ${t.fat.toFixed(1)}`
      :'Empty';

    return `<label class="saved-meal-destination ${foodCount?'has-food':'empty'}">
      <input type="radio" name="recipeMealTargetRadio" value="${i}" ${i===selectedIndex?'checked':''}>
      <span>
        <b>Meal ${i+1}</b>
        <small>${escapeHtml(status)}</small>
      </span>
    </label>`;
  }).join('');
}

function openRecipeAddDialog(recipe){
  if(!recipe||!Array.isArray(recipe.ingredients)||!recipe.ingredients.length)return;

  ensureSavedMealUi();

  recipePendingAdd=recipe;
  $('#recipeAddName').textContent=recipe.name||'Saved meal';

  const meals=day().meals||[];
  const firstEmpty=meals.findIndex(m=>!m.length);
  const selected=firstEmpty>=0?firstEmpty:0;

  $('#recipeMealChoices').innerHTML=todayMealChoiceHtml(selected);
  $('#recipeAddDialog').showModal();
}

window.addSavedRecipe=i=>{
  const r=db.savedRecipes?.[i];
  if(r)openRecipeAddDialog(r)
};

window.deleteSavedRecipe=i=>{
  const r=db.savedRecipes?.[i];
  if(!r)return;

  if(confirm(`Delete ${r.name||'this saved meal'}?`)){
    db.savedRecipes.splice(i,1);
    localStorage.setItem(KEY,JSON.stringify(db));
    renderSavedRecipes();
    render()
  }
};

/* =========================================================
   MEALS → EDIT
   ========================================================= */

window.openMealActions=mealIndex=>{
  ensureSavedMealUi();

  mealActionsIndex=mealIndex;
  const meal=day().meals?.[mealIndex]||[];
  const t=mealTotalsFromItems(meal);

  $('#mealActionsTitle').textContent=`Meal ${mealIndex+1}`;
  $('#mealActionsSummary').textContent=meal.length
    ?`${meal.length} food${meal.length===1?'':'s'} · ${Math.round(t.kcal)} kcal · C ${t.c.toFixed(1)} g · P ${t.p.toFixed(1)} g · F ${t.fat.toFixed(1)} g`
    :'This meal is empty.';

  $('#mealActionsDialog').showModal();
};

function openSavedMealImportPicker(mealIndex){
  ensureSavedMealUi();

  savedMealImportTarget=mealIndex;
  $('#savedMealPickerTitle').textContent=`Import into Meal ${mealIndex+1}`;

  const list=db.savedRecipes||[];

  $('#savedMealPickerList').innerHTML=list.length
    ?list.map((recipe,i)=>{
      const t=recipeTotals(recipe);
      return `<button type="button" class="saved-meal-picker-card" onclick="importSavedRecipeIntoMeal(${i},${mealIndex})">
        <span>
          <b>${escapeHtml(recipe.name||'Saved meal')}</b>
          <small>${(recipe.ingredients||[]).length} food${(recipe.ingredients||[]).length===1?'':'s'} · ${Math.round(t.kcal)} kcal · C ${t.c.toFixed(1)} · P ${t.p.toFixed(1)} · F ${t.fat.toFixed(1)}</small>
        </span>
        <span>Import</span>
      </button>`;
    }).join('')
    :'<div class="recipe-empty">No saved meals yet. Save a meal first from Meals or Recipes.</div>';

  $('#savedMealPickerDialog').showModal();
}

window.importSavedRecipeIntoMeal=(recipeIndex,mealIndex)=>{
  const recipe=db.savedRecipes?.[recipeIndex];
  const target=day().meals?.[mealIndex];

  if(!recipe||!Array.isArray(recipe.ingredients)||!Array.isArray(target))return;

  target.push(...recipe.ingredients.map(x=>structuredClone(x)));

  $('#savedMealPickerDialog')?.close();
  savedMealImportTarget=null;

  save();
};

/* =========================================================
   EDIT SAVED MEAL
   ========================================================= */

window.editSavedRecipe=i=>{
  const recipe=db.savedRecipes?.[i];
  if(!recipe)return;

  ensureSavedMealUi();

  savedMealEditorIndex=i;
  savedMealEditorDraft=structuredClone(recipe);
  savedMealEditorDraft.ingredients ||= [];

  renderSavedMealEditor();
  $('#savedMealEditorDialog').showModal();
};

function renderSavedMealEditor(){
  if(!savedMealEditorDraft)return;

  $('#savedMealEditName').value=savedMealEditorDraft.name||'Saved meal';

  const list=$('#savedMealEditorFoods');

  list.innerHTML=savedMealEditorDraft.ingredients.length
    ?savedMealEditorDraft.ingredients.map((x,i)=>`
      <div class="saved-meal-edit-food">
        <div class="saved-meal-edit-food-name">
          <b>${escapeHtml(x.food?.name||'Food')}</b>
          <small>Reference: ${Number(x.food?.serving)||1} ${escapeHtml(x.food?.unit||'')}</small>
        </div>

        <label>
          Quantity
          <input
            type="number"
            min="0"
            step="0.1"
            value="${Number(x.qty)||0}"
            data-saved-meal-qty="${i}"
          >
        </label>

        <label>
          State
          <select data-saved-meal-state="${i}" ${x.food?.ratio?'':'disabled'}>
            <option value="Raw" ${x.state==='Raw'?'selected':''}>Raw</option>
            <option value="Cooked" ${x.state==='Cooked'?'selected':''}>Cooked</option>
          </select>
        </label>

        <button type="button" class="danger" data-saved-meal-remove="${i}" title="Remove food">✕</button>
      </div>
    `).join('')
    :'<div class="recipe-empty">No foods in this saved meal.</div>';

  list.querySelectorAll('[data-saved-meal-qty]').forEach(input=>{
    input.oninput=()=>{
      const i=Number(input.dataset.savedMealQty);
      savedMealEditorDraft.ingredients[i].qty=Math.max(0,Number(input.value)||0);
      updateSavedMealEditorTotals()
    }
  });

  list.querySelectorAll('[data-saved-meal-state]').forEach(select=>{
    select.onchange=()=>{
      const i=Number(select.dataset.savedMealState);
      savedMealEditorDraft.ingredients[i].state=select.value;
      updateSavedMealEditorTotals()
    }
  });

  list.querySelectorAll('[data-saved-meal-remove]').forEach(button=>{
    button.onclick=()=>{
      const i=Number(button.dataset.savedMealRemove);
      savedMealEditorDraft.ingredients.splice(i,1);
      renderSavedMealEditor()
    }
  });

  const foodSelect=$('#savedMealEditorFoodSelect');

  foodSelect.innerHTML=(db.supportFoods||[])
    .map((f,i)=>`<option value="${i}">${escapeHtml(f.name)} · ${Math.round(Number(f.kcal)||0)} kcal / ${Number(f.serving)||1} ${escapeHtml(f.unit||'')}</option>`)
    .join('');

  updateSavedMealEditorTotals();
}

function updateSavedMealEditorTotals(){
  const el=$('#savedMealEditorTotals');
  if(!el||!savedMealEditorDraft)return;

  const t=recipeTotals(savedMealEditorDraft);

  el.textContent=`${savedMealEditorDraft.ingredients.length} food${savedMealEditorDraft.ingredients.length===1?'':'s'} · ${Math.round(t.kcal)} kcal · C ${t.c.toFixed(1)} g · P ${t.p.toFixed(1)} g · F ${t.fat.toFixed(1)} g`;
}

/* =========================================================
   DYNAMIC UI
   ========================================================= */

function ensureSavedMealUi(){
  if(!$('#savedMealFeatureStyles')){
    const style=document.createElement('style');
    style.id='savedMealFeatureStyles';
    style.textContent=`
      .meal-save-template-btn{background:#1a2338;color:#d9e0ef;min-height:34px;padding:6px 10px;font-size:12px}
      .meal-save-template-btn.saved{background:#174c37;color:#baf7d7;border:1px solid #2d7e5c}
      .meal-save-template-btn:disabled{opacity:.42;cursor:not-allowed}
      .saved-recipe-actions{display:flex;gap:8px;flex-wrap:wrap}
      .saved-meal-destination{display:flex;align-items:center;gap:12px;border:1px solid #34415c;background:#0c1427;border-radius:12px;padding:11px;cursor:pointer}
      .saved-meal-destination input{width:auto;min-height:auto}
      .saved-meal-destination span{display:flex;flex-direction:column;gap:3px}
      .saved-meal-destination small{color:#9aa7bd}
      .saved-meal-destination.empty{border-color:#35634f}
      .saved-meal-destination:has(input:checked){border-color:#8d75ff;box-shadow:0 0 0 1px #8d75ff inset}
      .saved-meal-destination-list{display:grid;gap:8px}
      .meal-action-buttons{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .saved-meal-picker-list{display:grid;gap:8px;max-height:55vh;overflow:auto}
      .saved-meal-picker-card{display:flex;justify-content:space-between;align-items:center;gap:12px;text-align:left;background:#0c1427;border:1px solid #34415c}
      .saved-meal-picker-card>span:first-child{display:flex;flex-direction:column;gap:3px;min-width:0}
      .saved-meal-picker-card small{color:#9aa7bd;white-space:normal}
      .saved-meal-edit-foods{display:grid;gap:8px;max-height:42vh;overflow:auto}
      .saved-meal-edit-food{display:grid;grid-template-columns:minmax(0,1.4fr) .75fr .75fr auto;gap:8px;align-items:end;border:1px solid #26324a;background:#0c1427;border-radius:12px;padding:10px}
      .saved-meal-edit-food-name{align-self:center;min-width:0}
      .saved-meal-edit-food-name small{display:block;margin-top:3px;color:#9aa7bd}
      .saved-meal-editor-add{display:grid;grid-template-columns:1fr auto;gap:8px}
      .saved-meal-editor-summary{padding:10px;border-radius:10px;background:#0c1427;color:#b7c2d6}
      @media(max-width:650px){
        .meal-save-template-btn{font-size:11px;padding:5px 7px}
        .saved-meal-edit-food{grid-template-columns:1fr 1fr}
        .saved-meal-edit-food-name{grid-column:1/-1}
        .meal-action-buttons{grid-template-columns:1fr}
      }
    `;
    document.head.appendChild(style);
  }

  const recipeAddDialog=$('#recipeAddDialog');

  if(recipeAddDialog&&!$('#recipeMealChoices')){
    recipeAddDialog.innerHTML=`
      <form id="recipeAddForm" method="dialog">
        <div class="section-head">
          <div>
            <h2>Add to today</h2>
            <p id="recipeAddName">Saved meal</p>
          </div>
          <button aria-label="Close" class="ghost" id="closeRecipeAdd" type="button">✕</button>
        </div>

        <p class="note">
          Choose exactly where to add this saved meal. Existing foods are kept — importing never replaces a meal.
        </p>

        <div class="saved-meal-destination-list" id="recipeMealChoices"></div>

        <button type="submit">Add to selected meal</button>
      </form>
    `;
  }

  if(!$('#mealActionsDialog')){
    document.body.insertAdjacentHTML('beforeend',`
      <dialog id="mealActionsDialog">
        <form method="dialog">
          <div class="section-head">
            <div>
              <h2 id="mealActionsTitle">Meal</h2>
              <p id="mealActionsSummary"></p>
            </div>
            <button type="button" class="ghost" id="closeMealActions">✕</button>
          </div>

          <div class="meal-action-buttons">
            <button type="button" id="mealActionsAddFood">+ Add food</button>
            <button type="button" class="ghost" id="mealActionsImportSaved">Import from saved meals</button>
          </div>
        </form>
      </dialog>

      <dialog id="savedMealPickerDialog">
        <form method="dialog">
          <div class="section-head">
            <div>
              <h2 id="savedMealPickerTitle">Import saved meal</h2>
              <p>Choose a saved meal. Its foods will be appended to the current meal.</p>
            </div>
            <button type="button" class="ghost" id="closeSavedMealPicker">✕</button>
          </div>

          <div class="saved-meal-picker-list" id="savedMealPickerList"></div>
        </form>
      </dialog>

      <dialog id="savedMealEditorDialog">
        <form id="savedMealEditorForm" method="dialog">
          <div class="section-head">
            <div>
              <h2>Edit saved meal</h2>
              <p>Changes affect the saved template only, not meals already added to previous days.</p>
            </div>
            <button type="button" class="ghost" id="closeSavedMealEditor">✕</button>
          </div>

          <label>
            Meal name
            <input id="savedMealEditName" maxlength="120" required>
          </label>

          <div class="saved-meal-editor-summary" id="savedMealEditorTotals"></div>

          <div class="saved-meal-edit-foods" id="savedMealEditorFoods"></div>

          <div class="saved-meal-editor-add">
            <label>
              Add food from Support List
              <select id="savedMealEditorFoodSelect"></select>
            </label>
            <button type="button" id="savedMealEditorAddFood">+ Add</button>
          </div>

          <button type="submit">Save changes</button>
        </form>
      </dialog>
    `);
  }

  bindSavedMealUi();
}

let savedMealUiBound=false;

function bindSavedMealUi(){
  if(savedMealUiBound)return;
  savedMealUiBound=true;

  $('#closeRecipeAdd').onclick=()=>{
    $('#recipeAddDialog').close();
    recipePendingAdd=null
  };

  $('#recipeAddForm').onsubmit=e=>{
    e.preventDefault();
    if(!recipePendingAdd)return;

    const selected=document.querySelector('input[name="recipeMealTargetRadio"]:checked');
    if(!selected)return;

    const target=Number(selected.value);

    if(!Number.isInteger(target)||target<0||target>=day().meals.length)return;

    const items=(recipePendingAdd.ingredients||[]).map(x=>structuredClone(x));

    /*
     * Append only. Never replace anything already logged in the destination meal.
     */
    day().meals[target].push(...items);

    const addedName=recipePendingAdd.name||'Saved meal';

    recipePendingAdd=null;
    $('#recipeAddDialog').close();

    save();
    setRecipeStatus(`${addedName} added to Meal ${target+1}. Existing foods were kept.`,'ok');
  };

  $('#closeMealActions').onclick=()=>{
    $('#mealActionsDialog').close();
    mealActionsIndex=null
  };

  $('#mealActionsAddFood').onclick=()=>{
    const target=mealActionsIndex;
    $('#mealActionsDialog').close();
    mealActionsIndex=null;

    if(Number.isInteger(target)){
      window.addFoodToMeal(target)
    }
  };

  $('#mealActionsImportSaved').onclick=()=>{
    const target=mealActionsIndex;
    $('#mealActionsDialog').close();

    if(Number.isInteger(target)){
      openSavedMealImportPicker(target)
    }
  };

  $('#closeSavedMealPicker').onclick=()=>{
    $('#savedMealPickerDialog').close();
    savedMealImportTarget=null
  };

  $('#closeSavedMealEditor').onclick=()=>{
    $('#savedMealEditorDialog').close();
    savedMealEditorIndex=null;
    savedMealEditorDraft=null
  };

  $('#savedMealEditorAddFood').onclick=()=>{
    if(!savedMealEditorDraft)return;

    const i=Number($('#savedMealEditorFoodSelect').value);
    const food=db.supportFoods?.[i];

    if(!food)return;

    savedMealEditorDraft.ingredients.push({
      food:structuredClone(food),
      qty:Number(food.serving)||1,
      state:'Raw'
    });

    renderSavedMealEditor()
  };

  $('#savedMealEditorForm').onsubmit=e=>{
    e.preventDefault();

    if(savedMealEditorIndex===null||!savedMealEditorDraft)return;

    const name=$('#savedMealEditName').value.trim();

    if(!name){
      alert('Enter a name for the saved meal.');
      return;
    }

    if(!savedMealEditorDraft.ingredients.length){
      alert('A saved meal must contain at least one food.');
      return;
    }

    savedMealEditorDraft.name=name;
    savedMealEditorDraft.updatedAt=new Date().toISOString();
    savedMealEditorDraft.sourceMealSignature=mealSnapshotSignature(savedMealEditorDraft.ingredients);

    db.savedRecipes[savedMealEditorIndex]=structuredClone(savedMealEditorDraft);

    localStorage.setItem(KEY,JSON.stringify(db));

    $('#savedMealEditorDialog').close();
    savedMealEditorIndex=null;
    savedMealEditorDraft=null;

    renderSavedRecipes();
    render()
  };
}

$('#generateRecipeBtn').onclick=generateRecipe;

ensureSavedMealUi();
