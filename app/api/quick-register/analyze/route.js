import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { QUICK_REGISTER_CATEGORIES, resolveQuickRegisterCategory } from "../../../utils/quickRegisterCategories";

import { FILM_TARGET_RULES } from "../../../utils/visionRules";

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
        metadata.some((m) => !m || typeof m !== "object" || Array.isArray(m)) ||
        files.some((file) => !file.type?.startsWith("image/") || file.size > 5_000_000)) {
      return NextResponse.json({ error: "사진은 1~12장, 장당 5MB 이하로 분석해주세요." }, { status: 400 });
    }
    const instruction = `인테리어필름 시공 사진 ${files.length}장을 비교하라. 번호는 0부터 시작한다. 각 사진의 시공 부위(category: ${QUICK_REGISTER_CATEGORIES.join("/")}), 세부 부위(sub_category), 전후(before/after/unknown), 현장 번호(site_key), 실제 시공 대상 번호(object_key), 대상 구분 근거(object_evidence), 대상 동일성 확신(object_confidence), description, tags를 판별하라.
${FILM_TARGET_RULES}
[냉장고장과 붙박이장 구분]
- 냉장고가 들어가는 바닥까지 열린 큰 빈 칸, 깊은 측판·칸막이, 빈 칸 위의 수납부가 주 대상이면 category는 냉장고장이다. 냉장고가 빠져 있어도 냉장고장일 수 있다.
- 냉장고 자리의 옆판·상단 수납부·문짝을 각각 촬영한 사진도 같은 구조를 보여주는 다른 사진과 비교해 냉장고장으로 분류한다. 냉장고장 세부 부위는 전체/측판/상단 수납부/도어 중 보이는 범위로 적고 싱크대 상부장·하부장과 섞지 않는다.
- 붙박이장은 옷걸이 봉, 옷 수납용 내부 선반·서랍·연속 옷장 문 등 실제 근거가 있어야 한다. 흰색 가구, 키 큰 장, 빈 공간이라는 이유만으로 붙박이장으로 단정하지 않는다.
- 사진의 주 대상 구조를 판별하고 배경의 냉장고나 붙박이장 때문에 주 대상 분류를 바꾸지 않는다.
- category와 sub_category는 같은 대상을 가리켜야 하며 서로 모순되게 쓰지 않는다.
- 용도를 구분할 근거가 부족하거나 문짝만 보여 단정할 수 없으면 confidence는 low로 두고 description에 확인이 필요한 구조를 적는다. 사진이 선명한 것만으로 confidence를 high로 하지 않는다.
[현장과 실제 시공 대상은 별도로 구분]
- site_key는 현장, object_key는 그 현장 안의 물리적으로 동일한 장·문·시공 대상을 뜻한다. 같은 현장에 붙박이장이 여러 개면 서로 다른 object_key를 부여한다.
- 날짜, GPS, 흰색, 부위명, 비슷한 문짝만으로 같은 대상이라고 합치지 않는다. 문 개수와 폭 비율, 경첩·손잡이 위치, 거울·화장대 위치, 옆 벽·기둥·창문, 장의 끝과 주변 배치를 비교한다. 대상이 다르다는 구조적 차이가 있으면 반드시 분리한다.
- 예: 같은 2짝 장을 정면과 측면에서 촬영했다면 한 대상이다. 거울과 선반이 붙은 다른 구조의 장은 같은 날짜·현장·붙박이장 도어여도 별도 대상이다. 파일명 자체는 동일성 근거가 아니며 구조로 판단한다.
- 같은 대상을 다른 각도나 전후로 촬영한 사진은 같은 object_key와 같은 시공 범위의 sub_category를 쓴다. 한 대상에서 실제로 시공 범위가 다르면 sub_category로 구분한다.
- object_evidence에 사진 사이에서 일치하거나 다른 고정 구조를 구체적으로 적는다. 구분 근거가 부족하면 사진별 별도 object_key, object_confidence=low로 두어 사용자가 확인하게 한다. category confidence가 high여도 동일 대상이라는 뜻은 아니다.
- referenceSite/referenceObject가 있는 사진은 이전 요청에서 분류한 기준 사진이다. 기준 사진의 두 키를 그대로 유지한다. 새 사진이 기준과 같은 현장/대상이면 해당 키를 사용한다. 다른 대상이면 기존 키와 겹치지 않는 새 object_key를 사용한다. 기준 사진들끼리도 서로 다른 대상 키를 임의로 합치지 않는다.
- 다른 날짜라도 GPS와 타일·손잡이·배치가 일치하면 같은 현장일 수 있다. 같은 날짜나 GPS 근접만으로 현장을 확정하지 않는다.
[시공 전후]
- 동일한 물리적 대상임이 확인된 사진끼리 전후를 비교한다. 다른 장끼리 전후 한 쌍으로 만들지 않는다. 촬영 시각은 보조 근거다. 단독 사진 또는 판단이 불확실하면 photo_type=unknown이다.
사진 정보: ${JSON.stringify(metadata.map((m, index) => ({ index, takenAt: m.takenAt, latitude: m.latitude, longitude: m.longitude, referenceSite: m.referenceSite, referenceObject: m.referenceObject })))}.
JSON만 반환: {"photos":[{"index":0,"site_key":"new-site-1","object_key":"new-object-1","object_confidence":"low","object_evidence":"문 개수와 주변 구조 확인 필요","category":"싱크대","sub_category":"하부장","photo_type":"unknown","confidence":"low","description":"사진에 보이는 사실","tags":["특징"]}]}. 모든 index를 정확히 한 번씩 포함한다. confidence와 object_confidence는 각각 high/medium/low.`;
    const content = [{ type: "input_text", text: instruction }];
    for (let i = 0; i < files.length; i++) {
      const buffer = Buffer.from(await files[i].arrayBuffer());
      content.push({ type: "input_text", text: `사진 ${i}` });
      content.push({ type: "input_image", image_url: `data:${files[i].type};base64,${buffer.toString("base64")}`, detail: "high" });
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
    return NextResponse.json({ photos: photos.map((photo) => ({ ...photo, category: resolveQuickRegisterCategory(photo.category) })) });
  } catch (error) {
    return NextResponse.json({ error: error.message || "분석 실패" }, { status: 500 });
  }
}
