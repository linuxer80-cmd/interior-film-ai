import { dispatchLaborNotifications } from "../../../lib/laborPush";
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
  roughRegion,
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

  return json(
    {
      error: error.status
        ? error.message
        : ["42P01", "PGRST205", "PGRST202"].includes(error.code)
          ? "구인·구직 SQL을 먼저 실행해주세요."
          : "처리하지 못했습니다. 잠시 후 다시 확인해주세요.",
    },
    error.status || 503,
  );
}

export async function GET(request) {
  try {
    const { db, user, companyId } = await auth(request);
    const params = new URL(request.url).searchParams;

    if (params.get("mode") === "site") {
      if (!companyId) throw fail("관리자 권한이 필요합니다.", 403);

      const siteId = params.get("site");
      if (!uuid(siteId)) throw fail("현장을 확인해주세요.");

      const site = value(await db
        .from("sites")
        .select(
          "id,region,address,work_type,work_description,work_dates,schedule_start,schedule_end,status",
        )
        .eq("id", siteId)
        .eq("company_id", companyId)
        .maybeSingle());

      if (!site) {
        throw fail("본인 업체의 현장만 구인할 수 있습니다.", 403);
      }
      if (["cancelled", "completed"].includes(site.status)) {
        throw fail("진행할 현장을 선택해주세요.");
      }

      const dates = (site.work_dates || [])
        .filter(day => day >= dayInKorea())
        .sort();

      return json({
        site: {
          id: site.id,
          region: site.region || roughRegion(site.address),
          work_content: [site.work_type, site.work_description]
            .filter(Boolean)
            .join("\n"),
          work_dates: dates,
          work_date: dates[0] || site.schedule_start?.slice(0, 10),
          end_date: dates.at(-1) || site.schedule_end?.slice(0, 10),
        },
      });
    }

    if (params.get("mode") === "notifications") {
      const notices = value(await db
        .from("labor_notifications")
        .select("id,title,message,link,read_at,created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50));

      return json({ notifications: notices });
    }

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

    value(await db.rpc("expire_labor_jobs"));

    try {
      await dispatchLaborNotifications(db);
    } catch {
      // 푸시 오류가 있어도 저장된 알림과 게시판은 사용할 수 있습니다.
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
      Math.min(1000, Number.parseInt(params.get("page") || "0", 10) || 0),
    );

    let jobsQuery = db
      .from("labor_jobs")
      .select("*")
      .order("created_at", { ascending: false })
      .range(page * 30, page * 30 + 29);

    if (companyId) {
      jobsQuery = jobsQuery.eq("company_id", companyId);
    } else {
      jobsQuery = jobsQuery
        .eq("status", "open")
        .gte("end_date", dayInKorea());
    }

    if (!companyId && params.get("region")) {
      jobsQuery = jobsQuery.ilike(
        "region",
        `%${params.get("region").slice(0, 100).replace(/[%_]/g, "")}%`,
      );
    }

    if (!companyId && params.get("date")) {
      jobsQuery = jobsQuery.contains("work_dates", [params.get("date")]);
    }

    const jobs = value(await jobsQuery);

    if (params.get("job")) {
      if (!uuid(params.get("job"))) throw fail("공고를 확인해주세요.");

      const requested = value(await db
        .from("labor_jobs")
        .select("*")
        .eq("id", params.get("job"))
        .maybeSingle());

      if (requested && !jobs.some(job => job.id === requested.id)) {
        const application = !companyId
          ? value(await db
            .from("labor_applications")
            .select("id")
            .eq("job_id", requested.id)
            .eq("user_id", user.id)
            .maybeSingle())
          : null;

        if (
          companyId
            ? requested.company_id === companyId
            : Boolean(application)
        ) {
          jobs.push(requested);
        }
      }
    }

    for (const job of jobs) {
      job.address = job.region;
      delete job.created_by;
    }

    let applicationsQuery = db
      .from("labor_applications")
      .select("*")
      .order("updated_at", { ascending: false });

    if (!companyId && params.get("job")) {
      applicationsQuery = applicationsQuery.eq("job_id", params.get("job"));
    }

    const applications = companyId
      ? jobs.length
        ? value(await applicationsQuery
          .in(
            "job_id",
            jobs
              .filter(job => job.company_id === companyId)
              .map(job => job.id)
              .concat("00000000-0000-0000-0000-000000000000"),
          )
          .limit(300))
        : []
      : value(await applicationsQuery.eq("user_id", user.id).limit(300));

    const missingIds = [...new Set(
      applications
        .map(application => application.job_id)
        .filter(id => !jobs.some(job => job.id === id)),
    )];

    const applicationJobs = missingIds.length
      ? value(await db.from("labor_jobs").select("*").in("id", missingIds))
      : [];

    for (const job of applicationJobs) {
      job.address = job.region;
      delete job.created_by;
    }

    const companyIds = [...new Set(
      [...jobs, ...applicationJobs].map(job => job.company_id),
    )];

    const companies = companyIds.length
      ? value(await db
        .from("companies")
        .select("id,company_name")
        .in("id", companyIds))
      : [];

    for (const job of [...jobs, ...applicationJobs]) {
      job.company_name =
        companies.find(company => company.id === job.company_id)?.company_name ||
        "업체";
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
          `%${params.get("region").slice(0, 100).replace(/[%_]/g, "")}%`,
        );
      }
      if (params.get("skill")) {
        query = query.contains("skills", [params.get("skill").slice(0, 40)]);
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

      const ids = [...new Set(
        applications.map(application => application.user_id),
      )];

      if (ids.length) {
        const applicantProfiles = await photos(
          db,
          value(await db
            .from("labor_profiles")
            .select(publicProfileFields)
            .in("user_id", ids)),
        );

        const consenting = [...new Set(
          applications
            .filter(application =>
              application.share_phone &&
              ["applied", "accepted"].includes(application.status))
            .map(application => application.user_id),
        )];

        const contacts = consenting.length
          ? value(await db
            .from("labor_personal_details")
            .select("user_id,phone")
            .in("user_id", consenting))
          : [];

        for (const application of applications) {
          application.profile = applicantProfiles.find(
            profile => profile.user_id === application.user_id,
          );

          if (
            application.share_phone &&
            ["applied", "accepted"].includes(application.status)
          ) {
            application.phone =
              contacts.find(contact =>
                contact.user_id === application.user_id)?.phone || "";
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
      if (companyId) {
        throw fail("관리자는 구인 공고만 등록할 수 있습니다.", 403);
      }
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
          ? [137, 80, 78, 71, 13, 10, 26, 10].every(
            (number, index) => bytes[index] === number,
          )
          : String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
            String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";

      if (!valid) throw fail("지원하는 이미지 파일을 선택해주세요.");

      const existing = value(await db
        .from("labor_profiles")
        .select("photo_path")
        .eq("user_id", user.id)
        .maybeSingle());

      if (!existing) throw fail("개인 프로필을 먼저 저장해주세요.");

      const path =
        `${user.id}/${crypto.randomUUID()}.` +
        (file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp");

      value(await db.storage
        .from("labor-avatars")
        .upload(path, bytes, { contentType: file.type, upsert: false }));

      const updated = await db
        .from("labor_profiles")
        .update({ photo_path: path, updated_at: new Date().toISOString() })
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

    if (body.action === "read_notification") {
      if (!uuid(body.id)) throw fail("알림을 확인해주세요.");

      value(await db
        .from("labor_notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", body.id)
        .eq("user_id", user.id));

      return json({ ok: true });
    }

    if (body.action === "profile") {
      if (companyId) {
        throw fail("관리자는 구인 공고만 등록할 수 있습니다.", 403);
      }

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
        p_private: { ...personal, phone: body.personal.phone.trim() },
      }));

      return json({ ok: true });
    }

    if (body.action === "job") {
      if (!companyId) throw fail("관리자 권한이 필요합니다.", 403);
      if (!uuid(body.job?.site_id)) {
        throw fail("내 현장에서 구인하기를 눌러주세요.");
      }

      const site = value(await db
        .from("sites")
        .select("id,company_id,work_dates,schedule_start,schedule_end,status")
        .eq("id", body.job.site_id)
        .eq("company_id", companyId)
        .maybeSingle());

      if (!site || ["cancelled", "completed"].includes(site.status)) {
        throw fail("본인 업체의 진행할 현장만 구인할 수 있습니다.", 403);
      }

      const job = cleanJob(body.job);

      const days = Array.isArray(site.work_dates)
        ? site.work_dates.filter(
          day => day >= job.work_date && day <= job.end_date,
        )
        : [];

      if (!days.length && !Array.isArray(site.work_dates)) {
        const start = site.schedule_start?.slice(0, 10);
        const end = site.schedule_end?.slice(0, 10);

        if (
          !start || !end ||
          job.work_date < start ||
          job.end_date > end
        ) {
          throw fail("현장 일정 안에서 날짜를 선택해주세요.");
        }

        for (
          let day = new Date(job.work_date);
          day.toISOString().slice(0, 10) <= job.end_date;
          day.setUTCDate(day.getUTCDate() + 1)
        ) {
          days.push(day.toISOString().slice(0, 10));
          if (days.length > 90) {
            throw fail("90일 이내로 공고를 등록해주세요.");
          }
        }
      }

      if (!days.length) {
        throw fail(
          "선택한 기간에 시공 예정일이 없습니다. 내 현장의 일정을 먼저 등록해주세요.",
        );
      }

      const saved = value(await db
        .from("labor_jobs")
        .insert({
          ...job,
          site_id: site.id,
          work_dates: days,
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

    const manager = ["close", "invite", "accept", "reject"].includes(body.action);

    if (manager && (!companyId || job.company_id !== companyId)) {
      throw fail("본인 업체의 공고만 관리할 수 있습니다.", 403);
    }

    if (
      !["close", "invite", "apply", "withdraw", "accept", "reject"].includes(body.action)
    ) {
      throw fail("요청을 확인해주세요.");
    }

    if (companyId && ["apply", "withdraw"].includes(body.action)) {
      throw fail("관리자는 구인만 등록할 수 있습니다.", 403);
    }

    if (body.action === "apply" && body.share_phone !== true) {
      throw fail("지원할 업체에 프로필·연락처 공유를 동의해주세요.");
    }

    if (
      ["invite", "accept", "reject"].includes(body.action) &&
      !uuid(body.userId)
    ) {
      throw fail("시공자를 확인해주세요.");
    }

    const result = await db.rpc("labor_action", {
      p_actor: user.id,
      p_job: job.id,
      p_action: body.action,
      p_target: manager ? body.userId || null : null,
    });

    if (result.error) {
      if (result.error.code === "P0001") {
        throw fail(result.error.message, 409);
      }
      throw result.error;
    }

    try {
      await dispatchLaborNotifications(db, job.id);
    } catch (error) {
      console.error("구인 알림 발송 대기:", error.code || "push");
    }

    return json(result.data || { ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
