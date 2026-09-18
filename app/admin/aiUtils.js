export async function createEmbedding(text) {
  if (!String(text || "").trim()) {
    return null;
  }

  const response = await fetch("/api/embedding", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
    }),
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

export async function analyzeImage(
  file,
  photoType
) {
  const formData = new FormData();

  formData.append("image", file);
  formData.append("photo_type", photoType);

  const response = await fetch("/api/analyze", {
    method: "POST",
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

    description:
      result?.description ||
      result?.ai_description ||
      result?.analysis?.description ||
      "",

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
      formData.append("before", file);
    });

    afterFiles.forEach((file) => {
      formData.append("after", file);
    });

    const response = await fetch("/api/analyze", {
      method: "POST",
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
