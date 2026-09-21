"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import SiteWorkerAssignment from "./SiteWorkerAssignment";

const STATUS_INFO = {
  scheduled: {
    label: "시공 예정",
    background: "#eff6ff",
    color: "#1d4ed8",
  },
  in_progress: {
    label: "시공 중",
    background: "#fff7ed",
    color: "#c2410c",
  },
  completed: {
    label: "시공 완료",
    background: "#f0fdf4",
    color: "#15803d",
  },
  cancelled: {
    label: "취소",
    background: "#f8fafc",
    color: "#64748b",
  },
};

const PHOTO_BUCKET = "work-photos";
const SIGNED_URL_SECONDS = 1800;

function formatDateTime(value) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatWon(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "-";
  }

  const number = Number(value);

  if (Number.isNaN(number)) {
    return "-";
  }

  return `${number.toLocaleString("ko-KR")}원`;
}

function formatQuantity(value, unit) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "-";
  }

  const number = Number(value);

  const quantity = Number.isNaN(number)
    ? value
    : number.toLocaleString("ko-KR");

  return `${quantity}${unit ? ` ${unit}` : ""}`;
}

function getLeader(site) {
  const assignments = site?.site_workers || [];

  return assignments.find(
    (item) => item.role === "leader",
  );
}

function getMembers(site) {
  const assignments = site?.site_workers || [];

  return assignments.filter(
    (item) => item.role === "member",
  );
}

