"use client";

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
                같은 부위 사진{" "}
                {
                  group.photos
                    ?.length
                }
                장
              </div>

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
                          {[
                            [
                              item.beforeUrl,
                              "시공 전",
                            ],
                            [
                              item.afterUrl,
                              "시공 후",
                            ],
                          ].map(
                            (
                              [
                                url,
                                alt,
                              ],
                              photoIndex
                            ) =>
                              url ? (
                                <div
                                  key={
                                    photoIndex
                                  }
                                >
                                  <img
                                    src={
                                      url
                                    }
                                    alt={
                                      alt
                                    }
                                    loading="lazy"
                                    decoding="async"
                                    style={{
                                      display:
                                        "block",
                                      width:
                                        "100%",
                                      aspectRatio:
                                        "1 / 1",
                                      objectFit:
                                        "cover",
                                      borderRadius:
                                        "10px",
                                    }}
                                  />

                                  <div
                                    style={{
                                      marginTop:
                                        "4px",
                                      textAlign:
                                        "center",
                                      fontSize:
                                        "12px",
                                      color:
                                        "#6b7280",
                                    }}
                                  >
                                    {
                                      alt
                                    }
                                  </div>
                                </div>
                              ) : (
                                <div
                                  key={
                                    photoIndex
                                  }
                                >
                                  <div
                                    style={{
                                      aspectRatio:
                                        "1 / 1",
                                      background:
                                        "#f3f4f6",
                                      borderRadius:
                                        "10px",
                                      display:
                                        "flex",
                                      justifyContent:
                                        "center",
                                      alignItems:
                                        "center",
                                      color:
                                        "#9ca3af",
                                      fontSize:
                                        "12px",
                                    }}
                                  >
                                    사진 없음
                                  </div>

                                  <div
                                    style={{
                                      marginTop:
                                        "4px",
                                      textAlign:
                                        "center",
                                      fontSize:
                                        "12px",
                                      color:
                                        "#6b7280",
                                    }}
                                  >
                                    {
                                      alt
                                    }
                                  </div>
                                </div>
                              )
                          )}
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
