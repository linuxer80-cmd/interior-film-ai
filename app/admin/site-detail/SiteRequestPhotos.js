"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../../lib/supabase";

const PHOTO_BUCKET = "work-photos";
const SIGNED_URL_SECONDS = 1800;

/* =========================================================
   현장 요청사진 관리
========================================================= */

export default function SiteRequestPhotos({
  site,
  addSiteRequestPhotos,
  deleteSiteRequestPhoto,
}) {
  const [photos, setPhotos] = useState([]);

  const [loading, setLoading] = useState(false);

  const [message, setMessage] = useState("");

  const [photoUploading, setPhotoUploading] =
    useState(false);

  const [photoDeletingId, setPhotoDeletingId] =
    useState(null);

  const photoInputRef = useRef(null);

  /* =======================================================
     요청사진 불러오기
  ======================================================= */

  const loadRequestPhotos = useCallback(async () => {
    if (!site?.id) {
      setPhotos([]);
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const {
        data: photoData,
        error: photoError,
      } = await supabase
        .from("site_photos")
        .select(
          `
            id,
            photo_type,
            storage_path,
            photo_url,
            description,
            created_at
          `,
        )
        .eq("site_id", site.id)
        .eq("photo_type", "request")
        .order("created_at", {
          ascending: true,
        });

      if (photoError) {
        throw photoError;
      }

      const signedPhotos = await Promise.all(
        (photoData || []).map(
          async (photo) => {
            if (!photo.storage_path) {
              return {
                ...photo,
                signed_url:
                  photo.photo_url || "",
              };
            }

            const {
              data: signedData,
              error: signedError,
            } = await supabase.storage
              .from(PHOTO_BUCKET)
              .createSignedUrl(
                photo.storage_path,
                SIGNED_URL_SECONDS,
              );

            if (signedError) {
              console.error(
                "현장 요청사진 signed URL 오류:",
                signedError,
              );

              return {
                ...photo,
                signed_url:
                  photo.photo_url || "",
              };
            }

            return {
              ...photo,
              signed_url:
                signedData?.signedUrl || "",
            };
          },
        ),
      );

      setPhotos(signedPhotos || []);
    } catch (error) {
      console.error(
        "현장 요청사진 로드 오류:",
        error,
      );

      setPhotos([]);

      setMessage(
        `❌ 요청사진을 불러오지 못했습니다: ${
          error?.message || "알 수 없는 오류"
        }`,
      );
    } finally {
      setLoading(false);
    }
  }, [site?.id]);

  /* =======================================================
     현장 변경 시 요청사진 로드
  ======================================================= */

  useEffect(() => {
    loadRequestPhotos();
  }, [loadRequestPhotos]);

  /* =======================================================
     현장 변경 시 상태 초기화
  ======================================================= */

  useEffect(() => {
    setPhotoUploading(false);
    setPhotoDeletingId(null);
    setMessage("");
  }, [site?.id]);

  /* =======================================================
     요청사진 추가
  ======================================================= */

  async function handleRequestPhotoFiles(event) {
    const files = Array.from(
      event.target.files || [],
    ).filter((file) =>
      file?.type?.startsWith("image/"),
    );

    event.target.value = "";

    if (files.length === 0) {
      return;
    }

    if (!site?.id) {
      setMessage(
        "❌ 현장 정보를 확인할 수 없습니다.",
      );
      return;
    }

    if (
      typeof addSiteRequestPhotos !== "function"
    ) {
      setMessage(
        "❌ 사진 추가 기능을 사용할 수 없습니다.",
      );
      return;
    }

    setPhotoUploading(true);
    setMessage("");

    try {
      const result =
        await addSiteRequestPhotos({
          siteId: site.id,
          files,
        });

      if (!result?.success) {
        setMessage(
          `❌ ${
            result?.error ||
            "사진을 등록하지 못했습니다."
          }`,
        );

        return;
      }

      await loadRequestPhotos();

      setMessage(
        `✅ 요청사진 ${files.length}장이 등록되었습니다.`,
      );
    } catch (error) {
      console.error(
        "현장 요청사진 추가 오류:",
        error,
      );

      setMessage(
        `❌ 사진 등록 오류: ${
          error?.message || "알 수 없는 오류"
        }`,
      );
    } finally {
      setPhotoUploading(false);
    }
  }

  /* =======================================================
     요청사진 삭제
  ======================================================= */

  async function handleDeleteRequestPhoto(
    photo,
  ) {
    if (
      !photo?.id ||
      photoDeletingId ||
      photoUploading
    ) {
      return;
    }

    if (
      typeof deleteSiteRequestPhoto !==
      "function"
    ) {
      setMessage(
        "❌ 사진 삭제 기능을 사용할 수 없습니다.",
      );
      return;
    }

    const confirmed = window.confirm(
      "이 요청사진을 삭제할까요?",
    );

    if (!confirmed) {
      return;
    }

    setPhotoDeletingId(photo.id);
    setMessage("");

    try {
      const result =
        await deleteSiteRequestPhoto({
          siteId: site.id,
          photoId: photo.id,
          storagePath:
            photo.storage_path || null,
        });

      if (!result?.success) {
        setMessage(
          `❌ ${
            result?.error ||
            "사진을 삭제하지 못했습니다."
          }`,
        );

        return;
      }

      setPhotos((current) =>
        current.filter(
          (item) =>
            item.id !== photo.id,
        ),
      );

      setMessage(
        result?.storageWarning
          ? "✅ 사진 정보는 삭제되었습니다. 저장소 파일 정리는 확인이 필요합니다."
          : "✅ 요청사진이 삭제되었습니다.",
      );
    } catch (error) {
      console.error(
        "현장 요청사진 삭제 오류:",
        error,
      );

      setMessage(
        `❌ 사진 삭제 오류: ${
          error?.message ||
          "알 수 없는 오류"
        }`,
      );
    } finally {
      setPhotoDeletingId(null);
    }
  }

  /* =======================================================
     화면
  ======================================================= */

  return (
    <section
      style={{
        marginTop: "18px",
        paddingTop: "14px",
        borderTop:
          "1px solid #e5e7eb",
      }}
    >
      {/* =========================
          제목 / 사진 추가
      ========================= */}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent:
            "space-between",
          gap: "10px",
          marginBottom: "10px",
        }}
      >
        <div>
          <div
            style={{
              fontSize: "14px",
              fontWeight: "900",
              color: "#111827",
            }}
          >
            📷 시공 요청사진
          </div>

          <div
            style={{
              marginTop: "3px",
              fontSize: "11px",
              fontWeight: "700",
              color: "#64748b",
            }}
          >
            {photos.length}장
          </div>
        </div>

        <div>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={
              handleRequestPhotoFiles
            }
            disabled={
              photoUploading ||
              Boolean(photoDeletingId)
            }
            style={{
              display: "none",
            }}
          />

          <button
            type="button"
            onClick={() =>
              photoInputRef.current?.click()
            }
            disabled={
              photoUploading ||
              Boolean(photoDeletingId)
            }
            style={{
              flex: "0 0 auto",

              border: "none",

              borderRadius: "9px",

              padding: "9px 11px",

              background: "#2563eb",

              color: "#ffffff",

              fontSize: "12px",
              fontWeight: "900",

              cursor:
                photoUploading ||
                photoDeletingId
                  ? "not-allowed"
                  : "pointer",

              opacity:
                photoUploading ||
                photoDeletingId
                  ? 0.6
                  : 1,
            }}
          >
            {photoUploading
              ? "업로드 중..."
              : "+ 사진 추가"}
          </button>
        </div>
      </div>

      {/* =========================
          메시지
      ========================= */}

      {message && (
        <div
          style={{
            marginBottom: "10px",

            padding: "9px 10px",

            borderRadius: "9px",

            background:
              message.startsWith("✅")
                ? "#f0fdf4"
                : "#fef2f2",

            color:
              message.startsWith("✅")
                ? "#166534"
                : "#b91c1c",

            fontSize: "11px",
            fontWeight: "800",

            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {message}
        </div>
      )}

      {/* =========================
          로딩
      ========================= */}

      {loading ? (
        <LoadingBox />
      ) : photos.length === 0 ? (
        <EmptyBox
          text="등록된 요청사진이 없습니다."
        />
      ) : (
        <div
          style={{
            display: "grid",

            gridTemplateColumns:
              "repeat(2, minmax(0, 1fr))",

            gap: "8px",
          }}
        >
          {photos.map(
            (photo, index) => (
              <PhotoCard
                key={photo.id}
                photo={photo}
                index={index}
                deleting={
                  photoDeletingId ===
                  photo.id
                }
                disabled={
                  photoUploading ||
                  Boolean(
                    photoDeletingId,
                  )
                }
                onDelete={() =>
                  handleDeleteRequestPhoto(
                    photo,
                  )
                }
              />
            ),
          )}
        </div>
      )}
    </section>
  );
}

