import { createClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";
import { isIP } from "node:net";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const reply = (body, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...(status === 429
        ? { "Retry-After": "900" }
        : {}),
    },
  });

const clean = (value) =>
  typeof value === "string" ? value.trim() : "";

const compact = (value) =>
  clean(value).replace(/\s/g, "");

const noMatch =
  "일치하는 계정을 확인하지 못했습니다. 입력 내용을 확인하거나 소속 회사 관리자에게 문의해주세요.";

export async function POST(request) {
  try {
    const url =
      process.env.NEXT_PUBLIC_SUPABASE_URL;

    const key =
      process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      return reply(
        {
          error: "계정 찾기 설정을 확인해주세요.",
        },
        503
      );
    }

    // Vercel이 덮어쓰는 헤더만 신뢰합니다.
    // 일반 forwarded 헤더는 사용하지 않습니다.
    const ip =
      process.env.VERCEL === "1"
        ? clean(
            request.headers.get("x-vercel-forwarded-for")
          )
            .split(",")[0]
            .trim()
        : process.env.NODE_ENV === "development"
          ? "127.0.0.1"
          : "";

    if (!isIP(ip)) {
      return reply(
        {
          error:
            "접속 정보를 확인하지 못했습니다. 잠시 후 다시 시도해주세요.",
        },
        503
      );
    }

    if (
      !request.headers
        .get("content-type")
        ?.includes("application/json")
    ) {
      return reply(
        { error: "잘못된 요청입니다." },
        400
      );
    }

    const raw = await request.text();

    if (raw.length > 2048) {
      return reply(
        { error: "입력 내용이 너무 깁니다." },
        400
      );
    }

    let body;

    try {
      body = JSON.parse(raw);
    } catch {
      return reply(
        { error: "잘못된 요청입니다." },
        400
      );
    }

    const company = compact(body?.company);
    const name = compact(body?.name);

    const phone = clean(body?.phone).replace(
      /[\s()-]/g,
      ""
    );

    if (
      !company ||
      company.length > 80 ||
      !name ||
      name.length > 40 ||
      !/^01[016789]\d{7,8}$/.test(phone)
    ) {
      return reply(
        {
          error:
            "회사명, 이름, 휴대폰 번호를 정확히 입력해주세요.",
        },
        400
      );
    }

    const hash = (value) =>
      createHmac("sha256", key)
        .update(value)
        .digest("hex");

    const db = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data, error } = await db.rpc(
      "lookup_worker_account",
      {
        p_ip_key: hash(`ip:${ip}`),
        p_person_key: hash(`phone:${phone}`),
        p_company: company,
        p_name: name,
        p_phone: phone,
      }
    );

    if (error) throw error;

    if (data?.limited) {
      return reply(
        {
          error:
            "조회 횟수를 초과했습니다. 15분 후 다시 시도해주세요.",
        },
        429
      );
    }

    if (!data?.user_id) {
      return reply({ message: noMatch });
    }

    const {
      data: auth,
      error: authError,
    } = await db.auth.admin.getUserById(
      data.user_id
    );

    if (authError) {
      if (authError.status === 404) {
        return reply({ message: noMatch });
      }

      throw authError;
    }

    const email = auth?.user?.email;

    if (!email || !email.includes("@")) {
      return reply({ message: noMatch });
    }

    const [local, domain] = email.split("@");

    // 짧은 이메일도 전체 앞부분이 드러나지 않도록
    // 최소 한 글자를 숨깁니다.
    const visible = local.slice(
      0,
      Math.min(
        2,
        Math.max(0, local.length - 1)
      )
    );

    return reply({
      maskedEmail: `${visible}***@${domain}`,
    });
  } catch {
    return reply(
      {
        error:
          "계정 조회를 처리하지 못했습니다. 잠시 후 다시 시도해주세요.",
      },
      503
    );
  }
}
