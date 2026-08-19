import {getAllArticles,getArticle,putArticle,deleteArticle as removeArticle} from './db.js';
import {buildBackupPayload,validateBackupPayload,restoreBackupPayload} from './backup.js';
import {getStoredGoogleClientId,setStoredGoogleClientId,preloadGoogleIdentity,backupToGoogleDrive,downloadGoogleDriveBackup} from './drive.js';

const $=id=>document.getElementById(id);
const state={articles:[],currentId:null,filter:'active',query:'',driveReady:false,driveBusy:false};

function uid(){return crypto.randomUUID?.()||`${Date.now()}-${Math.random().toString(16).slice(2)}`;}
function escapeHtml(s=''){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function host(url=''){try{return new URL(url).hostname.replace(/^www\./,'');}catch{return '';}}
function safeFilename(value='article'){return value.replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'')||'article';}

function stripUnsafe(root){
  root.querySelectorAll('script,noscript,iframe,object,embed,form,input,button,textarea,select,link[rel="preload"],link[rel="prefetch"]').forEach(el=>el.remove());
  root.querySelectorAll('*').forEach(el=>{
    [...el.attributes].forEach(a=>{
      const name=a.name.toLowerCase();
      if(name.startsWith('on')||name==='srcdoc'||name==='formaction'){el.removeAttribute(a.name);return;}
      if(['src','href','poster'].includes(name)&&/^javascript:/i.test(a.value))el.removeAttribute(a.name);
    });
  });
}

function pickContent(doc){
  const candidates=[...doc.querySelectorAll('article,main,[role="main"],.article,.post,.entry-content,.article-body,.story-body')];
  let best=candidates.sort((a,b)=>(b.innerText||'').length-(a.innerText||'').length)[0];
  if(!best)best=doc.body;
  const clone=best.cloneNode(true);
  clone.querySelectorAll('nav,aside,footer,header,.advertisement,.advert,.ad,.ads,.cookie,.newsletter,.social-share,.related,.comments').forEach(el=>el.remove());
  stripUnsafe(clone);
  return clone;
}

function absolutize(root,base){
  root.querySelectorAll('[src]').forEach(el=>{try{el.setAttribute('src',new URL(el.getAttribute('src'),base).href);}catch{}});
  root.querySelectorAll('[poster]').forEach(el=>{try{el.setAttribute('poster',new URL(el.getAttribute('poster'),base).href);}catch{}});
  root.querySelectorAll('a[href]').forEach(el=>{try{el.setAttribute('href',new URL(el.getAttribute('href'),base).href);}catch{}});
  root.querySelectorAll('[srcset]').forEach(el=>{
    const converted=el.getAttribute('srcset').split(',').map(part=>{
      const bits=part.trim().split(/\s+/);if(!bits[0])return '';
      try{bits[0]=new URL(bits[0],base).href;}catch{}
      return bits.join(' ');
    }).filter(Boolean).join(', ');
    if(converted)el.setAttribute('srcset',converted);
  });
}

function metadata(doc,file){
  const canonicalRaw=doc.querySelector('link[rel="canonical"]')?.getAttribute('href')||doc.querySelector('meta[property="og:url"]')?.content||'';
  let canonical=canonicalRaw;
  try{canonical=new URL(canonicalRaw,doc.querySelector('base[href]')?.href||location.href).href;}catch{}
  const title=doc.querySelector('meta[property="og:title"]')?.content||doc.querySelector('h1')?.textContent?.trim()||doc.title||file.name.replace(/\.html?$/i,'');
  const author=doc.querySelector('meta[name="author"]')?.content||doc.querySelector('[rel="author"]')?.textContent?.trim()||'';
  return {canonical,title,author};
}

