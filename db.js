const DB_NAME='readdeck';
const DB_VERSION=1;
const STORE='articles';

function openDb(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains(STORE)){
        const store=db.createObjectStore(STORE,{keyPath:'id'});
        store.createIndex('savedAt','savedAt');
        store.createIndex('archived','archived');
      }
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}

async function tx(mode,handler){
  const db=await openDb();
  return new Promise((resolve,reject)=>{
    const transaction=db.transaction(STORE,mode);
    const store=transaction.objectStore(STORE);
    let result;
    try{result=handler(store);}catch(error){reject(error);return;}
    transaction.oncomplete=()=>resolve(result);
    transaction.onerror=()=>reject(transaction.error);
    transaction.onabort=()=>reject(transaction.error);
  });
}

export async function getAllArticles(){
  const db=await openDb();
  return new Promise((resolve,reject)=>{
    const req=db.transaction(STORE,'readonly').objectStore(STORE).getAll();
    req.onsuccess=()=>resolve(req.result.sort((a,b)=>b.savedAt.localeCompare(a.savedAt)));
    req.onerror=()=>reject(req.error);
  });
}

export async function getArticle(id){
  const db=await openDb();
  return new Promise((resolve,reject)=>{
    const req=db.transaction(STORE,'readonly').objectStore(STORE).get(id);
    req.onsuccess=()=>resolve(req.result||null);
    req.onerror=()=>reject(req.error);
  });
}

export async function putArticle(article){
  return tx('readwrite',store=>store.put(article));
}

export async function deleteArticle(id){
  return tx('readwrite',store=>store.delete(id));
}

export async function replaceAllArticles(articles){
  const db=await openDb();
  return new Promise((resolve,reject)=>{
    const transaction=db.transaction(STORE,'readwrite');
    const store=transaction.objectStore(STORE);
    store.clear();
    for(const article of articles) store.put(article);
    transaction.oncomplete=()=>resolve();
    transaction.onerror=()=>reject(transaction.error);
  });
}
