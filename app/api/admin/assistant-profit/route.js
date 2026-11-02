import { GET as getProfit } from "../profit/route";
import { POST as getPreferences } from "../profit-preferences/route";
import { assistantProfitSummary } from "../../../../lib/assistantProfitSummary.mjs";

export const runtime = "nodejs";
const json = (data, status = 200) => Response.json(data, {status, headers:{"Cache-Control":"private, no-store"}});

export async function GET(request) {
  const url = new URL(request.url);
  // The assistant summary is always a bounded period, never an implicit site query.
  if (url.searchParams.has("siteId") || !url.searchParams.has("from") || !url.searchParams.has("to")) return json({error:"조회 기간을 확인해주세요."},400);
  const authorization = request.headers.get("authorization") || "";
  if (!/^Bearer \S+$/.test(authorization)) return json({error:"관리자로 다시 로그인해주세요."},401);
  try {
    const preferencesRequest = new Request(new URL("/api/admin/profit-preferences",url.origin), {
      method:"POST",headers:{authorization,"Content-Type":"application/json"},body:JSON.stringify({action:"get"}),
    });
    const [profitResponse, preferenceResponse] = await Promise.all([getProfit(request),getPreferences(preferencesRequest)]);
    if (!profitResponse.ok) return json({error:"매출·수익을 불러오지 못했습니다."},profitResponse.status);
    if (!preferenceResponse.ok) return json({error:"인건비 제외 설정을 확인하지 못했습니다."},preferenceResponse.status);
    const [profit,preferences] = await Promise.all([profitResponse.json(),preferenceResponse.json()]);
    // Uninitialized preferences can still live in the browser's old local storage.
    if (!preferences.initialized || !Array.isArray(preferences.ids)) return json({error:"필름장이 매출·수익 화면에서 제외 설정을 먼저 확인해 주세요."},409);
    return json({from:url.searchParams.get("from"),to:url.searchParams.get("to"),...assistantProfitSummary(profit,preferences.ids)});
  } catch { return json({error:"매출·수익을 확인하지 못했습니다."},500); }
}
