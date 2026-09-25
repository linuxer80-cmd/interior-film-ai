"use client";

import {
  useMemo,
  useState,
} from "react";

import SiteRegisterModal from "./SiteRegisterModal";
import SiteDetailModal from "./SiteDetailModal";
import WorkerManagement from "./WorkerManagement";

/* =========================================================
   현장 상태
========================================================= */

const STATUS_INFO = {
  consulting: {
    label: "상담중",
    background: "#fff7ed",
    color: "#c2410c",
  },

  scheduled: {
    label: "시공 예정",
    background: "#eff6ff",
    color: "#1d4ed8",
  },

  in_progress: {
    label: "시공 중",
    background: "#fef3c7",
    color: "#b45309",
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

/* =========================================================
   날짜 + 시간 표시
========================================================= */

function formatDateTime(
  scheduleStart,
  scheduleDate,
) {
  /*
   * 날짜와 시간이 모두 확정된 경우
   */
  if (scheduleStart) {
    const date =
      new Date(scheduleStart);

    if (
      !Number.isNaN(
        date.getTime(),
      )
    ) {
      return new Intl.DateTimeFormat(
        "ko-KR",
        {
          month: "long",
          day: "numeric",
          weekday: "short",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        },
      ).format(date);
    }
  }

  /*
   * 날짜만 정해지고 시간이 미정인 상담
   */
  if (scheduleDate) {
    const date =
      new Date(
        `${scheduleDate}T00:00:00`,
      );

    if (
      !Number.isNaN(
        date.getTime(),
      )
    ) {
      const dateText =
        new Intl.DateTimeFormat(
          "ko-KR",
          {
            month: "long",
            day: "numeric",
            weekday: "short",
          },
        ).format(date);

      return `${dateText} · 시간 미정`;
    }
  }

  return "미정";
}

/* =========================================================
   팀장 찾기
========================================================= */

function getLeader(site) {
  const assignments =
    site?.site_workers ||
    [];

  return assignments.find(
    (item) =>
      item.role ===
      "leader",
  );
}

/* =========================================================
   일반 시공자 찾기
========================================================= */

function getMembers(site) {
  const assignments =
    site?.site_workers ||
    [];

  return assignments.filter(
    (item) =>
      item.role ===
      "member",
  );
}

/* =========================================================
   메인 현장관리
========================================================= */

export default function SiteManagementTab({
  companyId,

  sites = [],
  sitesLoading = false,
  sitesMessage = "",

  createSite,
  updateSiteSchedule,
  updateSiteStatus,

  addSiteRequestPhotos,
  deleteSiteRequestPhoto,

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
  createWorkerInvite,

  assignSiteWorkers,
  loadSiteWorkers,

  reloadSites,
}) {
  /* =======================================================
     현장 등록 모달
  ======================================================= */

  const [
    registerOpen,
    setRegisterOpen,
  ] = useState(false);

  /* =======================================================
     시공자 관리 모달
  ======================================================= */

  const [
    workerManagerOpen,
    setWorkerManagerOpen,
  ] = useState(false);

  /* =======================================================
     현장 필터
  ======================================================= */

  const [
    filter,
    setFilter,
  ] = useState("active");

  /* =======================================================
     필터 적용
  ======================================================= */

  const filteredSites =
    useMemo(() => {
      if (
        filter === "all"
      ) {
        return sites;
      }

      if (
        filter === "active"
      ) {
        return sites.filter(
          (site) =>
            site.status ===
              "consulting" ||
            site.status ===
              "scheduled" ||
            site.status ===
              "in_progress",
        );
      }

      return sites.filter(
        (site) =>
          site.status ===
          filter,
      );
    }, [
      sites,
      filter,
    ]);

  /* =======================================================
     상태별 개수
  ======================================================= */

  const consultingCount =
    sites.filter(
      (site) =>
        site.status ===
        "consulting",
    ).length;

  const scheduledCount =
    sites.filter(
      (site) =>
        site.status ===
        "scheduled",
    ).length;

  const progressCount =
    sites.filter(
      (site) =>
        site.status ===
        "in_progress",
    ).length;

  const completedCount =
    sites.filter(
      (site) =>
        site.status ===
        "completed",
    ).length;

  /* =======================================================
     시공자 관리 열기
  ======================================================= */

  async function openWorkerManager() {
    if (
      typeof loadWorkers ===
      "function"
    ) {
      await loadWorkers();
    }

    setWorkerManagerOpen(
      true,
    );
  }

  /* =======================================================
     화면
  ======================================================= */

  return (
    <>
      <section>
        {/* =================================================
            상단
        ================================================= */}

        <div
          style={{
            display: "flex",
            alignItems:
              "flex-start",
            justifyContent:
              "space-between",
            gap: "10px",
            marginBottom:
              "14px",
          }}
        >
          <div>
            <div
              style={{
                fontSize:
                  "20px",
                fontWeight:
                  "800",
                color:
                  "#111827",
              }}
            >
              현장관리
            </div>

            <div
              style={{
                marginTop:
                  "3px",
                fontSize:
                  "12px",
                color:
                  "#64748b",
              }}
            >
              상담중 현장부터 시공
              완료까지 관리합니다.
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection:
                "column",
              gap: "6px",
              flex:
                "0 0 auto",
            }}
          >
            <button
              type="button"
              onClick={() =>
                setRegisterOpen(
                  true,
                )
              }
              style={{
                border:
                  "none",
                borderRadius:
                  "10px",
                padding:
                  "10px 12px",
                background:
                  "#111827",
                color:
                  "#ffffff",
                fontSize:
                  "13px",
                fontWeight:
                  "800",
                cursor:
                  "pointer",
                whiteSpace:
                  "nowrap",
              }}
            >
              + 현장 추가
            </button>

            <button
              type="button"
              onClick={
                openWorkerManager
              }
              style={{
                border:
                  "1px solid #cbd5e1",
                borderRadius:
                  "10px",
                padding:
                  "9px 12px",
                background:
                  "#ffffff",
                color:
                  "#334155",
                fontSize:
                  "12px",
                fontWeight:
                  "800",
                cursor:
                  "pointer",
                whiteSpace:
                  "nowrap",
              }}
            >
              👷 시공자 관리
            </button>
          </div>
        </div>

        {/* =================================================
            요약
        ================================================= */}

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(4, minmax(0, 1fr))",
            gap: "6px",
            marginBottom:
              "14px",
          }}
        >
          <SummaryCard
            label="상담중"
            value={
              consultingCount
            }
          />

          <SummaryCard
            label="시공 예정"
            value={
              scheduledCount
            }
          />

          <SummaryCard
            label="시공 중"
            value={
              progressCount
            }
          />

          <SummaryCard
            label="완료"
            value={
              completedCount
            }
          />
        </div>

        {/* =================================================
            필터
        ================================================= */}

        <div
          style={{
            display: "flex",
            gap: "6px",
            overflowX:
              "auto",
            paddingBottom:
              "5px",
            marginBottom:
              "12px",
          }}
        >
          <FilterButton
            active={
              filter ===
              "active"
            }
            onClick={() =>
              setFilter(
                "active",
              )
            }
          >
            진행 현장
          </FilterButton>

          <FilterButton
            active={
              filter ===
              "consulting"
            }
            onClick={() =>
              setFilter(
                "consulting",
              )
            }
          >
            상담중
          </FilterButton>

          <FilterButton
            active={
              filter ===
              "scheduled"
            }
            onClick={() =>
              setFilter(
                "scheduled",
              )
            }
          >
            예정
          </FilterButton>

          <FilterButton
            active={
              filter ===
              "in_progress"
            }
            onClick={() =>
              setFilter(
                "in_progress",
              )
            }
          >
            시공 중
          </FilterButton>

          <FilterButton
            active={
              filter ===
              "completed"
            }
            onClick={() =>
              setFilter(
                "completed",
              )
            }
          >
            완료
          </FilterButton>

          <FilterButton
            active={
              filter ===
              "all"
            }
            onClick={() =>
              setFilter(
                "all",
              )
            }
          >
            전체
          </FilterButton>
        </div>

        {/* =================================================
            메시지
        ================================================= */}

        {sitesMessage && (
          <div
            style={{
              marginBottom:
                "12px",
              padding:
                "10px 12px",
              borderRadius:
                "9px",
              background:
                sitesMessage.startsWith(
                  "✅",
                )
                  ? "#f0fdf4"
                  : "#fef2f2",
              color:
                sitesMessage.startsWith(
                  "✅",
                )
                  ? "#166534"
                  : "#b91c1c",
              fontSize:
                "13px",
              fontWeight:
                "700",
              whiteSpace:
                "pre-wrap",
              wordBreak:
                "break-word",
            }}
          >
            {sitesMessage}
          </div>
        )}

        {/* =================================================
            로딩
        ================================================= */}

        {sitesLoading &&
          sites.length ===
            0 && (
            <div
              style={{
                padding:
                  "30px 12px",
                textAlign:
                  "center",
                color:
                  "#64748b",
                fontSize:
                  "14px",
              }}
            >
              현장 정보를 불러오는
              중입니다...
            </div>
          )}

        {/* =================================================
            현장 없음
        ================================================= */}

        {!sitesLoading &&
          filteredSites.length ===
            0 && (
            <div
              style={{
                padding:
                  "38px 16px",
                border:
                  "1px dashed #cbd5e1",
                borderRadius:
                  "14px",
                background:
                  "#ffffff",
                textAlign:
                  "center",
              }}
            >
              <div
                style={{
                  fontSize:
                    "30px",
                  marginBottom:
                    "8px",
                }}
              >
                🏠
              </div>

              <div
                style={{
                  fontWeight:
                    "800",
                  color:
                    "#334155",
                }}
              >
                등록된 현장이
                없습니다.
              </div>

              <div
                style={{
                  marginTop:
                    "5px",
                  fontSize:
                    "12px",
                  color:
                    "#64748b",
                }}
              >
                + 현장 추가에서
                상담중 현장이나
                시공 일정을
                등록해주세요.
              </div>
            </div>
          )}

        {/* =================================================
            현장 목록
        ================================================= */}

        <div
          style={{
            display: "grid",
            gap: "10px",
          }}
        >
          {filteredSites.map(
            (site) => (
              <SiteCard
                key={
                  site.id
                }
                site={
                  site
                }
                onOpen={() =>
                  openSite(
                    site,
                  )
                }
              />
            ),
          )}
        </div>
      </section>

      {/* ===================================================
          현장 등록
      =================================================== */}

      <SiteRegisterModal
        open={
          registerOpen
        }
        onClose={() =>
          setRegisterOpen(
            false,
          )
        }
        createSite={
          createSite
        }
        loading={
          sitesLoading
        }
      />

      {/* ===================================================
          시공자 관리
      =================================================== */}

      {workerManagerOpen && (
        <WorkerManagerModal
          onClose={() =>
            setWorkerManagerOpen(
              false,
            )
          }
        >
          <WorkerManagement
            workers={
              workers
            }
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
            createWorkerInvite={
              createWorkerInvite
            }
          />
        </WorkerManagerModal>
      )}

      {/* ===================================================
          현장 상세
      =================================================== */}

      {selectedSite && (
        <SiteDetailModal
          companyId={
            companyId
          }

          site={
            selectedSite
          }

          onClose={
            closeSite
          }

          updateSiteSchedule={
            updateSiteSchedule
          }

          updateSiteStatus={
            updateSiteStatus
          }

          addSiteRequestPhotos={
            addSiteRequestPhotos
          }

          deleteSiteRequestPhoto={
            deleteSiteRequestPhoto
          }

          workers={
            workers
          }

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

/* =========================================================
   요약 카드
========================================================= */

function SummaryCard({
  label,
  value,
}) {
  return (
    <div
      style={{
        minWidth: 0,
        padding:
          "12px 4px",
        border:
          "1px solid #e2e8f0",
        borderRadius:
          "12px",
        background:
          "#ffffff",
        textAlign:
          "center",
      }}
    >
      <div
        style={{
          fontSize:
            "11px",
          color:
            "#64748b",
          whiteSpace:
            "nowrap",
        }}
      >
        {label}
      </div>

      <div
        style={{
          marginTop:
            "4px",
          fontSize:
            "22px",
          fontWeight:
            "900",
          color:
            "#111827",
        }}
      >
        {value}
      </div>
    </div>
  );
}

/* =========================================================
   필터 버튼
========================================================= */

function FilterButton({
  active,
  onClick,
  children,
}) {
  return (
    <button
      type="button"
      onClick={
        onClick
      }
      style={{
        flex:
          "0 0 auto",
        border:
          active
            ? "1px solid #111827"
            : "1px solid #cbd5e1",
        borderRadius:
          "999px",
        padding:
          "8px 12px",
        background:
          active
            ? "#111827"
            : "#ffffff",
        color:
          active
            ? "#ffffff"
            : "#475569",
        fontSize:
          "12px",
        fontWeight:
          "700",
        cursor:
          "pointer",
      }}
    >
      {children}
    </button>
  );
}
/* =========================================================
   현장 카드
========================================================= */

function SiteCard({
  site,
  onOpen,
}) {
  const status =
    STATUS_INFO[
      site.status
    ] ||
    STATUS_INFO.consulting;

  const leader =
    getLeader(site);

  const members =
    getMembers(site);

  const siteTitle =
    site.site_name ||
    site.customer_name ||
    "현장명 미정";

  const customerName =
    site.customer_name ||
    "미정";

  const address =
    site.address ||
    "미정";

  const workType =
    site.work_type ||
    "미정";

  return (
    <button
      type="button"
      onClick={
        onOpen
      }
      style={{
        width:
          "100%",
        padding:
          "14px",
        border:
          "1px solid #e2e8f0",
        borderRadius:
          "14px",
        background:
          "#ffffff",
        textAlign:
          "left",
        cursor:
          "pointer",
      }}
    >
      {/* 상단 */}

      <div
        style={{
          display:
            "flex",
          alignItems:
            "flex-start",
          justifyContent:
            "space-between",
          gap:
            "8px",
        }}
      >
        <div
          style={{
            minWidth:
              0,
          }}
        >
          <div
            style={{
              fontSize:
                "15px",
              fontWeight:
                "800",
              color:
                "#111827",
              wordBreak:
                "break-word",
            }}
          >
            {siteTitle}
          </div>

          <div
            style={{
              marginTop:
                "3px",
              fontSize:
                "12px",
              color:
                "#64748b",
            }}
          >
            고객{" "}
            {customerName}
          </div>
        </div>

        <span
          style={{
            flex:
              "0 0 auto",
            padding:
              "5px 8px",
            borderRadius:
              "999px",
            background:
              status.background,
            color:
              status.color,
            fontSize:
              "11px",
            fontWeight:
              "800",
          }}
        >
          {status.label}
        </span>
      </div>

      {/* 현장 정보 */}

      <div
        style={{
          marginTop:
            "12px",
          display:
            "grid",
          gap:
            "7px",
          fontSize:
            "13px",
          color:
            "#334155",
        }}
      >
        <div>
          📅{" "}
          {formatDateTime(
            site.schedule_start,
            site.schedule_date,
          )}
        </div>

        <div>
          📍{" "}
          {address}

          {site.address_detail
            ? ` ${site.address_detail}`
            : ""}
        </div>

        <div>
          🛠️{" "}
          {workType}
        </div>

        <div>
          ★ 팀장{" "}
          <strong>
            {leader?.workers
              ?.name ||
              "미배정"}
          </strong>
        </div>

        {members.length >
          0 && (
          <div>
            👷 담당{" "}

            {members
              .map(
                (item) =>
                  item.workers
                    ?.name,
              )
              .filter(
                Boolean,
              )
              .join(
                ", ",
              ) ||
              "미배정"}
          </div>
        )}
      </div>
    </button>
  );
}

/* =========================================================
   시공자 관리 모달
========================================================= */

function WorkerManagerModal({
  onClose,
  children,
}) {
  return (
    <div
      onClick={
        onClose
      }
      style={{
        position:
          "fixed",
        inset:
          0,
        zIndex:
          1100,
        display:
          "flex",
        alignItems:
          "flex-start",
        justifyContent:
          "center",
        padding:
          "20px 10px",
        background:
          "rgba(15,23,42,0.55)",
        overflowY:
          "auto",
      }}
    >
      <div
        onClick={(
          event,
        ) =>
          event.stopPropagation()
        }
        style={{
          width:
            "100%",
          maxWidth:
            "650px",
          padding:
            "16px",
          borderRadius:
            "16px",
          background:
            "#ffffff",
          boxShadow:
            "0 20px 50px rgba(0,0,0,0.20)",
        }}
      >
        <div
          style={{
            display:
              "flex",
            alignItems:
              "center",
            justifyContent:
              "space-between",
            gap:
              "10px",
            marginBottom:
              "12px",
          }}
        >
          <div
            style={{
              fontSize:
                "18px",
              fontWeight:
                "900",
              color:
                "#111827",
            }}
          >
            시공자 관리
          </div>

          <button
            type="button"
            onClick={
              onClose
            }
            style={{
              border:
                "none",
              background:
                "transparent",
              fontSize:
                "28px",
              color:
                "#64748b",
              cursor:
                "pointer",
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
