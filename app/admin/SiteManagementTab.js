"use client";

import { useEffect, useMemo, useState } from "react";
import SiteRegisterModal from "./SiteRegisterModal";
import SiteWorkerAssignment from "./SiteWorkerAssignment";
import WorkerManagement from "./WorkerManagement";

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

export default function SiteManagementTab({
  sites = [],
  sitesLoading = false,
  sitesMessage = "",

  createSite,
  updateSiteStatus,

  selectedSite,
  openSite,
  closeSite,

  workers = [],
  workersLoading = false,
  workersMessage = "",

  loadWorkers,
  createWorker,
  updateWorker,
  setWorkerActive,

  assignSiteWorkers,
  loadSiteWorkers,

  reloadSites,
}) {
  const [registerOpen, setRegisterOpen] =
    useState(false);

  const [workerManagerOpen, setWorkerManagerOpen] =
    useState(false);

  const [filter, setFilter] =
    useState("active");

  const filteredSites = useMemo(() => {
    if (filter === "all") {
      return sites;
    }

    if (filter === "active") {
      return sites.filter(
        (site) =>
          site.status === "scheduled" ||
          site.status === "in_progress",
      );
    }

    return sites.filter(
      (site) => site.status === filter,
    );
  }, [sites, filter]);

  const scheduledCount = sites.filter(
    (site) => site.status === "scheduled",
  ).length;

  const progressCount = sites.filter(
    (site) => site.status === "in_progress",
  ).length;

  const completedCount = sites.filter(
    (site) => site.status === "completed",
  ).length;

  async function openWorkerManager() {
    if (typeof loadWorkers === "function") {
      await loadWorkers();
    }

    setWorkerManagerOpen(true);
  }

  return (
    <>
      <section>
        {/* 상단 */}

        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "10px",
            marginBottom: "14px",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "20px",
                fontWeight: "800",
                color: "#111827",
              }}
            >
              현장관리
            </div>

            <div
              style={{
                marginTop: "3px",
                fontSize: "12px",
                color: "#64748b",
              }}
            >
              시공 일정과 담당자를 관리합니다.
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "6px",
              flex: "0 0 auto",
            }}
          >
            <button
              type="button"
              onClick={() =>
                setRegisterOpen(true)
              }
              style={{
                border: "none",
                borderRadius: "10px",
                padding: "10px 12px",
                background: "#111827",
                color: "#ffffff",
                fontSize: "13px",
                fontWeight: "800",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              + 일정 추가
            </button>

            <button
              type="button"
              onClick={openWorkerManager}
              style={{
                border: "1px solid #cbd5e1",
                borderRadius: "10px",
                padding: "9px 12px",
                background: "#ffffff",
                color: "#334155",
                fontSize: "12px",
                fontWeight: "800",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              👷 시공자 관리
            </button>
          </div>
        </div>

        {/* 요약 */}

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(3, 1fr)",
            gap: "8px",
            marginBottom: "14px",
          }}
        >
          <SummaryCard
            label="시공 예정"
            value={scheduledCount}
          />

          <SummaryCard
            label="시공 중"
            value={progressCount}
          />

          <SummaryCard
            label="완료"
            value={completedCount}
          />
        </div>

        {/* 필터 */}

        <div
          style={{
            display: "flex",
            gap: "6px",
            overflowX: "auto",
            paddingBottom: "5px",
            marginBottom: "12px",
          }}
        >
          <FilterButton
            active={filter === "active"}
            onClick={() =>
              setFilter("active")
            }
          >
            진행 현장
          </FilterButton>

          <FilterButton
            active={filter === "scheduled"}
            onClick={() =>
              setFilter("scheduled")
            }
          >
            예정
          </FilterButton>

          <FilterButton
            active={
              filter === "in_progress"
            }
            onClick={() =>
              setFilter("in_progress")
            }
          >
            시공 중
          </FilterButton>

          <FilterButton
            active={filter === "completed"}
            onClick={() =>
              setFilter("completed")
            }
          >
            완료
          </FilterButton>

          <FilterButton
            active={filter === "all"}
            onClick={() =>
              setFilter("all")
            }
          >
            전체
          </FilterButton>
        </div>

        {/* 메시지 */}

        {sitesMessage && (
          <div
            style={{
              marginBottom: "12px",
              padding: "10px 12px",
              borderRadius: "9px",
              background:
                sitesMessage.startsWith("✅")
                  ? "#f0fdf4"
                  : "#fef2f2",
              color:
                sitesMessage.startsWith("✅")
                  ? "#166534"
                  : "#b91c1c",
              fontSize: "13px",
              fontWeight: "700",
            }}
          >
            {sitesMessage}
          </div>
        )}

        {/* 로딩 */}

        {sitesLoading &&
          sites.length === 0 && (
            <div
              style={{
                padding: "30px 12px",
                textAlign: "center",
                color: "#64748b",
                fontSize: "14px",
              }}
            >
              현장 정보를 불러오는
              중입니다...
            </div>
          )}

        {/* 현장 없음 */}

        {!sitesLoading &&
          filteredSites.length === 0 && (
            <div
              style={{
                padding: "38px 16px",
                border:
                  "1px dashed #cbd5e1",
                borderRadius: "14px",
                background: "#ffffff",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontSize: "30px",
                  marginBottom: "8px",
                }}
              >
                🏠
              </div>

              <div
                style={{
                  fontWeight: "800",
                  color: "#334155",
                }}
              >
                등록된 현장이 없습니다.
              </div>

              <div
                style={{
                  marginTop: "5px",
                  fontSize: "12px",
                  color: "#64748b",
                }}
              >
                + 일정 추가에서 첫 현장을
                등록해주세요.
              </div>
            </div>
          )}

        {/* 현장 목록 */}

        <div
          style={{
            display: "grid",
            gap: "10px",
          }}
        >
          {filteredSites.map((site) => (
            <SiteCard
              key={site.id}
              site={site}
              onOpen={() =>
                openSite(site)
              }
            />
          ))}
        </div>
      </section>

      {/* 현장 등록 */}

      <SiteRegisterModal
        open={registerOpen}
        onClose={() =>
          setRegisterOpen(false)
        }
        createSite={createSite}
        loading={sitesLoading}
      />

      {/* 시공자 관리 */}

      {workerManagerOpen && (
        <WorkerManagerModal
          onClose={() =>
            setWorkerManagerOpen(false)
          }
        >
          <WorkerManagement
            workers={workers}
            workersLoading={
              workersLoading
            }
            workersMessage={
              workersMessage
            }
            createWorker={
              createWorker
            }
            updateWorker={
              updateWorker
            }
            setWorkerActive={
              setWorkerActive
            }
          />
        </WorkerManagerModal>
      )}

      {/* 현장 상세 */}

      {selectedSite && (
        <SiteDetailModal
          site={selectedSite}
          onClose={closeSite}
          updateSiteStatus={
            updateSiteStatus
          }

          workers={workers}
          workersLoading={
            workersLoading
          }

          loadWorkers={
            loadWorkers
          }

          loadSiteWorkers={
            loadSiteWorkers
          }

          assignSiteWorkers={
            assignSiteWorkers
          }

          reloadSites={
            reloadSites
          }
        />
      )}
    </>
  );
}

