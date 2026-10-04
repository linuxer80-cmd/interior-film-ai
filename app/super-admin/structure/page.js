"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabase";
import ToolIllustration from "../../components/ui/ToolIllustration";

const EMPTY_ANALYSIS = {
  total: 0,
  completed: 0,
  remaining: 0,
  failed: 0,
  processed: 0,
  attempted: 0,
  running: false,
  finished: false,
  errors: [],
};

export default function StructureAnalysisPage() {
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [message, setMessage] = useState("");
  const [statusLoading, setStatusLoading] = useState(false);
  const [analysis, setAnalysis] = useState(EMPTY_ANALYSIS);

  const stopRef = useRef(false);
  const runningRef = useRef(false);

  const selectedCompanyName =
    companies.find((item) => item.id === selectedCompanyId)
      ?.company_name || "선택 업체";

  const checkSuperAdmin = useCallback(async () => {
    const {
      data: authData,
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      throw new Error(`로그인 확인 실패: ${authError.message}`);
    }

    if (!authData?.user?.id) {
      throw new Error("로그인이 필요합니다.");
    }

    const { data, error } = await supabase.rpc(
      "get_super_admin_status"
    );

    if (error) {
      throw new Error(`슈퍼관리자 확인 실패: ${error.message}`);
    }

    const status = Array.isArray(data) ? data[0] : data;

    if (!status?.is_super_admin) {
      throw new Error("슈퍼관리자 권한이 없습니다.");
    }

    setAuthorized(true);
  }, []);

  const loadCompanies = useCallback(async () => {
    const { data, error } = await supabase.rpc(
      "super_admin_get_companies"
    );

    if (error) {
      throw new Error(`업체 목록 조회 실패: ${error.message}`);
    }

    setCompanies(Array.isArray(data) ? data : []);
  }, []);

  async function getAccessToken() {
    const { data, error } = await supabase.auth.getSession();

    if (error) {
      throw new Error(`로그인 정보 확인 실패: ${error.message}`);
    }

    const token = data?.session?.access_token;

    if (!token) {
      throw new Error("로그인이 필요합니다.");
    }

    return token;
  }

  useEffect(() => {
    let alive = true;

    async function initialize() {
      setLoading(true);
      setMessage("");

      try {
        await checkSuperAdmin();
        if (!alive) return;

        await loadCompanies();
      } catch (error) {
        console.error("구조분석 관리 초기화:", error);

        if (!alive) return;

        setMessage(
          `❌ ${error?.message || "페이지를 불러오지 못했습니다."}`
        );
      } finally {
        if (alive) setLoading(false);
      }
    }

    initialize();

    return () => {
      alive = false;
      stopRef.current = true;
    };
  }, [checkSuperAdmin, loadCompanies]);

  async function handleCompanyChange(event) {
    if (runningRef.current || statusLoading) return;

    const companyId = event.target.value;

    stopRef.current = true;
    setSelectedCompanyId(companyId);
    setMessage("");
    setAnalysis({ ...EMPTY_ANALYSIS, errors: [] });

    if (companyId) {
      await loadStatus(companyId);
    }
  }

  async function loadStatus(companyId = selectedCompanyId) {
    if (!companyId) {
      setMessage("⚠️ 분석할 업체를 선택해주세요.");
      return;
    }

    if (runningRef.current) return;

    setStatusLoading(true);
    setMessage("");

    try {
      const token = await getAccessToken();

      const response = await fetch(
        `/api/analyze-work-structure?company_id=${encodeURIComponent(
          companyId
        )}`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error || "구조분석 현황 조회에 실패했습니다."
        );
      }

      const remaining = Number(data.remaining || 0);

      setAnalysis((current) => ({
        ...current,
        total: Number(data.total || 0),
        completed: Number(data.completed || 0),
        remaining,
        finished: Boolean(data.finished),
        running: false,
      }));

      setMessage(
        remaining === 0
          ? "✅ 이 업체의 구조분석이 모두 완료되어 있습니다."
          : `분석이 필요한 사진이 ${remaining.toLocaleString(
              "ko-KR"
            )}장 있습니다.`
      );
    } catch (error) {
      console.error("구조분석 현황:", error);
      setMessage(
        `❌ ${error?.message || "현황 조회 중 오류가 발생했습니다."}`
      );
    } finally {
      setStatusLoading(false);
    }
  }

  async function runStructureAnalysis() {
    if (runningRef.current || statusLoading) return;

    if (!selectedCompanyId) {
      setMessage("⚠️ 분석할 업체를 먼저 선택해주세요.");
      return;
    }

    if (analysis.remaining <= 0) {
      setMessage("✅ 분석할 사진이 없습니다.");
      return;
    }

    const confirmed = window.confirm(
      `${selectedCompanyName}의 기존 시공사진을 AI로 구조분석합니다.\n\n` +
        `분석 필요: ${Number(analysis.remaining).toLocaleString(
          "ko-KR"
        )}장\n\n` +
        "분석 중에는 OpenAI API 비용과 데이터 전송량이 발생합니다.\n계속할까요?"
    );

    if (!confirmed) return;

    const companyId = selectedCompanyId;
    runningRef.current = true;
    stopRef.current = false;

    setMessage("AI 구조분석을 시작합니다...");
    setAnalysis((current) => ({
      ...current,
      running: true,
      failed: 0,
      processed: 0,
      attempted: 0,
      errors: [],
    }));

    let noProgressCount = 0;

    try {
      while (!stopRef.current) {
        const token = await getAccessToken();

        if (stopRef.current) break;

        const response = await fetch("/api/analyze-work-structure", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            company_id: companyId,
            limit: 3,
          }),
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data.error || "구조분석 요청 실패");
        }

        const processed = Number(data.processed || 0);
        const failed = Number(data.failed || 0);
        const attempted = Number(data.attempted || 0);

        const newErrors = Array.isArray(data.results)
          ? data.results
              .filter((item) => item?.success === false)
              .map((item) => ({
                id: item.id || "",
                error: item.error || "구조분석 실패",
              }))
          : [];

        setAnalysis((current) => ({
          ...current,
          total: Number(data.total || 0),
          completed: Number(data.completed || 0),
          remaining: Number(data.remaining || 0),
          processed: current.processed + processed,
          failed: current.failed + failed,
          attempted: current.attempted + attempted,
          finished: Boolean(data.finished),
          errors: [...current.errors, ...newErrors].slice(-20),
          running: true,
        }));

        if (
          data.finished === true ||
          Number(data.remaining || 0) === 0
        ) {
          setMessage("✅ 구조분석이 모두 완료되었습니다.");
          break;
        }

        if (stopRef.current) break;

        noProgressCount = processed <= 0 ? noProgressCount + 1 : 0;

        if (noProgressCount >= 2) {
          setMessage(
            "⚠️ 더 이상 처리되지 않는 사진이 있어 자동으로 중지했습니다. 최근 실패 내용을 확인해주세요."
          );
          break;
        }

        setMessage(
          `분석 중... 완료 ${Number(
            data.completed || 0
          ).toLocaleString("ko-KR")}장 / 남음 ${Number(
            data.remaining || 0
          ).toLocaleString("ko-KR")}장`
        );

        await new Promise((resolve) => setTimeout(resolve, 700));
      }

      if (stopRef.current) {
        setMessage("⚠️ 구조분석을 중지했습니다.");
      }
    } catch (error) {
      console.error("구조분석 실행:", error);
      setMessage(
        `❌ ${error?.message || "구조분석 중 오류가 발생했습니다."}`
      );
    } finally {
      runningRef.current = false;
      setAnalysis((current) => ({ ...current, running: false }));
    }
  }

  function stopStructureAnalysis() {
    stopRef.current = true;
    setMessage(
      "⚠️ 현재 처리 중인 요청이 끝난 뒤 구조분석을 중지합니다."
    );
  }

  const progress =
    analysis.total > 0
      ? Math.min(
          100,
          Math.max(
            0,
            Math.round((analysis.completed / analysis.total) * 100)
          )
        )
      : 0;

  if (loading || !authorized) {
    return (
      <main style={styles.page}>
        <section style={styles.centerCard}>
          <div style={{ fontSize: 40 }}>{loading ? "🛠️" : "🔒"}</div>

          <h1 style={styles.centerTitle}>
            {loading
              ? "구조분석 관리 준비 중..."
              : "접근할 수 없습니다"}
          </h1>

          {!loading && (
            <>
              <p style={styles.help}>슈퍼관리자 전용 페이지입니다.</p>

              {message && (
                <div role="alert" style={styles.error}>
                  {message}
                </div>
              )}

              <Link
                href="/super-admin"
                style={{
                  ...styles.button,
                  display: "block",
                  marginTop: 20,
                  textDecoration: "none",
                }}
              >
                돌아가기
              </Link>
            </>
          )}
        </section>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <div style={styles.container}>
        <header style={styles.header}>
          <Link
            href="/super-admin"
            aria-label="슈퍼관리자로 돌아가기"
            style={styles.back}
          >
            ←
          </Link>

          <div style={{ flex: 1, minWidth: 0 }}>
            <small style={styles.eyebrow}>필름장이 · 슈퍼관리자</small>
            <h1 style={styles.title}>구조분석 관리</h1>
            <p style={styles.help}>기존 시공사진의 AI 분석 현황</p>
          </div>

          <ToolIllustration kind="camera" size={52} />
        </header>

        <div style={styles.notice}>
          <strong>유지보수 전용 기능</strong>
          <div style={{ marginTop: 5 }}>
            실행 시 AI API 비용과 데이터 전송량이 발생합니다.
            필요한 업체에만 실행해주세요.
          </div>
        </div>

        <section style={styles.card}>
          <h2 style={styles.sectionTitle}>분석 업체 선택</h2>

          <select
            aria-label="분석할 업체 선택"
            value={selectedCompanyId}
            onChange={handleCompanyChange}
            disabled={analysis.running || statusLoading}
            style={styles.select}
          >
            <option value="">업체를 선택해주세요</option>

            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.company_name || "회사명 없음"}
                {company.slug ? ` / ${company.slug}` : ""}
              </option>
            ))}
          </select>

          {selectedCompanyId && (
            <button
              type="button"
              disabled={statusLoading || analysis.running}
              onClick={() => loadStatus()}
              style={{
                ...styles.button,
                width: "100%",
                marginTop: 10,
                ...(statusLoading || analysis.running
                  ? styles.disabled
                  : {}),
              }}
            >
              {statusLoading ? "조회 중..." : "현황 새로고침"}
            </button>
          )}
        </section>

        {message && (
          <div
            role="status"
            style={{
              ...styles.message,
              ...(message.startsWith("❌")
                ? styles.error
                : message.startsWith("⚠️")
                  ? styles.warning
                  : message.startsWith("✅")
                    ? styles.success
                    : {}),
            }}
          >
            {message}
          </div>
        )}

        {selectedCompanyId && (
          <section style={styles.card}>
            <div style={styles.sectionHeader}>
              <div style={{ minWidth: 0 }}>
                <h2 style={styles.sectionTitle}>
                  {selectedCompanyName}
                </h2>
                <p style={styles.help}>구조분석 진행 현황</p>
              </div>

              {(analysis.running || analysis.finished) && (
                <span
                  style={{
                    ...styles.badge,
                    background: analysis.running
                      ? "#eaf3ff"
                      : "#ecfdf5",
                    color: analysis.running ? "#3268bd" : "#047857",
                  }}
                >
                  {analysis.running ? "분석 중" : "완료"}
                </span>
              )}
            </div>

            <div style={styles.statsGrid}>
              {[
                ["전체", analysis.total],
                ["완료", analysis.completed],
                ["남음", analysis.remaining],
                ["이번 실패", analysis.failed],
              ].map(([label, value]) => (
                <div key={label} style={styles.statCard}>
                  <div style={styles.help}>{label}</div>
                  <strong
                    style={{
                      ...styles.statValue,
                      color: label === "이번 실패"
                        ? "#b91c1c"
                        : "#3268bd",
                    }}
                  >
                    {Number(value || 0).toLocaleString("ko-KR")}
                  </strong>
                </div>
              ))}
            </div>

            <div style={styles.progressHeader}>
              <span>진행률</span>
              <strong>{progress}%</strong>
            </div>

            <div
              role="progressbar"
              aria-label="구조분석 진행률"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
              style={styles.progressTrack}
            >
              <div
                style={{ ...styles.progressBar, width: `${progress}%` }}
              />
            </div>

            {(analysis.processed > 0 || analysis.attempted > 0) && (
              <div style={styles.execution}>
                <span>
                  이번 처리 {analysis.processed.toLocaleString("ko-KR")}장
                </span>
                <span>
                  시도 {analysis.attempted.toLocaleString("ko-KR")}장
                </span>
                <span>
                  실패 {analysis.failed.toLocaleString("ko-KR")}장
                </span>
              </div>
            )}

            {analysis.running ? (
              <button
                type="button"
                onClick={stopStructureAnalysis}
                style={{
                  ...styles.button,
                  width: "100%",
                  marginTop: 20,
                  color: "#a16207",
                  borderColor: "#f2d58b",
                }}
              >
                분석 중지
              </button>
            ) : (
              <button
                type="button"
                onClick={runStructureAnalysis}
                disabled={statusLoading || analysis.remaining <= 0}
                style={{
                  ...styles.primary,
                  ...(statusLoading || analysis.remaining <= 0
                    ? styles.disabled
                    : {}),
                }}
              >
                {analysis.remaining > 0
                  ? `구조분석 시작 · ${analysis.remaining.toLocaleString(
                      "ko-KR"
                    )}장`
                  : "분석할 사진 없음"}
              </button>
            )}

            <p style={styles.help}>
              분석 중에는 이 페이지를 열어두세요. 중지하면 진행 중인
              요청을 마친 뒤 다음 요청을 멈춥니다.
            </p>
          </section>
        )}

        {analysis.errors.length > 0 && (
          <details style={styles.card}>
            <summary style={styles.summary}>
              최근 실패 내역 · {analysis.errors.length}건
            </summary>

            <div style={styles.errorList}>
              {analysis.errors.map((item, index) => (
                <div
                  key={`${item.id}-${index}`}
                  style={styles.errorItem}
                >
                  <strong style={styles.errorId}>
                    {item.id || "사진 ID 없음"}
                  </strong>

                  <div style={{ marginTop: 6 }}>{item.error}</div>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    boxSizing: "border-box",
    background: "var(--film-bg, #f8f7f3)",
    color: "#243247",
    padding: "24px 16px 60px",
  },
  container: {
    width: "100%",
    maxWidth: 760,
    margin: "0 auto",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 24,
  },
  back: {
    width: 44,
    height: 44,
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid #dfe6ef",
    borderRadius: 14,
    background: "#ffffff",
    color: "#50617a",
    fontSize: 24,
    textDecoration: "none",
  },
  eyebrow: {
    color: "#7b8798",
    fontSize: 12,
    fontWeight: 800,
  },
  title: {
    margin: "6px 0",
    fontSize: 26,
    letterSpacing: "-0.7px",
  },
  help: {
    margin: "6px 0 0",
    color: "#7b8798",
    fontSize: 12,
    lineHeight: 1.7,
  },
  notice: {
    padding: 16,
    marginBottom: 16,
    border: "1px solid #f2e1b5",
    borderRadius: 18,
    background: "#fff9e9",
    color: "#946624",
    fontSize: 12,
    lineHeight: 1.8,
  },
  card: {
    padding: 18,
    marginBottom: 16,
    border: "1px solid #e4eaf2",
    borderRadius: 22,
    background: "#ffffff",
    boxShadow: "0 6px 20px rgba(48,77,116,0.04)",
  },
  sectionTitle: {
    margin: 0,
    fontSize: 18,
    overflowWrap: "anywhere",
  },
  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 16,
  },
  select: {
    width: "100%",
    minHeight: 48,
    marginTop: 14,
    boxSizing: "border-box",
    padding: "10px 12px",
    border: "1px solid #dfe6ef",
    borderRadius: 14,
    background: "#fbfcfe",
    color: "#243247",
    fontSize: 16,
  },
  button: {
    minHeight: 44,
    boxSizing: "border-box",
    padding: "10px 14px",
    border: "1px solid #dfe6ef",
    borderRadius: 14,
    background: "#ffffff",
    color: "#50617a",
    fontSize: 13,
    fontWeight: 800,
    cursor: "pointer",
    textAlign: "center",
  },
  primary: {
    width: "100%",
    minHeight: 50,
    marginTop: 20,
    padding: 14,
    border: "none",
    borderRadius: 15,
    background: "var(--film-blue, #3478ed)",
    color: "#ffffff",
    fontSize: 14,
    fontWeight: 800,
    cursor: "pointer",
  },
  disabled: {
    opacity: 0.5,
    cursor: "not-allowed",
  },
  message: {
    padding: 14,
    marginBottom: 16,
    borderRadius: 14,
    background: "#edf3fb",
    color: "#50617a",
    fontSize: 12,
    lineHeight: 1.8,
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
  },
  error: {
    padding: 14,
    borderRadius: 14,
    background: "#fff1f2",
    color: "#b91c1c",
    fontSize: 12,
    lineHeight: 1.8,
  },
  warning: {
    background: "#fff9e9",
    color: "#946624",
  },
  success: {
    background: "#ecfdf5",
    color: "#047857",
  },
  badge: {
    flexShrink: 0,
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 800,
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 10,
  },
  statCard: {
    minWidth: 0,
    padding: 15,
    border: "1px solid #e4eaf2",
    borderRadius: 16,
    background: "#fbfcfe",
  },
  statValue: {
    display: "block",
    marginTop: 8,
    fontSize: 25,
    overflowWrap: "anywhere",
  },
  progressHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    margin: "20px 0 8px",
    color: "#50617a",
    fontSize: 12,
  },
  progressTrack: {
    height: 12,
    borderRadius: 999,
    overflow: "hidden",
    background: "#eaf0f7",
  },
  progressBar: {
    height: "100%",
    borderRadius: 999,
    background: "var(--film-blue, #3478ed)",
    transition: "width 0.25s ease",
  },
  execution: {
    display: "flex",
    flexWrap: "wrap",
    gap: 12,
    padding: 14,
    marginTop: 14,
    borderRadius: 14,
    background: "#f3f7fc",
    color: "#50617a",
    fontSize: 12,
    lineHeight: 1.7,
  },
  summary: {
    cursor: "pointer",
    color: "#50617a",
    fontSize: 14,
    fontWeight: 800,
  },
  errorList: {
    display: "grid",
    gap: 10,
    marginTop: 16,
  },
  errorItem: {
    padding: 14,
    borderRadius: 14,
    background: "#fff1f2",
    color: "#b91c1c",
    fontSize: 12,
    lineHeight: 1.8,
    overflowWrap: "anywhere",
  },
  errorId: {
    fontSize: 11,
  },
  centerCard: {
    maxWidth: 420,
    boxSizing: "border-box",
    margin: "70px auto 0",
    padding: "28px 22px",
    border: "1px solid #e4eaf2",
    borderRadius: 24,
    background: "#ffffff",
    textAlign: "center",
  },
  centerTitle: {
    margin: "16px 0 8px",
    fontSize: 20,
  },
};
