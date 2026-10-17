// Convert on the phone before multipart upload reaches the hosting body limit.
export async function prepareDoorUpload(file, convert, revoke) {
 if(!file || !file.size) throw new Error('사진을 선택해주세요.');
 if(file.size > 25 * 1024 * 1024) throw new Error('원본 사진은 25MB 이하로 선택해주세요.');
 if(!file.type?.startsWith('image/') && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name||'')) throw new Error('사진 파일을 선택해주세요.');
 for(const [size,quality] of [[1600,.82],[1280,.7],[1000,.6]]) {
  let result;
  try { result=await convert(file,size,quality); }
  catch { throw new Error('이 사진 형식은 휴대폰에서 변환할 수 없습니다. JPG 사진이나 화면 캡처로 다시 선택해주세요.'); }
  if(result.preview) revoke(result.preview);
  if(result.file?.type==='image/jpeg' && result.file.size>0 && result.file.size<=2500000) return result.file;
 }
 throw new Error('사진을 충분히 줄이지 못했습니다. 화면 캡처로 다시 선택해주세요.');
}
