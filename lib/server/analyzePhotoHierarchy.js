import {randomUUID} from 'node:crypto';
import {TARGETS,SPACES,DAMAGES,STAGES,aiTargets} from '../photoHierarchy.mjs';
const fail=(message,status=400)=>Object.assign(Error(message),{status});
export async function analyzePhotoHierarchy(imageUrl,stage){
 if(!process.env.OPENAI_API_KEY)throw fail('AI 분석 서버 설정을 확인해주세요.',503);
 const photo={photo_stage:stage};
 const instruction=`인테리어필름 시공 데이터의 6단계 분류를 제안한다. 사진 속 주요 시공 대상을 각각 분리한다. 배경 부위를 무조건 모두 등록하지 말고 주요 독립 대상을 기록한다.
1 공간 space: ${JSON.stringify(SPACES)}.
2 대상 part 및 3 세부종류 kind는 다음 사전에서만 선택: ${JSON.stringify(TARGETS)}.
4 shapes는 모양·배치·표면구조·개폐방식의 짧은 한국어 태그 배열.
5 damage: ${JSON.stringify(DAMAGES)} 중 하나. 사진에서 보이지 않으면 확인 필요, 손상이 눈에 띄지 않으면 파손 미관찰. '파손 없음(관리자 확인)'은 사용하지 말것. 시공 후 사진에서 시공 전 파손을 추측하지 말것.
6 components는 보이는 구성부위의 한국어 배열. 문과 문틀이 함께 보이면 문·문틀 세트로 묶고 문짝·문틀을 별도 중복 등록하지 말것. 격자살 등 추가특징은 허용.
싱크대와 함께 보이는 냉장고장은 주 싱크대의 구성 부위로 포함하고 하나의 대상으로 기록한다. 이 경우 kind는 냉장고장 결합형 싱크대, components에 냉장고장을 포함한다. 냉장고장을 별도 대상으로 중복 등록하지 않는다. 싱크대 없이 냉장고장만 촬영한 사례는 냉장고장 독립 대상으로 유지한다. 냉장고장과 붙박이장을 구분. 금액은 추정하거나 기존가격을 여러 대상에 배분하지 말것. 크기·수량·시공범위를 창작하지 말것. 공간과 방화 성능 등은 불확실하면 확인 필요로 기록. 주거 엘리베이터를 무조건 상업공간으로 판단하지 말것.
현재 사진 상태: ${STAGES[photo.photo_stage]||'미확인'}. 이는 촬영상태이며 보수 전 상태의 증거가 아니다.
JSON만 반환: {"targets":[{"space":"주거공간","part":"문","kind":"방문","shapes":["평판형","여닫이"],"damage":"파손 미관찰","components":["문·문틀 세트"],"notes":"판단 이유와 미확인 사항"}]} 최대 20대상.`;
 const res=await fetch('https://api.openai.com/v1/responses',{method:'POST',signal:AbortSignal.timeout(45000),headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.PHOTO_CLASSIFICATION_MODEL||'gpt-5.6-luna',max_output_tokens:6000,input:[{role:'user',content:[{type:'input_text',text:instruction},{type:'input_image',image_url:imageUrl}]}],text:{format:{type:'json_object'}}})});
 if(!res.ok)throw fail('AI 분류에 실패했습니다. 기존 데이터는 유지됩니다. 잠시 후 다시 시도해주세요.',502);
 const result=await res.json(),text=result.output_text||(result.output||[]).flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text).join('');
 let parsed;try{parsed=JSON.parse(text);}catch{throw fail('AI 응답을 확인하지 못했습니다. 직접 분류하거나 다시 시도해주세요.',502);}
 return aiTargets(parsed.targets,randomUUID);
}
