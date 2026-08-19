const MAX_MHTML_BYTES=16*1024*1024;

function normalizeOriginPattern(value){
  const url=new URL(value);
  if(!['http:','https:'].includes(url.protocol))throw new Error('ReadDeck URL must use http or https.');
  return `${url.origin}/*`;
}

function captureRenderedArticle(){
  const absolute=(value,base)=>{try{return new URL(value,base).href;}catch{return value;}};
  const sourceUrl=location.href;
  const canonicalRaw=document.querySelector('link[rel="canonical"]')?.getAttribute('href')||document.querySelector('meta[property="og:url"]')?.content||sourceUrl;
  const canonical=absolute(canonicalRaw,sourceUrl);
  const title=document.querySelector('meta[property="og:title"]')?.content||document.querySelector('h1')?.textContent?.trim()||document.title||'Untitled';
  const author=document.querySelector('meta[name="author"]')?.content||document.querySelector('[rel="author"]')?.textContent?.trim()||'';
  const candidates=[...document.querySelectorAll('article,main,[role="main"],.article,.post,.entry-content,.article-body,.story-body')];
  let best=candidates.sort((a,b)=>(b.innerText||'').length-(a.innerText||'').length)[0]||document.body;
  const clone=best.cloneNode(true);
  clone.querySelectorAll('script,noscript,iframe,object,embed,form,input,button,textarea,select,nav,aside,footer,header,.advertisement,.advert,.ad,.ads,.cookie,.newsletter,.social-share,.related,.comments').forEach(el=>el.remove());
  clone.querySelectorAll('*').forEach(el=>{
    [...el.attributes].forEach(attr=>{
      const name=attr.name.toLowerCase();
      if(name.startsWith('on')||name==='srcdoc'||name==='formaction'){el.removeAttribute(attr.name);return;}
      if(['href','src','poster'].includes(name)){
        if(/^javascript:/i.test(attr.value)){el.removeAttribute(attr.name);return;}
        el.setAttribute(attr.name,absolute(attr.value,sourceUrl));
      }
      if(name==='srcset'){
        const converted=attr.value.split(',').map(part=>{
          const bits=part.trim().split(/\s+/);if(!bits[0])return '';
          bits[0]=absolute(bits[0],sourceUrl);return bits.join(' ');
        }).filter(Boolean).join(', ');
        if(converted)el.setAttribute('srcset',converted);else el.removeAttribute('srcset');
      }
    });
  });
  const text=(clone.innerText||'').trim();
  return {title,author,url:canonical,capturedAt:new Date().toISOString(),html:clone.innerHTML,text};
}

async function blobToBase64(blob){
  const bytes=new Uint8Array(await blob.arrayBuffer());
  let binary='';
  const chunk=0x8000;
  for(let i=0;i<bytes.length;i+=chunk)binary+=String.fromCharCode(...bytes.subarray(i,i+chunk));
  return btoa(binary);
}

async function captureArchive(tabId,enabled){
  if(!enabled)return null;
  const allowed=await chrome.permissions.contains({permissions:['pageCapture']});
  if(!allowed)return {format:'mhtml',skipped:'permission-not-granted'};
  try{
    const blob=await chrome.pageCapture.saveAsMHTML({tabId});
    if(!blob)return {format:'mhtml',skipped:'capture-failed'};
    if(blob.size>MAX_MHTML_BYTES)return {format:'mhtml',size:blob.size,skipped:'too-large'};
    return {format:'mhtml',mimeType:blob.type||'multipart/related',size:blob.size,data:await blobToBase64(blob)};
  }catch(error){return {format:'mhtml',skipped:'capture-failed',message:error?.message||String(error)};}
}

async function waitForComplete(tabId){
  const current=await chrome.tabs.get(tabId);
  if(current.status==='complete')return;
  await new Promise((resolve,reject)=>{
    let timer;
    const done=()=>{chrome.tabs.onUpdated.removeListener(listener);clearTimeout(timer);resolve();};
    const listener=(id,change)=>{if(id===tabId&&change.status==='complete')done();};
    chrome.tabs.onUpdated.addListener(listener);
    timer=setTimeout(()=>{chrome.tabs.onUpdated.removeListener(listener);reject(new Error('ReadDeck did not finish loading.'));},20000);
  });
}

async function deliverCapture(readdeckUrl,payload){
  const pattern=normalizeOriginPattern(readdeckUrl);
  if(!await chrome.permissions.contains({origins:[pattern]}))throw new Error('ReadDeck site permission is missing. Open extension options and save the URL again.');
  const nonce=crypto.randomUUID();
  const targetUrl=new URL(readdeckUrl);
  targetUrl.hash=`readdeck-capture=${encodeURIComponent(nonce)}`;
  const target=await chrome.tabs.create({url:targetUrl.href,active:true});
  await waitForComplete(target.id);
  const message={source:'readdeck-extension',type:'readdeck.capture.v1',nonce,payload};
  const inject=msg=>window.postMessage(msg,location.origin);
  try{
    await chrome.scripting.executeScript({target:{tabId:target.id},world:'MAIN',func:inject,args:[message]});
  }catch(error){
    if(payload.archive?.data){
      payload.archive={...payload.archive,data:undefined,skipped:'transfer-limit'};
      const fallback={source:'readdeck-extension',type:'readdeck.capture.v1',nonce,payload};
      await chrome.scripting.executeScript({target:{tabId:target.id},world:'MAIN',func:inject,args:[fallback]});
      return;
    }
    throw error;
  }
}

async function badge(text,color){
  await chrome.action.setBadgeText({text});
  if(color)await chrome.action.setBadgeBackgroundColor({color});
  setTimeout(()=>chrome.action.setBadgeText({text:''}).catch(()=>{}),2500);
}

chrome.action.onClicked.addListener(async tab=>{
  try{
    const settings=await chrome.storage.local.get({readdeckUrl:'',fullArchive:false});
    if(!settings.readdeckUrl){await chrome.runtime.openOptionsPage();await badge('!','#dc2626');return;}
    if(!tab?.id||!/^https?:/i.test(tab.url||''))throw new Error('This page cannot be captured by ReadDeck.');
    const [{result}]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:captureRenderedArticle});
    if(!result?.html)throw new Error('No readable page content was found.');
    result.archive=await captureArchive(tab.id,settings.fullArchive);
    await deliverCapture(settings.readdeckUrl,result);
    await badge('✓','#16a34a');
  }catch(error){
    console.error('ReadDeck capture failed',error);
    await chrome.storage.local.set({lastCaptureError:error?.message||String(error)});
    await badge('!','#dc2626');
  }
});
