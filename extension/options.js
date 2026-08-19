const $=id=>document.getElementById(id);
const DEFAULT_READDECK_URL='https://keep.fishese.cc/';

function normalizeUrl(value){
  const url=new URL(value.trim());
  if(!['http:','https:'].includes(url.protocol))throw new Error('ReadDeck URL must use http or https.');
  url.hash='';
  return url.href;
}

function originPattern(value){return `${new URL(value).origin}/*`;}

async function load(){
  const settings=await chrome.storage.local.get({readdeckUrl:'',fullArchive:false,lastCaptureError:''});
  $('readdeckUrl').value=settings.readdeckUrl||DEFAULT_READDECK_URL;
  $('fullArchive').checked=settings.fullArchive;
  if(settings.lastCaptureError)$('status').textContent=`Last capture error: ${settings.lastCaptureError}`;
}

$('save').addEventListener('click',async()=>{
  const status=$('status');
  status.textContent='';
  try{
    const readdeckUrl=normalizeUrl($('readdeckUrl').value);
    const fullArchive=$('fullArchive').checked;
    const request={origins:[originPattern(readdeckUrl)]};
    if(fullArchive)request.permissions=['pageCapture'];
    const granted=await chrome.permissions.request(request);
    if(!granted)throw new Error('The requested ReadDeck permission was not granted.');
    if(!fullArchive&&await chrome.permissions.contains({permissions:['pageCapture']})){
      await chrome.permissions.remove({permissions:['pageCapture']});
    }
    await chrome.storage.local.set({readdeckUrl,fullArchive,lastCaptureError:''});
    status.textContent='Saved. Click the ReadDeck toolbar button on a page to capture it.';
  }catch(error){status.textContent=error?.message||String(error);}
});

load();
