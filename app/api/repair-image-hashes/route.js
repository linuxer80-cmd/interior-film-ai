import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH_SIZE = 3;

const json = (body, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
    },
  });

function eligible(
  db,
  columns = "id",
  options = {}
) {
  return db
    .from("work_photos")
    .select(columns, options)
    .not("storage_path", "is", null)
    .neq("storage_path", "");
}

export async function GET(request) {
  try {
    const token = request.headers
      .get("authorization")
      ?.match(/^Bearer\s+(.+)$/i)?.[1]
      ?.trim();

    if (!token) {
      return json(
        {
          success: false,
          error: "슈퍼관리자 로그인이 필요합니다.",
        },
        401
      );
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      return json(
        {
          success: false,
          error: "서버 설정을 확인해주세요.",
        },
        503
      );
    }

    const db = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const {
      data: auth,
      error: authError,
    } = await db.auth.getUser(token);

    if (authError || !auth?.user) {
      return json(
        {
          success: false,
          error: "로그인이 만료되었습니다.",
        },
        401
      );
    }

    const {
      data: admin,
      error: adminError,
    } = await db
      .from("super_admins")
      .select("user_id")
      .eq("user_id", auth.user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (adminError) throw adminError;

    if (!admin) {
      return json(
        {
          success: false,
          error:
            "슈퍼관리자만 전체 사진 해시를 복구할 수 있습니다.",
        },
        403
      );
    }

    const {
      count: total,
      error: totalError,
    } = await eligible(db, "id", {
      count: "exact",
      head: true,
    });

    if (totalError) throw totalError;

    const {
      count: beforeRemaining,
      error: countError,
    } = await eligible(db, "id", {
      count: "exact",
      head: true,
    }).is("image_hash", null);

    if (countError) throw countError;

    let processed = 0;
    const errors = [];
    let photos = [];

    if (beforeRemaining > 0) {
      const result = await eligible(
        db,
        "id,storage_path,created_at"
      )
        .is("image_hash", null)
        .order("created_at", {
          ascending: true,
        })
        .limit(BATCH_SIZE);

      if (result.error) throw result.error;

      photos = result.data || [];

      for (const photo of photos) {
        try {
          const {
            data: file,
            error: downloadError,
          } = await db.storage
            .from("work-photos")
            .download(photo.storage_path);

          if (downloadError) throw downloadError;

          if (!file) {
            throw new Error(
              "사진 파일을 찾지 못했습니다."
            );
          }

          const buffer = Buffer.from(
            await file.arrayBuffer()
          );

          if (!buffer.length) {
            throw new Error(
              "사진 파일이 비어 있습니다."
            );
          }

          const hash = crypto
            .createHash("sha256")
            .update(buffer)
            .digest("hex");

          const {
            data: updated,
            error: updateError,
          } = await db
            .from("work_photos")
            .update({
              image_hash: hash,
            })
            .eq("id", photo.id)
            .is("image_hash", null)
            .select("id")
            .maybeSingle();

          if (updateError) throw updateError;

          if (updated?.id) {
            processed++;
          }
        } catch (error) {
          errors.push({
            id: photo.id,
            path: photo.storage_path,
            error: error?.message || "처리 실패",
          });
        }
      }
    }

    const {
      count: remaining,
      error: finalError,
    } = await eligible(db, "id", {
      count: "exact",
      head: true,
    }).is("image_hash", null);

    if (finalError) throw finalError;

    const safeTotal = Number(total || 0);
    const safeRemaining = Number(remaining || 0);

    const completed = Math.max(
      0,
      safeTotal - safeRemaining
    );

    const percent = safeTotal
      ? Math.min(
          100,
          Math.round(
            (completed / safeTotal) * 100
          )
        )
      : 100;

    return json({
      success: true,
      total: safeTotal,
      completed,
      remaining: safeRemaining,
      previous_remaining: Number(
        beforeRemaining || 0
      ),
      this_batch: photos.length,
      processed,
      failed: errors.length,
      progress: `${percent}%`,
      finished: safeRemaining === 0,
      errors,
    });
  } catch (error) {
    console.error(
      "Hash repair error:",
      error?.name,
      error?.code
    );

    return json(
      {
        success: false,
        error:
          "해시 복구에 실패했습니다. 서버 설정과 권한을 확인해주세요.",
      },
      503
    );
  }
}
