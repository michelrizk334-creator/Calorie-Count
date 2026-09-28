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

(()=>{
  let deferredInstallPrompt=window.__ccInstallPrompt||null;
  let showingManualSteps=false;

  const overlay=document.getElementById('installPromptOverlay');
  const installBtn=document.getElementById('installAppNow');
  const notNow=document.getElementById('installNotNow');
  const iosSteps=document.getElementById('iosInstallSteps');
  const note=document.getElementById('installPromptNote');
  const text=document.getElementById('installPromptText');

  const ua=navigator.userAgent||'';
  const isIOS=/iPad|iPhone|iPod/.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  const isSamsung=/SamsungBrowser/i.test(ua);
  const isFirefox=/Firefox|FxiOS/i.test(ua);
  const isAndroid=/Android/i.test(ua);
  const isWindows=/Windows NT/i.test(ua);
  const standalone=window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;
  const dismissed=()=>sessionStorage.getItem('cc_install_prompt_dismissed')==='1';

  function hide(){overlay.hidden=true}

  function syncPrompt(){
    if(window.__ccInstallPrompt) deferredInstallPrompt=window.__ccInstallPrompt;

    if(!overlay.hidden && !isIOS && !isFirefox){
      if(deferredInstallPrompt){
        installBtn.textContent='Install';
        installBtn.disabled=false;
        note.textContent=isSamsung?'Ready to install with Samsung Browser.':'Ready to install.';
      }else if(isSamsung){
        installBtn.textContent='Preparing…';
        installBtn.disabled=true;
        note.textContent='Preparing Samsung Browser’s native installer…';
      }
    }
  }

  function showQuestion(){
    if(standalone||dismissed())return;

    overlay.hidden=false;
    text.textContent='Install Calorie Count for a standalone, offline experience.';
    iosSteps.hidden=true;
    showingManualSteps=false;

    if(isIOS){
      installBtn.textContent='Install';
      installBtn.disabled=false;
      note.textContent='';
      return;
    }

    if(isFirefox){
      installBtn.textContent='Install';
      installBtn.disabled=false;
      note.textContent='Firefox requires installation from its own browser controls.';
      return;
    }

    if(deferredInstallPrompt||window.__ccInstallPrompt){
      syncPrompt();
      return;
    }

    if(isSamsung){
      installBtn.textContent='Preparing…';
      installBtn.disabled=true;
      note.textContent='Preparing Samsung Browser’s native installer…';
    }else{
      // Preserve Chrome / Edge behavior.
      installBtn.textContent='Install';
      installBtn.disabled=false;
      note.textContent='';
    }
  }

  // Receive the event captured by the early inline listener in index.html.
  window.addEventListener('cc-install-prompt-ready',()=>{
    deferredInstallPrompt=window.__ccInstallPrompt||deferredInstallPrompt;
    syncPrompt();
  });

  // Secondary listener for Chromium-based browsers.
  window.addEventListener('beforeinstallprompt',event=>{
    event.preventDefault();
    deferredInstallPrompt=event;
    window.__ccInstallPrompt=event;
    syncPrompt();
  });

  window.addEventListener('appinstalled',()=>{
    deferredInstallPrompt=null;
    window.__ccInstallPrompt=null;
    hide();
  });

  notNow.addEventListener('click',()=>{
    sessionStorage.setItem('cc_install_prompt_dismissed','1');
    hide();
  });

  function showFirefoxSteps(){
    showingManualSteps=true;
    iosSteps.hidden=false;

    if(isAndroid){
      iosSteps.innerHTML='<div><strong>1.</strong> Tap the Firefox <strong>⋮</strong> menu.</div><div><strong>2.</strong> Tap <strong>Install</strong>.</div><div><strong>3.</strong> In the Add to Home Screen panel, tap <strong>Add automatically</strong> (or place the icon manually).</div>';
      note.textContent='Firefox for Android controls the installation itself, so the website cannot open that panel automatically.';
    }else if(isWindows){
      iosSteps.innerHTML='<div><strong>1.</strong> Look for the <strong>Web apps</strong> button in the Firefox address bar.</div><div><strong>2.</strong> Click it to install Calorie Count as a web app.</div><div><strong>3.</strong> Firefox will add the app to the Start menu and can pin it to the taskbar.</div>';
      note.textContent='Firefox for Windows does not let websites trigger this installation button programmatically.';
    }else{
      iosSteps.innerHTML='<div>Firefox does not currently expose standalone web-app installation on this desktop platform.</div><div>You can still bookmark Calorie Count and use it normally in Firefox.</div>';
      note.textContent='Automatic installation is not available in this Firefox configuration.';
    }

    installBtn.textContent='Got it';
  }

  installBtn.addEventListener('click',async()=>{
    if(isIOS){
      if(!showingManualSteps){
        showingManualSteps=true;
        iosSteps.hidden=false;
        iosSteps.innerHTML='<div><strong>1.</strong> Tap the <strong>Share</strong> button (□↑).</div><div><strong>2.</strong> Tap <strong>Add to Home Screen</strong>.</div><div><strong>3.</strong> Tap <strong>Add</strong>.</div>';
        installBtn.textContent='Got it';
        note.textContent='iPhone and iPad require Add to Home Screen to be confirmed manually.';
        return;
      }
      sessionStorage.setItem('cc_install_prompt_dismissed','1');
      hide();
      return;
    }

    if(isFirefox){
      if(!showingManualSteps){
        showFirefoxSteps();
        return;
      }
      sessionStorage.setItem('cc_install_prompt_dismissed','1');
      hide();
      return;
    }

    syncPrompt();

    if(deferredInstallPrompt){
      const promptEvent=deferredInstallPrompt;
      try{
        await promptEvent.prompt();
        const choice=await promptEvent.userChoice;
        if(choice&&choice.outcome==='accepted'){
          deferredInstallPrompt=null;
          window.__ccInstallPrompt=null;
          hide();
        }
      }catch(error){
        console.error('Install prompt error:',error);
        note.textContent='The browser could not open the native installer. Please reload and try again.';
      }
      return;
    }

    note.textContent=isSamsung
      ? 'Samsung Browser has not made the native installer available on this visit. Reload the page and try again.'
      : 'Automatic installation is not available in this browser right now.';
    installBtn.disabled=true;
    installBtn.textContent='Unavailable';
  });

  setTimeout(showQuestion,900);

  // Samsung can expose beforeinstallprompt later than Chrome/Edge.
  setTimeout(()=>{
    if(isSamsung&&!standalone&&!overlay.hidden&&!deferredInstallPrompt&&!window.__ccInstallPrompt){
      installBtn.textContent='Unavailable';
      installBtn.disabled=true;
      note.textContent='Samsung Browser did not expose its native installer on this visit. Reload the page and try again.';
    }
  },8000);
})();

// Initialize only after every feature file above has loaded.
bindCoreUi();
render();
