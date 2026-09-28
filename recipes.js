// =========================================================
// v28 RECIPE GENERATOR + SAVED MEALS
// =========================================================

let generatedRecipe=null;
let recipePendingAdd=null;
let recipeGenerating=false;

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

function hasRecipeTarget(t){return Object.values(t).some(v=>v!==null)}

function setRecipeStatus(message,type=''){
  const el=$('#recipeStatus');if(!el)return;
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
    t.kcal+=q.kcal;t.c+=q.c;t.p+=q.p;t.fat+=q.fat;
  });
  return t;
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
  return `<div class="recipe-ingredient"><span><b>${escapeHtml(x.food?.name||'Ingredient')}</b>${desc}</span><span>${qty} ${escapeHtml(unit)} · ${escapeHtml(x.state||'Raw')}</span></div>`;
}

function recipeInstructionsHtml(recipe){
  const steps=Array.isArray(recipe?.instructions)?recipe.instructions:[];
  return steps.length?`<div><b>Preparation</b><ol class="recipe-instructions">${steps.map(step=>`<li>${escapeHtml(step)}</li>`).join('')}</ol></div>`:'';
}

function renderGeneratedRecipe(){
  const root=$('#recipeResult');if(!root)return;
  if(!generatedRecipe){root.innerHTML='';return;}
  const t=recipeTotals(generatedRecipe);
  const requested=requestedRecipeText(generatedRecipe.targets||recipeTargets());
  root.innerHTML=`<div class="recipe-result-card">
    <div class="recipe-result-head"><div><h3>${escapeHtml(generatedRecipe.name||'Generated meal')}</h3><div class="recipe-requested">${requested?`Requested: ${escapeHtml(requested)}`:'Generated meal'}</div></div><div class="recipe-macros"><b>Estimated</b><br>P ${t.p.toFixed(1)} g · C ${t.c.toFixed(1)} g · F ${t.fat.toFixed(1)} g · ${Math.round(t.kcal)} kcal</div></div>
    <div class="recipe-ingredients"><b>Ingredients</b>${(generatedRecipe.ingredients||[]).map(recipeIngredientText).join('')}</div>
    ${recipeInstructionsHtml(generatedRecipe)}
    ${generatedRecipe.assumptions?`<div class="note"><b>Estimate:</b> ${escapeHtml(generatedRecipe.assumptions)}</div>`:''}
    <div class="recipe-warning"><b>Note:</b> Actual calories and macros may differ from goal calories and macros because ingredient nutrition and practical serving sizes are estimates.</div>
    <div class="recipe-result-actions"><button type="button" id="regenerateRecipeBtn" class="ghost">Generate again</button><button type="button" id="addGeneratedRecipeBtn">Add this meal</button><button type="button" id="saveGeneratedRecipeBtn" class="ghost">Save meal</button></div>
  </div>`;
  $('#regenerateRecipeBtn').onclick=generateRecipe;
  $('#addGeneratedRecipeBtn').onclick=()=>openRecipeAddDialog(generatedRecipe);
  $('#saveGeneratedRecipeBtn').onclick=saveGeneratedRecipe;
}

function renderSavedRecipes(){
  const root=$('#savedRecipesList');if(!root)return;
  const list=Array.isArray(db.savedRecipes)?db.savedRecipes:[];
  if(!list.length){root.innerHTML='<div class="recipe-empty">No saved meals yet.</div>';return;}
  root.innerHTML=list.map((recipe,i)=>{
    const t=recipeTotals(recipe);
    return `<details class="saved-recipe-card"><summary><div><b>${escapeHtml(recipe.name||'Saved meal')}</b><div class="recipe-requested">P ${t.p.toFixed(1)} g · C ${t.c.toFixed(1)} g · F ${t.fat.toFixed(1)} g · ${Math.round(t.kcal)} kcal</div></div><span>⌄</span></summary><div class="saved-recipe-body"><div class="recipe-ingredients">${(recipe.ingredients||[]).map(recipeIngredientText).join('')}</div>${recipeInstructionsHtml(recipe)}${recipe.assumptions?`<div class="note"><b>Estimate:</b> ${escapeHtml(recipe.assumptions)}</div>`:''}<div class="saved-recipe-actions"><button type="button" onclick="addSavedRecipe(${i})">Add this meal</button><button type="button" class="danger" onclick="deleteSavedRecipe(${i})">Delete</button></div></div></details>`;
  }).join('');
}

