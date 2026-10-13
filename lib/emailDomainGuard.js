// Check common Korean mail-domain typos before creating an Auth account.
// Do not reject unfamiliar domains: legitimate custom domains are allowed.
const commonTypos = Object.freeze({
  "naver.con": "naver.com",
  "naver.cmo": "naver.com",
  "naver.co": "naver.com",
  "nvaer.com": "naver.com",
  "navre.com": "naver.com",
  "gmail.con": "gmail.com",
  "gmail.cmo": "gmail.com",
  "gamil.com": "gmail.com",
  "gmial.com": "gmail.com",
  "daum.con": "daum.net",
  "daum.nte": "daum.net",
  "hanmail.con": "hanmail.net",
  "hanmail.nte": "hanmail.net",
  "kakao.con": "kakao.com",
});
export function suggestedEmailCorrection(value) {
  const email = String(value || "").trim().toLowerCase();
  const at = email.lastIndexOf("@");
  if (at < 1 || at === email.length - 1) return null;
  const domain = email.slice(at + 1);
  const replacement = commonTypos[domain];
  return replacement ? email.slice(0, at + 1) + replacement : null;
}
export function confirmEmailDomain(value) {
  const suggestion = suggestedEmailCorrection(value);
  if (!suggestion) return true;
  // Explicitly ask the user to correct the address; avoid creating another account by mistake.
  if (typeof window !== "undefined") window.alert("이메일 주소를 확인해주세요. 혹시 " + suggestion + " 주소를 입력하려던 것인가요? 수정 후 다시 가입해주세요.");
  return false;
}
