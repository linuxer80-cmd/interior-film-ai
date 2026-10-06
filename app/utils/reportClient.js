import { supabase } from "../../lib/supabase";

export async function reportRequest(path, body) {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) throw Error("다시 로그인해주세요.");

  const response = await fetch(path, {
    method: body ? "POST" : "GET",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const result = await response.json().catch(() => null);
  if (!result) {
    throw Error(`서버 응답을 확인할 수 없습니다 (${response.status}). 최신 배포를 확인해주세요.`);
  }
  if (!response.ok) throw Error(result.error || "처리하지 못했습니다.");
  return result;
}

let database;

function openDrafts() {
  if (!database) {
    database = new Promise((resolve, reject) => {
      const request = indexedDB.open("filmjang-report-drafts", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("drafts");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        database = null;
        reject(request.error);
      };
    });
  }
  return database;
}

export async function draftStore(key, action, value) {
  const db = await openDrafts();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("drafts", action === "get" ? "readonly" : "readwrite");
    const store = tx.objectStore("drafts");
    const req = action === "get"
      ? store.get(key)
      : action === "delete"
        ? store.delete(key)
        : store.put(value, key);
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error || Error("임시저장 실패"));
    tx.onabort = () => reject(tx.error || Error("임시저장 중단"));
  });
}

export async function compressReportPhoto(file) {
  if (!file.type.startsWith("image/")) throw Error("이미지 파일을 선택해주세요.");
  if (file.size > 25 * 1024 * 1024) {
    throw Error(`${file.name}: 25MB 이하 사진을 선택해주세요.`);
  }
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return file;

  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const ratio = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio));

    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.85));
    return blob && blob.size < file.size
      ? new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", {
          type: "image/jpeg",
          lastModified: file.lastModified,
        })
      : file;
  } catch {
    return file;
  } finally {
    bitmap?.close();
  }
}

export async function uploadReportPhotos({
  entries, siteId, owner, onProgress, onUploaded,
}) {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) throw Error("다시 로그인해주세요.");

  let companyId;
  if (owner) {
    const profile = await supabase.from("profiles")
      .select("company_id").eq("id", data.session.user.id).single();
    if (profile.error) throw profile.error;
    companyId = profile.data.company_id;
  }

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.uploaded) {
      onProgress(`${i + 1}/${entries.length}장 · 등록된 사진 유지`);
      continue;
    }

    onProgress(`${i + 1}/${entries.length}장 업로드 중 · ${entry.file.name}`);

    try {
      if (owner) {
        const extension = entry.file.name.split(".").pop().replace(/[^a-z0-9]/gi, "") || "jpg";
        const path = `sites/${companyId}/${siteId}/${entry.type}/${entry.id}.${extension}`;

        const uploaded = await supabase.storage.from("work-photos").upload(path, entry.file, {
          upsert: false,
          contentType: entry.file.type,
        });
        if (uploaded.error && String(uploaded.error.statusCode) !== "409") {
          throw uploaded.error;
        }

        const existing = await supabase.from("site_photos").select("id")
          .eq("company_id", companyId)
          .eq("site_id", siteId)
          .eq("storage_path", path)
          .maybeSingle();
        if (existing.error) throw existing.error;

        if (!existing.data) {
          const row = await supabase.from("site_photos").insert({
            company_id: companyId,
            site_id: siteId,
            photo_type: entry.type,
            storage_path: path,
            uploaded_by: data.session.user.id,
            description: "완료보고 사진",
          });
          if (row.error) throw row.error;
        }
      } else {
        const form = new FormData();
        form.append("siteId", siteId);
        form.append("photoType", entry.type);
        form.append("photos", entry.file);

        const response = await fetch("/api/worker/site-photos", {
          method: "POST",
          headers: { Authorization: `Bearer ${data.session.access_token}` },
          body: form,
        });
        const result = await response.json().catch(() => null);
        if (!response.ok || !result?.success) {
          throw Error(result?.error || "사진 업로드 실패");
        }
      }

      await onUploaded(entry.id);
      onProgress(`${i + 1}/${entries.length}장 업로드 완료`);
    } catch (error) {
      throw Error(`${entry.file.name}: ${error.message}. 다시 저장하면 완료된 사진은 건너뜁니다.`);
    }
  }
}
