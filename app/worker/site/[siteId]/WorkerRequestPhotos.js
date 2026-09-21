"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../../lib/supabase";

const BUCKET_NAME = "work-photos";
const SIGNED_URL_SECONDS = 1800;

export default function WorkerRequestPhotos({ siteId }) {
  const [loading, setLoading] = useState(true);
  const [photos, setPhotos] = useState([]);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!siteId) {
      setLoading(false);
      setPhotos([]);
      return;
    }

    loadRequestPhotos();
  }, [siteId]);

  /* =========================================================
     고객 요청사진 불러오기
  ========================================================= */

  async function loadRequestPhotos() {
    setLoading(true);
    setErrorMessage("");

    try {
      /* -----------------------------------------------------
         1. 로그인 확인
      ----------------------------------------------------- */

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        throw userError;
      }

      if (!user) {
        throw new Error("로그인이 필요합니다.");
      }

      /* -----------------------------------------------------
         2. 배정된 현장의 request 사진 조회

         RPC 내부에서:
         - 로그인한 시공자 확인
         - 현장 배정 여부 확인
         - photo_type = request 만 반환
      ----------------------------------------------------- */

      const {
        data,
        error: photoError,
      } = await supabase.rpc(
        "get_my_worker_site_request_photos",
        {
          p_site_id: siteId,
        }
      );

      if (photoError) {
        throw photoError;
      }

      const photoRows = Array.isArray(data)
        ? data
        : [];

      if (photoRows.length === 0) {
        setPhotos([]);
        return;
      }

      /* -----------------------------------------------------
         3. Private Storage Signed URL 생성

         URL 유효시간: 30분
      ----------------------------------------------------- */

      const signedPhotos = await Promise.all(
        photoRows.map(async (photo) => {
          if (!photo.storage_path) {
            return {
              ...photo,
              signed_url: null,
            };
          }

          try {
            const {
              data: signedData,
              error: signedError,
            } = await supabase.storage
              .from(BUCKET_NAME)
              .createSignedUrl(
                photo.storage_path,
                SIGNED_URL_SECONDS
              );

            if (signedError) {
              console.error(
                "요청사진 Signed URL 생성 오류:",
                signedError
              );

              return {
                ...photo,
                signed_url: null,
              };
            }

            return {
              ...photo,
              signed_url:
                signedData?.signedUrl || null,
            };
          } catch (error) {
            console.error(
              "요청사진 URL 처리 오류:",
              error
            );

            return {
              ...photo,
              signed_url: null,
            };
          }
        })
      );

      setPhotos(signedPhotos);
    } catch (error) {
      console.error(
        "고객 요청사진 조회 오류:",
        error
      );

      setPhotos([]);

      setErrorMessage(
        error?.message ||
          "고객 요청사진을 불러오지 못했습니다."
      );
    } finally {
      setLoading(false);
    }
  }

  /* =========================================================
     로딩
  ========================================================= */

  if (loading) {
    return (
      <section
        style={{
          marginTop: "14px",
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: "16px",
          padding: "18px",
        }}
      >
        <SectionHeader count={null} />

        <div
          style={{
            marginTop: "12px",
            padding: "18px",
            borderRadius: "10px",
            background: "#f8fafc",
            color: "#64748b",
            fontSize: "12px",
            textAlign: "center",
          }}
        >
          고객 요청사진을 불러오고 있습니다...
        </div>
      </section>
    );
  }

  /* =========================================================
     메인
  ========================================================= */

  return (
    <section
      style={{
        marginTop: "14px",
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: "16px",
        padding: "18px",
      }}
    >
      <SectionHeader count={photos.length} />

      {/* 오류 */}

      {errorMessage && (
        <div
          style={{
            marginTop: "12px",
            padding: "12px",
            borderRadius: "10px",
            background: "#fef2f2",
            color: "#b91c1c",
            fontSize: "12px",
            fontWeight: "700",
            lineHeight: 1.6,
            wordBreak: "break-word",
          }}
        >
          ❌ {errorMessage}

          <button
            type="button"
            onClick={loadRequestPhotos}
            style={{
              width: "100%",
              marginTop: "10px",
              border: "1px solid #fecaca",
              borderRadius: "8px",
              background: "#ffffff",
              color: "#b91c1c",
              padding: "9px",
              fontSize: "12px",
              fontWeight: "900",
              cursor: "pointer",
            }}
          >
            다시 불러오기
          </button>
        </div>
      )}

      {/* 사진 없음 */}

      {!errorMessage && photos.length === 0 && (
        <div
          style={{
            marginTop: "12px",
            padding: "18px 12px",
            border: "1px dashed #cbd5e1",
            borderRadius: "10px",
            background: "#f8fafc",
            color: "#64748b",
            fontSize: "12px",
            lineHeight: 1.6,
            textAlign: "center",
          }}
        >
          등록된 고객 요청사진이 없습니다.
        </div>
      )}

      {/* 사진 목록 */}

      {!errorMessage && photos.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(2, minmax(0, 1fr))",
            gap: "10px",
            marginTop: "12px",
          }}
        >
          {photos.map((photo, index) => (
            <PhotoCard
              key={
                photo.photo_id ||
                `${photo.storage_path}-${index}`
              }
              photo={photo}
              index={index}
            />
          ))}
        </div>
      )}

      <div
        style={{
          marginTop: "10px",
          color: "#94a3b8",
          fontSize: "10px",
          lineHeight: 1.5,
        }}
      >
        고객이 요청한 시공 부위 및 현장
        참고사진입니다.
      </div>
    </section>
  );
}

