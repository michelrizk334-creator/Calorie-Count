(function(){
function fit(){
  var r=document.getElementById("desktopScaleRoot");if(!r)return;
  var support=document.getElementById("supportView");
  var w=document.documentElement.clientWidth||window.innerWidth||900;
  var nativeSupport=w<900&&support&&!support.hidden;
  r.classList.toggle("support-phone-native",nativeSupport);
  r.style.transform="none";
  r.style.marginLeft="";
  document.body.style.height="";
}
window.addEventListener("resize",fit);
window.addEventListener("orientationchange",function(){setTimeout(fit,120)});
window.addEventListener("load",fit);
new MutationObserver(fit).observe(document.getElementById("desktopScaleRoot"),{childList:true,subtree:true,attributes:true});
fit();
})();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('/Calorie-Count/sw.js', {scope:'/Calorie-Count/'}).catch(()=>{}));
}

(()=>{
  let deferredInstallPrompt=null;
  let showingIosSteps=false;
  const overlay=document.getElementById('installPromptOverlay');
  const installBtn=document.getElementById('installAppNow');
  const notNow=document.getElementById('installNotNow');
  const iosSteps=document.getElementById('iosInstallSteps');
  const note=document.getElementById('installPromptNote');
  const text=document.getElementById('installPromptText');
  const ua=navigator.userAgent||'';
  const isIOS=/iPad|iPhone|iPod/.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  const standalone=window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;
  const dismissed=()=>sessionStorage.getItem('cc_install_prompt_dismissed')==='1';
  function hide(){overlay.hidden=true}
  function showQuestion(){if(standalone||dismissed())return;overlay.hidden=false;text.textContent='Install Calorie Count for a standalone, offline experience.';installBtn.textContent='Install';installBtn.disabled=false;note.textContent='';iosSteps.hidden=true;showingIosSteps=false}
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();deferredInstallPrompt=event});
  window.addEventListener('appinstalled',()=>{deferredInstallPrompt=null;hide()});
  notNow.addEventListener('click',()=>{sessionStorage.setItem('cc_install_prompt_dismissed','1');hide()});
  installBtn.addEventListener('click',async()=>{
    if(isIOS){if(!showingIosSteps){showingIosSteps=true;iosSteps.hidden=false;iosSteps.innerHTML='<div><strong>1.</strong> Tap the <strong>Share</strong> button (□↑).</div><div><strong>2.</strong> Tap <strong>Add to Home Screen</strong>.</div><div><strong>3.</strong> Tap <strong>Add</strong>.</div>';installBtn.textContent='Got it';note.textContent='Safari requires Add to Home Screen to be confirmed manually.';return}sessionStorage.setItem('cc_install_prompt_dismissed','1');hide();return}
    if(deferredInstallPrompt){const promptEvent=deferredInstallPrompt;try{await promptEvent.prompt();const choice=await promptEvent.userChoice;if(choice&&choice.outcome==='accepted'){deferredInstallPrompt=null;hide()}}catch(error){console.error('Install prompt error:',error)}return}
    note.textContent='Automatic installation is not available in this browser right now.';installBtn.disabled=true;installBtn.textContent='Unavailable';
  });
  setTimeout(showQuestion,900);
})();

// Initialize only after every feature file above has loaded.
bindCoreUi();
render();
