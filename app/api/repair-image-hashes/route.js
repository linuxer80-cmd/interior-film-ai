import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { count: total, error: totalError } = await supabase
      .from("work_photos")
      .select("id", {
        count: "exact",
        head: true,
      });

    if (totalError) throw totalError;

    const { count: remaining, error: countError } = await supabase
      .from("work_photos")
      .select("id", {
        count: "exact",
        head: true,
      })
      .is("image_hash", null);

    if (countError) throw countError;

    const { data, error } = await supabase
      .from("work_photos")
      .select("id, storage_path, photo_type, category")
      .is("image_hash", null)
      .not("storage_path", "is", null)
      .order("created_at", {
        ascending: true,
      })
      .limit(20);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      mode: "CHECK_ONLY",
      total: total || 0,
      completed: (total || 0) - (remaining || 0),
      remaining: remaining || 0,
      batch: data?.length || 0,
      photos: data || [],
    });
  } catch (error) {
    console.error("HASH CHECK ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "HASH 확인 실패",
      },
      {
        status: 500,
      }
    );
  }
}