/* =========================================================
   요청사진 카드
========================================================= */

function PhotoCard({
  photo,
  index,
  deleting = false,
  disabled = false,
  onDelete,
}) {
  if (!photo.signed_url) {
    return (
      <div
        style={{
          position: "relative",

          aspectRatio: "1 / 1",

          display: "flex",

          alignItems: "center",
          justifyContent: "center",

          padding: "10px",

          border:
            "1px solid #e2e8f0",

          borderRadius: "11px",

          background: "#f8fafc",

          color: "#94a3b8",

          fontSize: "11px",
          fontWeight: "700",

          textAlign: "center",
        }}
      >
        사진을 불러올 수 없습니다.

        <button
          type="button"
          onClick={onDelete}
          disabled={disabled}
          style={{
            position: "absolute",

            top: "6px",
            right: "6px",

            border: "none",

            borderRadius: "8px",

            padding: "6px 7px",

            background:
              "rgba(185,28,28,0.90)",

            color: "#ffffff",

            fontSize: "11px",
            fontWeight: "900",

            cursor: disabled
              ? "not-allowed"
              : "pointer",

            opacity: disabled
              ? 0.6
              : 1,
          }}
        >
          {deleting
            ? "삭제 중"
            : "삭제"}
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        position: "relative",

        aspectRatio: "1 / 1",

        overflow: "hidden",

        borderRadius: "11px",

        border:
          "1px solid #e2e8f0",

        background: "#f8fafc",
      }}
    >
      {/* 사진 확대 */}

      <a
        href={photo.signed_url}
        target="_blank"
        rel="noreferrer"
        style={{
          display: "block",
          width: "100%",
          height: "100%",
        }}
      >
        <img
          src={photo.signed_url}
          alt={`시공 요청사진 ${
            index + 1
          }`}
          loading="lazy"
          style={{
            width: "100%",
            height: "100%",

            objectFit: "cover",

            display: "block",
          }}
        />
      </a>

      {/* 사진 번호 */}

      <div
        style={{
          position: "absolute",

          left: "6px",
          bottom: "6px",

          padding: "3px 6px",

          borderRadius: "999px",

          background:
            "rgba(15,23,42,0.72)",

          color: "#ffffff",

          fontSize: "10px",
          fontWeight: "800",

          pointerEvents: "none",
        }}
      >
        요청사진 {index + 1}
      </div>

      {/* 삭제 */}

      <button
        type="button"
        onClick={onDelete}
        disabled={disabled}
        style={{
          position: "absolute",

          top: "6px",
          right: "6px",

          border: "none",

          borderRadius: "8px",

          padding: "6px 7px",

          background:
            "rgba(185,28,28,0.90)",

          color: "#ffffff",

          fontSize: "11px",
          fontWeight: "900",

          cursor: disabled
            ? "not-allowed"
            : "pointer",

          opacity: disabled
            ? 0.6
            : 1,
        }}
      >
        {deleting
          ? "삭제 중"
          : "🗑 삭제"}
      </button>
    </div>
  );
}

/* =========================================================
   로딩 박스
========================================================= */

function LoadingBox() {
  return (
    <div
      style={{
        padding: "16px 12px",

        border:
          "1px dashed #cbd5e1",

        borderRadius: "11px",

        background: "#f8fafc",

        color: "#64748b",

        fontSize: "12px",

        textAlign: "center",
      }}
    >
      요청사진을 불러오는 중입니다...
    </div>
  );
}

/* =========================================================
   빈 데이터
========================================================= */

function EmptyBox({
  text,
}) {
  return (
    <div
      style={{
        padding: "16px 12px",

        border:
          "1px dashed #cbd5e1",

        borderRadius: "11px",

        background: "#f8fafc",

        color: "#64748b",

        fontSize: "12px",

        textAlign: "center",
      }}
    >
      {text}
    </div>
  );
  }
