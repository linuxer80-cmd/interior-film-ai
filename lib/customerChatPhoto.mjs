import sharp from 'sharp';
export const CHAT_PHOTO_MAX=2*1024*1024;
export async function normalizeChatPhoto(file){
 if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type)||!file.size||file.size>CHAT_PHOTO_MAX)throw Object.assign(Error('사진은 JPG·PNG·WebP 형식, 2MB 이하로 보내주세요.'),{status:400});
 try {
  const input=Buffer.from(await file.arrayBuffer());
  const decoder=sharp(input,{limitInputPixels:25000000,animated:false});
  const metadata=await decoder.metadata();
  if(!['jpeg','png','webp'].includes(metadata.format))throw Error('format');
  return await decoder.rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).jpeg({quality:82}).toBuffer();
 }catch{throw Object.assign(Error('읽을 수 없는 사진입니다. JPG 또는 PNG 사진을 다시 선택해주세요.'),{status:400});}
}