async function importHtml(file){
  const raw=await file.text();
  const doc=new DOMParser().parseFromString(raw,'text/html');
  const meta=metadata(doc,file);
  const base=meta.canonical||doc.querySelector('base[href]')?.href||location.href;
  const content=pickContent(doc);
  absolutize(content,base);
  const text=(content.innerText||'').trim();
  const article={
    id:uid(),title:meta.title||'Untitled',author:meta.author,url:meta.canonical||'',site:host(meta.canonical),
    savedAt:new Date().toISOString(),archived:false,tags:[],contentHtml:content.innerHTML,textContent:text,
    excerpt:text.replace(/\s+/g,' ').slice(0,260),sourceFile:file.name,archive:null
  };
  await putArticle(article);
}

function captureNonce(){return new URLSearchParams(location.hash.replace(/^#/,'')).get('readdeck-capture')||'';}
function normalizeCaptureArchive(value){
  if(!value||value.format!=='mhtml')return null;
  return {
    format:'mhtml',
    mimeType:typeof value.mimeType==='string'?value.mimeType:'multipart/related',
    size:Number.isFinite(Number(value.size))?Number(value.size):0,
    data:typeof value.data==='string'?value.data:null,
    skipped:typeof value.skipped==='string'?value.skipped:'',
    message:typeof value.message==='string'?value.message:''
  };
}

async function receiveCapture(event){
  if(event.source!==window||event.origin!==location.origin)return;
  const message=event.data;
  if(!message||message.source!=='readdeck-extension'||message.type!=='readdeck.capture.v1')return;
  const nonce=captureNonce();
  if(!nonce||message.nonce!==nonce)return;
  const payload=message.payload||{};
  if(typeof payload.html!=='string'||!payload.html.trim())return;
  const container=document.createElement('div');
  container.innerHTML=payload.html;
  stripUnsafe(container);
  absolutize(container,payload.url||location.href);
  const text=(container.innerText||payload.text||'').trim();
  const article={
    id:uid(),
    title:String(payload.title||'Untitled').trim()||'Untitled',
    author:String(payload.author||'').trim(),
    url:String(payload.url||''),
    site:host(payload.url||''),
    savedAt:payload.capturedAt&&Number.isFinite(Date.parse(payload.capturedAt))?new Date(payload.capturedAt).toISOString():new Date().toISOString(),
    archived:false,
    tags:[],
    contentHtml:container.innerHTML,
    textContent:text,
    excerpt:text.replace(/\s+/g,' ').slice(0,260),
    sourceFile:'browser capture',
    archive:normalizeCaptureArchive(payload.archive)
  };
  await putArticle(article);
  history.replaceState(null,'',`${location.pathname}${location.search}`);
  await refresh();
  await openReader(article.id);
}

async function refresh(){state.articles=await getAllArticles();renderLibrary();}
function visibleArticles(){
  const q=state.query.trim().toLowerCase();
  return state.articles.filter(a=>{
    if(state.filter==='active'&&a.archived)return false;
    if(state.filter==='archived'&&!a.archived)return false;
    if(!q)return true;
    return [a.title,a.site,a.author,a.textContent,...(a.tags||[])].join(' ').toLowerCase().includes(q);
  });
}
function renderTags(tags=[]){return tags.map(t=>`<span class="tag">${escapeHtml(t)}</span>`).join('');}
function renderLibrary(){
  const items=visibleArticles();
  $('emptyState').hidden=items.length!==0;
  $('cards').innerHTML=items.map(a=>`<section class="card" data-id="${escapeHtml(a.id)}">
    <div class="card-meta"><span>${escapeHtml(a.site||'Saved page')}</span><span>${new Date(a.savedAt).toLocaleDateString()}</span></div>
    <h2>${escapeHtml(a.title)}</h2><p>${escapeHtml(a.excerpt||'')}</p><div class="tags">${renderTags(a.tags)}${a.archive?.data?'<span class="tag system-tag">MHTML</span>':''}</div>
    <div class="card-actions"><button data-action="read">Read</button><button data-action="archive">${a.archived?'Unarchive':'Archive'}</button></div>
  </section>`).join('');
}

function archiveStatusText(archive){
  if(!archive)return '';
  if(archive.data)return `Full offline MHTML archive attached${archive.size?` · ${(archive.size/1024/1024).toFixed(1)} MB`:''}.`;
  const reasons={
    'too-large':'The full MHTML archive was too large to attach; the reader copy is still saved locally.',
    'permission-not-granted':'Full MHTML capture is not enabled in the browser extension.',
    'capture-failed':'The browser could not create the full MHTML archive; the reader copy is still saved.',
    'transfer-limit':'The full MHTML archive was too large to transfer into ReadDeck; the reader copy is still saved.'
  };
  return reasons[archive.skipped]||'';
}

async function openReader(id){
  const a=await getArticle(id);if(!a)return;
  state.currentId=id;$('libraryView').hidden=true;$('readerView').hidden=false;
  $('readerSite').textContent=a.site||'Saved page';$('readerTitle').textContent=a.title;
  $('readerMeta').textContent=[a.author,new Date(a.savedAt).toLocaleString()].filter(Boolean).join(' · ');
  $('readerTags').innerHTML=renderTags(a.tags);$('readerContent').innerHTML=a.contentHtml;
  stripUnsafe($('readerContent'));
  $('readerContent').querySelectorAll('a[href]').forEach(link=>{link.target='_blank';link.rel='noopener noreferrer';});
  $('archiveArticle').textContent=a.archived?'Unarchive':'Archive';
  $('openOriginal').disabled=!a.url;
  $('downloadArchive').hidden=!a.archive?.data;
  const status=archiveStatusText(a.archive);$('readerArchiveStatus').textContent=status;$('readerArchiveStatus').hidden=!status;
  scrollTo(0,0);
}

async function toggleArchive(id){const a=await getArticle(id);if(!a)return;a.archived=!a.archived;await putArticle(a);await refresh();if(state.currentId===id)await openReader(id);}
async function editTags(){const a=await getArticle(state.currentId);if(!a)return;const value=prompt('Tags, separated by commas',(a.tags||[]).join(', '));if(value===null)return;a.tags=[...new Set(value.split(',').map(t=>t.trim()).filter(Boolean))];await putArticle(a);await refresh();await openReader(a.id);}
function download(name,blob){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function base64ToBlob(base64,type){const binary=atob(base64);const bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return new Blob([bytes],{type});}

async function exportCurrentHtml(){
  const a=await getArticle(state.currentId);if(!a)return;
  const html=`<!doctype html><meta charset="utf-8"><title>${escapeHtml(a.title)}</title><style>body{max-width:800px;margin:3rem auto;padding:0 1rem;font:18px/1.65 Georgia,serif}img{max-width:100%;height:auto}</style><h1>${escapeHtml(a.title)}</h1>${a.contentHtml}`;
  download(`${safeFilename(a.title)}.html`,new Blob([html],{type:'text/html'}));
}
async function downloadCurrentArchive(){
  const a=await getArticle(state.currentId);if(!a?.archive?.data)return;
  download(`${safeFilename(a.title)}.mhtml`,base64ToBlob(a.archive.data,a.archive.mimeType||'multipart/related'));
}
async function backup(){const payload=await buildBackupPayload();download(`readdeck-${new Date().toISOString().slice(0,10)}.readdeck`,new Blob([JSON.stringify(payload)],{type:'application/json'}));}
async function restore(file){const payload=validateBackupPayload(JSON.parse(await file.text()));if(!confirm(`Replace this device's library with ${payload.articles.length} saved page(s)?`))return;await restoreBackupPayload(payload);await refresh();alert('Backup restored.');}

function currentClientId(){return setStoredGoogleClientId($('googleClientId').value);}
function updateDriveControls(){
  const configured=Boolean($('googleClientId').value.trim());
  $('driveBackup').disabled=state.driveBusy||!state.driveReady||!configured;
  $('driveRestore').disabled=state.driveBusy||!state.driveReady||!configured;
}
async function driveBackup(){
  const clientId=currentClientId();state.driveBusy=true;updateDriveControls();$('driveStatus').textContent='Opening Google authorization…';
  try{
    const result=await backupToGoogleDrive(clientId);
    $('driveStatus').textContent=`Backed up ${result.count} saved page(s) to Google Drive at ${new Date(result.file.modifiedTime||result.createdAt).toLocaleString()}.`;
  }catch(error){$('driveStatus').textContent=error?.message||String(error);}finally{state.driveBusy=false;updateDriveControls();}
}
async function driveRestore(){
  const clientId=currentClientId();state.driveBusy=true;updateDriveControls();$('driveStatus').textContent='Opening Google authorization…';
  try{
    const {file,payload}=await downloadGoogleDriveBackup(clientId);
    const when=file.modifiedTime?` from ${new Date(file.modifiedTime).toLocaleString()}`:'';
    if(!confirm(`Replace this device's library with ${payload.articles.length} saved page(s) from the Google Drive backup${when}?`))return;
    await restoreBackupPayload(payload);await refresh();
    $('driveStatus').textContent=`Restored ${payload.articles.length} saved page(s) from Google Drive.`;
  }catch(error){$('driveStatus').textContent=error?.message||String(error);}finally{state.driveBusy=false;updateDriveControls();}
}

$('htmlImport').addEventListener('change',async e=>{for(const file of e.target.files)await importHtml(file);e.target.value='';await refresh();});
$('search').addEventListener('input',e=>{state.query=e.target.value;renderLibrary();});
$('filter').addEventListener('change',e=>{state.filter=e.target.value;renderLibrary();});
$('cards').addEventListener('click',async e=>{const card=e.target.closest('.card');if(!card)return;if(e.target.dataset.action==='read')openReader(card.dataset.id);if(e.target.dataset.action==='archive')toggleArchive(card.dataset.id);});
$('backToLibrary').onclick=()=>{$('readerView').hidden=true;$('libraryView').hidden=false;state.currentId=null;};
$('archiveArticle').onclick=()=>toggleArchive(state.currentId);
$('editTags').onclick=editTags;
$('openOriginal').onclick=async()=>{const a=await getArticle(state.currentId);if(a?.url)open(a.url,'_blank','noopener');};
$('exportHtml').onclick=exportCurrentHtml;$('downloadArchive').onclick=downloadCurrentArchive;$('printArticle').onclick=()=>print();
$('deleteArticle').onclick=async()=>{const a=await getArticle(state.currentId);if(!a||!confirm(`Delete “${a.title}” from this device?`))return;await removeArticle(a.id);$('backToLibrary').click();await refresh();};
$('openSettings').onclick=()=>{$('googleClientId').value=getStoredGoogleClientId();updateDriveControls();$('settingsDialog').showModal();};
$('downloadBackup').onclick=backup;
$('restoreFile').addEventListener('change',async e=>{try{if(e.target.files[0])await restore(e.target.files[0]);}catch(err){alert(err.message);}e.target.value='';});
$('googleClientId').value=getStoredGoogleClientId();$('googleClientId').addEventListener('input',updateDriveControls);$('googleClientId').addEventListener('change',currentClientId);
$('driveBackup').onclick=driveBackup;$('driveRestore').onclick=driveRestore;
window.addEventListener('message',event=>receiveCapture(event).catch(error=>console.error('ReadDeck capture import failed',error)));

preloadGoogleIdentity().then(()=>{state.driveReady=true;$('driveStatus').textContent='Google Drive authorization is ready.';updateDriveControls();}).catch(()=>{$('driveStatus').textContent='Google Drive backup is unavailable while the Google authorization library cannot be loaded.';updateDriveControls();});
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js');
refresh();
