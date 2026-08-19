import {getAllArticles,replaceAllArticles} from './db.js';

export async function buildBackupPayload(){
  return {
    format:'readdeck-backup',
    version:1,
    createdAt:new Date().toISOString(),
    articles:await getAllArticles()
  };
}

export function validateBackupPayload(payload){
  if(!payload||payload.format!=='readdeck-backup'||!Array.isArray(payload.articles)){
    throw new Error('Not a valid ReadDeck backup');
  }
  return payload;
}

export async function restoreBackupPayload(payload){
  validateBackupPayload(payload);
  await replaceAllArticles(payload.articles);
}
