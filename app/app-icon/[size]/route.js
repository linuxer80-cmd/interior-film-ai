import { ImageResponse } from "next/og";

export const dynamic = "force-static";

export function generateStaticParams() {
  return [{ size: "192" }, { size: "512" }];
}

export async function GET(request, { params }) {
  const { size: requestedSize } = await params;

  if (!["192", "512"].includes(requestedSize)) {
    return new Response("Not found", { status: 404 });
  }

  const size = Number(requestedSize);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#182620",
        }}
      >
        <div
          style={{
            width: size * 0.7,
            height: size * 0.7,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: `${Math.round(size * 0.018)}px solid #d7bb7a`,
            borderRadius: size * 0.14,
            color: "#d7bb7a",
            fontSize: size * 0.4,
            fontWeight: 700,
          }}
        >
          F
        </div>
      </div>
    ),
    {
      width: size,
      height: size,
    }
  );
}
