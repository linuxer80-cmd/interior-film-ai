import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // 전체 사진 수
    const {
      count: total,
      error: totalError,
    } = await supabase
      .from("work_photos")
      .select("id", {
        count: "exact",
        head: true,
      });

    if (totalError) {
      throw totalError;
    }

    // 현재 HASH 없는 사진 수
    const {
      count: beforeRemaining,
      error: countError,
    } = await supabase
      .from("work_photos")
      .select("id", {
        count: "exact",
        head: true,
      })
      .is("image_hash", null);

    if (countError) {
      throw countError;
    }

    // HASH가 없는 사진 중 3장만 가져오기
    const {
      data: photos,
      error: photosError,
    } = await supabase
      .from("work_photos")
      .select("id, storage_path")
      .is("image_hash", null)
      .not("storage_path", "is", null)
      .order("created_at", {
        ascending: true,
      })
      .limit(3);

    if (photosError) {
      throw photosError;
    }

    let processed = 0;
    let failed = 0;

    const errors = [];

    // 사진을 한 장씩 안전하게 처리
    for (const photo of photos || []) {
      try {
        // Supabase Storage에서 기존 사진 다운로드
        const {
          data: file,
          error: downloadError,
        } = await supabase.storage
          .from("work-photos")
          .download(photo.storage_path);

        if (downloadError) {
          throw downloadError;
        }

        if (!file) {
          throw new Error(
            "Storage에서 사진 파일을 찾을 수 없습니다."
          );
        }

        // 파일 → Buffer
        const arrayBuffer =
          await file.arrayBuffer();

        const buffer =
          Buffer.from(arrayBuffer);

        // SHA-256 HASH 생성
        const hash = crypto
          .createHash("sha256")
          .update(buffer)
          .digest("hex");

        // 해당 사진의 image_hash만 업데이트
        const {
          error: updateError,
        } = await supabase
          .from("work_photos")
          .update({
            image_hash: hash,
          })
          .eq("id", photo.id)
          .is("image_hash", null);

        if (updateError) {
          throw updateError;
        }

        processed++;
      } catch (error) {
        failed++;

        errors.push({
          id: photo.id,
          path: photo.storage_path,
          error:
            error?.message ||
            "처리 실패",
        });

        console.error(
          "사진 HASH 처리 오류:",
          photo.id,
          error
        );
      }
    }

    // 처리 후 남은 사진 수 다시 확인
    const {
      count: remaining,
      error: finalCountError,
    } = await supabase
      .from("work_photos")
      .select("id", {
        count: "exact",
        head: true,
      })
      .is("image_hash", null);

    if (finalCountError) {
      throw finalCountError;
    }

    const completed =
      (total || 0) -
      (remaining || 0);

    return NextResponse.json({
      success: true,

      total:
        total || 0,

      completed,

      remaining:
        remaining || 0,

      previous_remaining:
        beforeRemaining || 0,

      this_batch:
        photos?.length || 0,

      processed,

      failed,

      progress:
        total
          ? `${Math.round(
              (completed / total) * 100
            )}%`
          : "0%",

      finished:
        (remaining || 0) === 0,

      errors,
    });
  } catch (error) {
    console.error(
      "HASH REPAIR ERROR:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error?.message ||
          "HASH 복구 실패",
      },
      {
        status: 500,
      }
    );
  }
      }
