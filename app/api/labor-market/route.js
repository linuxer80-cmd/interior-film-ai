import {
  privateAuth,
  privateJson as json,
  cleanPrivate,
  uuid,
} from "../../../lib/workerPrivate";

import {
  publicProfileFields,
  dayInKorea,
  fail,
  cleanProfile,
  cleanJob,
  nextApplication,
} from "../../../lib/laborMarket.mjs";

export const runtime = "nodejs";

async function auth(request) {
  const result = await privateAuth(request, false);
  if (result.error) throw fail(result.error, result.status);

  if (result.user.is_anonymous || !result.user.email_confirmed_at) {
    throw fail("이메일 인증을 완료해주세요.", 403);
  }

  const profile = await result.db
    .from("profiles")
    .select("company_id,role,is_active")
    .eq("id", result.user.id)
    .maybeSingle();

  if (profile.error) throw profile.error;

  if (profile.data?.is_active === false) {
    throw fail("사용이 중지된 계정입니다.", 403);
  }

  let companyId = null;

  if (profile.data?.role === "owner" && profile.data.company_id) {
    const company = await result.db
      .from("companies")
      .select("id,is_active")
      .eq("id", profile.data.company_id)
      .maybeSingle();

    if (company.error) throw company.error;

    if (company.data && company.data.is_active !== false) {
      companyId = company.data.id;
    }
  }

  return { ...result, companyId };
}

const value = result => {
  if (result.error) throw result.error;
  return result.data;
};

async function photos(db, rows) {
  return Promise.all(rows.map(async row => {
    const copy = { ...row };
    delete copy.photo_path;

    if (row.photo_path) {
      const signed = await db.storage
        .from("labor-avatars")
        .createSignedUrl(row.photo_path, 300);

      copy.photo_url = signed.error ? "" : signed.data.signedUrl;
    }

    return copy;
  }));
}

function errorResponse(error) {
  console.error("구인·구직 오류:", error.code || error.message);

  return json({
    error: error.status
      ? error.message
      : ["42P01", "PGRST205", "PGRST202"].includes(error.code)
        ? "구인·구직 SQL을 먼저 실행해주세요."
        : "처리하지 못했습니다. 잠시 후 다시 확인해주세요.",
  }, error.status || 503);
}

