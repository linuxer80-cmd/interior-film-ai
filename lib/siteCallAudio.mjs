export const AUDIO_BUCKET = 'site-call-audio-private';
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
export const AUDIO_EXTENSIONS = ['m4a','mp3','mp4','wav','webm','mpeg','mpga'];
export function validAudioPath(path,company,user) {
 if(typeof path!=='string'||!path.startsWith(company+'/'+user+'/'))return false;
 return /^[0-9a-f-]{36}\.(m4a|mp3|mp4|wav|webm|mpeg|mpga)$/.test(path.slice((company+'/'+user+'/').length));
}
export function audioMetadata(body) {
 const extension=String(body?.fileName||'').split('.').pop().toLowerCase();
 if(!AUDIO_EXTENSIONS.includes(extension)||!Number.isInteger(body?.size)||body.size<=0||body.size>MAX_AUDIO_BYTES)
  throw new Error('25MB 이하의 m4a·mp3·mp4·wav·webm·mpeg·mpga 녹음을 선택해주세요.');
 return extension;
}
