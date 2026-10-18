// Legacy titles are hints, not proof that an unspecified door is a room door.
export function doorCaseType(item) {
  const title=[item.category,item.sub_category].filter(Boolean).join(" ");
  if(/싱크|상부장|하부장|붙박이|신발장|냉장고장|가구/.test(title))return "가구문";
  const profile=item.case_profile || {};
  for(const kind of ["방화문","중문","현관문","방문","드레스룸문"]){
    if(title.includes(kind))return kind;
  }
  if(["방문","방화문","중문","현관문","드레스룸문","가구문"].includes(profile.door_kind))return profile.door_kind;
  if(["방문","방화문","중문","현관문","드레스룸문"].includes(profile.part))return profile.part;
  return "종류 확인 필요";
}
