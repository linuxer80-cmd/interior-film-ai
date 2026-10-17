const DB = 'film-personal-notebooks-v1';
function open() {
  return new Promise((resolve,reject)=>{
    const r = indexedDB.open(DB,1);
    r.onupgradeneeded=()=>r.result.createObjectStore('books',{keyPath:'key'});
    r.onsuccess=()=>resolve(r.result);
    r.onerror=()=>reject(Error('기기 저장소를 열 수 없습니다. 일반 브라우저에서 다시 시도해주세요.'));
  });
}
export async function listBooks(user) {
  const db=await open();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('books','readonly');
    const req=tx.objectStore('books').getAll();
    req.onsuccess=()=>resolve(req.result.filter(r=>r.user===user).map(r=>({...r.book,revision:r.revision})).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)));
    req.onerror=()=>reject(req.error);
    tx.oncomplete=()=>db.close();
  });
}
export async function saveBook(user,book,revision) {
  const db=await open();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('books','readwrite'); const store=tx.objectStore('books');
    const key=user+':'+book.id; const req=store.get(key); let conflict=false;
    req.onsuccess=()=>{
      if ((req.result?.revision || 0)!==revision) { conflict=true; tx.abort(); return; }
      store.put({key,user,book,revision:revision+1});
    };
    tx.oncomplete=()=>{db.close();resolve(revision+1);};
    tx.onabort=tx.onerror=()=>{db.close();reject(Error(conflict?'다른 탭에서 수첩이 변경되었습니다. 현재 내용을 백업한 후 다시 열어주세요.':'저장하지 못했습니다. 기기 여유 공간을 확인하고 다시 저장해주세요.'));};
  });
}
export async function compressPhoto(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw Error('JPG·PNG·WebP 사진을 선택해주세요.');
  if (file.size > 20*1024*1024) throw Error('사진은 한 장당 20MB 이하로 선택해주세요.');
  const bitmap=await createImageBitmap(file);
  const ratio=Math.min(1,1400/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement('canvas'); canvas.width=Math.round(bitmap.width*ratio);canvas.height=Math.round(bitmap.height*ratio);
  const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
  const data=canvas.toDataURL('image/jpeg',0.76);
  if(data.length>1800000) throw Error('사진 용량이 큽니다. 더 작은 사진을 선택해주세요.');
  return data;
}
