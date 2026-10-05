export const runtime = "nodejs";

export async function POST() {
  return Response.json(
    {
      success: false,
      error:
        "사용이 종료된 분석 주소입니다. 최신 화면에서 다시 시도해주세요.",
    },
    {
      status: 410,
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
