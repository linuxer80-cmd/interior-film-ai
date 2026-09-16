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

    const { count: total, error: totalError } = await supabase
      .from("work_photos")
      .select("id", { count: "exact", head: true });

    if (totalError) throw totalError;

    const { count: beforeRemaining, error: countError } =
      await supabase
        .from("work_photos")
        .select("id", { count: "exact", head: true })
        .is("image_hash", null);

    if (countError) throw countError;

    const { data: photos, error: photosError } = await supabase
      .from("work_photos")
      .select("id, storage_path")
      .is("image_hash", null)
      .not("storage_path", "is", null)
      .order("created_at", { ascending: true })
      .limit(20);

    if (photosError) throw photosError;

    let processed = 0;
    let failed = 0;
    const errors = [];

    for (const photo of photos || []) {
      try {
        const { data: file, error: downloadError } =
          await supabase.storage
            .from("work-photos")
            .download(photo.storage_path);

        if (downloadError) throw downloadError;
        if (!file) throw new Error("사진 파일 없음");

        const buffer = Buffer.from(await file.arrayBuffer());

        const hash = crypto
          .createHash("sha256")
          .update(buffer)
          .digest("hex");

        const { error: updateError } = await supabase
          .from("work_photos")
          .update({ image_hash: hash })
          .eq("id", photo.id)
          .is("image_hash", null);

        if (updateError) throw updateError;

        processed++;
      } catch (error) {
        failed++;

        errors.push({
          id: photo.id,
          path: photo.storage_path,
          error: error?.message || "처리 실패",
        });
      }
    }

    const { count: remaining, error: finalCountError } =
      await supabase
        .from("work_photos")
        .select("id", { count: "exact", head: true })
        .is("image_hash", null);

    if (finalCountError) throw finalCountError;

    return NextResponse.json({
      success: true,
      total: total || 0,
      completed: (total || 0) - (remaining || 0),
      remaining: remaining || 0,
      this_batch: photos?.length || 0,
      processed,
      failed,
      previous_remaining: beforeRemaining || 0,
      errors,
    });
  } catch (error) {
    console.error("HASH REPAIR ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "HASH 복구 실패",
      },
      { status: 500 }
    );
  }
}
