/** Optional cloud archive. Uploads occur only after the Save click. */
export function initializeArchive({ snapshot,reopen,notify }) {
  const $ = (id) => document.getElementById(id);
  let connected=false,saving=false,available=false,next=null;
  function update(value) { available=value; $('archive-save').disabled=!connected || !available || saving; }
  async function api(path,options) {
    const response=await fetch(path,{ credentials:'same-origin',...options });
    let result;
    try { result=await response.json(); } catch { throw new Error('Archivage indisponible sur ce déploiement.'); }
    if (!response.ok) throw new Error(result.error || 'Archivage indisponible.');
    return result;
  }
  function addImage(image) {
    const card=document.createElement('article'); card.className='archive-card';
    const thumbnail=document.createElement('img'); thumbnail.src=`/api/images/${encodeURIComponent(image.id)}/file`;
    thumbnail.alt=image.filename; thumbnail.loading='lazy'; thumbnail.decoding='async';
    const title=document.createElement('strong'); title.textContent=image.filename;
    const detail=document.createElement('small'); detail.textContent=`${new Date(image.createdAt).toLocaleString('fr-FR')} · ${image.width} × ${image.height} · ${Math.round(image.bytes/1024)} Ko${image.analysis ? ' · analyse enregistrée' : ''}`;
    const actions=document.createElement('div'); actions.className='archive-actions';
    const open=document.createElement('button'); open.type='button'; open.className='text-button'; open.textContent='Reprendre pour analyse';
    open.onclick=async()=>{
      open.disabled=true;
      try {
        const response=await fetch(thumbnail.src,{ credentials:'same-origin' });
        if (!response.ok) throw new Error('Image inaccessible.');
        await reopen(new File([await response.blob()],image.filename,{ type:image.contentType }));
        document.getElementById('audit').scrollIntoView({ behavior:'smooth' });
      } catch(error) { notify(error.message,'error'); } finally { open.disabled=false; }
    };
    const remove=document.createElement('button'); remove.type='button'; remove.className='text-button'; remove.textContent='Supprimer';
    remove.onclick=async()=>{
      remove.disabled=true;
      try { await api(`/api/images/${encodeURIComponent(image.id)}`,{ method:'DELETE' }); card.remove(); notify('Image et analyse supprimées de votre archive.'); }
      catch(error) { notify(error.message,'error'); remove.disabled=false; }
    };
    actions.append(open,remove); card.append(thumbnail,title,detail,actions); $('archive-list').append(card);
  }
  async function list(append=false) {
    const result=await api(`/api/images${append && next ? `?before=${encodeURIComponent(next)}` : ''}`);
    if (!append) $('archive-list').replaceChildren();
    result.images.forEach(addImage); next=result.next; $('archive-more').hidden=!next;
    if (!append && !result.images.length) $('archive-status').textContent='Aucune image enregistrée. L’enregistrement reste facultatif.';
  }
  async function connect() {
    $('archive-refresh').disabled=true;
    try {
      const session=await api('/api/session'); connected=session.storage===true;
      $('archive-status').textContent=`Archive privée de ${session.email}. Rien n’est enregistré automatiquement.`;
      await list();
    } catch(error) { connected=false; $('archive-status').textContent=error.message; }
    finally { $('archive-refresh').disabled=false; update(available); }
  }
  $('archive-save').onclick=async()=>{
    if (!connected || saving || !available) return;
    const record=snapshot(); if (!record) return;
    saving=true; update(available); $('archive-status').textContent='Enregistrement de la vue affichée dans Cloudflare…';
    try {
      const blob=await new Promise((resolve)=>record.canvas.toBlob(resolve,'image/jpeg',.9));
      if (!blob || blob.size>8*1024*1024) throw new Error('La vue dépasse la limite de 8 Mo.');
      const form=new FormData(); form.set('image',blob,record.filename);
      form.set('metadata',JSON.stringify({ width:record.canvas.width,height:record.canvas.height,analysis:record.analysis }));
      await api('/api/images',{ method:'POST',body:form }); await list();
      $('archive-status').textContent='Vue enregistrée sur votre demande, avec son analyse si disponible.';
    } catch(error) { $('archive-status').textContent=error.message; }
    finally { record.canvas.width=record.canvas.height=0; saving=false; update(available); }
  };
  $('archive-refresh').onclick=()=>{ void connect(); };
  $('archive-more').onclick=async()=>{
    $('archive-more').disabled=true;
    try { await list(true); } catch(error) { $('archive-status').textContent=error.message; }
    finally { $('archive-more').disabled=false; }
  };
  void connect(); return { update };
}
