import {getAllArticles,getArticle,putArticle,deleteArticle as removeArticle,replaceAllArticles} from './db.js';

const $=id=>document.getElementById(id);
const state={articles:[],currentId:null,filter:'active',query:''};

function uid(){return crypto.randomUUID?.()||`${Date.now()}-${Math.random().toString(16).slice(2)}`;}
function escapeHtml(s=''){return s.replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function host(url=''){try{return new URL(url).hostname.replace(/^www\./,'');}catch{return '';}}
function stripUnsafe(root){
  root.querySelectorAll('script,noscript,iframe,object,embed,form,input,button,textarea,select,link[rel="preload"],link[rel="prefetch"]').forEach(el=>el.remove());
  root.querySelectorAll('*').forEach(el=>{
    [...el.attributes].forEach(a=>{
      if(/^on/i.test(a.name)) el.removeAttribute(a.name);
      if(['src','href'].includes(a.name)&&/^javascript:/i.test(a.value)) el.removeAttribute(a.name);
    });
  });
}
function pickContent(doc){
  const candidates=[...doc.querySelectorAll('article,main,[role="main"],.article,.post,.entry-content,.article-body')];
  let best=candidates.sort((a,b)=>(b.innerText||'').length-(a.innerText||'').length)[0];
  if(!best) best=doc.body;
  const clone=best.cloneNode(true);
  clone.querySelectorAll('nav,aside,footer,header,.advertisement,.ad,.ads,.cookie,.newsletter,.social-share,.related,.comments').forEach(el=>el.remove());
  stripUnsafe(clone);
  return clone;
}
function absolutize(root,base){
  root.querySelectorAll('[src]').forEach(el=>{try{el.src=new URL(el.getAttribute('src'),base).href;}catch{}});
  root.querySelectorAll('a[href]').forEach(el=>{try{el.href=new URL(el.getAttribute('href'),base).href;}catch{}});
}
function metadata(doc,file){
  const canonical=doc.querySelector('link[rel="canonical"]')?.href||doc.querySelector('meta[property="og:url"]')?.content||'';
  const title=doc.querySelector('meta[property="og:title"]')?.content||doc.querySelector('h1')?.textContent?.trim()||doc.title||file.name.replace(/\.html?$/i,'');
  const author=doc.querySelector('meta[name="author"]')?.content||doc.querySelector('[rel="author"]')?.textContent?.trim()||'';
  return {canonical,title,author};
}
async function importHtml(file){
  const raw=await file.text();
  const doc=new DOMParser().parseFromString(raw,'text/html');
  const meta=metadata(doc,file);
  const base=meta.canonical||doc.baseURI||location.href;
  const content=pickContent(doc);
  absolutize(content,base);
  const text=(content.innerText||'').trim();
  const article={
    id:uid(),title:meta.title||'Untitled',author:meta.author,url:meta.canonical||'',site:host(meta.canonical),
    savedAt:new Date().toISOString(),archived:false,tags:[],contentHtml:content.innerHTML,textContent:text,
    excerpt:text.replace(/\s+/g,' ').slice(0,260),sourceFile:file.name
  };
  await putArticle(article);
}
async function refresh(){state.articles=await getAllArticles();renderLibrary();}
function visibleArticles(){
  const q=state.query.trim().toLowerCase();
  return state.articles.filter(a=>{
    if(state.filter==='active'&&a.archived) return false;
    if(state.filter==='archived'&&!a.archived) return false;
    if(!q) return true;
    return [a.title,a.site,a.author,a.textContent,...(a.tags||[])].join(' ').toLowerCase().includes(q);
  });
}
function renderTags(tags=[]){return tags.map(t=>`<span class="tag">${escapeHtml(t)}</span>`).join('');}
function renderLibrary(){
  const items=visibleArticles();
  $('emptyState').hidden=items.length!==0;
  $('cards').innerHTML=items.map(a=>`<section class="card" data-id="${a.id}">
    <div class="card-meta"><span>${escapeHtml(a.site||'Saved page')}</span><span>${new Date(a.savedAt).toLocaleDateString()}</span></div>
    <h2>${escapeHtml(a.title)}</h2><p>${escapeHtml(a.excerpt||'')}</p><div class="tags">${renderTags(a.tags)}</div>
    <div class="card-actions"><button data-action="read">Read</button><button data-action="archive">${a.archived?'Unarchive':'Archive'}</button></div>
  </section>`).join('');
}
async function openReader(id){
  const a=await getArticle(id); if(!a) return;
  state.currentId=id;$('libraryView').hidden=true;$('readerView').hidden=false;
  $('readerSite').textContent=a.site||'Saved page';$('readerTitle').textContent=a.title;
  $('readerMeta').textContent=[a.author,new Date(a.savedAt).toLocaleString()].filter(Boolean).join(' · ');
  $('readerTags').innerHTML=renderTags(a.tags);$('readerContent').innerHTML=a.contentHtml;
  stripUnsafe($('readerContent'));$('archiveArticle').textContent=a.archived?'Unarchive':'Archive';
  $('openOriginal').disabled=!a.url;
  scrollTo(0,0);
}
async function toggleArchive(id){const a=await getArticle(id);if(!a)return;a.archived=!a.archived;await putArticle(a);await refresh();if(state.currentId===id)await openReader(id);}
async function editTags(){const a=await getArticle(state.currentId);if(!a)return;const value=prompt('Tags, separated by commas',(a.tags||[]).join(', '));if(value===null)return;a.tags=[...new Set(value.split(',').map(t=>t.trim()).filter(Boolean))];await putArticle(a);await refresh();await openReader(a.id);}
function download(name,blob){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function exportCurrentHtml(){const a=await getArticle(state.currentId);if(!a)return;const html=`<!doctype html><meta charset="utf-8"><title>${escapeHtml(a.title)}</title><style>body{max-width:800px;margin:3rem auto;padding:0 1rem;font:18px/1.65 Georgia,serif}img{max-width:100%;height:auto}</style><h1>${escapeHtml(a.title)}</h1>${a.contentHtml}`;download(`${a.title.replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'')||'article'}.html`,new Blob([html],{type:'text/html'}));}
async function backup(){const payload={format:'readdeck-backup',version:1,createdAt:new Date().toISOString(),articles:await getAllArticles()};download(`readdeck-${new Date().toISOString().slice(0,10)}.readdeck`,new Blob([JSON.stringify(payload)],{type:'application/json'}));}
async function restore(file){const payload=JSON.parse(await file.text());if(payload.format!=='readdeck-backup'||!Array.isArray(payload.articles))throw new Error('Not a valid ReadDeck backup');if(!confirm(`Replace this device's library with ${payload.articles.length} saved page(s)?`))return;await replaceAllArticles(payload.articles);await refresh();alert('Backup restored.');}

$('htmlImport').addEventListener('change',async e=>{for(const file of e.target.files)await importHtml(file);e.target.value='';await refresh();});
$('search').addEventListener('input',e=>{state.query=e.target.value;renderLibrary();});
$('filter').addEventListener('change',e=>{state.filter=e.target.value;renderLibrary();});
$('cards').addEventListener('click',async e=>{const card=e.target.closest('.card');if(!card)return;if(e.target.dataset.action==='read')openReader(card.dataset.id);if(e.target.dataset.action==='archive')toggleArchive(card.dataset.id);});
$('backToLibrary').onclick=()=>{$('readerView').hidden=true;$('libraryView').hidden=false;state.currentId=null;};
$('archiveArticle').onclick=()=>toggleArchive(state.currentId);
$('editTags').onclick=editTags;
$('openOriginal').onclick=async()=>{const a=await getArticle(state.currentId);if(a?.url)open(a.url,'_blank','noopener');};
$('exportHtml').onclick=exportCurrentHtml;$('printArticle').onclick=()=>print();
$('deleteArticle').onclick=async()=>{const a=await getArticle(state.currentId);if(!a||!confirm(`Delete “${a.title}” from this device?`))return;await removeArticle(a.id);$('backToLibrary').click();await refresh();};
$('openSettings').onclick=()=>$('settingsDialog').showModal();$('downloadBackup').onclick=backup;
$('restoreFile').addEventListener('change',async e=>{try{if(e.target.files[0])await restore(e.target.files[0]);}catch(err){alert(err.message);}e.target.value='';});

if('serviceWorker'in navigator) navigator.serviceWorker.register('./sw.js');
refresh();
