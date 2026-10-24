export function expansionSuggestions(){
 const areas=['인천','부천','일산','청라','검단','송도','계양','부평','구월동','주안','가정동','연희동'];
 return areas.flatMap(area=>['방문필름시공','문틀필름시공','싱크대필름시공','붙박이장필름시공','샷시필름시공','인테리어필름견적','시트지시공업체'].map(term=>area+term));
}
