export const DESIGN_GROUPS = ['내추럴','모던','프리미엄','사진 중심'];
const rows = [
 ['natural-oak','내추럴','오크 스튜디오','따뜻한 우드 · 좌측 정렬','#f7f2e8','#fffdf7','#304d3b','#78694e','classic'],
 ['natural-sage','내추럴','세이지 가든','세이지 그린 · 중앙 정렬','#eef2e9','#fcfdf9','#325741','#66735f','center'],
 ['natural-linen','내추럴','리넨 하우스','리넨 베이지 · 액자형 사진','#f3eee6','#fffdf8','#66523f','#7c6f60','frame'],
 ['natural-clay','내추럴','클레이 아틀리에','테라코타 · 매거진 구성','#f8eee7','#fffaf5','#874c37','#81675b','editorial'],
 ['modern-white','모던','화이트 라인','화이트 · 여백 중심','#ffffff','#f6f7f8','#202e36','#607079','classic'],
 ['modern-slate','모던','슬레이트 그리드','슬레이트 · 정돈된 격자','#eef1f4','#ffffff','#34485b','#647382','grid'],
 ['modern-blue','모던','블루 포인트','블루 포인트 · 중앙 정렬','#f1f6fc','#ffffff','#24548b','#5d7188','center'],
 ['modern-mono','모던','모노 에디토리얼','흑백 · 큰 제목과 구분선','#f5f5f3','#ffffff','#242424','#666666','editorial'],
 ['premium-gold','프리미엄','블랙 골드','차콜과 골드 · 액자형 사진','#191a19','#252724','#e2c788','#bfb9aa','frame'],
 ['premium-navy','프리미엄','네이비 시그니처','딥 네이비 · 중앙 정렬','#162331','#223347','#ddd0ad','#bec9d4','center'],
 ['premium-emerald','프리미엄','에메랄드 살롱','딥 그린 · 여백 중심','#152b25','#213c33','#dfcc9e','#bfcec5','classic'],
 ['premium-burgundy','프리미엄','버건디 갤러리','버건디 · 매거진 구성','#321f28','#472d39','#efd0b3','#d2bcc6','editorial'],
 ['photo-wide','사진 중심','와이드 포트폴리오','큰 가로 사진 · 시공 사례 강조','#faf7f1','#ffffff','#354838','#6b7268','wide'],
 ['photo-grid','사진 중심','프로젝트 그리드','사진 격자 · 많은 사례 한눈에','#f1f2ef','#ffffff','#273c38','#62746e','grid'],
 ['photo-story','사진 중심','시공 스토리','세로 사진 · 프로젝트 이야기','#f5ede5','#fffaf5','#74513e','#806d61','story'],
 ['photo-gallery','사진 중심','다크 갤러리','어두운 배경 · 대형 사진','#191c20','#262b31','#e7d6b8','#bbc3cc','wide'],
];
export const CUSTOMER_DESIGNS = rows.map(([id,group,name,description,bg,surface,accent,muted,layout])=>({id,group,name,description,bg,surface,accent,muted,layout}));
export function getCustomerDesign(id) { return CUSTOMER_DESIGNS.find(d=>d.id===id) || CUSTOMER_DESIGNS[0]; }
export function designVars(id) { const d=getCustomerDesign(id);return {'--customer-bg':d.bg,'--customer-surface':d.surface,'--customer-accent':d.accent,'--customer-muted':d.muted,'--customer-text':d.group==='프리미엄'||d.id==='photo-gallery'?'#f8f3e9':'#27332e'}; }
