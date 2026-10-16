// Fill only missing receipt quantities; never overwrite recognized roll information.
export function receiptRollDefaults(source) {
  const result = {lengthM: source.lengthM ?? "", rollCount: source.rollCount ?? "", totalM: source.totalM ?? "", quantityNote: ""};
  if (source.action !== "receive") return result;
  const blank = value => value == null || String(value).trim() === "";
  const positive = value => !blank(value) && Number.isFinite(Number(value)) && Number(value) > 0;
  const countOK = value => positive(value) && Number.isInteger(Number(value)) && Number(value) <= 50;
  if (!positive(result.totalM)) return result;
  if (blank(result.lengthM) && blank(result.rollCount)) {
    result.lengthM = Number(result.totalM);
    result.rollCount = 1;
    result.quantityNote = "영수증 총 길이를 1롤로 자동 입력했습니다. 여러 롤이면 길이와 롤 수를 수정해주세요.";
  } else if (blank(result.lengthM) && countOK(result.rollCount)) {
    result.lengthM = Number(result.totalM) / Number(result.rollCount);
    result.quantityNote = "총 길이를 롤 수로 나누어 입력했습니다. 각 롤의 길이가 같은지 확인해주세요.";
  } else if (blank(result.rollCount) && positive(result.lengthM)) {
    const count = Math.round(Number(result.totalM) / Number(result.lengthM));
    if (count >= 1 && count <= 50 && Math.abs(Number(result.lengthM) * count - Number(result.totalM)) <= 0.001) {
      result.rollCount = count;
      result.quantityNote = "총 길이와 한 롤 길이로 롤 수를 자동 계산했습니다.";
    }
  }
  return result;
}
