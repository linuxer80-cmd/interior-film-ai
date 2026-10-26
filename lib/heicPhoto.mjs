// Only load the HEIC decoder when a HEIC/HEIF image is encountered.
export function isHeicPhoto(name = '', type = '') {
  return /\.(heic|heif)(?:[?#].*)?$/i.test(name) || /^image\/hei[cf](?:-sequence)?$/i.test(type);
}

let conversionQueue = Promise.resolve();
export function convertHeicBlob(blob, decoder) {
  const task = conversionQueue.catch(() => {}).then(async () => {
    const heicTo = decoder || (await import('heic-to/csp')).heicTo;
    const result = await heicTo({ blob, type: 'image/jpeg', quality: 0.9 });
    if (!(result instanceof Blob) || !result.size || result.type !== 'image/jpeg') {
      throw new Error('사진 변환에 실패했습니다.');
    }
    return result;
  });
  conversionQueue = task;
  return task;
}

export async function prepareRequestPhoto(file, decoder) {
  if (!isHeicPhoto(file.name, file.type)) return file;
  const jpeg = await convertHeicBlob(file, decoder);
  return new File([jpeg], file.name.replace(/\.(heic|heif)$/i, '') + '.jpg', {
    type: 'image/jpeg', lastModified: file.lastModified,
  });
}
