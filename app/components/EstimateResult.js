"use client";

import { useState } from "react";

function SimilarCasePhoto({ url, status, alt, onRetry }) {
  const [failed, setFailed] = useState(false);
  const error = failed || status === "error";
  return <div>
    {url && !failed ? <img src={url} alt={alt} loading="lazy" decoding="async"
      onError={() => setFailed(true)}
      style={{ display: "block", width: "100%", aspectRatio: "1 / 1", objectFit: "cover", borderRadius: 10 }} />
      : <div role="status" style={{ aspectRatio: "1 / 1", background: "#f3f4f6", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b", fontSize: 12, textAlign: "center", padding: 8 }}>
        <div>{status === "loading" ? "사진 불러오는 중…" : error ? "사진을 불러오지 못했어요" : "등록된 사진 없음"}
          {error && <button type="button" onClick={onRetry} style={{ display: "block", margin: "8px auto", padding: 6 }}>다시 불러오기</button>}
        </div>
      </div>}
    <div style={{ marginTop: 4, textAlign: "center", fontSize: 12, color: "#6b7280" }}>{alt}</div>
  </div>;
}

function formatWon(value) {
  return Number(
    value || 0
  ).toLocaleString(
    "ko-KR"
  );
}

function confirmationMessage(group) {
  if (group.subjectRequiresConfirmation) return "사진만으로 같은 문인지 또는 문 개수를 확인하기 어렵습니다. 문과 주변이 함께 보이는 사진을 추가한 뒤 다시 분석하거나 상담을 신청해주세요.";
  const reasons = group.confirmationReasons || [];
  if (reasons.some((reason) => ["unknown_scope", "conflicting_scope"].includes(reason))) {
    return "사진만으로 싱크대의 시공 범위를 확인하기 어렵습니다. 시공할 상부장이나 하부장이 잘 보이는 사진을 추가한 뒤 다시 분석하거나 상담을 신청해주세요.";
  }
  if (reasons.some((reason) => ["unclear_view", "incomplete_view"].includes(reason))) {
    return "현재 사진에서 견적에 필요한 대상의 구조나 개수를 확인하기 어렵습니다. 대상이 더 잘 보이는 사진을 추가한 뒤 다시 분석해주세요.";
  }
  return "사진만으로 시공 부위나 범위를 확인하기 어렵습니다. 시공할 곳이 잘 보이는 사진을 추가한 뒤 다시 분석하거나 상담을 신청해주세요.";
}

export default function EstimateResult({
  groups = [],
  imageCount = 0,
  onRetrySimilarPhoto,
  onEditPhotos,
}) {
  if (!groups.length) {
    return null;
  }

  const sectionStyle = {
    marginTop: "24px",
    padding: "22px",
    border:
      "1px solid #e5e7eb",
    borderRadius: "20px",
    background: "#ffffff",
  };

  return (
    <section style={sectionStyle}>
      <h2
        style={{
          marginTop: 0,
          marginBottom: "8px",
        }}
      >
        AI 부위별 분석
      </h2>

      <p
        style={{
          color: "#6b7280",
          lineHeight: 1.6,
          marginTop: 0,
        }}
      >
        총 {imageCount}장의
        사진을{" "}
        <strong>
          {groups.length}개 시공 부위
        </strong>
        로 분류했습니다.
      </p>

      {groups.map(
        (group, index) => {
          /*
           * 유사 시공사례를
           * 유사도 높은 순으로 정렬합니다.
           */
          const sortedSimilarItems = (group.similarItems || [])
            .filter((item) => item.visual_verified === true)
            .slice().sort((a, b) => a.visual_rank - b.visual_rank);

          /*
           * 가장 유사한 실제 시공사례
           */
          const bestMatch =
            sortedSimilarItems[0] ||
            null;

          const bestActualCost =
            Number(
              bestMatch?.actual_cost ||
                0
            );

          const hasBestMatch =
            bestActualCost > 0;

          return (
            <div
              key={`${group.key}-${index}`}
              style={{
                marginTop: "18px",

                paddingTop:
                  index
                    ? "22px"
                    : 0,

                borderTop:
                  index
                    ? "1px solid #e5e7eb"
                    : "none",
              }}
            >
              {/* ============================= */}
              {/* 시공 부위 이름 */}
              {/* ============================= */}

              <div
                style={{
                  fontSize: "20px",
                  fontWeight: "bold",
                }}
              >
                {index + 1}.{" "}
                {group.category}

                {group.subCategory
                  ? ` · ${group.subCategory}`
                  : ""}
              </div>

              <div
                style={{
                  marginTop: "5px",
                  color: "#6b7280",
                  fontSize: "14px",
                }}
              >
                {group.photoNumbers?.length ? `사진 ${group.photoNumbers.join(", ")} · ` : ""}
                {group.photos?.length > 1 ? (group.subjectSource === "ai" ? "같은 문으로 인식한 사진 " : "직접 묶은 사진 ") : "별도 대상 사진 "}
                {
                  group.photos
                    ?.length
                }
                장
              </div>

              {group.requiresConfirmation && (
                <div role="status" style={{ color: "#92400e", background: "#fffbeb", padding: 12, borderRadius: 10, marginTop: 12, lineHeight: 1.6 }}>
                  <p style={{ margin: 0 }}>{confirmationMessage(group)}</p>
                  {onEditPhotos && <button type="button" onClick={onEditPhotos} style={{ marginTop: 10, padding: "10px 14px", border: "1px solid #d97706", borderRadius: 8, background: "#fff", color: "#92400e", fontWeight: 700 }}>사진 추가·변경하기</button>}
                </div>
              )}

              {/* ============================= */}
              {/* 고객이 등록한 분석 사진 */}
              {/* ============================= */}

              <div
                style={{
                  display: "flex",
                  gap: "6px",
                  overflowX: "auto",
                  marginTop: "10px",
                }}
              >
                {group.photos?.map(
                  (photo) => (
                    <img
                      key={photo.id}
                      src={
                        photo.preview
                      }
                      alt="분석 사진"
                      loading="lazy"
                      decoding="async"
                      style={{
                        width: "82px",
                        height: "82px",
                        objectFit:
                          "cover",
                        borderRadius:
                          "9px",
                        flexShrink: 0,
                      }}
                    />
                  )
                )}
              </div>

              {/* ============================= */}
              {/* 가장 유사한 실제 시공 견적 */}
              {/* ============================= */}

              {hasBestMatch && (
                <div
                  style={{
                    marginTop:
                      "16px",
                    padding: "16px",
                    border:
                      "1px solid #bfdbfe",
                    background:
                      "#eff6ff",
                    borderRadius:
                      "14px",
                  }}
                >
                  <div
                    style={{
                      display:
                        "flex",
                      justifyContent:
                        "space-between",
                      alignItems:
                        "center",
                      gap: "10px",
                      flexWrap:
                        "wrap",
                    }}
                  >
                    <div
                      style={{
                        fontSize:
                          "14px",
                        fontWeight:
                          "700",
                        color:
                          "#1d4ed8",
                      }}
                    >
                      사진으로 비교한 실제
                      시공금액
                    </div>

                    <div
                      style={{
                        padding:
                          "4px 9px",
                        background:
                          "#dbeafe",
                        borderRadius:
                          "999px",
                        fontSize:
                          "12px",
                        fontWeight:
                          "700",
                        color:
                          "#1d4ed8",
                      }}
                    >
                      구조·범위 비교 완료
                    </div>
                  </div>

                  <div
                    style={{
                      marginTop:
                        "8px",
                      fontSize:
                        "28px",
                      lineHeight: 1.2,
                      fontWeight:
                        "800",
                      color:
                        "#111827",
                    }}
                  >
                    {formatWon(
                      bestActualCost
                    )}
                    원
                  </div>

                  <div
                    style={{
                      marginTop:
                        "7px",
                      fontSize:
                        "13px",
                      lineHeight: 1.6,
                      color:
                        "#6b7280",
                    }}
                  >
                    {bestMatch.match_reason || "시공 범위와 구조를 비교한 과거 사례의 금액입니다."}
                  </div>
                </div>
              )}

              {/* ============================= */}
              {/* 유사 시공 평균 견적 */}
              {/* ============================= */}

              {group.estimate ? (
                <div
                  style={{
                    marginTop:
                      "10px",
                    padding: "16px",
                    background:
                      "#f9fafb",
                    border:
                      "1px solid #e5e7eb",
                    borderRadius:
                      "14px",
                  }}
                >
                  <div
                    style={{
                      fontSize:
                        "14px",
                      fontWeight:
                        "700",
                      color:
                        "#374151",
                    }}
                  >
                    비교 사례 평균 금액
                  </div>

                  <div
                    style={{
                      marginTop:
                        "7px",
                      fontSize:
                        "24px",
                      lineHeight: 1.2,
                      fontWeight:
                        "800",
                      color:
                        "#111827",
                    }}
                  >
                    {formatWon(
                      group
                        .estimate
                        .average
                    )}
                    원
                  </div>

                  <div
                    style={{
                      marginTop:
                        "10px",
                      paddingTop:
                        "10px",
                      borderTop:
                        "1px solid #e5e7eb",
                      fontSize:
                        "14px",
                      lineHeight: 1.7,
                      color:
                        "#4b5563",
                    }}
                  >
                    {group.estimate.range_basis === "observed_cases" ? "사례 금액 범위 " : "참고 범위 "}
                    <strong>
                      {formatWon(
                        group
                          .estimate
                          .min
                      )}
                      원
                    </strong>

                    {" ~ "}

                    <strong>
                      {formatWon(
                        group
                          .estimate
                          .max
                      )}
                      원
                    </strong>

                    <br />

                    유사 시공{" "}
                    {
                      group
                        .estimate
                        .count
                    }
                    건 분석 · 자료 충분도{" "}
                    <strong>
                      {
                        group
                          .estimate
                          .confidence
                      }
                    </strong>
                  </div>
                </div>
              ) : !group.requiresConfirmation ? (
                <div
                  style={{
                    marginTop:
                      "14px",
                    padding: "14px",
                    background:
                      "#fff7ed",
                    border:
                      "1px solid #fed7aa",
                    borderRadius:
                      "12px",
                    lineHeight: 1.6,
                  }}
                >
                  {group.searchMessage || "사진으로 비교할 수 있는 같은 시공 범위의 사례가 부족합니다. 정확한 상담을 신청해주세요."}
                </div>
              ) : null}

              {group.estimate?.price_spread === "wide" && <p style={{ fontSize: 13, color: "#92400e" }}>비교 사례 간 금액 차이가 큽니다. 실측 크기와 세부 시공 범위를 확인해야 합니다.</p>}
              {/* ============================= */}
              {/* 안내 문구 */}
              {/* ============================= */}

              {hasBestMatch &&
                group.estimate && (
                  <div
                    style={{
                      marginTop:
                        "10px",
                      padding:
                        "10px 12px",
                      background:
                        "#f8fafc",
                      borderRadius:
                        "10px",
                      color:
                        "#64748b",
                      fontSize:
                        "12px",
                      lineHeight: 1.6,
                    }}
                  >
                    ※ 가장 유사한 실제
                    견적과 평균 견적은
                    시공 범위, 크기,
                    현장상태 등에 따라
                    차이가 날 수
                    있습니다.
                  </div>
                )}

              {/* ============================= */}
              {/* 실제 유사 시공사례 */}
              {/* ============================= */}

              {sortedSimilarItems.length >
                0 && (
                <div
                  style={{
                    marginTop:
                      "18px",
                  }}
                >
                  <div
                    style={{
                      fontWeight:
                        "700",
                      fontSize:
                        "16px",
                    }}
                  >
                    비슷한 실제
                    시공사례
                  </div>

                  {sortedSimilarItems.map(
                    (
                      item,
                      caseIndex
                    ) => (
                      <div
                        key={
                          item.work_item_id ||
                          caseIndex
                        }
                        style={{
                          marginTop:
                            "12px",
                          padding:
                            "12px",
                          border:
                            caseIndex ===
                            0
                              ? "1px solid #bfdbfe"
                              : "1px solid #e5e7eb",
                          borderRadius:
                            "14px",
                          background:
                            caseIndex ===
                            0
                              ? "#f8fbff"
                              : "#ffffff",
                        }}
                      >
                        {/* 최고 유사 사례 표시 */}

                        {caseIndex ===
                          0 && (
                          <div
                            style={{
                              marginBottom:
                                "9px",
                              display:
                                "inline-block",
                              padding:
                                "4px 8px",
                              borderRadius:
                                "999px",
                              background:
                                "#2563eb",
                              color:
                                "#ffffff",
                              fontSize:
                                "12px",
                              fontWeight:
                                "700",
                            }}
                          >
                            비교 후보 중
                            가장 유사한 사례
                          </div>
                        )}

                        {/* 전/후 사진 */}

                        <div
                          style={{
                            display:
                              "grid",

                            gridTemplateColumns:
                              "repeat(2, minmax(0, 1fr))",

                            gap: "7px",
                          }}
                        >
                          {(item.reference_path && !item.before_path && !item.after_path
                            ? [["reference", "참고사진 · 전후 미확인"]]
                            : [["before", "시공 전"], ["after", "시공 후"], ...(item.reference_path ? [["reference", "참고사진 · 전후 미확인"]] : [])]).map(([side, alt]) => (
                            <SimilarCasePhoto key={`${side}:${item[`${side}Url`] || item[`${side}Status`]}`}
                              url={item[`${side}Url`]} status={item[`${side}Status`]} alt={alt}
                              onRetry={() => onRetrySimilarPhoto?.(group.key, caseIndex, side)} />
                          ))}
                        </div>

                        {item.match_reason && <p style={{ fontSize: 13, lineHeight: 1.6, color: "#475569" }}>{item.match_reason}</p>}
                        {!!item.differences?.length && <p style={{ fontSize: 12, lineHeight: 1.6, color: "#64748b" }}>차이점: {item.differences.join(" · ")}</p>}
                        {/* 실제 금액 / 비교 결과 */}

                        <div
                          style={{
                            marginTop:
                              "10px",
                            display:
                              "flex",
                            justifyContent:
                              "space-between",
                            alignItems:
                              "center",
                            flexWrap:
                              "wrap",
                            gap:
                              "6px",
                            fontSize:
                              "14px",
                            color:
                              "#4b5563",
                          }}
                        >
                          <div>
                            실제 시공금액{" "}

                            <strong
                              style={{
                                color:
                                  "#111827",
                              }}
                            >
                              {formatWon(
                                item.actual_cost
                              )}
                              원
                            </strong>
                          </div>

                          <div
                            style={{
                              padding:
                                "3px 7px",
                              borderRadius:
                                "999px",
                              background:
                                "#f3f4f6",
                              fontWeight:
                                "700",
                              fontSize:
                                "12px",
                            }}
                          >
                            구조·범위 비교 완료
                          </div>
                        </div>
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          );
        }
      )}
    </section>
  );
                    }
