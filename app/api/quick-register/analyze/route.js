import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    const scoped = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error: authError } = await scoped.auth.getUser(token);
    const { data: membership, error: membershipError } = await scoped.rpc("get_my_company");
    if (authError || !user || membershipError || !Array.isArray(membership) ||
        !membership.some((row) => row.company_id && row.is_active !== false)) {
      return NextResponse.json({ error: "관리자 권한이 없습니다." }, { status: 403 });
    }
    const form = await request.formData();
    const files = form.getAll("images");
    const metadata = JSON.parse(String(form.get("metadata") || "[]"));
    if (!Array.isArray(metadata) || files.length < 1 || files.length > 12 || files.length !== metadata.length ||
        files.some((file) => !file.type?.startsWith("image/") || file.size > 5_000_000)) {
      return NextResponse.json({ error: "사진은 1~12장, 장당 5MB 이하로 분석해주세요." }, { status: 400 });
    }
    const instruction = `인테리어필름 시공 사진 ${files.length}장을 비교하라. 번호는 0부터 시작한다. 각 사진의 시공 부위(category: 싱크대/문·문틀/중문/붙박이장/신발장/현관문/기타), 세부 부위(sub_category), 전후(before/after/unknown), 현장 번호(site_key: 1,2,...), description, tags를 판별하라. 다른 날짜라도 GPS와 타일·손잡이·배치 같은 구조가 일치하면 같은 현장일 수 있다. 같은 날이라도 다른 공간은 분리한다. 전후 상태를 같은 부위 사진끼리 비교하고 시각은 보조로만 사용한다. 단독 사진이나 불확실한 사진은 unknown. GPS 근접만으로 현장을 확정하지 말라. 사진 정보: ${JSON.stringify(metadata.map((m, index) => ({ index, takenAt: m.takenAt, latitude: m.latitude, longitude: m.longitude })))}. JSON만 반환: {"photos":[{"index":0,"site_key":"1","category":"싱크대","sub_category":"하부장","photo_type":"unknown","confidence":"low","description":"사진에 보이는 사실","tags":["특징"]}]}. 모든 index를 정확히 한 번씩 포함한다. confidence는 high/medium/low.`;
    const content = [{ type: "input_text", text: instruction }];
    for (let i = 0; i < files.length; i++) {
      const buffer = Buffer.from(await files[i].arrayBuffer());
      content.push({ type: "input_text", text: `사진 ${i}` });
      content.push({ type: "input_image", image_url: `data:${files[i].type};base64,${buffer.toString("base64")}`, detail: "low" });
    }
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-5.6-luna", input: [{ role: "user", content }], text: { format: { type: "json_object" } } }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result?.error?.message || "AI 분석 실패");
    const raw = result.output_text || (result.output || []).flatMap((item) => item.content || []).map((part) => part.text || "").join("\n");
    const photos = JSON.parse(raw).photos;
    if (!Array.isArray(photos) || photos.length !== files.length || new Set(photos.map((p) => p.index)).size !== files.length ||
        photos.some((p) => !Number.isInteger(p.index) || p.index < 0 || p.index >= files.length)) {
      throw new Error("AI 분석 결과가 불완전합니다. 다시 분석해주세요.");
    }
    return NextResponse.json({ photos });
  } catch (error) {
    return NextResponse.json({ error: error.message || "분석 실패" }, { status: 500 });
  }
}
