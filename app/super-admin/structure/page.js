"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { supabase } from "../../../lib/supabase";

export default function StructureAnalysisPage() {
  const [loading, setLoading] =
    useState(true);

  const [authorized, setAuthorized] =
    useState(false);

  const [companies, setCompanies] =
    useState([]);

  const [
    selectedCompanyId,
    setSelectedCompanyId,
  ] = useState("");

  const [
    selectedCompanyName,
    setSelectedCompanyName,
  ] = useState("");

  const [message, setMessage] =
    useState("");

  const [statusLoading, setStatusLoading] =
    useState(false);

  const stopRef = useRef(false);

  const [analysis, setAnalysis] =
    useState({
      total: 0,
      completed: 0,
      remaining: 0,
      failed: 0,
      processed: 0,
      attempted: 0,
      running: false,
      finished: false,
      errors: [],
    });

  /* =========================================================
     슈퍼관리자 확인
  ========================================================= */

  const checkSuperAdmin =
    useCallback(async () => {
      const {
        data: authData,
        error: authError,
      } =
        await supabase.auth.getUser();

      if (authError) {
        throw new Error(
          `로그인 확인 실패: ${
            authError.message ||
            "알 수 없는 오류"
          }`,
        );
      }

      if (!authData?.user?.id) {
        throw new Error(
          "로그인이 필요합니다.",
        );
      }

      const {
        data,
        error,
      } =
        await supabase.rpc(
          "get_super_admin_status",
        );

      if (error) {
        throw new Error(
          `슈퍼관리자 확인 실패: ${
            error.message ||
            "알 수 없는 오류"
          }`,
        );
      }

      const status =
        Array.isArray(data)
          ? data[0]
          : data;

      if (
        !status?.is_super_admin
      ) {
        throw new Error(
          "슈퍼관리자 권한이 없습니다.",
        );
      }

      setAuthorized(true);

      return true;
    }, []);

  /* =========================================================
     업체 목록
  ========================================================= */

  const loadCompanies =
    useCallback(async () => {
      const {
        data,
        error,
      } =
        await supabase.rpc(
          "super_admin_get_companies",
        );

      if (error) {
        throw new Error(
          `업체 목록 조회 실패: ${
            error.message ||
            "알 수 없는 오류"
          }`,
        );
      }

      const rows =
        Array.isArray(data)
          ? data
          : [];

      setCompanies(rows);

      return rows;
    }, []);

  /* =========================================================
     로그인 토큰
  ========================================================= */

  async function getAccessToken() {
    const {
      data,
      error,
    } =
      await supabase.auth.getSession();

    if (error) {
      throw new Error(
        `로그인 정보 확인 실패: ${
          error.message ||
          "알 수 없는 오류"
        }`,
      );
    }

    const accessToken =
      data?.session?.access_token;

    if (!accessToken) {
      throw new Error(
        "로그인이 필요합니다.",
      );
    }

    return accessToken;
  }

  /* =========================================================
     초기화
  ========================================================= */

  useEffect(() => {
    let alive = true;

    async function initialize() {
      setLoading(true);
      setMessage("");

      try {
        await checkSuperAdmin();

        if (!alive) {
          return;
        }

        await loadCompanies();
      } catch (error) {
        console.error(
          "구조분석 관리 초기화:",
          error,
        );

        if (!alive) {
          return;
        }

        setAuthorized(false);

        setMessage(
          `❌ ${
            error?.message ||
            "페이지를 불러오지 못했습니다."
          }`,
        );
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    }

    initialize();

    return () => {
      alive = false;
      stopRef.current = true;
    };
  }, [
    checkSuperAdmin,
    loadCompanies,
  ]);

  /* =========================================================
     업체 선택
  ========================================================= */

  async function handleCompanyChange(
    event,
  ) {
    const companyId =
      event.target.value;

    stopRef.current = true;

    setSelectedCompanyId(
      companyId,
    );

    setMessage("");

    setAnalysis({
      total: 0,
      completed: 0,
      remaining: 0,
      failed: 0,
      processed: 0,
      attempted: 0,
      running: false,
      finished: false,
      errors: [],
    });

    if (!companyId) {
      setSelectedCompanyName("");
      return;
    }

    const company =
      companies.find(
        (item) =>
          item.id === companyId,
      );

    setSelectedCompanyName(
      company?.company_name ||
        "선택 업체",
    );

    await loadStatus(
      companyId,
    );
  }

  /* =========================================================
     분석 현황 조회
  ========================================================= */

  async function loadStatus(
    companyId = selectedCompanyId,
  ) {
    if (!companyId) {
      setMessage(
        "⚠️ 분석할 업체를 선택해주세요.",
      );

      return;
    }

    setStatusLoading(true);
    setMessage("");

    try {
      const accessToken =
        await getAccessToken();

      const response =
        await fetch(
          `/api/analyze-work-structure?company_id=${encodeURIComponent(
            companyId,
          )}`,
          {
            method: "GET",

            headers: {
              Authorization:
                `Bearer ${accessToken}`,
            },

            cache: "no-store",
          },
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "구조분석 현황 조회 실패",
        );
      }

      setAnalysis(
        (current) => ({
          ...current,

          total:
            Number(
              data?.total || 0,
            ),

          completed:
            Number(
              data?.completed || 0,
            ),

          remaining:
            Number(
              data?.remaining || 0,
            ),

          finished:
            Boolean(
              data?.finished,
            ),

          running: false,
        }),
      );

      if (
        Number(
          data?.remaining || 0,
        ) === 0
      ) {
        setMessage(
          "✅ 이 업체의 구조분석이 모두 완료되어 있습니다.",
        );
      } else {
        setMessage(
          `분석이 필요한 사진이 ${Number(
            data?.remaining || 0,
          ).toLocaleString(
            "ko-KR",
          )}장 있습니다.`,
        );
      }
    } catch (error) {
      console.error(
        "구조분석 현황:",
        error,
      );

      setMessage(
        `❌ ${
          error?.message ||
          "현황 조회 중 오류가 발생했습니다."
        }`,
      );
    } finally {
      setStatusLoading(false);
    }
  }

  /* =========================================================
     구조분석 실행
  ========================================================= */

  async function runStructureAnalysis() {
    if (!selectedCompanyId) {
      setMessage(
        "⚠️ 분석할 업체를 먼저 선택해주세요.",
      );

      return;
    }

    if (analysis.running) {
      return;
    }

    if (
      Number(
        analysis.remaining || 0,
      ) <= 0
    ) {
      setMessage(
        "✅ 분석할 사진이 없습니다.",
      );

      return;
    }

    const confirmed =
      window.confirm(
        `${selectedCompanyName}의 기존 시공사진을 AI로 구조분석합니다.\n\n` +
        `현재 분석 필요: ${Number(
          analysis.remaining || 0,
        ).toLocaleString(
          "ko-KR",
        )}장\n\n` +
        "분석 중에는 OpenAI API 비용과 데이터 전송량이 발생합니다.\n계속할까요?",
      );

    if (!confirmed) {
      return;
    }

    stopRef.current = false;

    setMessage(
      "AI 구조분석을 시작합니다...",
    );

    setAnalysis(
      (current) => ({
        ...current,

        running: true,
        failed: 0,
        processed: 0,
        attempted: 0,
        errors: [],
      }),
    );

    let noProgressCount = 0;

    try {
      while (
        !stopRef.current
      ) {
        const accessToken =
          await getAccessToken();

        const response =
          await fetch(
            "/api/analyze-work-structure",
            {
              method: "POST",

              headers: {
                Authorization:
                  `Bearer ${accessToken}`,

                "Content-Type":
                  "application/json",
              },

              body:
                JSON.stringify({
                  company_id:
                    selectedCompanyId,

                  limit: 3,
                }),
            },
          );

        const data =
          await response.json();

        if (!response.ok) {
          throw new Error(
            data?.error ||
              "구조분석 요청 실패",
          );
        }

        const processed =
          Number(
            data?.processed || 0,
          );

        const failed =
          Number(
            data?.failed || 0,
          );

        const attempted =
          Number(
            data?.attempted || 0,
          );

        const newErrors =
          Array.isArray(
            data?.results,
          )
            ? data.results
                .filter(
                  (item) =>
                    item?.success ===
                    false,
                )
                .map(
                  (item) => ({
                    id:
                      item?.id ||
                      "",

                    error:
                      item?.error ||
                      "구조분석 실패",
                  }),
                )
            : [];

        setAnalysis(
          (current) => ({
            ...current,

            total:
              Number(
                data?.total || 0,
              ),

            completed:
              Number(
                data?.completed || 0,
              ),

            remaining:
              Number(
                data?.remaining || 0,
              ),

            processed:
              Number(
                current.processed ||
                  0,
              ) +
              processed,

            failed:
              Number(
                current.failed ||
                  0,
              ) +
              failed,

            attempted:
              Number(
                current.attempted ||
                  0,
              ) +
              attempted,

            finished:
              Boolean(
                data?.finished,
              ),

            errors: [
              ...current.errors,
              ...newErrors,
            ].slice(-20),

            running: true,
          }),
        );

        if (
          data?.finished ===
            true ||
          Number(
            data?.remaining || 0,
          ) === 0
        ) {
          setMessage(
            "✅ 구조분석이 모두 완료되었습니다.",
          );

          break;
        }

        if (processed <= 0) {
          noProgressCount += 1;
        } else {
          noProgressCount = 0;
        }

        /*
         * 실패 사진만 계속 반복되는 것을 방지
         */
        if (
          noProgressCount >= 2
        ) {
          setMessage(
            "⚠️ 더 이상 처리되지 않는 사진이 있어 자동으로 중지했습니다. 아래 실패 내용을 확인해주세요.",
          );

          break;
        }

        setMessage(
          `분석 중... 완료 ${Number(
            data?.completed || 0,
          ).toLocaleString(
            "ko-KR",
          )}장 / 남음 ${Number(
            data?.remaining || 0,
          ).toLocaleString(
            "ko-KR",
          )}장`,
        );

        /*
         * 연속 API 호출 간 짧은 간격
         */
        await new Promise(
          (resolve) =>
            setTimeout(
              resolve,
              700,
            ),
        );
      }

      if (
        stopRef.current
      ) {
        setMessage(
          "⚠️ 사용자가 구조분석을 중지했습니다.",
        );
      }
    } catch (error) {
      console.error(
        "구조분석 실행:",
        error,
      );

      setMessage(
        `❌ ${
          error?.message ||
          "구조분석 중 오류가 발생했습니다."
        }`,
      );
    } finally {
      setAnalysis(
        (current) => ({
          ...current,
          running: false,
        }),
      );
    }
  }

  /* =========================================================
     중지
  ========================================================= */

  function stopStructureAnalysis() {
    stopRef.current = true;

    setMessage(
      "⚠️ 현재 처리 중인 요청이 끝난 뒤 구조분석을 중지합니다.",
    );
  }

  /* =========================================================
     진행률
  ========================================================= */

  const progress =
    analysis.total > 0
      ? Math.min(
          100,
          Math.max(
            0,
            Math.round(
              (
                analysis.completed /
                analysis.total
              ) * 100,
            ),
          ),
        )
      : 0;

  /* =========================================================
     로딩
  ========================================================= */

  if (loading) {
    return (
      <main style={styles.page}>
        <div
          style={
            styles.centerBox
          }
        >
          <div
            style={
              styles.loadingIcon
            }
          >
            🛠️
          </div>

          <div
            style={
              styles.loadingTitle
            }
          >
            구조분석 관리 준비 중...
          </div>
        </div>
      </main>
    );
  }

  /* =========================================================
     권한 없음
  ========================================================= */

  if (!authorized) {
    return (
      <main style={styles.page}>
        <div
          style={
            styles.centerBox
          }
        >
          <div
            style={
              styles.loadingIcon
            }
          >
            🔒
          </div>

          <h2>
            접근할 수 없습니다
          </h2>

          <div
            style={{
              color: "#6b7280",
              fontSize: "13px",
            }}
          >
            슈퍼관리자 전용
            페이지입니다.
          </div>

          {message && (
            <div
              style={
                styles.errorBox
              }
            >
              {message}
            </div>
          )}

          <button
            type="button"
            style={
              styles.backButton
            }
            onClick={() => {
              window.location.href =
                "/admin";
            }}
          >
            관리자 페이지
          </button>
        </div>
      </main>
    );
  }

  /* =========================================================
     화면
  ========================================================= */

  return (
    <main style={styles.page}>
      <div
        style={
          styles.container
        }
      >
        {/* 헤더 */}

        <div
          style={
            styles.header
          }
        >
          <div>
            <div
              style={
                styles.badge
              }
            >
              SUPER ADMIN
            </div>

            <h1
              style={
                styles.title
              }
            >
              🛠️ 구조분석 관리
            </h1>

            <div
              style={
                styles.subtitle
              }
            >
              업체별 기존 시공사진의
              AI 구조분석을 관리합니다.
            </div>
          </div>

          <button
            type="button"
            style={
              styles.backButton
            }
            onClick={() => {
              window.location.href =
                "/super-admin";
            }}
          >
            ← 돌아가기
          </button>
        </div>

        {/* 안내 */}

        <section
          style={
            styles.warningBox
          }
        >
          <strong>
            ⚠️ 유지보수 전용 기능
          </strong>

          <div
            style={{
              marginTop: "5px",
              fontSize: "12px",
              lineHeight: 1.6,
            }}
          >
            구조분석을 실행하면
            시공사진을 AI로 분석하므로
            OpenAI API 사용량과 데이터
            전송량이 발생합니다.
            필요한 업체에만 실행하세요.
          </div>
        </section>

        {/* 업체 선택 */}

        <section
          style={
            styles.section
          }
        >
          <h2
            style={
              styles.sectionTitle
            }
          >
            분석 업체 선택
          </h2>

          <select
            value={
              selectedCompanyId
            }
            onChange={
              handleCompanyChange
            }
            disabled={
              analysis.running
            }
            style={
              styles.select
            }
          >
            <option value="">
              업체를 선택해주세요
            </option>

            {companies.map(
              (company) => (
                <option
                  key={
                    company.id
                  }
                  value={
                    company.id
                  }
                >
                  {company.company_name ||
                    "회사명 없음"}
                  {company.slug
                    ? ` / ${company.slug}`
                    : ""}
                </option>
              ),
            )}
          </select>

          {selectedCompanyId && (
            <button
              type="button"
              disabled={
                statusLoading ||
                analysis.running
              }
              onClick={() =>
                loadStatus()
              }
              style={
                styles.refreshButton
              }
            >
              {statusLoading
                ? "조회 중..."
                : "현황 새로고침"}
            </button>
          )}
        </section>

        {/* 분석 현황 */}

        {selectedCompanyId && (
          <section
            style={
              styles.section
            }
          >
            <div
              style={
                styles.sectionHeader
              }
            >
              <div>
                <h2
                  style={
                    styles.sectionTitle
                  }
                >
                  {selectedCompanyName}
                </h2>

                <div
                  style={
                    styles.sectionDescription
                  }
                >
                  구조분석 진행 현황
                </div>
              </div>

              {analysis.running && (
                <span
                  style={
                    styles.runningBadge
                  }
                >
                  분석 중
                </span>
              )}

              {!analysis.running &&
                analysis.finished && (
                  <span
                    style={
                      styles.doneBadge
                    }
                  >
                    완료
                  </span>
                )}
            </div>

            <div
              style={
                styles.statsGrid
              }
            >
              <StatCard
                label="전체"
                value={
                  analysis.total
                }
              />

              <StatCard
                label="완료"
                value={
                  analysis.completed
                }
              />

              <StatCard
                label="남음"
                value={
                  analysis.remaining
                }
              />

              <StatCard
                label="이번 실패"
                value={
                  analysis.failed
                }
              />
            </div>

            {/* 진행률 */}

            <div
              style={
                styles.progressHeader
              }
            >
              <span>
                진행률
              </span>

              <strong>
                {progress}%
              </strong>
            </div>

            <div
              style={
                styles.progressTrack
              }
            >
              <div
                style={{
                  ...styles.progressBar,
                  width:
                    `${progress}%`,
                }}
              />
            </div>

            {/* 이번 실행 */}

            {(analysis.processed >
              0 ||
              analysis.attempted >
                0) && (
              <div
                style={
                  styles.executionBox
                }
              >
                <div>
                  이번 실행 처리{" "}
                  <strong>
                    {Number(
                      analysis.processed,
                    ).toLocaleString(
                      "ko-KR",
                    )}
                  </strong>
                  장
                </div>

                <div>
                  시도{" "}
                  <strong>
                    {Number(
                      analysis.attempted,
                    ).toLocaleString(
                      "ko-KR",
                    )}
                  </strong>
                  장
                </div>

                <div>
                  실패{" "}
                  <strong>
                    {Number(
                      analysis.failed,
                    ).toLocaleString(
                      "ko-KR",
                    )}
                  </strong>
                  장
                </div>
              </div>
            )}

            {/* 메시지 */}

            {message && (
              <div
                style={{
                  ...styles.message,

                  ...(message.startsWith(
                    "❌",
                  )
                    ? styles.errorMessage
                    : message.startsWith(
                          "⚠️",
                        )
                      ? styles.warningMessage
                      : message.startsWith(
                            "✅",
                          )
                        ? styles.successMessage
                        : {}),
                }}
              >
                {message}
              </div>
            )}

            {/* 실행 버튼 */}

            {!analysis.running ? (
              <button
                type="button"
                onClick={
                  runStructureAnalysis
                }
                disabled={
                  statusLoading ||
                  analysis.remaining <=
                    0
                }
                style={{
                  ...styles.startButton,

                  opacity:
                    statusLoading ||
                    analysis.remaining <=
                      0
                      ? 0.5
                      : 1,
                }}
              >
                {analysis.remaining >
                0
                  ? `구조분석 시작 (${Number(
                      analysis.remaining,
                    ).toLocaleString(
                      "ko-KR",
                    )}장)`
                  : "분석할 사진 없음"}
              </button>
            ) : (
              <button
                type="button"
                onClick={
                  stopStructureAnalysis
                }
                style={
                  styles.stopButton
                }
              >
                분석 중지
              </button>
            )}
          </section>
        )}

        {/* 실패 목록 */}

        {analysis.errors.length >
          0 && (
          <section
            style={
              styles.section
            }
          >
            <h2
              style={
                styles.sectionTitle
              }
            >
              최근 실패
            </h2>

            <div
              style={{
                marginTop: "12px",
                display: "grid",
                gap: "8px",
              }}
            >
              {analysis.errors.map(
                (
                  item,
                  index,
                ) => (
                  <div
                    key={`${item.id}-${index}`}
                    style={
                      styles.errorItem
                    }
                  >
                    <div
                      style={{
                        fontWeight: 800,
                        fontSize: "11px",
                        wordBreak:
                          "break-all",
                      }}
                    >
                      {item.id ||
                        "사진 ID 없음"}
                    </div>

                    <div
                      style={{
                        marginTop: "4px",
                        fontSize: "12px",
                        color:
                          "#991b1b",
                        wordBreak:
                          "break-word",
                      }}
                    >
                      {item.error}
                    </div>
                  </div>
                ),
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

/* =========================================================
   통계 카드
========================================================= */

function StatCard({
  label,
  value,
}) {
  return (
    <div
      style={
        styles.statCard
      }
    >
      <div
        style={
          styles.statLabel
        }
      >
        {label}
      </div>

      <div
        style={
          styles.statValue
        }
      >
        {Number(
          value || 0,
        ).toLocaleString(
          "ko-KR",
        )}
      </div>
    </div>
  );
}

/* =========================================================
   스타일
========================================================= */

const styles = {
  page: {
    minHeight: "100vh",
    background: "#f3f4f6",
    color: "#111827",
    padding:
      "18px 14px 50px",
  },

  container: {
    width: "100%",
    maxWidth: "900px",
    margin: "0 auto",
  },

  header: {
    display: "flex",
    justifyContent:
      "space-between",
    alignItems:
      "flex-start",
    gap: "12px",
    marginBottom: "14px",
  },

  badge: {
    display: "inline-block",
    padding: "5px 8px",
    borderRadius: "999px",
    background: "#111827",
    color: "#ffffff",
    fontSize: "10px",
    fontWeight: 900,
    letterSpacing: "1px",
    marginBottom: "7px",
  },

  title: {
    margin: 0,
    fontSize: "25px",
    fontWeight: 900,
    letterSpacing: "-0.5px",
  },

  subtitle: {
    marginTop: "5px",
    color: "#6b7280",
    fontSize: "13px",
    lineHeight: 1.5,
  },

  backButton: {
    border:
      "1px solid #d1d5db",
    borderRadius: "10px",
    background: "#ffffff",
    padding: "10px 12px",
    fontWeight: 800,
    fontSize: "12px",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },

  centerBox: {
    width: "100%",
    maxWidth: "420px",
    margin: "100px auto 0",
    background: "#ffffff",
    border:
      "1px solid #e5e7eb",
    borderRadius: "18px",
    padding: "28px 20px",
    textAlign: "center",
  },

  loadingIcon: {
    fontSize: "40px",
    marginBottom: "10px",
  },

  loadingTitle: {
    fontSize: "18px",
    fontWeight: 900,
  },

  errorBox: {
    marginTop: "15px",
    padding: "10px",
    borderRadius: "9px",
    background: "#fef2f2",
    color: "#991b1b",
    fontSize: "12px",
    lineHeight: 1.5,
  },

  warningBox: {
    background: "#fffbeb",
    border:
      "1px solid #fde68a",
    color: "#92400e",
    borderRadius: "14px",
    padding: "13px",
    marginBottom: "14px",
  },

  section: {
    background: "#ffffff",
    border:
      "1px solid #e5e7eb",
    borderRadius: "16px",
    padding: "15px",
    marginBottom: "14px",
  },

  sectionHeader: {
    display: "flex",
    alignItems:
      "flex-start",
    justifyContent:
      "space-between",
    gap: "10px",
    marginBottom: "13px",
  },

  sectionTitle: {
    margin: 0,
    fontSize: "18px",
    fontWeight: 900,
  },

  sectionDescription: {
    marginTop: "4px",
    color: "#6b7280",
    fontSize: "12px",
  },

  select: {
    width: "100%",
    minHeight: "46px",
    boxSizing: "border-box",
    border:
      "1px solid #d1d5db",
    borderRadius: "10px",
    background: "#ffffff",
    padding: "0 11px",
    fontSize: "14px",
    outline: "none",
    marginTop: "12px",
  },

  refreshButton: {
    width: "100%",
    minHeight: "42px",
    marginTop: "9px",
    border:
      "1px solid #d1d5db",
    borderRadius: "10px",
    background: "#ffffff",
    fontWeight: 800,
    cursor: "pointer",
  },

  statsGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(4, minmax(0, 1fr))",
    gap: "6px",
  },

  statCard: {
    minWidth: 0,
    padding: "11px 4px",
    borderRadius: "10px",
    background: "#f8fafc",
    border:
      "1px solid #e5e7eb",
    textAlign: "center",
  },

  statLabel: {
    fontSize: "10px",
    color: "#6b7280",
    whiteSpace: "nowrap",
  },

  statValue: {
    marginTop: "4px",
    fontSize: "18px",
    fontWeight: 900,
  },

  runningBadge: {
    padding: "5px 9px",
    borderRadius: "999px",
    background: "#eff6ff",
    color: "#1d4ed8",
    fontSize: "11px",
    fontWeight: 900,
    whiteSpace: "nowrap",
  },

  doneBadge: {
    padding: "5px 9px",
    borderRadius: "999px",
    background: "#ecfdf5",
    color: "#047857",
    fontSize: "11px",
    fontWeight: 900,
    whiteSpace: "nowrap",
  },

  progressHeader: {
    display: "flex",
    justifyContent:
      "space-between",
    alignItems: "center",
    marginTop: "15px",
    marginBottom: "6px",
    fontSize: "12px",
    color: "#6b7280",
  },

  progressTrack: {
    width: "100%",
    height: "10px",
    borderRadius: "999px",
    overflow: "hidden",
    background: "#e5e7eb",
  },

  progressBar: {
    height: "100%",
    borderRadius: "999px",
    background: "#111827",
    transition:
      "width 0.25s ease",
  },

  executionBox: {
    display: "flex",
    flexWrap: "wrap",
    gap: "12px",
    marginTop: "12px",
    padding: "10px",
    borderRadius: "10px",
    background: "#f8fafc",
    fontSize: "12px",
    color: "#475569",
  },

  message: {
    marginTop: "12px",
    padding: "10px 12px",
    borderRadius: "10px",
    border:
      "1px solid #e5e7eb",
    background: "#f8fafc",
    fontSize: "12px",
    lineHeight: 1.55,
    whiteSpace: "pre-wrap",
  },

  successMessage: {
    background: "#ecfdf5",
    borderColor: "#a7f3d0",
    color: "#047857",
  },

  warningMessage: {
    background: "#fffbeb",
    borderColor: "#fde68a",
    color: "#92400e",
  },

  errorMessage: {
    background: "#fef2f2",
    borderColor: "#fecaca",
    color: "#991b1b",
  },

  startButton: {
    width: "100%",
    minHeight: "46px",
    marginTop: "14px",
    border: 0,
    borderRadius: "11px",
    background: "#111827",
    color: "#ffffff",
    fontSize: "14px",
    fontWeight: 900,
    cursor: "pointer",
  },

  stopButton: {
    width: "100%",
    minHeight: "46px",
    marginTop: "14px",
    border:
      "1px solid #f59e0b",
    borderRadius: "11px",
    background: "#ffffff",
    color: "#b45309",
    fontSize: "14px",
    fontWeight: 900,
    cursor: "pointer",
  },

  errorItem: {
    padding: "10px",
    borderRadius: "9px",
    border:
      "1px solid #fecaca",
    background: "#fef2f2",
  },
};
