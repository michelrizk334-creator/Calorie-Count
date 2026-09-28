function renderMeals(d){
  $('#meals').innerHTML=d.meals.map((meal,i)=>{let mt=meal.reduce((a,x)=>{let q=calcItem(x);a.kcal+=q.kcal;a.c+=q.c;a.p+=q.p;a.fat+=q.fat;return a},{kcal:0,c:0,p:0,fat:0});return `<div class="meal" data-meal-index="${i}"><div class="meal-title"><b>Meal ${i+1}</b><div class="meal-header-right"><span class="meal-macros">C ${mt.c.toFixed(1)}g · P ${mt.p.toFixed(1)}g · F ${mt.fat.toFixed(1)}g</span><span class="meal-total">${Math.round(mt.kcal)} kcal</span><button type="button" class="meal-add-btn" onclick="addFoodToMeal(${i})">Edit</button><button type="button" class="meal-clear-btn" onclick="clearMeal(${i})" aria-label="Clear Meal ${i+1}" title="Clear meal">🗑</button><button type="button" class="meal-drag" draggable="true" data-meal-index="${i}" aria-label="Move Meal ${i+1}" title="Drag to reorder">☰</button></div></div>${meal.length?meal.map((x,j)=>{let q=calcItem(x);return `<div class="food-row"><div><b>${x.food.name}</b><div class="sub">${x.qty} ${x.food.unit} · ${x.state} · C ${q.c.toFixed(1)} / P ${q.p.toFixed(1)} / F ${q.fat.toFixed(1)}</div></div><span class="kcal">${Math.round(q.kcal)} kcal</span><button class="meal-edit" onclick="editMealFood(${i},${j})" aria-label="Edit ${x.food.name}" title="Edit">✎</button><button onclick="removeFood(${i},${j})" aria-label="Delete ${x.food.name}" title="Delete">✕</button></div>`}).join(''):'<div class="empty">No food yet</div>'}</div>`}).join('');
  setupMealReordering();
}
window.addFoodToMeal=(mealIndex)=>{editingMealIndex=null;editingMealItemIndex=null;selectedFood=null;$('#mealSelect').value=String(mealIndex);$('#foodDialog').showModal();$('#foodSearch').value='';showFoods('');setTimeout(()=>$('#foodSearch').focus(),50)};
window.clearMeal=(mealIndex)=>{const meal=day().meals[mealIndex];if(!Array.isArray(meal)||!meal.length)return;if(confirm(`Delete all foods from Meal ${mealIndex+1}?`)){day().meals[mealIndex]=[];save()}};
function moveMeal(fromIndex,toIndex){if(fromIndex===toIndex||fromIndex<0||toIndex<0)return;const meals=day().meals;const moved=meals.splice(fromIndex,1)[0];meals.splice(toIndex,0,moved);save()}
function setupMealReordering(){
  const root=$('#meals');if(!root)return;
  const handles=[...root.querySelectorAll('.meal-drag')];
  handles.forEach(handle=>{
    handle.addEventListener('dragstart',e=>{const i=Number(handle.dataset.mealIndex);e.dataTransfer.setData('text/plain',String(i));e.dataTransfer.effectAllowed='move';handle.closest('.meal')?.classList.add('dragging')});
    handle.addEventListener('dragend',()=>root.querySelectorAll('.meal').forEach(m=>m.classList.remove('dragging','drag-over')));
    handle.addEventListener('pointerdown',e=>{
      if(e.pointerType==='mouse')return;
      const from=Number(handle.dataset.mealIndex);let target=from;handle.setPointerCapture?.(e.pointerId);handle.closest('.meal')?.classList.add('dragging');
      const move=ev=>{const el=document.elementFromPoint(ev.clientX,ev.clientY);const meal=el?.closest?.('.meal');root.querySelectorAll('.meal').forEach(m=>m.classList.remove('drag-over'));if(meal){target=Number(meal.dataset.mealIndex);meal.classList.add('drag-over')}};
      const end=()=>{handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',end);handle.removeEventListener('pointercancel',end);root.querySelectorAll('.meal').forEach(m=>m.classList.remove('dragging','drag-over'));if(target!==from)moveMeal(from,target)};
      handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',end);handle.addEventListener('pointercancel',end);
    });
  });
  root.querySelectorAll('.meal').forEach(meal=>{
    meal.addEventListener('dragover',e=>{e.preventDefault();meal.classList.add('drag-over')});
    meal.addEventListener('dragleave',()=>meal.classList.remove('drag-over'));
    meal.addEventListener('drop',e=>{e.preventDefault();const from=Number(e.dataTransfer.getData('text/plain'));const to=Number(meal.dataset.mealIndex);root.querySelectorAll('.meal').forEach(m=>m.classList.remove('dragging','drag-over'));moveMeal(from,to)});
  });
}
window.removeFood=(i,j)=>{day().meals[i].splice(j,1);save()};
window.editMealFood=(i,j)=>{const x=day().meals[i][j]; if(!x)return; editingMealIndex=i; editingMealItemIndex=j; selectedFood=structuredClone(x.food); $('#mealSelect').value=String(i); openQtyEditor(x.qty,x.state,true)};
function shift(n){let d=new Date(date+'T12:00:00');d.setDate(d.getDate()+n);date=d.toISOString().slice(0,10);render()}
$('#prevDay').onclick=()=>shift(-1);$('#nextDay').onclick=()=>shift(1);$('#todayBtn').onclick=()=>{date=new Date().toISOString().slice(0,10);render()};$('#date').onchange=e=>{date=e.target.value;render()};
$('#mealSelect').innerHTML=Array.from({length:6},(_,i)=>`<option value="${i}">Meal ${i+1}</option>`).join('');
function allFoods(){return db.supportFoods}
$('#addFoodBtn').onclick=()=>{editingMealIndex=null;editingMealItemIndex=null;selectedFood=null;$('#foodDialog').showModal();$('#foodSearch').value='';showFoods('')};
function showFoods(q){q=q.toLowerCase();$('#foodResults').innerHTML=allFoods().filter(f=>f.name.toLowerCase().includes(q)).slice(0,60).map(f=>`<button type="button" class="food-option" data-name="${encodeURIComponent(f.name)}"><span><b>${f.name}</b><small>${f.type} · per ${f.serving} ${f.unit}</small></span><span>${Math.round(f.kcal)} kcal</span></button>`).join('');document.querySelectorAll('.food-option').forEach(b=>b.onclick=()=>pickFood(decodeURIComponent(b.dataset.name)))}
$('#foodSearch').oninput=e=>showFoods(e.target.value);
function openQtyEditor(qty,state,isEdit=false){$('#qtyTitle').textContent=(isEdit?'Edit ':'')+selectedFood.name;$('#qty').value=qty;$('#qtyLabel').firstChild.textContent=`Quantity (${selectedFood.unit})`;$('#state').value=state||'Raw';$('#state').disabled=!selectedFood.ratio;let mode=conversionMode(selectedFood);$('#conversionNote').textContent=selectedFood.ratio?`Raw nutrition values. Cooked quantity is ${mode==='divide'?'divided by':'multiplied by'} ${selectedFood.ratio} to get the raw-equivalent quantity.`:'No raw/cooked conversion for this food; quantity is used directly.';$('#confirmFood').textContent=isEdit?'Save changes':'Add to meal';$('#qtyDialog').showModal()}
function pickFood(name){selectedFood=allFoods().find(f=>f.name===name);$('#foodDialog').close();openQtyEditor(selectedFood.serving,'Raw',false)}
$('#confirmFood').onclick=e=>{e.preventDefault();if(!selectedFood)return;const targetMeal=+$('#mealSelect').value;const item={food:structuredClone(selectedFood),qty:+$('#qty').value||0,state:$('#state').value};if(editingMealIndex!==null&&editingMealItemIndex!==null){if(targetMeal===editingMealIndex){day().meals[editingMealIndex][editingMealItemIndex]=item}else{day().meals[editingMealIndex].splice(editingMealItemIndex,1);day().meals[targetMeal].push(item)}}else{day().meals[targetMeal].push(item)}editingMealIndex=null;editingMealItemIndex=null;selectedFood=null;$('#qtyDialog').close();save()};

$('#closeFoodDialog').onclick=()=>$('#foodDialog').close();
$('#closeQtyDialog').onclick=()=>{$('#qtyDialog').close();selectedFood=null;editingMealIndex=null;editingMealItemIndex=null;$('#confirmFood').textContent='Add to meal'};