export default function SiteDetailModal({
  site,
  onClose,
  updateSiteStatus,

  workers = [],
  workersLoading = false,

  loadWorkers,
  loadSiteWorkers,
  assignSiteWorkers,

  reloadSites,
}) {
  const [materials, setMaterials] = useState([]);
  const [photos, setPhotos] = useState([]);

  const [detailLoading, setDetailLoading] =
    useState(false);

  const [detailMessage, setDetailMessage] =
    useState("");

  const status =
    STATUS_INFO[site?.status] ||
    STATUS_INFO.scheduled;

  const leader = getLeader(site);
  const members = getMembers(site);

  useEffect(() => {
    if (!site?.id) return;

    let cancelled = false;

    async function loadDetailData() {
      setDetailLoading(true);
      setDetailMessage("");

      try {
        /*
         * 1. 시공 자재
         */
        const {
          data: materialData,
          error: materialError,
        } = await supabase
          .from("site_materials")
          .select(
            `
              id,
              brand,
              product_code,
              product_name,
              quantity,
              unit,
              unit_price,
              total_price,
              memo,
              created_at
            `,
          )
          .eq("site_id", site.id)
          .order("created_at", {
            ascending: true,
          });

        if (materialError) {
          throw materialError;
        }

        /*
         * 2. 현장 사진
         *
         * 현재 현장 등록 단계에서 저장하는
         * 요청사진은 photo_type = before 로 사용.
         */
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
          .eq("photo_type", "before")
          .order("created_at", {
            ascending: true,
          });

        if (photoError) {
          throw photoError;
        }

        /*
         * 3. private Storage 사진은
         * signed URL 생성
         */
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
                  signed_url: "",
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

        if (cancelled) return;

        setMaterials(materialData || []);
        setPhotos(signedPhotos || []);
      } catch (error) {
        console.error(
          "현장 상세정보 로드 오류:",
          error,
        );

        if (!cancelled) {
          setMaterials([]);
          setPhotos([]);

          setDetailMessage(
            `❌ 추가정보를 불러오지 못했습니다: ${
              error?.message || "알 수 없는 오류"
            }`,
          );
        }
      } finally {
        if (!cancelled) {
          setDetailLoading(false);
        }
      }
    }

    loadDetailData();

    return () => {
      cancelled = true;
    };
  }, [site?.id]);

  async function changeStatus(nextStatus) {
    if (
      typeof updateSiteStatus !== "function"
    ) {
      return;
    }

    await updateSiteStatus(
      site.id,
      nextStatus,
    );
  }

  async function handleAssignmentSaved() {
    if (
      typeof reloadSites === "function"
    ) {
      await reloadSites();
    }
  }

  if (!site) {
    return null;
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1001,

        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",

        padding: "24px 12px",

        background:
          "rgba(15,23,42,0.55)",

        overflowY: "auto",
      }}
    >
      <div
        onClick={(event) =>
          event.stopPropagation()
        }
        style={{
          width: "100%",
          maxWidth: "600px",
          padding: "16px",

          borderRadius: "16px",
          background: "#ffffff",

          boxShadow:
            "0 20px 50px rgba(0,0,0,0.20)",
        }}
      >
        {/* =========================
            상세 상단
        ========================= */}

        <div
          style={{
            display: "flex",
            justifyContent:
              "space-between",
            alignItems: "flex-start",
            gap: "10px",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "19px",
                fontWeight: "900",
                color: "#111827",
              }}
            >
              {site.site_name ||
                site.customer_name ||
                "현장 상세"}
            </div>

            <div
              style={{
                marginTop: "5px",
              }}
            >
              <span
                style={{
                  display: "inline-block",

                  padding: "5px 8px",

                  borderRadius: "999px",

                  background:
                    status.background,

                  color: status.color,

                  fontSize: "11px",

                  fontWeight: "800",
                }}
              >
                {status.label}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              border: "none",
              background: "transparent",
              fontSize: "26px",
              color: "#64748b",
              cursor: "pointer",
            }}
          >
            ×
          </button>
        </div>

        {/* =========================
            기본 정보
        ========================= */}

        <div
          style={{
            marginTop: "10px",
          }}
        >
          <DetailRow
            label="일정"
            value={formatDateTime(
              site.schedule_start,
            )}
          />

          <DetailRow
            label="고객"
            value={
              site.customer_name || "-"
            }
          />

          <DetailRow
            label="전화번호"
            value={
              site.customer_phone || "-"
            }
          />

          <DetailRow
            label="주소"
            value={`${site.address || "-"}${
              site.address_detail
                ? ` ${site.address_detail}`
                : ""
            }`}
          />

          <DetailRow
            label="지역"
            value={site.region || "-"}
          />

          <DetailRow
            label="시공 종류"
            value={site.work_type || "-"}
          />

          <DetailRow
            label="작업 내용"
            value={
              site.work_description || "-"
            }
          />

          <DetailRow
            label="계약금액"
            value={formatWon(
              site.contract_amount,
            )}
          />

          <DetailRow
            label="선금"
            value={formatWon(
              site.deposit_amount,
            )}
          />

          <DetailRow
            label="팀장"
            value={
              leader?.workers?.name ||
              "미배정"
            }
          />

          <DetailRow
            label="담당자"
            value={
              members.length > 0
                ? members
                    .map(
                      (item) =>
                        item.workers?.name,
                    )
                    .filter(Boolean)
                    .join(", ")
                : "미배정"
            }
          />

          <DetailRow
            label="메모"
            value={site.memo || "-"}
          />
        </div>

        {/* =========================
            추가정보 로딩/오류
        ========================= */}

        {detailLoading && (
          <div
            style={{
              marginTop: "16px",
              padding: "12px",
              borderRadius: "10px",
              background: "#f8fafc",
              color: "#64748b",
              fontSize: "13px",
              textAlign: "center",
            }}
          >
            시공자재와 요청사진을
            불러오는 중입니다...
          </div>
        )}

        {detailMessage && (
          <div
            style={{
              marginTop: "16px",
              padding: "11px 12px",
              borderRadius: "10px",
              background: "#fef2f2",
              color: "#b91c1c",
              fontSize: "12px",
              fontWeight: "700",
              wordBreak: "break-word",
            }}
          >
            {detailMessage}
          </div>
        )}

        {/* =========================
            시공 자재
        ========================= */}

        {!detailLoading && (
          <section
            style={{
              marginTop: "18px",
              paddingTop: "14px",
              borderTop:
                "1px solid #e5e7eb",
            }}
          >
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
              <div
                style={{
                  fontSize: "14px",
                  fontWeight: "900",
                  color: "#111827",
                }}
              >
                📦 시공 자재
              </div>

              <div
                style={{
                  fontSize: "11px",
                  fontWeight: "800",
                  color: "#64748b",
                }}
              >
                {materials.length}건
              </div>
            </div>

            {materials.length === 0 ? (
              <EmptyBox text="등록된 시공 자재가 없습니다." />
            ) : (
              <div
                style={{
                  display: "grid",
                  gap: "8px",
                }}
              >
                {materials.map(
                  (material, index) => (
                    <MaterialCard
                      key={material.id}
                      material={material}
                      index={index}
                    />
                  ),
                )}
              </div>
            )}
          </section>
        )}

        {/* =========================
            요청 사진
        ========================= */}

        {!detailLoading && (
          <section
            style={{
              marginTop: "18px",
              paddingTop: "14px",
              borderTop:
                "1px solid #e5e7eb",
            }}
          >
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
                  fontSize: "11px",
                  fontWeight: "800",
                  color: "#64748b",
                }}
              >
                {photos.length}장
              </div>
            </div>

            {photos.length === 0 ? (
              <EmptyBox text="등록된 요청사진이 없습니다." />
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
                    />
                  ),
                )}
              </div>
            )}
          </section>
        )}

        {/* =========================
            상태 변경
        ========================= */}

        <div
          style={{
            marginTop: "18px",
            paddingTop: "14px",
            borderTop:
              "1px solid #e5e7eb",
          }}
        >
          <div
            style={{
              marginBottom: "8px",
              fontSize: "13px",
              fontWeight: "800",
              color: "#334155",
            }}
          >
            현장 상태
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "1fr 1fr",
              gap: "7px",
            }}
          >
            <StatusButton
              active={
                site.status ===
                "scheduled"
              }
              onClick={() =>
                changeStatus("scheduled")
              }
            >
              시공 예정
            </StatusButton>

            <StatusButton
              active={
                site.status ===
                "in_progress"
              }
              onClick={() =>
                changeStatus(
                  "in_progress",
                )
              }
            >
              시공 중
            </StatusButton>

            <StatusButton
              active={
                site.status ===
                "completed"
              }
              onClick={() =>
                changeStatus("completed")
              }
            >
              시공 완료
            </StatusButton>

            <StatusButton
              active={
                site.status ===
                "cancelled"
              }
              onClick={() =>
                changeStatus("cancelled")
              }
            >
              취소
            </StatusButton>
          </div>
        </div>

        {/* =========================
            팀장 / 시공자 배정
        ========================= */}

        <div
          style={{
            marginTop: "18px",
            paddingTop: "14px",
            borderTop:
              "1px solid #e5e7eb",
          }}
        >
          <div
            style={{
              marginBottom: "10px",
              fontSize: "14px",
              fontWeight: "900",
              color: "#111827",
            }}
          >
            👷 담당 시공자 배정
          </div>

          <SiteWorkerAssignment
            site={site}
            workers={workers}
            workersLoading={
              workersLoading
            }
            loadWorkers={loadWorkers}
            loadSiteWorkers={
              loadSiteWorkers
            }
            assignSiteWorkers={
              assignSiteWorkers
            }
            onSaved={
              handleAssignmentSaved
            }
          />
        </div>
      </div>
    </div>
  );
}

