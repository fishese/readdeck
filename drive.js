import {buildBackupPayload,validateBackupPayload} from './backup.js';

const GIS_URL='https://accounts.google.com/gsi/client';
const DRIVE_SCOPE='https://www.googleapis.com/auth/drive.appdata';
const BACKUP_NAME='readdeck-backup.json';
const CLIENT_ID_KEY='readdeck.googleClientId';
let gisPromise;

function deployedClientId(){return String(window.READDECK_CONFIG?.googleOAuthClientId||'').trim();}
export function getStoredGoogleClientId(){return localStorage.getItem(CLIENT_ID_KEY)||deployedClientId();}
export function setStoredGoogleClientId(value){
  const trimmed=(value||'').trim();
  if(trimmed&&trimmed!==deployedClientId())localStorage.setItem(CLIENT_ID_KEY,trimmed);else localStorage.removeItem(CLIENT_ID_KEY);
  return trimmed||deployedClientId();
}

export function preloadGoogleIdentity(){
  if(window.google?.accounts?.oauth2)return Promise.resolve();
  if(gisPromise)return gisPromise;
  gisPromise=new Promise((resolve,reject)=>{
    const existing=document.querySelector(`script[src="${GIS_URL}"]`);
    const onLoad=()=>window.google?.accounts?.oauth2?resolve():reject(new Error('Google authorization library did not initialize.'));
    const onError=()=>reject(new Error('Could not load Google authorization. Check your connection.'));
    if(existing){existing.addEventListener('load',onLoad,{once:true});existing.addEventListener('error',onError,{once:true});return;}
    const script=document.createElement('script');
    script.src=GIS_URL;script.async=true;script.defer=true;script.referrerPolicy='no-referrer-when-downgrade';
    script.addEventListener('load',onLoad,{once:true});script.addEventListener('error',onError,{once:true});
    document.head.appendChild(script);
  });
  return gisPromise;
}

function requestAccessToken(clientId){
  if(!clientId)throw new Error('Add your Google OAuth client ID first.');
  if(!window.google?.accounts?.oauth2)throw new Error('Google authorization is not ready yet.');
  return new Promise((resolve,reject)=>{
    const client=window.google.accounts.oauth2.initTokenClient({
      client_id:clientId,
      scope:DRIVE_SCOPE,
      callback:response=>{
        if(response?.error){reject(new Error(response.error_description||response.error));return;}
        if(!response?.access_token){reject(new Error('Google did not return an access token.'));return;}
        resolve(response.access_token);
      },
      error_callback:error=>reject(new Error(error?.type==='popup_closed'?'Google sign-in was closed.':'Could not open Google sign-in.'))
    });
    client.requestAccessToken();
  });
}

async function driveFetch(url,token,options={}){
  const headers=new Headers(options.headers||{});headers.set('Authorization',`Bearer ${token}`);
  const response=await fetch(url,{...options,headers});
  if(response.ok)return response;
  let detail='';
  try{const body=await response.json();detail=body?.error?.message||body?.error_description||'';}catch{detail=await response.text().catch(()=> '');}
  throw new Error(detail||`Google Drive request failed (${response.status}).`);
}

async function findBackupFile(token){
  const url=new URL('https://www.googleapis.com/drive/v3/files');
  url.searchParams.set('spaces','appDataFolder');
  url.searchParams.set('q',`name = '${BACKUP_NAME}'`);
  url.searchParams.set('orderBy','modifiedTime desc');
  url.searchParams.set('pageSize','10');
  url.searchParams.set('fields','files(id,name,modifiedTime,size,mimeType)');
  const response=await driveFetch(url,token);
  const data=await response.json();
  return data.files?.[0]||null;
}

async function createBackupFile(token){
  const response=await driveFetch('https://www.googleapis.com/drive/v3/files?fields=id,name,modifiedTime,size',token,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({name:BACKUP_NAME,mimeType:'application/json',parents:['appDataFolder']})
  });
  return response.json();
}

async function uploadMedia(token,fileId,json){
  const response=await driveFetch(`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media&fields=id,name,modifiedTime,size`,token,{
    method:'PATCH',
    headers:{'Content-Type':'application/json; charset=utf-8'},
    body:json
  });
  return response.json();
}

export async function backupToGoogleDrive(clientId){
  const token=await requestAccessToken(clientId);
  const payload=await buildBackupPayload();
  const json=JSON.stringify(payload);
  let file=await findBackupFile(token);
  if(!file)file=await createBackupFile(token);
  const saved=await uploadMedia(token,file.id,json);
  return {file:saved,count:payload.articles.length,createdAt:payload.createdAt};
}

export async function downloadGoogleDriveBackup(clientId){
  const token=await requestAccessToken(clientId);
  const file=await findBackupFile(token);
  if(!file)throw new Error('No ReadDeck backup was found in Google Drive.');
  const response=await driveFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media`,token);
  const payload=validateBackupPayload(await response.json());
  return {file,payload};
}