function SummaryCard({
  label,
  value,
}) {
  return (
    <div
      style={{
        padding: "12px 8px",
        border:
          "1px solid #e2e8f0",
        borderRadius: "12px",
        background: "#ffffff",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontSize: "12px",
          color: "#64748b",
        }}
      >
        {label}
      </div>

      <div
        style={{
          marginTop: "4px",
          fontSize: "22px",
          fontWeight: "900",
          color: "#111827",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: "0 0 auto",

        border: active
          ? "1px solid #111827"
          : "1px solid #cbd5e1",

        borderRadius: "999px",

        padding: "8px 12px",

        background: active
          ? "#111827"
          : "#ffffff",

        color: active
          ? "#ffffff"
          : "#475569",

        fontSize: "12px",
        fontWeight: "700",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function SiteCard({
  site,
  onOpen,
}) {
  const status =
    STATUS_INFO[site.status] ||
    STATUS_INFO.scheduled;

  const leader =
    getLeader(site);

  const members =
    getMembers(site);

  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        width: "100%",
        padding: "14px",

        border:
          "1px solid #e2e8f0",

        borderRadius: "14px",

        background: "#ffffff",

        textAlign: "left",
        cursor: "pointer",
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
              fontSize: "15px",
              fontWeight: "800",
              color: "#111827",
              wordBreak: "break-word",
            }}
          >
            {site.site_name ||
              site.customer_name ||
              "현장"}
          </div>

          {site.customer_name && (
            <div
              style={{
                marginTop: "3px",
                fontSize: "12px",
                color: "#64748b",
              }}
            >
              고객 {site.customer_name}
            </div>
          )}
        </div>

        <span
          style={{
            flex: "0 0 auto",

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

      <div
        style={{
          marginTop: "12px",
          display: "grid",
          gap: "7px",
          fontSize: "13px",
          color: "#334155",
        }}
      >
        <div>
          📅{" "}
          {formatDateTime(
            site.schedule_start,
          )}
        </div>

        <div>
          📍{" "}
          {site.address ||
            "주소 미입력"}
          {site.address_detail
            ? ` ${site.address_detail}`
            : ""}
        </div>

        {site.work_type && (
          <div>
            🛠️ {site.work_type}
          </div>
        )}

        <div>
          ★ 팀장{" "}
          <strong>
            {leader?.workers?.name ||
              "미배정"}
          </strong>
        </div>

        {members.length > 0 && (
          <div>
            👷 담당{" "}
            {members
              .map(
                (item) =>
                  item.workers?.name,
              )
              .filter(Boolean)
              .join(", ")}
          </div>
        )}
      </div>
    </button>
  );
}

function SiteDetailModal({
  site,
  onClose,
  updateSiteStatus,

  workers,
  workersLoading,

  loadWorkers,
  loadSiteWorkers,
  assignSiteWorkers,

  reloadSites,
}) {
  const status =
    STATUS_INFO[site.status] ||
    STATUS_INFO.scheduled;

  const leader =
    getLeader(site);

  const members =
    getMembers(site);

  async function changeStatus(
    nextStatus,
  ) {
    await updateSiteStatus(
      site.id,
      nextStatus,
    );
  }

  async function handleAssignmentSaved() {
    if (
      typeof reloadSites ===
      "function"
    ) {
      await reloadSites();
    }
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
        {/* 상세 상단 */}

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
                  display:
                    "inline-block",

                  padding: "5px 8px",

                  borderRadius:
                    "999px",

                  background:
                    status.background,

                  color:
                    status.color,

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
              background:
                "transparent",
              fontSize: "26px",
              color: "#64748b",
              cursor: "pointer",
            }}
          >
            ×
          </button>
        </div>

        {/* 기본 정보 */}

        <DetailRow
          label="일정"
          value={formatDateTime(
            site.schedule_start,
          )}
        />

        <DetailRow
          label="고객"
          value={
            site.customer_name ||
            "-"
          }
        />

        <DetailRow
          label="전화번호"
          value={
            site.customer_phone ||
            "-"
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
          value={
            site.region || "-"
          }
        />

        <DetailRow
          label="시공 종류"
          value={
            site.work_type || "-"
          }
        />

        <DetailRow
          label="작업 내용"
          value={
            site.work_description ||
            "-"
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
                      item.workers
                        ?.name,
                  )
                  .filter(Boolean)
                  .join(", ")
              : "미배정"
          }
        />

        <DetailRow
          label="메모"
          value={
            site.memo || "-"
          }
        />

        {/* 상태 변경 */}

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
                changeStatus(
                  "scheduled",
                )
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
                changeStatus(
                  "completed",
                )
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
                changeStatus(
                  "cancelled",
                )
              }
            >
              취소
            </StatusButton>
          </div>
        </div>

        {/* 팀장 / 시공자 배정 */}

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
            loadWorkers={
              loadWorkers
            }
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

function WorkerManagerModal({
  onClose,
  children,
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1100,

        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",

        padding: "20px 10px",

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
          maxWidth: "650px",

          padding: "16px",

          borderRadius: "16px",
          background: "#ffffff",

          boxShadow:
            "0 20px 50px rgba(0,0,0,0.20)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent:
              "space-between",
            gap: "10px",
            marginBottom: "12px",
          }}
        >
          <div
            style={{
              fontSize: "18px",
              fontWeight: "900",
              color: "#111827",
            }}
          >
            시공자 관리
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              border: "none",
              background:
                "transparent",
              fontSize: "28px",
              color: "#64748b",
              cursor: "pointer",
            }}
          >
            ×
          </button>
        </div>

        {children}
      </div>
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