export async function GET(request) {
  try {
    const { db, user, companyId } = await auth(request);
    const params = new URL(request.url).searchParams;

    if (params.get("mode") === "me") {
      const profile = value(await db
        .from("labor_profiles")
        .select(publicProfileFields)
        .eq("user_id", user.id)
        .maybeSingle());

      let personal = value(await db
        .from("labor_personal_details")
        .select("phone,bank_name,account_number,account_holder,departure_address")
        .eq("user_id", user.id)
        .maybeSingle());

      let defaults = null;

      if (!profile || !personal) {
        const linked = value(await db
          .from("workers")
          .select("id,company_id,name,phone")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .limit(1)
          .maybeSingle());

        if (linked) {
          defaults = { name: linked.name || "" };

          if (!personal) {
            personal = {
              phone: linked.phone || "",
              ...value(await db
                .from("worker_private_details")
                .select("bank_name,account_number,account_holder,departure_address")
                .eq("worker_id", linked.id)
                .eq("company_id", linked.company_id)
                .maybeSingle()),
            };
          }
        }
      }

      return json({
        profile: profile ? (await photos(db, [profile]))[0] : null,
        defaults,
        personal,
        manager: Boolean(companyId),
      });
    }

    const ownProfile = value(await db
      .from("labor_profiles")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle());

    if (!companyId && !ownProfile) {
      throw fail("개인설정에서 시공자 프로필을 등록해주세요.", 403);
    }

    const page = Math.max(
      0,
      Math.min(1000, Number.parseInt(params.get("page") || "0", 10) || 0)
    );

    let jobsQuery = db
      .from("labor_jobs")
      .select("*")
      .order("created_at", { ascending: false })
      .range(page * 30, page * 30 + 29);

    if (params.get("mine") === "1") {
      if (!companyId) throw fail("관리자 권한이 필요합니다.", 403);
      jobsQuery = jobsQuery.eq("company_id", companyId);
    } else {
      jobsQuery = jobsQuery
        .eq("status", "open")
        .gte("end_date", dayInKorea());
    }

    if (params.get("region")) {
      jobsQuery = jobsQuery.ilike(
        "region",
        `%${params.get("region").slice(0, 100).replace(/[%_]/g, "")}%`
      );
    }

    const jobs = value(await jobsQuery);

    let applicationsQuery = db
      .from("labor_applications")
      .select("*")
      .order("updated_at", { ascending: false });

    const applications = companyId
      ? jobs.length
        ? value(await applicationsQuery
            .in(
              "job_id",
              jobs
                .filter(j => j.company_id === companyId)
                .map(j => j.id)
                .concat("00000000-0000-0000-0000-000000000000")
            )
            .limit(300))
        : []
      : value(await applicationsQuery
          .eq("user_id", user.id)
          .limit(300));

    const missingIds = [...new Set(
      applications
        .map(a => a.job_id)
        .filter(id => !jobs.some(j => j.id === id))
    )];

    const applicationJobs = missingIds.length
      ? value(await db
          .from("labor_jobs")
          .select("*")
          .in("id", missingIds))
      : [];

    const companyIds = [...new Set(
      [...jobs, ...applicationJobs].map(j => j.company_id)
    )];

    const companies = companyIds.length
      ? value(await db
          .from("companies")
          .select("id,company_name")
          .in("id", companyIds))
      : [];

    for (const job of [...jobs, ...applicationJobs]) {
      job.company_name =
        companies.find(c => c.id === job.company_id)?.company_name || "업체";
    }

    let candidates = [];

    if (companyId) {
      let query = db
        .from("labor_profiles")
        .select(publicProfileFields)
        .eq("seeking", true)
        .eq("published", true)
        .order("updated_at", { ascending: false })
        .range(page * 30, page * 30 + 29);

      if (params.get("region")) {
        query = query.ilike(
          "region",
          `%${params.get("region").slice(0, 100).replace(/[%_]/g, "")}%`
        );
      }

      if (params.get("skill")) {
        query = query.contains("skills", [
          params.get("skill").slice(0, 40),
        ]);
      }

      if (params.get("date")) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(params.get("date"))) {
          throw fail("날짜를 확인해주세요.");
        }
        query = query.contains("available_dates", [params.get("date")]);
      }

      if (params.get("wage")) {
        const n = Number(params.get("wage"));

        if (!Number.isInteger(n) || n < 0 || n > 2000000) {
          throw fail("일당을 확인해주세요.");
        }

        query = query.lte("daily_wage", n);
      }

      if (params.get("experience")) {
        const n = Number(params.get("experience"));

        if (!Number.isInteger(n) || n < 0 || n > 70) {
          throw fail("경력을 확인해주세요.");
        }

        query = query.gte("experience_years", n);
      }

      candidates = await photos(db, value(await query));

      const ids = [...new Set(applications.map(a => a.user_id))];

      if (ids.length) {
        const applicantProfiles = await photos(
          db,
          value(await db
            .from("labor_profiles")
            .select(publicProfileFields)
            .in("user_id", ids))
        );

        const consenting = [...new Set(
          applications
            .filter(a =>
              a.share_phone &&
              ["applied", "accepted"].includes(a.status)
            )
            .map(a => a.user_id)
        )];

        const contacts = consenting.length
          ? value(await db
              .from("labor_personal_details")
              .select("user_id,phone")
              .in("user_id", consenting))
          : [];

        for (const a of applications) {
          a.profile = applicantProfiles.find(p => p.user_id === a.user_id);

          if (
            a.share_phone &&
            ["applied", "accepted"].includes(a.status)
          ) {
            a.phone =
              contacts.find(p => p.user_id === a.user_id)?.phone || "";
          }
        }
      }
    }

    return json({
      manager: Boolean(companyId),
      companyId,
      jobs,
      applicationJobs,
      applications,
      candidates,
      page,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    const { db, user, companyId } = await auth(request);

    if (request.headers.get("content-type")?.startsWith("multipart/form-data")) {
      if (Number(request.headers.get("content-length")) > 2200000) {
        throw fail("사진은 2MB 이하로 올려주세요.");
      }

      const form = await request.formData();
      const file = form.get("photo");

      if (
        !file ||
        !file.size ||
        file.size > 2097152 ||
        !["image/jpeg", "image/png", "image/webp"].includes(file.type)
      ) {
        throw fail("2MB 이하 JPG·PNG·WebP 사진을 선택해주세요.");
      }

      const bytes = new Uint8Array(await file.arrayBuffer());

      const valid = file.type === "image/jpeg"
        ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        : file.type === "image/png"
          ? [137, 80, 78, 71, 13, 10, 26, 10]
              .every((n, i) => bytes[i] === n)
          : String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
            String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";

      if (!valid) throw fail("지원하는 이미지 파일을 선택해주세요.");

      const existing = value(await db
        .from("labor_profiles")
        .select("photo_path")
        .eq("user_id", user.id)
        .maybeSingle());

      if (!existing) throw fail("개인 프로필을 먼저 저장해주세요.");

      const extension = file.type === "image/jpeg"
        ? "jpg"
        : file.type === "image/png" ? "png" : "webp";

      const path = `${user.id}/${crypto.randomUUID()}.${extension}`;

      value(await db.storage
        .from("labor-avatars")
        .upload(path, bytes, {
          contentType: file.type,
          upsert: false,
        }));

      const updated = await db
        .from("labor_profiles")
        .update({
          photo_path: path,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id)
        .select("user_id")
        .single();

      if (updated.error) {
        await db.storage.from("labor-avatars").remove([path]);
        throw updated.error;
      }

      if (existing.photo_path) {
        await db.storage.from("labor-avatars").remove([existing.photo_path]);
      }

      return json({ ok: true });
    }

    const body = await request.json();

    if (body.action === "profile") {
      const profile = cleanProfile(body.profile);
      const personal = cleanPrivate(body.personal);

      if (
        typeof body.personal.phone !== "string" ||
        !/^[0-9 +()-]{0,30}$/.test(body.personal.phone.trim())
      ) {
        throw fail("전화번호를 확인해주세요.");
      }

      value(await db.rpc("save_labor_profile", {
        p_user_id: user.id,
        p_profile: profile,
        p_private: {
          ...personal,
          phone: body.personal.phone.trim(),
        },
      }));

      return json({ ok: true });
    }

    if (body.action === "job") {
      if (!companyId) throw fail("관리자 권한이 필요합니다.", 403);

      const job = cleanJob(body.job);

      const saved = value(await db
        .from("labor_jobs")
        .insert({
          ...job,
          company_id: companyId,
          created_by: user.id,
        })
        .select("id")
        .single());

      return json({ ok: true, id: saved.id });
    }

    if (!uuid(body.jobId)) throw fail("구인 공고를 확인해주세요.");

    const job = value(await db
      .from("labor_jobs")
      .select("*")
      .eq("id", body.jobId)
      .maybeSingle());

    if (!job) throw fail("공고를 찾을 수 없습니다.", 404);

    const manager = ["close", "invite", "accept", "reject"]
      .includes(body.action);

    if (
      manager &&
      (!companyId || job.company_id !== companyId)
    ) {
      throw fail("본인 업체의 공고만 관리할 수 있습니다.", 403);
    }

    if (body.action === "close") {
      value(await db
        .from("labor_jobs")
        .update({ status: "closed" })
        .eq("id", job.id)
        .eq("company_id", companyId));

      return json({ ok: true });
    }

    if (!["invite", "apply", "withdraw", "accept", "reject"].includes(body.action)) {
      throw fail("요청을 확인해주세요.");
    }

    if (
      ["invite", "apply", "accept"].includes(body.action) &&
      (job.status !== "open" || job.end_date < dayInKorea())
    ) {
      throw fail("마감된 구인입니다.", 409);
    }

    const userId = manager ? body.userId : user.id;
    if (!uuid(userId)) throw fail("시공자를 확인해주세요.");

    const profile = value(await db
      .from("labor_profiles")
      .select("user_id,seeking,published")
      .eq("user_id", userId)
      .maybeSingle());

    if (!profile) throw fail("개인 프로필을 먼저 등록해주세요.");

    if (
      body.action === "invite" &&
      (!profile.seeking || !profile.published)
    ) {
      throw fail("현재 구직을 공개한 시공자만 제안할 수 있습니다.");
    }

    if (body.action === "apply") {
      const contact = value(await db
        .from("labor_personal_details")
        .select("phone")
        .eq("user_id", user.id)
        .maybeSingle());

      if (!contact?.phone) {
        throw fail("개인설정에 연락처를 먼저 등록해주세요.");
      }
    }

    const current = value(await db
      .from("labor_applications")
      .select("*")
      .eq("job_id", job.id)
      .eq("user_id", userId)
      .maybeSingle());

    const status = nextApplication(current?.status, body.action, manager);

    if (body.action === "apply" && body.share_phone !== true) {
      throw fail("지원할 업체에 연락처를 공유하는 데 동의해주세요.");
    }

    const share_phone = body.action === "apply"
      ? true
      : body.action === "withdraw" || body.action === "invite"
        ? false
        : current?.share_phone || false;

    const row = {
      job_id: job.id,
      user_id: userId,
      status,
      share_phone,
      updated_at: new Date().toISOString(),
    };

    if (current) {
      const changed = value(await db
        .from("labor_applications")
        .update(row)
        .eq("id", current.id)
        .eq("status", current.status)
        .eq("updated_at", current.updated_at)
        .select("id"));

      if (!changed.length) {
        throw fail("상태가 변경되었습니다. 새로고침해주세요.", 409);
      }
    } else {
      value(await db.from("labor_applications").insert(row));
    }

    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
  }
