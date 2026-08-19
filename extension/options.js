const $=id=>document.getElementById(id);
const READDECK_URL='https://keep.fishese.cc/';

async function load(){
  const settings=await chrome.storage.local.get({fullArchive:false,lastCaptureError:''});
  $('readdeckUrl').value=READDECK_URL;
  $('fullArchive').checked=settings.fullArchive;
  if(settings.lastCaptureError)$('status').textContent=`Last capture error: ${settings.lastCaptureError}`;
}

$('save').addEventListener('click',async()=>{
  const status=$('status');
  status.textContent='';
  try{
    const fullArchive=$('fullArchive').checked;
    await chrome.storage.local.set({readdeckUrl:READDECK_URL,fullArchive,lastCaptureError:''});
    status.textContent=fullArchive
      ? 'Saved. Chrome will ask for full-page archive permission the next time you click Save to ReadDeck.'
      : 'Saved. Click the ReadDeck toolbar button on a page to capture it.';
  }catch(error){status.textContent=error?.message||String(error);}
});

load();