/* =========================================================
   섹션 헤더
========================================================= */

function SectionHeader({ count }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "10px",
      }}
    >
      <div
        style={{
          color: "#111827",
          fontSize: "15px",
          fontWeight: "900",
        }}
      >
        📷 고객 요청사진
      </div>

      {count !== null && (
        <div
          style={{
            flex: "0 0 auto",
            padding: "5px 9px",
            borderRadius: "999px",
            background: "#f1f5f9",
            color: "#475569",
            fontSize: "11px",
            fontWeight: "800",
          }}
        >
          {count}장
        </div>
      )}
    </div>
  );
}

/* =========================================================
   사진 카드
========================================================= */

function PhotoCard({ photo, index }) {
  const [imageError, setImageError] =
    useState(false);

  const imageUrl =
    !imageError && photo.signed_url
      ? photo.signed_url
      : null;

  return (
    <div
      style={{
        minWidth: 0,
      }}
    >
      {imageUrl ? (
        <a
          href={imageUrl}
          target="_blank"
          rel="noreferrer"
          style={{
            display: "block",
            textDecoration: "none",
          }}
        >
          <img
            src={imageUrl}
            alt={
              photo.description ||
              `고객 요청사진 ${index + 1}`
            }
            onError={() => {
              setImageError(true);
            }}
            style={{
              display: "block",
              width: "100%",
              aspectRatio: "1 / 1",
              objectFit: "cover",
              borderRadius: "10px",
              background: "#f1f5f9",
              border: "1px solid #e2e8f0",
            }}
          />
        </a>
      ) : (
        <div
          style={{
            width: "100%",
            aspectRatio: "1 / 1",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "10px",
            background: "#f8fafc",
            border: "1px dashed #cbd5e1",
            color: "#94a3b8",
            fontSize: "11px",
            textAlign: "center",
            padding: "10px",
            boxSizing: "border-box",
          }}
        >
          사진을 표시할 수 없습니다.
        </div>
      )}

      {photo.description && (
        <div
          style={{
            marginTop: "6px",
            color: "#64748b",
            fontSize: "11px",
            lineHeight: 1.5,
            wordBreak: "break-word",
          }}
        >
          {photo.description}
        </div>
      )}
    </div>
  );
            }
