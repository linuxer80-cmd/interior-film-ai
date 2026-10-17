// Google Fonts, losslessly WOFF2-compressed; no glyph subsetting; each family includes its OFL license.
const root='/fonts/business-card/';
export const cardFonts=[
 {id:'nanum',name:'나눔고딕',family:'Nanum Gothic Card',description:'또렷하고 신뢰감 있는 고딕',regular:'NanumGothic-Regular.woff2',bold:'NanumGothic-Bold.woff2',license:'nanumgothic-OFL.txt'},
 {id:'dodum',name:'고운돋움',family:'Gowun Dodum Card',description:'부드럽고 단정한 글씨',regular:'GowunDodum-Regular.woff2',license:'gowundodum-OFL.txt'},
 {id:'batang',name:'고운바탕',family:'Gowun Batang Card',description:'차분하고 고급스러운 명조',regular:'GowunBatang-Regular.woff2',bold:'GowunBatang-Bold.woff2',license:'gowunbatang-OFL.txt'},
 {id:'gaegu',name:'개구체',family:'Gaegu Card',description:'친근하고 자연스러운 손글씨',regular:'Gaegu-Regular.woff2',license:'gaegu-OFL.txt'},
];
export const getCardFont=id=>cardFonts.find(font=>font.id===id)||cardFonts[0];
const loaded=new Map();
export function loadCardFont(id){
 const font=getCardFont(id);
 if(!loaded.has(font.id)){
  const promise=Promise.all([[font.regular,'400'],...(font.bold?[[font.bold,'700']]:[])].map(async([file,weight])=>{
   const face=new FontFace(font.family,`url("${root}${file}")`,{weight,style:'normal'});
   await face.load();document.fonts.add(face);
  })).then(()=>font).catch(error=>{loaded.delete(font.id);throw error;});
  loaded.set(font.id,promise);
 }
 return loaded.get(font.id);
}
