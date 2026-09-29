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

function formatSimilarity(value) {
  return (
    Number(
      value || 0
    ) * 100
  ).toFixed(1);
}

export default function EstimateResult({
  groups = [],
  imageCount = 0,
  onRetrySimilarPhoto,
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
          const sortedSimilarItems = [
            ...(group.similarItems ||
              []),
          ].sort(
            (a, b) =>
              Number(
                b?.similarity || 0
              ) -
              Number(
                a?.similarity || 0
              )
          );

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

          const bestSimilarity =
            Number(
              bestMatch?.similarity ||
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
                {group.photos?.length > 1 ? "직접 묶은 사진 " : "별도 대상 사진 "}
                {
                  group.photos
                    ?.length
                }
                장
              </div>

              {group.requiresConfirmation && (
                <p role="status" style={{ color: "#92400e", background: "#fffbeb", padding: 12, borderRadius: 10 }}>
                  시공 부위 또는 범위가 명확하지 않아 금액을 계산하지 않았습니다. 대상 전체가 보이는 사진을 추가하거나 상담을 신청해주세요.
                </p>
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
                      가장 유사한 실제
                      시공 견적
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
                      유사도{" "}
                      {formatSimilarity(
                        bestSimilarity
                      )}
                      %
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
                    등록된 실제 시공
                    데이터 중 현재
                    사진과 가장 유사한
                    사례의 실제
                    시공금액입니다.
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
                    유사 시공 평균 견적
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
                    예상 범위{" "}
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
                    건 분석 · 신뢰도{" "}
                    <strong>
                      {
                        group
                          .estimate
                          .confidence
                      }
                    </strong>
                  </div>
                </div>
              ) : (
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
                  ⚠️ 실제 시공 데이터가
                  부족하여 평균 견적
                  계산이 어렵습니다.
                  정확한 상담을
                  신청해주세요.
                </div>
              )}

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
                            가장 유사한
                            사례
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
                          {[ ["before", "시공 전"], ["after", "시공 후"] ].map(([side, alt]) => (
                            <SimilarCasePhoto key={`${side}:${item[`${side}Url`] || item[`${side}Status`]}`}
                              url={item[`${side}Url`]} status={item[`${side}Status`]} alt={alt}
                              onRetry={() => onRetrySimilarPhoto?.(group.key, caseIndex, side)} />
                          ))}
                        </div>

                        {/* 실제 금액 / 유사도 */}

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
                            유사도{" "}
                            {formatSimilarity(
                              item.similarity
                            )}
                            %
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
