// Sites store addresses, not coordinates. Let the worker confirm the place
// in Naver Maps instead of inventing a destination coordinate.
export function siteDirectionsLinks(address, userAgent = "") {
  const query = String(address || "").trim();
  if (!query) return null;
  const encoded = encodeURIComponent(query);
  const web = `https://map.naver.com/p/search/${encoded}`;
  const parameters = `query=${encoded}&appname=${encodeURIComponent("https://interior-film-ai.vercel.app")}`;
  if (/Android/i.test(userAgent)) {
    return { web, mobile: true, href: `intent://search?${parameters}#Intent;scheme=nmap;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;package=com.nhn.android.nmap;S.browser_fallback_url=${encodeURIComponent(web)};end` };
  }
  if (/iPhone|iPad|iPod/i.test(userAgent)) {
    return { web, mobile: true, href: `nmap://search?${parameters}` };
  }
  return { web, mobile: false, href: web };
}
