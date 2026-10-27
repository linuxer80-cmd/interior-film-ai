import {prepareRequestPhoto, isHeicPhoto} from './heicPhoto.mjs';

// Keep ten images below the hosting request limit; preserve enough detail for consultation.
export async function prepareCustomerPhoto(original) {
  if (!original?.size || original.size > 20 * 1024 * 1024)
    throw Error('사진은 한 장당 20MB 이하로 선택해주세요.');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(original.type) && !isHeicPhoto(original.name, original.type))
    throw Error('JPG·PNG·WebP·HEIC 사진을 선택해주세요.');
  const file = await prepareRequestPhoto(original), url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(Error('사진을 읽을 수 없습니다. 다른 사진을 선택해주세요.')); image.src = url; });
    if (!img.naturalWidth || !img.naturalHeight || img.naturalWidth * img.naturalHeight > 64000000)
      throw Error('사진 크기가 너무 큽니다. 크기를 줄여 다시 선택해주세요.');
    const canvas = document.createElement('canvas');
    let edge = 1800;
    for (let attempt = 0; attempt < 4; attempt++) {
      const ratio = Math.min(1, edge / Math.max(img.naturalWidth, img.naturalHeight));
      canvas.width = Math.max(1, Math.round(img.naturalWidth * ratio)); canvas.height = Math.max(1, Math.round(img.naturalHeight * ratio));
      const ctx = canvas.getContext('2d'); if (!ctx) throw Error('사진 처리를 지원하지 않는 브라우저입니다.');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      for (const quality of [.84, .72, .6]) {
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
        if (blob?.size && blob.size <= 300000) return new File([blob], original.name.replace(/\.[^.]+$/, '') + '.jpg', {type: 'image/jpeg'});
      }
      edge = Math.round(edge * .75);
    }
    throw Error('사진 용량을 줄이지 못했습니다. 다른 사진으로 다시 선택해주세요.');
  } finally { URL.revokeObjectURL(url); }
}
