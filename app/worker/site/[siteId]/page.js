"use client";

import ToolIllustration from "../../../components/ui/ToolIllustration";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  useParams,
  useRouter,
  useSearchParams,
} from "next/navigation";
import { supabase } from "../../../../lib/supabase";
import {
  loadMyWorkerSites,
  workerLoginUrl,
} from "../../../utils/workerSites";
import WorkerRequestPhotos from "./WorkerRequestPhotos";
import SiteOperations from "../../../components/SiteOperations";
import WorkerWorkReport from "./WorkerWorkReport";
import SiteExpenses from "../../../components/SiteExpenses";
import SiteDirections from "../../SiteDirections";
import SiteCuttingMaterials from "../../cutting/SiteCuttingMaterials";

const menus = [
  { id: "info", label: "현장정보", kind: "home" },
  { id: "film", label: "필름·재단", kind: "film" },
  { id: "photos", label: "요청사진", kind: "camera" },
  { id: "expenses", label: "경비", kind: "money" },
  { id: "report", label: "완료보고", kind: "report" },
];

const card = {
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 22,
  padding: 18,
  marginTop: 12,
  boxShadow: "var(--film-shadow)",
};

const action = {
  minHeight: 44,
  padding: "10px 14px",
  border: "1px solid #cbd5e1",
  borderRadius: 12,
  background: "#fff",
  color: "#334155",
  fontWeight: 800,
  cursor: "pointer",
};

const muted = {
  color: "#64748b",
  fontSize: 13,
  lineHeight: 1.7,
};

const statusMap = {
  scheduled: {
    label: "시공 예정",
    color: "#1d4ed8",
    background: "#eff6ff",
  },
  in_progress: {
    label: "시공 중",
    color: "#1d4ed8",
    background: "#eff6ff",
  },
  completed: {
    label: "시공 완료",
    color: "#15803d",
    background: "#f0fdf4",
  },
  cancelled: {
    label: "취소",
    color: "#b91c1c",
    background: "#fef2f2",
  },
};

function dateText(value, withTime = false) {
  if (!value) return "미정";

  const date = new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? `${value}T00:00:00+09:00`
      : value
  );

  if (Number.isNaN(date.getTime())) return "미정";

  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
    ...(withTime
      ? {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }
      : {}),
  }).format(date);
}

