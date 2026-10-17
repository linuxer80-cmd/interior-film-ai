import {cardFonts,loadCardFont} from './businessCardFonts';
export const designGroups = [
 {id:'simple',name:'심플',description:'여백과 또렷한 글씨로 깔끔하게'},
 {id:'premium',name:'고급',description:'깊은 색감과 섬세한 라인의 조화'},
 {id:'business',name:'기업형',description:'정돈된 정보로 전하는 신뢰'},
 {id:'natural',name:'내추럴',description:'공간을 닮은 따뜻하고 편안한 색감'},
 {id:'color',name:'컬러',description:'선명한 색과 도형으로 남기는 첫인상'},
 {id:'craft',name:'시공 전문가',description:'도면과 마감 디테일에서 얻은 디자인'},
];
export const designs = [
 {id:'white',group:'simple',name:'모던 화이트',bg:'#ffffff',fg:'#21342e',accent:'#387965',layout:'line'},
 {id:'mono',group:'simple',name:'모노 타이포',bg:'#fafafa',fg:'#242424',accent:'#666666',layout:'editorial'},
 {id:'mist',group:'simple',name:'미스트 그레이',bg:'#edf0f2',fg:'#243542',accent:'#567182',layout:'frame'},
 {id:'pure',group:'simple',name:'퓨어 센터',bg:'#ffffff',fg:'#343a40',accent:'#66737d',layout:'center'},
 {id:'black',group:'premium',name:'블랙 골드',bg:'#20201e',fg:'#f7f2e6',accent:'#d6b77c',layout:'line'},
 {id:'velvet',group:'premium',name:'버건디 벨벳',bg:'#4b2532',fg:'#fff4e4',accent:'#deba89',layout:'frame'},
 {id:'emerald',group:'premium',name:'에메랄드 시그니처',bg:'#163c35',fg:'#fff9e9',accent:'#d5bb84',layout:'center'},
 {id:'midnight',group:'premium',name:'미드나잇 실버',bg:'#24283d',fg:'#f5f5fa',accent:'#b8c0d8',layout:'editorial'},
 {id:'navy',group:'business',name:'클래식 네이비',bg:'#16283e',fg:'#ffffff',accent:'#93bbd9',layout:'frame'},
 {id:'corporate',group:'business',name:'블루 파트너',bg:'#f4f7fd',fg:'#173861',accent:'#326bba',layout:'band'},
 {id:'trust',group:'business',name:'트러스트 틸',bg:'#edf5f5',fg:'#163e46',accent:'#287f89',layout:'split'},
 {id:'slate',group:'business',name:'슬레이트 오피스',bg:'#f6f6f3',fg:'#34404b',accent:'#68788b',layout:'editorial'},
 {id:'cream',group:'natural',name:'내추럴 크림',bg:'#f4eddf',fg:'#514235',accent:'#9c7955',layout:'split'},
 {id:'forest',group:'natural',name:'딥 포레스트',bg:'#173e34',fg:'#fffbee',accent:'#d3bd87',layout:'split'},
 {id:'sage',group:'natural',name:'세이지 리프',bg:'#eaf0e4',fg:'#344735',accent:'#5c7a51',layout:'botanical'},
 {id:'sand',group:'natural',name:'샌드 스톤',bg:'#ede4d5',fg:'#4b4238',accent:'#8f7556',layout:'center'},
 {id:'clay',group:'color',name:'테라코타',bg:'#f7eee7',fg:'#583c31',accent:'#b76548',layout:'frame'},
 {id:'cobalt',group:'color',name:'코발트 팝',bg:'#eef3ff',fg:'#193f83',accent:'#3166d3',layout:'diagonal'},
 {id:'peach',group:'color',name:'피치 블록',bg:'#fff0e6',fg:'#703c36',accent:'#be6455',layout:'band'},
 {id:'lavender',group:'color',name:'라벤더 무드',bg:'#f0ebfa',fg:'#4e3d6b',accent:'#8365aa',layout:'split'},
 {id:'blueprint',group:'craft',name:'블루프린트',bg:'#17384c',fg:'#f1f8fc',accent:'#8bbacb',layout:'blueprint'},
 {id:'oak',group:'craft',name:'오크 라인',bg:'#f4ebdc',fg:'#4d3c2a',accent:'#997442',layout:'slats'},
 {id:'structure',group:'craft',name:'아키텍트',bg:'#f6f4ef',fg:'#313d3c',accent:'#687d75',layout:'blueprint'},
 {id:'charcoal',group:'craft',name:'차콜 마감',bg:'#30332f',fg:'#f5f2e8',accent:'#cfb481',layout:'slats'},
 {id:'ink',group:'simple',name:'잉크 에디션',bg:'#fffdf8',fg:'#292925',accent:'#6b6b60',layout:'corner'},
 {id:'air',group:'simple',name:'에어 블루',bg:'#f6fbff',fg:'#304655',accent:'#6c94ad',layout:'ribbon'},
 {id:'copper',group:'premium',name:'코퍼 브라운',bg:'#392e29',fg:'#fff1df',accent:'#d2a17d',layout:'corner'},
 {id:'royal',group:'premium',name:'로열 플럼',bg:'#34243e',fg:'#fff4e6',accent:'#d1af7d',layout:'ribbon'},
 {id:'executive',group:'business',name:'이그제큐티브',bg:'#f7f8fa',fg:'#273849',accent:'#526d91',layout:'corner'},
 {id:'marine',group:'business',name:'마린 파트너',bg:'#f3f9fa',fg:'#1d414b',accent:'#3e8192',layout:'ribbon'},
 {id:'linen',group:'natural',name:'린넨 베이지',bg:'#f6f0e6',fg:'#5b4a39',accent:'#ab8b63',layout:'corner'},
 {id:'olive',group:'natural',name:'올리브 가든',bg:'#edf0df',fg:'#404d30',accent:'#7a884c',layout:'botanical'},
 {id:'rose',group:'color',name:'로즈 포인트',bg:'#fff0f3',fg:'#73384c',accent:'#b9607b',layout:'ribbon'},
 {id:'mustard',group:'color',name:'머스터드 포인트',bg:'#fff7df',fg:'#594a24',accent:'#ac831e',layout:'diagonal'},
 {id:'concrete',group:'craft',name:'콘크리트 그리드',bg:'#e9e9e5',fg:'#3a413f',accent:'#707d77',layout:'blueprint'},
 {id:'walnut',group:'craft',name:'월넛 스튜디오',bg:'#46372d',fg:'#fcf0de',accent:'#c7a078',layout:'slats'},
];
export const blankCard={font:'nanum',design:'white',company:'',name:'',position:'',phone:'',email:'',address:'',website:'',tagline:'인테리어 필름 전문 시공',logo:''};
export const fields=[['company','업체명 / 활동명',32],['name','이름',20],['position','직함',20],['phone','전화번호',30],['email','이메일',60],['address','주소 / 활동 지역',70],['website','홈페이지 / SNS 주소',80],['tagline','소개 문구',55]];
export function cleanCard(value){const c={...blankCard};for(const [k,,n] of fields)c[k]=typeof value?.[k]==='string'?value[k].slice(0,n):c[k];if(cardFonts.some(f=>f.id===value?.font))c.font=value.font;if(designs.some(d=>d.id===value?.design))c.design=value.design;if(typeof value?.logo==='string'&&value.logo.length<1500000&&/^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(value.logo))c.logo=value.logo;return c;}
export async function renderCard(canvas,card,outputWidth=1800){
 const font=await loadCardFont(card.font);
 const d=designs.find(x=>x.id===card.design)||designs[0];
 canvas.width=outputWidth;canvas.height=Math.round(outputWidth*1000/1800);const ctx=canvas.getContext('2d');ctx.scale(canvas.width/1800,canvas.height/1000);
 ctx.fillStyle=d.bg;ctx.fillRect(0,0,1800,1000);
 const split=['split','slats'].includes(d.layout);
 if(d.layout==='corner'){ctx.strokeStyle=d.accent;ctx.lineWidth=6;for(const [x,y,dx,dy] of [[55,55,1,1],[1745,945,-1,-1]]){ctx.beginPath();ctx.moveTo(x,y+dy*140);ctx.lineTo(x,y);ctx.lineTo(x+dx*260,y);ctx.stroke();}}
 if(d.layout==='ribbon'){ctx.fillStyle=d.accent;ctx.globalAlpha=.17;ctx.fillRect(1435,0,280,315);ctx.beginPath();ctx.moveTo(1435,315);ctx.lineTo(1575,240);ctx.lineTo(1715,315);ctx.fill();ctx.globalAlpha=1;ctx.fillRect(100,870,1600,7);}

 if(d.layout==='band'){ctx.fillStyle=d.accent;ctx.fillRect(0,0,1800,38);ctx.fillRect(0,930,1800,70);}
 if(d.layout==='editorial'){ctx.fillStyle=d.accent;ctx.fillRect(95,100,6,700);ctx.fillRect(1300,860,400,5);}
 if(d.layout==='diagonal'){ctx.fillStyle=d.accent;ctx.globalAlpha=.16;ctx.beginPath();ctx.moveTo(1250,0);ctx.lineTo(1800,0);ctx.lineTo(1800,1000);ctx.lineTo(1630,1000);ctx.closePath();ctx.fill();ctx.globalAlpha=1;}
 if(d.layout==='slats'){ctx.strokeStyle=d.accent;ctx.globalAlpha=.13;ctx.lineWidth=2;for(let x=20;x<540;x+=28){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,1000);ctx.stroke();}ctx.globalAlpha=1;}
 if(d.layout==='blueprint'){ctx.strokeStyle=d.accent;ctx.globalAlpha=.1;ctx.lineWidth=1;for(let x=30;x<1800;x+=65){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,1000);ctx.stroke();}for(let y=25;y<1000;y+=65){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(1800,y);ctx.stroke();}ctx.globalAlpha=.6;ctx.lineWidth=3;ctx.strokeRect(1440,340,235,390);ctx.strokeRect(1495,400,125,275);ctx.globalAlpha=1;}
 if(d.layout==='botanical'){ctx.strokeStyle=d.accent;ctx.lineWidth=5;ctx.globalAlpha=.4;ctx.beginPath();ctx.moveTo(1700,900);ctx.quadraticCurveTo(1460,650,1600,360);ctx.stroke();for(let i=0;i<6;i++){ctx.beginPath();ctx.ellipse(1560+i*15,460+i*65,30,65,-.7,0,Math.PI*2);ctx.stroke();}ctx.globalAlpha=1;}
 if(d.layout==='center'){ctx.strokeStyle=d.accent;ctx.lineWidth=2;ctx.strokeRect(55,55,1690,890);}

 if(split){ctx.fillStyle=d.accent;ctx.globalAlpha=.16;ctx.fillRect(0,0,560,1000);ctx.globalAlpha=1;}
 if(d.layout==='frame'){ctx.strokeStyle=d.accent;ctx.lineWidth=3;ctx.strokeRect(45,45,1710,910);}
 if(d.layout==='line'){ctx.fillStyle=d.accent;ctx.fillRect(95,90,100,9);ctx.fillRect(95,860,1610,3);}
 const text=(value,x,y,size,width,color=d.fg,weight=400)=>{if(!value)return;ctx.fillStyle=color;let s=size;do{ctx.font=`${font.bold?weight:400} ${s}px "${font.family}"`;if(ctx.measureText(value).width<=width)break;s-=1;}while(s>12);ctx.fillText(value,x,y);};
 if(card.logo){const img=await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error('로고를 읽을 수 없습니다.'));image.src=card.logo;});const w=split?280:145,h=split?280:145;const scale=Math.min(w/img.width,h/img.height);ctx.drawImage(img,split?140+(w-img.width*scale)/2:1515+(w-img.width*scale)/2,split?210+(h-img.height*scale)/2:110+(h-img.height*scale)/2,img.width*scale,img.height*scale);}
 if(split){text(card.company,85,600,52,390,d.fg,700);text(card.tagline,85,660,24,390,d.accent);}
 const x=split?650:d.layout==='editorial'?150:100,width=split?1030:['blueprint','botanical','diagonal'].includes(d.layout)?1250:1350;
 if(d.layout==='center'){
  ctx.textAlign='center';text(card.company,900,240,64,1100,d.fg,700);text(card.tagline,900,305,29,1200,d.accent);
  text(card.name,900,465,67,1450,d.fg,700);text(card.position,900,525,29,1450,d.accent);
  [card.phone,card.email,card.address,card.website].filter(v=>v.trim()).forEach((v,i)=>text(v,900,620+i*63,32,1500));
  ctx.textAlign='left';return canvas;
 }
 if(!split){text(card.company,x,220,64,width,d.fg,700);text(card.tagline,x,285,29,width,d.accent);}
 text(card.name,x,split?270:430,67,width,d.fg,700);
 text(card.position,x,split?330:485,29,width,d.accent);
 const rows=[['T',card.phone],['E',card.email],['A',card.address],['W',card.website]].filter(([,v])=>v.trim());
 rows.forEach(([label,value],i)=>{const y=(split?470:585)+i*67;text(label,x,y,25,40,d.accent,700);text(value,x+65,y,33,width-65);});
 return canvas;
}
