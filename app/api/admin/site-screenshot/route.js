import {
  reviewAiSchedule,
} from "../../../../lib/aiScheduleDate.mjs";

import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";

import {
  SCREENSHOT_MODEL,
  screenshotSchema,
  screenshotInstructions,
  normalizeScreenshot,
  validScreenshotDate,
} from "../../../../lib/siteScreenshot";

export const runtime = "nodejs";
export const maxDuration = 60;

const json = (body, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      Vary: "Authorization",
    },
  });

const fault = (
  message,
  status = 500,
  code = "ERROR"
) =>
  Object.assign(new Error(message), {
    status,
    code,
  });

async function authorize(request) {
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer (.+)$/i)?.[1];

  if (!token) {
    throw fault("다시 로그인해주세요.", 401);
  }

  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw fault(
      "서버 설정을 확인해주세요.",
      503
    );
  }

  const db = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data, error } =
    await db.auth.getUser(token);

  if (error || !data?.user) {
    throw fault(
      "로그인이 만료되었습니다.",
      401
    );
  }

  return { db, userId: data.user.id };
}

async function access(
  db,
  userId,
  requestId = null,
  hash = null
) {
  const { data, error } = await db.rpc(
    "site_screenshot_access",
    {
      p_user_id: userId,
      p_request_id: requestId,
      p_input_hash: hash,
    }
  );

  if (error || !data) {
    throw fault(
      "스크린샷 등록 SQL과 서버 설정을 확인해주세요.",
      503
    );
  }

  return data;
}

function accessResponse(data) {
  const status = {
    FORBIDDEN: 403,
    INVALID: 400,
    CONFLICT: 409,
    PENDING: 409,
    RETRY_NEW: 409,
    LIMIT: 429,
    RATE_LIMIT: 429,
  }[data.code] || 503;

  return json(
    {
      error: data.error,
      code: data.code,
      usage: data.usage,
    },
    status
  );
}

export async function GET(request) {
  try {
    const { db, userId } =
      await authorize(request);

    const data = await access(db, userId);

    return data.ok
      ? json({ usage: data.usage })
      : accessResponse(data);
  } catch (error) {
    return json(
      { error: error.message },
      error.status || 500
    );
  }
}

function imageType(bytes) {
  if (
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255
  ) {
    return "image/jpeg";
  }

  if (
    bytes.subarray(0, 8).equals(
      Buffer.from([
        137, 80, 78, 71, 13, 10, 26, 10,
      ])
    )
  ) {
    return "image/png";
  }

  if (
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }

  return null;
}

