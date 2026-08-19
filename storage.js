const statusEl=document.getElementById('storageStatus');
const requestButton=document.getElementById('requestPersistentStorage');

function describe(result){
  if(!result.supported)return 'This browser does not expose the persistent-storage API. Keep regular ReadDeck backups.';
  if(result.persisted)return 'Persistent storage is granted. The browser should avoid automatically evicting ReadDeck data.';
  if(result.requested)return 'ReadDeck requested persistent storage, but this browser did not grant it. You can retry after using the app for a while.';
  return 'Persistent storage has not been granted yet.';
}

async function getState(){
  if(!navigator.storage?.persist||!navigator.storage?.persisted)return {supported:false,persisted:false,requested:false};
  try{return {supported:true,persisted:await navigator.storage.persisted(),requested:false};}
  catch{return {supported:true,persisted:false,requested:false};}
}

async function requestPersistence(){
  if(!navigator.storage?.persist||!navigator.storage?.persisted){
    const result={supported:false,persisted:false,requested:true};
    if(statusEl)statusEl.textContent=describe(result);
    return result;
  }
  let persisted=false;
  try{
    persisted=await navigator.storage.persisted();
    if(!persisted)persisted=await navigator.storage.persist();
    if(!persisted)persisted=await navigator.storage.persisted();
  }catch{}
  const result={supported:true,persisted,requested:true};
  if(statusEl)statusEl.textContent=describe(result);
  if(requestButton)requestButton.hidden=persisted;
  return result;
}

async function init(){
  const state=await getState();
  if(statusEl)statusEl.textContent=describe(state);
  if(requestButton)requestButton.hidden=state.persisted;
  // Request once on startup. Browsers decide whether to grant this automatically or prompt.
  if(!state.persisted)await requestPersistence();
}

requestButton?.addEventListener('click',requestPersistence);
init();