export default function WorkerSiteDetailPage() {
  const router = useRouter();
  const siteId = useParams()?.siteId;
  const searchParams = useSearchParams();

  const requestedSection = menus.some(
    (menu) => menu.id === searchParams.get("section")
  )
    ? searchParams.get("section")
    : "info";

  const [loading, setLoading] = useState(true);
  const [site, setSite] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [message, setMessage] = useState("");
  const [materialsMessage, setMaterialsMessage] = useState("");
  const [tab, setTab] = useState(requestedSection);
  const [visited, setVisited] = useState(() => ({
    info: true,
    [requestedSection]: true,
  }));
  const [reportLoading, setReportLoading] = useState(true);
  const [reportStatus, setReportStatus] = useState(null);
  const [reportError, setReportError] = useState("");

  const detailRequest = useRef(0);
  const reportRequest = useRef(0);

  const loadReportStatus = useCallback(async () => {
    const requestId = ++reportRequest.current;

    setReportLoading(true);
    setReportError("");

    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;

      const token = data?.session?.access_token;

      if (!token) {
        throw new Error("시공자로 다시 로그인해주세요.");
      }

      const response = await fetch(
        `/api/worker/site-work-report?siteId=${encodeURIComponent(
          siteId
        )}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        }
      );

      const result = await response.json();

      if (!response.ok || !result?.success) {
        throw new Error(
          result?.error || "완료보고 상태를 확인하지 못했습니다."
        );
      }

      if (requestId === reportRequest.current) {
        setReportStatus({
          hasReport: Boolean(result.hasReport && result.report),
          report: result.report || null,
          canSubmit: Boolean(result.canSubmit),
        });
      }
    } catch (error) {
      if (requestId === reportRequest.current) {
        setReportStatus(null);
        setReportError(
          error.message || "완료보고 상태를 확인하지 못했습니다."
        );
      }
    } finally {
      if (requestId === reportRequest.current) {
        setReportLoading(false);
      }
    }
  }, [siteId]);

  const loadSiteDetail = useCallback(async () => {
    const requestId = ++detailRequest.current;

    setLoading(true);
    setMessage("");
    setMaterialsMessage("");

    try {
      const result = await loadMyWorkerSites({ siteId });

      if (requestId !== detailRequest.current) return;

      setSite(result.site);
      setMaterials(result.materials || []);
      setMaterialsMessage(result.materialsError || "");

      void loadReportStatus();
    } catch (error) {
      if (requestId !== detailRequest.current) return;

      setSite(null);
      setMaterials([]);
      setMessage(
        error.message || "현장 정보를 불러오지 못했습니다."
      );

      if (error.status === 401) {
        router.replace(workerLoginUrl());
      }
    } finally {
      if (requestId === detailRequest.current) {
        setLoading(false);
      }
    }
  }, [siteId, router, loadReportStatus]);

  useEffect(() => {
    setTab(requestedSection);
    setVisited({
      info: true,
      [requestedSection]: true,
    });
    setSite(null);
    setMaterials([]);
    setReportStatus(null);
    setReportError("");

    if (siteId) void loadSiteDetail();

    return () => {
      detailRequest.current += 1;
      reportRequest.current += 1;
    };
  }, [siteId, loadSiteDetail, requestedSection]);

  function chooseTab(id) {
    setVisited((previous) => ({ ...previous, [id]: true }));
    setTab(id);
  }

  if (loading) {
    return (
      <main style={{ padding: 24, ...muted }}>
        현장 정보를 불러오고 있습니다…
      </main>
    );
  }

  if (!site) {
    return (
      <main
        style={{
          maxWidth: 680,
          margin: "0 auto",
          padding: 20,
        }}
      >
        <a href="/worker" style={{ color: "#2563eb" }}>
          ← 내 현장으로
        </a>

        <section style={card}>
          <h2>현장 정보를 볼 수 없습니다.</h2>

          <p role="alert" style={muted}>
            {message || "현재 배정된 현장이 아닙니다."}
          </p>

          <button
            type="button"
            style={action}
            onClick={loadSiteDetail}
          >
            다시 확인
          </button>
        </section>
      </main>
    );
  }

  const status = statusMap[site.status] || statusMap.scheduled;
  const report = reportStatus?.hasReport
    ? reportStatus.report
    : null;

  const reportLabel = reportLoading
    ? ""
    : report?.review_status === "pending"
      ? "검수 대기"
      : report?.review_status === "approved"
        ? "승인 완료"
        : report?.review_status === "rejected"
          ? "보완 요청"
          : "";

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--film-bg)",
        color: "#182c47",
        paddingBottom: 28,
      }}
    >
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "#fffcf8",
          borderBottom: "1px solid #e2e8f0",
        }}
      >
        <div
          style={{
            maxWidth: 720,
            margin: "0 auto",
            padding: "12px 16px",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
            }}
          >
            <button
              type="button"
              aria-label="내 현장으로 돌아가기"
              onClick={() => router.push("/worker")}
              style={{ ...action, fontSize: 22 }}
            >
              ←
            </button>

            <div style={{ flex: 1, minWidth: 0 }}>
              <small style={{ color: "#64748b" }}>
                현장 상세 ·{" "}
                {site.my_role === "leader" ? "책임 팀장" : "팀원"}
              </small>

              <h1
                style={{
                  margin: "3px 0 0",
                  fontSize: 19,
                  overflowWrap: "anywhere",
                }}
              >
                {site.site_name || site.customer_name || "현장"}
              </h1>
            </div>

            <span
              style={{
                color: status.color,
                background: status.background,
                padding: "6px 9px",
                borderRadius: 20,
                fontSize: 11,
                fontWeight: 800,
                whiteSpace: "nowrap",
              }}
            >
              {status.label}
            </span>
          </div>

          <nav
            aria-label="현장 상세 메뉴"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
              gap: 5,
              marginTop: 12,
            }}
          >
            {menus.map((menu) => (
              <button
                key={menu.id}
                type="button"
                aria-pressed={tab === menu.id}
                aria-controls={`site-panel-${menu.id}`}
                onClick={() => chooseTab(menu.id)}
                style={{
                  border:
                    tab === menu.id
                      ? "1px solid #81b4f7"
                      : "1px solid #e2e8f0",
                  borderRadius: 15,
                  minHeight: 76,
                  padding: "9px 2px",
                  background: tab === menu.id ? "#edf5ff" : "#fff",
                  color: tab === menu.id ? "#1d4ed8" : "#475569",
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                <span
                  style={{
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  <ToolIllustration kind={menu.kind} size={36} />
                </span>

                {menu.label}

                {menu.id === "report" && reportLabel && (
                  <small
                    style={{
                      display: "block",
                      fontSize: 10,
                      marginTop: 3,
                    }}
                  >
                    {reportLabel}
                  </small>
                )}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <div
        style={{
          maxWidth: 720,
          margin: "0 auto",
          padding: "0 16px",
        }}
      >
        <section
          id="site-panel-info"
          aria-label="현장정보"
          hidden={tab !== "info"}
        >
          <SiteOperations
            siteId={siteId}
            onCurrentData={async () => {
              const requestId = ++detailRequest.current;
              const result = await loadMyWorkerSites({ siteId });

              if (requestId !== detailRequest.current) {
                throw new Error(
                  "현장이 변경되었습니다. 다시 확인해주세요."
                );
              }

              setSite(result.site);
              setMaterials(result.materials || []);
              setMaterialsMessage(result.materialsError || "");
            }}
          />

          {site.memo?.trim() && (
            <div
              style={{
                ...card,
                background: "#fffbeb",
                borderColor: "#fcd34d",
              }}
            >
              <h2 style={{ margin: "0 0 10px", fontSize: 16 }}>
                📌 현장 메모 · 전달사항
              </h2>

              <p
                style={{
                  ...muted,
                  margin: 0,
                  color: "#713f12",
                  whiteSpace: "pre-wrap",
                  overflowWrap: "anywhere",
                }}
              >
                {site.memo}
              </p>
            </div>
          )}

          <div style={card}>
            <h2 style={{ margin: "0 0 12px", fontSize: 16 }}>
              📅 내 작업 일정
            </h2>

            {site.assigned_dates?.length ? (
              <div style={{ display: "grid", gap: 8 }}>
                {site.assigned_dates.map((day) => (
                  <div
                    key={day.work_date}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 12,
                      background: "#edf5ff",
                      fontSize: 13,
                    }}
                  >
                    <strong>{dateText(day.work_date)}</strong>
                    {" · "}
                    {day.role === "leader" ? "팀장" : "팀원"}
                  </div>
                ))}
              </div>
            ) : (
              <p style={muted}>
                {dateText(site.schedule_start)}
                {site.schedule_end &&
                dateText(site.schedule_end) !==
                  dateText(site.schedule_start)
                  ? ` ~ ${dateText(site.schedule_end)}`
                  : ""}
              </p>
            )}

            {site.schedule_notice && (
              <p style={{ ...muted, color: "#b45309" }}>
                {site.schedule_notice}
              </p>
            )}
          </div>

          <div style={card}>
            <h2 style={{ margin: "0 0 12px", fontSize: 16 }}>
              🏠 현장정보
            </h2>

            <InfoRow label="고객" value={site.customer_name} />
            <InfoRow label="지역" value={site.region} />
            <InfoRow
              label="주소"
              value={<SiteDirections site={site} />}
            />
            <InfoRow label="시공" value={site.work_type} />

            {site.work_description && (
              <div
                style={{
                  marginTop: 14,
                  padding: 12,
                  borderRadius: 12,
                  background: "var(--film-bg)",
                }}
              >
                <strong style={{ fontSize: 13 }}>
                  작업 내용
                </strong>

                <p
                  style={{
                    ...muted,
                    margin: "6px 0 0",
                    whiteSpace: "pre-wrap",
                    overflowWrap: "anywhere",
                  }}
                >
                  {site.work_description}
                </p>
              </div>
            )}

            {site.customer_phone && (
              <a
                href={`tel:${site.customer_phone}`}
                style={{
                  ...action,
                  display: "block",
                  textDecoration: "none",
                  textAlign: "center",
                  marginTop: 14,
                }}
              >
                📞 고객 전화 · {site.customer_phone}
              </a>
            )}
          </div>
        </section>

        {visited.film && (
          <section
            id="site-panel-film"
            aria-label="필름과 재단"
            hidden={tab !== "film"}
          >
            {materialsMessage ? (
              <div role="alert" style={card}>
                <p style={{ ...muted, color: "#b91c1c" }}>
                  {materialsMessage}
                </p>

                <button
                  type="button"
                  style={action}
                  onClick={loadSiteDetail}
                >
                  다시 확인
                </button>
              </div>
            ) : (
              <>
                <SiteCuttingMaterials
                  siteId={siteId}
                  materials={materials}
                />

                {materials.some((material) => material.memo) && (
                  <details style={card}>
                    <summary
                      style={{
                        cursor: "pointer",
                        fontWeight: 800,
                        fontSize: 13,
                      }}
                    >
                      자재별 메모 보기
                    </summary>

                    {materials
                      .filter((material) => material.memo)
                      .map((material) => (
                        <div
                          key={material.material_id}
                          style={{ marginTop: 12 }}
                        >
                          <strong style={{ fontSize: 13 }}>
                            {[
                              material.brand,
                              material.product_code ||
                                material.product_name,
                            ]
                              .filter(Boolean)
                              .join(" / ")}
                          </strong>

                          <p
                            style={{
                              ...muted,
                              margin: "4px 0",
                              whiteSpace: "pre-wrap",
                              overflowWrap: "anywhere",
                            }}
                          >
                            {material.memo}
                          </p>
                        </div>
                      ))}
                  </details>
                )}
              </>
            )}
          </section>
        )}

        {visited.photos && (
          <section
            id="site-panel-photos"
            aria-label="요청사진"
            hidden={tab !== "photos"}
          >
            <WorkerRequestPhotos key={siteId} siteId={siteId} />
          </section>
        )}

        {visited.expenses && (
          <section
            id="site-panel-expenses"
            aria-label="현장 경비"
            hidden={tab !== "expenses"}
          >
            <SiteExpenses key={siteId} siteId={siteId} />
          </section>
        )}

        {visited.report && (
          <section
            id="site-panel-report"
            aria-label="완료보고"
            hidden={tab !== "report"}
          >
            <ReportPanel
              site={site}
              siteId={siteId}
              report={report}
              canSubmit={reportStatus?.canSubmit}
              loading={reportLoading}
              error={reportError}
              onRetry={loadReportStatus}
              onSubmitted={loadReportStatus}
            />
          </section>
        )}
      </div>
    </main>
  );
}

function InfoRow({ label, value }) {
  if (!value) return null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        marginTop: 10,
        fontSize: 13,
        lineHeight: 1.7,
      }}
    >
      <span
        style={{
          flex: "0 0 40px",
          color: "#94a3b8",
          fontWeight: 700,
        }}
      >
        {label}
      </span>

      <div
        style={{
          flex: 1,
          minWidth: 0,
          overflowWrap: "anywhere",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function ReportPanel({
  canSubmit,
  site,
  siteId,
  report,
  loading,
  error,
  onRetry,
  onSubmitted,
}) {
  if (site.status === "cancelled") {
    return (
      <div style={card}>
        <h2 style={{ fontSize: 16 }}>취소된 현장</h2>
        <p style={muted}>
          취소된 현장에는 완료보고를 등록할 수 없습니다.
        </p>
      </div>
    );
  }

  if (!loading && !error && !canSubmit) {
    return (
      <div style={card}>
        <h2 style={{ fontSize: 16 }}>완료보고</h2>
        <p style={muted}>
          이 현장의 책임 팀장이 완료보고를 작성합니다.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={card}>
        <p style={muted}>
          완료보고 상태를 확인하고 있습니다…
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={card}>
        <p
          role="alert"
          style={{ ...muted, color: "#b91c1c" }}
        >
          {error}
        </p>

        <button
          type="button"
          style={action}
          onClick={onRetry}
        >
          다시 확인
        </button>
      </div>
    );
  }

  const review = report?.review_status;

  if (review === "pending" || review === "approved") {
    return (
      <div style={card}>
        <h2
          style={{
            margin: "0 0 10px",
            fontSize: 17,
            color: review === "approved" ? "#15803d" : "#b45309",
          }}
        >
          {review === "approved"
            ? "🟢 완료보고 승인 완료"
            : "🟠 완료보고 제출 완료"}
        </h2>

        <p style={muted}>
          {review === "approved"
            ? "관리자가 완료보고 검수를 완료했습니다."
            : "관리자가 시공 내용과 사진을 확인하고 있습니다. 승인 전에는 AI 견적자료로 등록되지 않습니다."}
        </p>

        {report.work_summary && (
          <details style={{ marginTop: 14 }}>
            <summary
              style={{
                cursor: "pointer",
                fontWeight: 800,
                fontSize: 13,
              }}
            >
              제출한 시공 내용
            </summary>

            <p
              style={{
                ...muted,
                whiteSpace: "pre-wrap",
                overflowWrap: "anywhere",
              }}
            >
              {report.work_summary}
            </p>
          </details>
        )}

        {report.review_memo && (
          <div
            style={{
              padding: 12,
              borderRadius: 12,
              background: "var(--film-bg)",
              marginTop: 12,
            }}
          >
            <strong style={{ fontSize: 13 }}>
              관리자 메모
            </strong>

            <p
              style={{
                ...muted,
                margin: "5px 0 0",
                whiteSpace: "pre-wrap",
                overflowWrap: "anywhere",
              }}
            >
              {report.review_memo}
            </p>
          </div>
        )}

        <p style={{ ...muted, fontSize: 11 }}>
          {review === "approved" ? "검수일시" : "제출일시"}{" "}
          {dateText(
            review === "approved"
              ? report.reviewed_at
              : report.completed_at,
            true
          )}
        </p>
      </div>
    );
  }

  return (
    <>
      {site.status === "completed" && (
        <div style={{ ...card, background: "#f0fdf4" }}>
          <p
            style={{
              ...muted,
              margin: 0,
              color: "#15803d",
            }}
          >
            ✅ 시공 완료 현장입니다.
            완료보고를 작성하거나 보완할 수 있습니다.
          </p>
        </div>
      )}

      {review === "rejected" && (
        <div style={{ ...card, background: "#fef2f2" }}>
          <strong style={{ color: "#b91c1c" }}>
            🔴 관리자 보완 요청
          </strong>

          <p
            style={{
              ...muted,
              marginBottom: 0,
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
            }}
          >
            {report.review_memo ||
              "완료보고 내용을 확인한 후 다시 제출해주세요."}
          </p>
        </div>
      )}

      <WorkerWorkReport
        key={siteId}
        siteId={siteId}
        site={site}
        onSubmitted={onSubmitted}
      />
    </>
  );
              }