export async function POST(request) {
  let db;
  let userId;
  let companyId;
  let requestId;
  let reserved = false;
  let finishing = false;

  try {
    ({ db, userId } =
      await authorize(request));

    const permission =
      await access(db, userId);

    if (!permission.ok) {
      return accessResponse(permission);
    }

    if (!process.env.OPENAI_API_KEY) {
      throw fault(
        "OPENAI_API_KEY 설정을 확인해주세요.",
        503
      );
    }

    if (
      Number(
        request.headers.get("content-length") ||
          0
      ) > 4000000
    ) {
      throw fault(
        "업로드 합계는 3.5MB 이하로 줄여주세요.",
        413
      );
    }

    const form = await request.formData();

    requestId = String(
      form.get("requestId") || ""
    );

    const referenceDate = String(
      form.get("referenceDate") || ""
    );

    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        requestId
      ) ||
      (
        referenceDate &&
        !validScreenshotDate(referenceDate)
      )
    ) {
      throw fault(
        "요청 번호 또는 대화 기준일을 확인해주세요.",
        400
      );
    }

    const files = form.getAll("images");

    if (
      !files.length ||
      files.length > 5 ||
      files.some(
        (file) =>
          typeof file.arrayBuffer !==
            "function" ||
          !file.size ||
          file.size > 3500000
      ) ||
      files.reduce(
        (sum, file) => sum + file.size,
        0
      ) > 3500000
    ) {
      throw fault(
        "사진은 최대 5장, 합계 3.5MB 이하로 선택해주세요.",
        400
      );
    }

    const images = [];

    const hash = createHash("sha256")
      .update(referenceDate);

    for (const file of files) {
      const bytes = Buffer.from(
        await file.arrayBuffer()
      );

      const type = imageType(bytes);

      if (!type || type !== file.type) {
        throw fault(
          "JPG·PNG·WEBP 사진을 선택해주세요.",
          400
        );
      }

      hash
        .update(`${type}:${bytes.length}:`)
        .update(bytes);

      images.push({
        type: "input_image",
        image_url:
          `data:${type};base64,` +
          bytes.toString("base64"),
        detail: "high",
      });
    }

    const booking = await access(
      db,
      userId,
      requestId,
      hash.digest("hex")
    );

    if (!booking.ok) {
      return accessResponse(booking);
    }

    if (booking.cached) {
      return json({
        data: reviewAiSchedule(booking.data),
        usage: booking.usage,
        cached: true,
      });
    }

    companyId = booking.companyId;
    reserved = true;

    const response = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          Authorization:
            `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: SCREENSHOT_MODEL,
          store: false,
          max_output_tokens: 3500,
          instructions:
            screenshotInstructions(
              referenceDate
            ),
          input: [
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text:
                    "첨부한 대화 사진에서 한 현장의 등록 초안을 추출해주세요.",
                },
                ...images,
              ],
            },
          ],
          text: {
            format: {
              type: "json_schema",
              name: "site_screenshot",
              strict: true,
              schema: screenshotSchema,
            },
          },
        }),
        signal: AbortSignal.timeout(40000),
      }
    );

    if (!response.ok) {
      throw fault(
        "사진 분석에 실패했습니다. 잠시 후 새 분석을 시도해주세요.",
        502,
        "RETRY_NEW"
      );
    }

    const result = await response.json();

    if (result.status !== "completed") {
      throw fault(
        "분석을 완료하지 못했습니다. 사진을 줄여 다시 시도해주세요.",
        502,
        "RETRY_NEW"
      );
    }

    const output = (result.output || [])
      .flatMap(
        (item) => item.content || []
      )
      .filter(
        (item) =>
          item.type === "output_text"
      )
      .map((item) => item.text)
      .join("");

    let draft;

    try {
      draft = normalizeScreenshot(
        JSON.parse(output)
      );
    } catch (error) {
      throw fault(
        error.message === "MULTIPLE_SITES"
          ? "여러 현장이 섞여 있습니다. 한 현장씩 사진을 선택해주세요."
          : "현장 정보를 읽지 못했습니다. 글자가 선명한 사진을 선택해주세요.",
        422,
        "RETRY_NEW"
      );
    }

    finishing = true;

    const {
      data: saved,
      error,
    } = await db
      .from("site_screenshot_requests")
      .update({
        status: "succeeded",
        result: draft,
        model: SCREENSHOT_MODEL,
        token_usage: result.usage || null,
        finished_at:
          new Date().toISOString(),
      })
      .eq("company_id", companyId)
      .eq("request_id", requestId)
      .eq("user_id", userId)
      .eq("status", "pending")
      .select("request_id")
      .maybeSingle();

    if (error || !saved) {
      throw fault(
        "결과 저장 상태를 확인하지 못했습니다. 같은 사진으로 결과를 다시 확인해주세요.",
        503,
        "PENDING"
      );
    }

    reserved = false;

    const current =
      await access(db, userId);

    return json({
      data: draft,
      usage: current.ok
        ? current.usage
        : null,
    });
  } catch (error) {
    if (reserved && !finishing) {
      await db
        .from("site_screenshot_requests")
        .update({
          status: "failed",
          finished_at:
            new Date().toISOString(),
        })
        .eq("company_id", companyId)
        .eq("request_id", requestId)
        .eq("user_id", userId)
        .eq("status", "pending");
    }

    return json(
      {
        error: error.status
          ? error.message
          : "분석 연결에 실패했습니다. 잠시 후 다시 확인해주세요.",
        code:
          error.code ||
          (
            reserved
              ? "RETRY_NEW"
              : "ERROR"
          ),
      },
      error.status || 502
    );
  }
}
