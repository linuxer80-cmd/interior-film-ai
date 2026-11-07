const chatFail=(message,status=400)=>Object.assign(Error(message),{status});
export async function readChatBody(request){
  const reader=request.body?.getReader();if(!reader)throw chatFail('메시지를 확인해주세요.');
  const chunks=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2300000){await reader.cancel();throw chatFail('사진 용량이 너무 큽니다.',413);}chunks.push(value);}
  const raw=Buffer.concat(chunks);
  if(request.headers.get('content-type')?.startsWith('multipart/form-data')){
    const form=await new Response(raw,{headers:{'Content-Type':request.headers.get('content-type')}}).formData();
    const photo=form.get('photo');
    if(!photo || typeof photo.arrayBuffer!=='function')throw chatFail('사진을 선택해주세요.');
    return {text:String(form.get('text')||''),messageId:String(form.get('messageId')||''),name:String(form.get('name')||''),consent:form.get('consent')==='true',photo};
  }
  if(raw.length>12000)throw chatFail('메시지가 너무 깁니다.');
  let body;try {body=JSON.parse(raw.toString('utf8'));} catch {throw chatFail('메시지를 확인해주세요.');}
  if(!body || typeof body!=='object' || Array.isArray(body))throw chatFail('메시지를 확인해주세요.');
  // JSON callers cannot fabricate file attachments or a stored image path.
  delete body.photo;delete body.image_path;
  return body;
}
