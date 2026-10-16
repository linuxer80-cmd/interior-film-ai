export const rewardLabels = {
 ai_photo_analysis:'사진 분석',similar_image_search:'유사 검색',virtual_remodel:'가상시공',cutting_ocr:'재단표 인식',receipt_ocr:'영수증·단가표 인식',consultation_ocr:'상담 캡처 인식',consultation_parse:'상담 정리',voice_transcription:'음성 변환',quick_photo_analysis:'사진 간편등록'
};
export function rewardText(spec) {
 return Object.entries(spec||{}).map(([key,value])=>`${rewardLabels[key]||key} +${value}회`).join(' · ');
}