function renderRecipeView(){
  renderGeneratedRecipe();
  renderSavedRecipes();
}

async function generateRecipe(){
  if(recipeGenerating)return;
  recipeGenerating=true;
  const targets=recipeTargets();
  if(!hasRecipeTarget(targets)){recipeGenerating=false;setRecipeStatus('Enter at least one target: protein, carbohydrates, fats, or calories.','error');return;}
  const sourceMode=$('#recipeSourceMode').value;
  const supportFoods=sourceMode==='support'?compactSupportFoods():[];
  if(sourceMode==='support'&&!supportFoods.length){recipeGenerating=false;setRecipeStatus('Your Support List is empty. Add foods first or choose Use any foods.','error');return;}
  const btn=$('#generateRecipeBtn');
  const regen=$('#regenerateRecipeBtn');
  btn.disabled=true;if(regen)regen.disabled=true;generatedRecipe=null;renderGeneratedRecipe();setRecipeStatus('Generating a meal idea…');
  try{
    const response=await fetch(aiEndpoint()+'/recipe-generate',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({mode:sourceMode,targets,supportFoods})
    });
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||'Recipe generation failed.');
    if(!data.recipe||!Array.isArray(data.recipe.ingredients)||!data.recipe.ingredients.length)throw new Error('No usable recipe was returned.');
    generatedRecipe=data.recipe;
    generatedRecipe.targets=targets;
    renderGeneratedRecipe();
    setRecipeStatus('Meal generated. Review it, add it directly to a meal, save it for later, or generate again.','ok');
  }catch(error){console.error('Recipe generation error:',error);setRecipeStatus(error.message||'Could not generate a recipe.','error')}
  finally{btn.disabled=false;recipeGenerating=false}
}

function saveGeneratedRecipe(){
  if(!generatedRecipe)return;
  const saved=structuredClone(generatedRecipe);
  saved.id=(crypto?.randomUUID?crypto.randomUUID():String(Date.now())+'-'+Math.random().toString(16).slice(2));
  saved.savedAt=new Date().toISOString();
  db.savedRecipes ||= [];
  db.savedRecipes.unshift(saved);
  localStorage.setItem(KEY,JSON.stringify(db));
  renderSavedRecipes();
  setRecipeStatus('Meal saved under Saved meals.','ok');
}

function openRecipeAddDialog(recipe){
  if(!recipe||!Array.isArray(recipe.ingredients)||!recipe.ingredients.length)return;
  recipePendingAdd=recipe;
  $('#recipeAddName').textContent=recipe.name||'Generated recipe';
  $('#recipeMealTarget').innerHTML=Array.from({length:6},(_,i)=>`<option value="${i}">Meal ${i+1}</option>`).join('');
  $('#recipeAddDialog').showModal();
}

window.addSavedRecipe=i=>{const r=db.savedRecipes?.[i];if(r)openRecipeAddDialog(r)};
window.deleteSavedRecipe=i=>{const r=db.savedRecipes?.[i];if(!r)return;if(confirm(`Delete ${r.name||'this saved meal'}?`)){db.savedRecipes.splice(i,1);localStorage.setItem(KEY,JSON.stringify(db));renderSavedRecipes()}};

$('#generateRecipeBtn').onclick=generateRecipe;
$('#closeRecipeAdd').onclick=()=>{$('#recipeAddDialog').close();recipePendingAdd=null};
$('#recipeAddForm').onsubmit=e=>{
  e.preventDefault();
  if(!recipePendingAdd)return;
  const target=Number($('#recipeMealTarget').value);
  if(!Number.isInteger(target)||target<0||target>=day().meals.length)return;
  const items=(recipePendingAdd.ingredients||[]).map(x=>structuredClone(x));
  day().meals[target].push(...items);
  recipePendingAdd=null;
  $('#recipeAddDialog').close();
  save();
  setRecipeStatus(`Added recipe ingredients to Meal ${target+1}.`,'ok');
};
