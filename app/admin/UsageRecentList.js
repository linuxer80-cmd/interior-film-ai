import {
  formatDate,
  formatWon,
  getUsagePhotoPaths,
} from "./adminUtils";
import {
  sectionStyle,
  secondaryButtonStyle,
} from "./adminStyles";

export default function UsageRecentList({
  usageLoading,
  usageRecent,
  usagePhotoUrls,
  openUsagePhotoId,
  usagePhotoLoadingId,
  toggleUsagePhotos,
  setPreviewPhoto,
}) {
  return (
    <section style={sectionStyle}>
      <h3 style={{ marginTop: 0 }}>
        최근 자동견적
      </h3>

      {usageLoading ? (
        <div>로그 불러오는 중...</div>
      ) : usageRecent.length === 0 ? (
        <div style={{ color: "#6b7280" }}>
          자동견적 기록이 없습니다.
        </div>
      ) : (
        usageRecent.map((row) => {
          const paths = getUsagePhotoPaths(row);
          const urls =
            usagePhotoUrls[row.id] || [];
          const isOpen =
            openUsagePhotoId === row.id;
          const photoLoading =
            usagePhotoLoadingId === row.id;

          return (
            <div
              key={row.id}
              style={{
                padding: "15px 0",
                borderBottom:
                  "1px solid #e5e7eb",
              }}
            >
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
                      fontWeight: "bold",
                      fontSize: "16px",
                    }}
                  >
                    {row.category || "미분류"}
                  </div>

                  <div
                    style={{
                      marginTop: "4px",
                      fontSize: "14px",
                      color: "#4b5563",
                    }}
                  >
                    {row.sub_category || "-"}
                  </div>
                </div>

                <span
                  style={{
                    fontSize: "12px",
                    color: "#6b7280",
                    whiteSpace: "nowrap",
                  }}
                >
                  자동견적
                </span>
              </div>

              <div
                style={{
                  marginTop: "8px",
                  fontSize: "14px",
                  lineHeight: 1.6,
                }}
              >
                사진{" "}
                {row.photo_count ||
                  paths.length ||
                  0}
                장

                {row.estimate_average !== null &&
                  row.estimate_average !==
                    undefined && (
                    <>
                      {" "}
                      · 평균{" "}
                      <b>
                        {formatWon(
                          row.estimate_average
                        )}
                      </b>
                    </>
                  )}
              </div>

              {(row.estimate_min !== null ||
                row.estimate_max !== null) && (
                <div
                  style={{
                    marginTop: "3px",
                    fontSize: "13px",
                    color: "#6b7280",
                  }}
                >
                  예상 범위:{" "}
                  {formatWon(row.estimate_min)} ~{" "}
                  {formatWon(row.estimate_max)}
                </div>
              )}

              <div
                style={{
                  marginTop: "7px",
                  fontSize: "12px",
                  color: "#9ca3af",
                  wordBreak: "break-all",
                }}
              >
                {formatDate(row.created_at)}
                <br />
                세션: {row.session_id || "-"}
              </div>

              {paths.length > 0 ? (
                <button
                  type="button"
                  disabled={photoLoading}
                  onClick={() =>
                    toggleUsagePhotos(row)
                  }
                  style={{
                    ...secondaryButtonStyle,
                    marginTop: "10px",
                    background: isOpen
                      ? "#f3f4f6"
                      : "#ffffff",
                  }}
                >
                  {photoLoading
                    ? "📷 사진 불러오는 중..."
                    : isOpen
                    ? "사진 닫기"
                    : `📷 사진 보기 (${paths.length})`}
                </button>
              ) : (
                <div
                  style={{
                    marginTop: "9px",
                    fontSize: "12px",
                    color: "#9ca3af",
                  }}
                >
                  사진 저장 없음
                </div>
              )}

              {isOpen && urls.length > 0 && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      urls.length === 1
                        ? "1fr"
                        : "repeat(2, minmax(0, 1fr))",
                    gap: "8px",
                    marginTop: "10px",
                  }}
                >
                  {urls.map((item, index) => (
                    <img
                      key={`${item.path}-${index}`}
                      src={item.url}
                      alt={`자동견적 사진 ${
                        index + 1
                      }`}
                      loading="lazy"
                      decoding="async"
                      onClick={() =>
                        setPreviewPhoto(item.url)
                      }
                      style={{
                        width: "100%",
                        height:
                          urls.length === 1
                            ? "320px"
                            : "180px",
                        objectFit: "contain",
                        background: "#111827",
                        borderRadius: "10px",
                        cursor: "pointer",
                      }}
                    />
                  ))}
                </div>
              )}

              {row.converted_to_lead === true && (
                <div
                  style={{
                    display: "inline-block",
                    marginTop: "9px",
                    padding: "4px 8px",
                    borderRadius: "999px",
                    background: "#dcfce7",
                    color: "#166534",
                    fontSize: "12px",
                    fontWeight: "bold",
                  }}
                >
                  상세상담 전환
                </div>
              )}
            </div>
          );
        })
      )}
    </section>
  );
                      }