function MaterialCard({
  material,
  index,
}) {
  const title =
    material.product_code ||
    material.product_name ||
    `자재 ${index + 1}`;

  return (
    <div
      style={{
        padding: "12px",

        border:
          "1px solid #e2e8f0",

        borderRadius: "11px",

        background: "#f8fafc",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent:
            "space-between",
          gap: "8px",
        }}
      >
        <div
          style={{
            minWidth: 0,
          }}
        >
          <div
            style={{
              fontSize: "13px",
              fontWeight: "900",
              color: "#111827",
              wordBreak: "break-word",
            }}
          >
            {title}
          </div>

          {(material.brand ||
            material.product_name) && (
            <div
              style={{
                marginTop: "3px",
                fontSize: "11px",
                color: "#64748b",
                wordBreak: "break-word",
              }}
            >
              {[
                material.brand,
                material.product_name,
              ]
                .filter(Boolean)
                .join(" · ")}
            </div>
          )}
        </div>

        <div
          style={{
            flex: "0 0 auto",

            padding: "4px 7px",

            borderRadius: "999px",

            background: "#ffffff",

            border:
              "1px solid #e2e8f0",

            fontSize: "11px",
            fontWeight: "800",
            color: "#334155",
          }}
        >
          {formatQuantity(
            material.quantity,
            material.unit,
          )}
        </div>
      </div>

      {(material.unit_price !== null &&
        material.unit_price !==
          undefined) ||
      (material.total_price !== null &&
        material.total_price !==
          undefined) ? (
        <div
          style={{
            marginTop: "9px",
            display: "grid",
            gap: "4px",
            fontSize: "11px",
            color: "#475569",
          }}
        >
          {material.unit_price !==
            null &&
            material.unit_price !==
              undefined && (
              <div>
                단가{" "}
                <strong>
                  {formatWon(
                    material.unit_price,
                  )}
                </strong>
              </div>
            )}

          {material.total_price !==
            null &&
            material.total_price !==
              undefined && (
              <div>
                합계{" "}
                <strong>
                  {formatWon(
                    material.total_price,
                  )}
                </strong>
              </div>
            )}
        </div>
      ) : null}

      {material.memo && (
        <div
          style={{
            marginTop: "8px",
            paddingTop: "8px",
            borderTop:
              "1px solid #e2e8f0",
            fontSize: "11px",
            color: "#64748b",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {material.memo}
        </div>
      )}
    </div>
  );
}

function PhotoCard({
  photo,
  index,
}) {
  if (!photo.signed_url) {
    return (
      <div
        style={{
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
      </div>
    );
  }

  return (
    <a
      href={photo.signed_url}
      target="_blank"
      rel="noreferrer"
      style={{
        position: "relative",
        display: "block",

        aspectRatio: "1 / 1",

        overflow: "hidden",

        borderRadius: "11px",

        border:
          "1px solid #e2e8f0",

        background: "#f8fafc",
      }}
    >
      <img
        src={photo.signed_url}
        alt={`시공 요청사진 ${index + 1}`}
        loading="lazy"
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: "block",
        }}
      />

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
        }}
      >
        요청사진 {index + 1}
      </div>
    </a>
  );
}

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

function DetailRow({
  label,
  value,
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns:
          "90px 1fr",
        gap: "10px",

        padding: "10px 0",

        borderBottom:
          "1px solid #f1f5f9",

        fontSize: "13px",
      }}
    >
      <div
        style={{
          color: "#64748b",
          fontWeight: "700",
        }}
      >
        {label}
      </div>

      <div
        style={{
          color: "#111827",
          fontWeight: "600",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function StatusButton({
  active,
  onClick,
  children,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: active
          ? "1px solid #111827"
          : "1px solid #cbd5e1",

        borderRadius: "9px",

        padding: "10px 8px",

        background: active
          ? "#111827"
          : "#ffffff",

        color: active
          ? "#ffffff"
          : "#334155",

        fontSize: "12px",
        fontWeight: "800",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
              }
