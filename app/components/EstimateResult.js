"use client";

function formatWon(value) {
  return Number(
    value || 0
  ).toLocaleString(
    "ko-KR"
  );
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
        }}
      >
        AI 부위별 분석
      </h2>

      <p
        style={{
          color: "#6b7280",
          lineHeight: 1.6,
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
        (group, index) => (
          <div
            key={`${group.key}-${index}`}
            style={{
              marginTop: "18px",

              paddingTop:
                index
                  ? "18px"
                  : 0,

              borderTop:
                index
                  ? "1px solid #e5e7eb"
                  : "none",
            }}
          >
            {/* 시공 부위 이름 */}

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
              }}
            >
              같은 부위 사진{" "}
              {
                group.photos
                  ?.length
              }
              장
            </div>

            {/* 같은 부위 사진 */}

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

            {/* 견적 */}

            {group.estimate ? (
              <div
                style={{
                  marginTop:
                    "14px",
                  padding: "14px",
                  background:
                    "#f3f4f6",
                  borderRadius:
                    "12px",
                  lineHeight: 1.7,
                }}
              >
                <strong>
                  {formatWon(
                    group
                      .estimate
                      .min
                  )}
                  원 ~{" "}
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
                건 · 신뢰도{" "}
                {
                  group
                    .estimate
                    .confidence
                }
              </div>
            ) : (
              <div
                style={{
                  marginTop:
                    "14px",
                  padding: "14px",
                  background:
                    "#fff7ed",
                  borderRadius:
                    "12px",
                  lineHeight: 1.6,
                }}
              >
                ⚠️ 실제 시공 데이터가
                부족하여 상담 확인이
                필요합니다.
              </div>
            )}

            {/* 유사 시공 사례 */}

            {group.similarItems
              ?.length > 0 && (
              <div
                style={{
                  marginTop:
                    "15px",
                }}
              >
                <strong>
                  비슷한 실제 시공사례
                </strong>

                {group.similarItems.map(
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
                      }}
                    >
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
                              <img
                                key={
                                  photoIndex
                                }
                                src={
                                  url
                                }
                                alt={
                                  alt
                                }
                                loading="lazy"
                                decoding="async"
                                style={{
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
                            ) : (
                              <div
                                key={
                                  photoIndex
                                }
                                style={{
                                  aspectRatio:
                                    "1 / 1",

                                  background:
                                    "#f3f4f6",

                                  borderRadius:
                                    "10px",
                                }}
                              />
                            )
                        )}
                      </div>

                      <div
                        style={{
                          marginTop:
                            "5px",

                          fontSize:
                            "14px",

                          color:
                            "#4b5563",
                        }}
                      >
                        유사도{" "}

                        {(
                          Number(
                            item.similarity ||
                              0
                          ) * 100
                        ).toFixed(
                          1
                        )}
                        %
                      </div>
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        )
      )}
    </section>
  );
                          }
