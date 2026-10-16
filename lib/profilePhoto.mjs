export const PROFILE_PHOTO_LIMIT=2*1024*1024;
const SOURCE_LIMIT=20*1024*1024;

// Decode and resize on the phone before sending to the 2 MB upload endpoint.
export async function prepareProfilePhoto(file){
 if(!file?.size)throw Error('사진 파일을 다시 선택해주세요.');
 if(file.size>SOURCE_LIMIT)throw Error('원본 사진은 20MB 이하로 선택해주세요.');
 if(file.type&&!file.type.startsWith('image/'))throw Error('이미지 파일을 선택해주세요.');
 const url=URL.createObjectURL(file);
 const image=new Image();
 try{
  await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('사진을 열지 못했습니다. 갤러리에 저장한 JPG 또는 PNG 사진을 선택해주세요.')),15000);
   image.onload=()=>{clearTimeout(timer);resolve();};
   image.onerror=()=>{clearTimeout(timer);reject(Error('이 사진 형식을 읽을 수 없습니다. JPG·PNG 사진이나 스크린샷으로 다시 선택해주세요.'));};
   image.src=url;
  });
  if(!image.naturalWidth||!image.naturalHeight)throw Error('사진 크기를 확인할 수 없습니다. 다른 사진을 선택해주세요.');
  const canvas=document.createElement('canvas');
  const context=canvas.getContext('2d');
  if(!context)throw Error('사진을 변환하지 못했습니다. 브라우저에서 다시 시도해주세요.');
  for(const edge of [1024,768,512]){
   const scale=Math.min(1,edge/Math.max(image.naturalWidth,image.naturalHeight));
   canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));
   canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
   context.fillStyle='#ffffff';
   context.fillRect(0,0,canvas.width,canvas.height);
   context.drawImage(image,0,0,canvas.width,canvas.height);
   for(const quality of [0.9,0.75,0.55]){
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
    if(blob?.size&&blob.size<=PROFILE_PHOTO_LIMIT){
     return new File([blob],'profile.jpg',{type:'image/jpeg'});
    }
   }
  }
  throw Error('사진 용량을 줄이지 못했습니다. 다른 사진을 선택해주세요.');
 }finally{
  image.onload=null;image.onerror=null;
  URL.revokeObjectURL(url);
 }
}
