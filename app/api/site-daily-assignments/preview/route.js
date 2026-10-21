import { POST as assignmentPost } from "../route";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return Response.json({error:"배정 내용을 확인해주세요."},{status:400}); }
  if (!body || Array.isArray(body) || typeof body !== "object") return Response.json({error:"배정 내용을 확인해주세요."},{status:400});
  return assignmentPost(new Request(request.url, {
    method:"POST", headers:request.headers, body:JSON.stringify({...body,preview:true}),
  }));
}
