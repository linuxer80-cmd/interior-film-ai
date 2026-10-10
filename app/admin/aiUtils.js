import { doorStructureDescription } from "../utils/doorStructure.mjs";
import { supabase } from "../../lib/supabase";

export async function createEmbedding(text) {
  if (!String(text || "").trim()) {
    return null;
  }

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session?.access_token) {
    throw new Error(
      "관리자 로그인이 필요합니다. 다시 로그인해주세요."
    );
  }

  const response = await fetch("/api/embedding", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ text }),
  });

  let result = {};

  try {
    result = await response.json();
  } catch {}

  if (!response.ok) {
    throw new Error(
      result?.error || "임베딩 생성 실패"
    );
  }

  return result.embedding || null;
}

export async function analyzeImage(file, photoType) {
  const formData = new FormData();

  formData.append("image", file);
  formData.append("photoType", photoType);

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("관리자 로그인이 필요합니다.");
  }

  const response = await fetch("/api/analyze", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
    body: formData,
  });

  let result = {};

  try {
    result = await response.json();
  } catch {}

  if (!response.ok) {
    throw new Error(
      result?.error || "AI 사진 분석 실패"
    );
  }

  return {
    category:
      result?.category ||
      result?.analysis?.category ||
      "",

    sub_category:
      result?.sub_category ||
      result?.subcategory ||
      result?.analysis?.sub_category ||
      "",

    description: doorStructureDescription(
      result?.analysis || result
    ),

    tags: Array.isArray(result?.tags)
      ? result.tags
      : Array.isArray(result?.ai_tags)
      ? result.ai_tags
      : Array.isArray(result?.analysis?.tags)
      ? result.analysis.tags
      : [],
  };
}

export async function compareMultipleBeforeAfter(
  beforeFiles,
  afterFiles
) {
  if (
    beforeFiles.length === 0 ||
    afterFiles.length === 0
  ) {
    return null;
  }

  try {
    const formData = new FormData();

    beforeFiles.forEach((file) => {
      formData.append("beforeImages", file);
    });

    afterFiles.forEach((file) => {
      formData.append("afterImages", file);
    });

    formData.append("photoType", "compare");

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      throw new Error("관리자 로그인이 필요합니다.");
    }

    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      return null;
    }

    const result = await response.json();

    return {
      description:
        result?.comparison ||
        result?.description ||
        result?.analysis?.description ||
        "",
    };
  } catch (error) {
    console.error("전후 비교:", error);
    return null;
  }
}
