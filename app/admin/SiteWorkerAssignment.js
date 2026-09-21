"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

export default function SiteWorkerAssignment({
  site,
  workers = [],
  workersLoading = false,

  loadWorkers,
  loadSiteWorkers,
  assignSiteWorkers,

  onSaved,
}) {
  const [leaderId, setLeaderId] =
    useState("");

  const [memberIds, setMemberIds] =
    useState([]);

  const [loading, setLoading] =
    useState(false);

  const [saving, setSaving] =
    useState(false);

  const [message, setMessage] =
    useState("");

  /* =========================================================
     활성 시공자
  ========================================================= */

  const activeWorkers = useMemo(
    () =>
      workers.filter(
        (worker) =>
          worker.is_active !== false,
      ),
    [workers],
  );

  /* =========================================================
     현장 열었을 때 현재 배정 조회
  ========================================================= */

  useEffect(() => {
    if (!site?.id) {
      return;
    }

    let cancelled = false;

    async function initialize() {
      setLoading(true);
      setMessage("");

      try {
        /*
         * 시공자 목록이 아직 없으면
         * 이때만 불러옵니다.
         */

        if (
          workers.length === 0 &&
          typeof loadWorkers ===
            "function"
        ) {
          await loadWorkers();
        }

        /*
         * 현재 현장의 배정 조회
         */

        const assignments =
          typeof loadSiteWorkers ===
          "function"
            ? await loadSiteWorkers(
                site.id,
              )
            : [];

        if (cancelled) {
          return;
        }

        const leader =
          assignments.find(
            (item) =>
              item.role ===
              "leader",
          );

        const members =
          assignments.filter(
            (item) =>
              item.role ===
              "member",
          );

        setLeaderId(
          leader?.worker_id || "",
        );

        setMemberIds(
          members
            .map(
              (item) =>
                item.worker_id,
            )
            .filter(Boolean),
        );
      } catch (error) {
        console.error(
          "현장 시공자 초기화:",
          error,
        );

        if (!cancelled) {
          setMessage(
            `❌ 담당자 정보를 불러오지 못했습니다: ${
              error?.message ||
              "알 수 없는 오류"
            }`,
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    initialize();

    return () => {
      cancelled = true;
    };
  }, [site?.id]);

  /* =========================================================
     팀장 선택

     팀장으로 선택한 사람은
     담당자 목록에서 자동 제외
  ========================================================= */

  function handleLeaderChange(
    workerId,
  ) {
    setLeaderId(workerId);

    if (workerId) {
      setMemberIds(
        (current) =>
          current.filter(
            (id) =>
              id !== workerId,
          ),
      );
    }

    setMessage("");
  }

  /* =========================================================
     담당자 선택 / 해제
  ========================================================= */

  function toggleMember(
    workerId,
  ) {
    if (!workerId) {
      return;
    }

    /*
     * 현재 팀장은 담당자로
     * 중복 선택하지 않음
     */

    if (
      workerId === leaderId
    ) {
      return;
    }

    setMemberIds(
      (current) => {
        if (
          current.includes(
            workerId,
          )
        ) {
          return current.filter(
            (id) =>
              id !== workerId,
          );
        }

        return [
          ...current,
          workerId,
        ];
      },
    );

    setMessage("");
  }

  /* =========================================================
     저장
  ========================================================= */

  async function handleSave() {
    if (!site?.id) {
      setMessage(
        "❌ 현장 정보를 확인할 수 없습니다.",
      );
      return;
    }

    if (
      typeof assignSiteWorkers !==
      "function"
    ) {
      setMessage(
        "❌ 시공자 배정 기능을 사용할 수 없습니다.",
      );
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const result =
        await assignSiteWorkers({
          siteId: site.id,
          leaderId:
            leaderId || null,
          memberIds,
        });

      if (!result?.success) {
        throw new Error(
          result?.error ||
            "배정 저장에 실패했습니다.",
        );
      }

      setMessage(
        "✅ 담당 시공자 배정이 저장되었습니다.",
      );

      /*
       * 부모 현장 목록을 다시 불러와
       * 카드의 팀장/담당자 표시도 갱신
       */

      if (
        typeof onSaved ===
        "function"
      ) {
        await onSaved(
          result.assignments ||
            [],
        );
      }
    } catch (error) {
      console.error(
        "시공자 배정 저장:",
        error,
      );

      setMessage(
        `❌ ${
          error?.message ||
          "배정 저장에 실패했습니다."
        }`,
      );
    } finally {
      setSaving(false);
    }
  }

  /* =========================================================
     현재 선택된 인원
  ========================================================= */

  const selectedLeader =
    activeWorkers.find(
      (worker) =>
        worker.id === leaderId,
    );

  const selectedMembers =
    activeWorkers.filter(
      (worker) =>
        memberIds.includes(
          worker.id,
        ),
    );

  return (
    <section
      style={{
        marginTop: "18px",

        paddingTop: "16px",

        borderTop:
          "1px solid #e2e8f0",
      }}
    >
      {/* =====================================================
          제목
      ===================================================== */}

      <div
        style={{
          display: "flex",

          alignItems: "center",

          justifyContent:
            "space-between",

          gap: "8px",

          marginBottom: "12px",
        }}
      >
        <div>
          <div
            style={{
              color: "#111827",

              fontSize: "15px",

              fontWeight: "900",
            }}
          >
            담당 시공자
          </div>

          <div
            style={{
              marginTop: "3px",

              color: "#64748b",

              fontSize: "11px",
            }}
          >
            책임 팀장 1명과 담당자를
            배정합니다.
          </div>
        </div>

        <div
          style={{
            padding: "5px 8px",

            borderRadius: "999px",

            background: "#f1f5f9",

            color: "#475569",

            fontSize: "10px",

            fontWeight: "800",
          }}
        >
          총{" "}
          {leaderId
            ? memberIds.length + 1
            : memberIds.length}
          명
        </div>
      </div>

      {/* =====================================================
          로딩
      ===================================================== */}

      {(loading ||
        workersLoading) && (
        <div
          style={{
            padding: "18px 10px",

            borderRadius: "9px",

            background: "#f8fafc",

            color: "#64748b",

            textAlign: "center",

            fontSize: "12px",
          }}
        >
          시공자 정보를 불러오는
          중입니다...
        </div>
      )}

      {/* =====================================================
          시공자 없음
      ===================================================== */}

      {!loading &&
        !workersLoading &&
        activeWorkers.length ===
          0 && (
          <div
            style={{
              padding: "18px 12px",

              border:
                "1px dashed #cbd5e1",

              borderRadius: "10px",

              background: "#f8fafc",

              textAlign: "center",
            }}
          >
            <div
              style={{
                fontSize: "25px",

                marginBottom: "6px",
              }}
            >
              👷
            </div>

            <div
              style={{
                color: "#334155",

                fontSize: "12px",

                fontWeight: "800",
              }}
            >
              등록된 시공자가 없습니다.
            </div>

            <div
              style={{
                marginTop: "4px",

                color: "#64748b",

                fontSize: "10px",
              }}
            >
              시공자 관리에서 먼저
              시공자를 등록해주세요.
            </div>
          </div>
        )}

      {/* =====================================================
          배정 화면
      ===================================================== */}

      {!loading &&
        activeWorkers.length >
          0 && (
          <>
            {/* 책임 팀장 */}

            <div
              style={{
                marginBottom:
                  "15px",
              }}
            >
              <label
                style={{
                  display:
                    "block",

                  marginBottom:
                    "6px",

                  color:
                    "#334155",

                  fontSize:
                    "12px",

                  fontWeight:
                    "800",
                }}
              >
                책임 팀장
              </label>

              <select
                value={
                  leaderId
                }
                onChange={(
                  event,
                ) =>
                  handleLeaderChange(
                    event.target
                      .value,
                  )
                }
                disabled={
                  saving
                }
                style={{
                  width: "100%",

                  boxSizing:
                    "border-box",

                  padding:
                    "11px 12px",

                  border:
                    "1px solid #cbd5e1",

                  borderRadius:
                    "9px",

                  background:
                    "#ffffff",

                  color:
                    "#111827",

                  fontSize:
                    "13px",
                }}
              >
                <option value="">
                  팀장 선택 안 함
                </option>

                {activeWorkers.map(
                  (worker) => (
                    <option
                      key={
                        worker.id
                      }
                      value={
                        worker.id
                      }
                    >
                      {worker.name}
                      {worker.position
                        ? ` · ${worker.position}`
                        : ""}
                    </option>
                  ),
                )}
              </select>
            </div>

            {/* 담당자 */}

            <div>
              <div
                style={{
                  marginBottom:
                    "7px",

                  color:
                    "#334155",

                  fontSize:
                    "12px",

                  fontWeight:
                    "800",
                }}
              >
                담당 시공자
              </div>

              <div
                style={{
                  display:
                    "grid",

                  gap: "6px",
                }}
              >
                {activeWorkers.map(
                  (worker) => {
                    const isLeader =
                      worker.id ===
                      leaderId;

                    const checked =
                      memberIds.includes(
                        worker.id,
                      );

                    return (
                      <label
                        key={
                          worker.id
                        }
                        style={{
                          display:
                            "flex",

                          alignItems:
                            "center",

                          gap: "9px",

                          padding:
                            "10px",

                          border:
                            checked
                              ? "1px solid #2563eb"
                              : "1px solid #e2e8f0",

                          borderRadius:
                            "9px",

                          background:
                            isLeader
                              ? "#f8fafc"
                              : checked
                                ? "#eff6ff"
                                : "#ffffff",

                          opacity:
                            isLeader
                              ? 0.6
                              : 1,

                          cursor:
                            isLeader ||
                            saving
                              ? "default"
                              : "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={
                            checked
                          }
                          disabled={
                            isLeader ||
                            saving
                          }
                          onChange={() =>
                            toggleMember(
                              worker.id,
                            )
                          }
                        />

                        <div
                          style={{
                            flex: 1,
                            minWidth: 0,
                          }}
                        >
                          <div
                            style={{
                              color:
                                "#111827",

                              fontSize:
                                "12px",

                              fontWeight:
                                "800",
                            }}
                          >
                            {
                              worker.name
                            }

                            {isLeader && (
                              <span
                                style={{
                                  marginLeft:
                                    "5px",

                                  color:
                                    "#2563eb",

                                  fontSize:
                                    "10px",
                                }}
                              >
                                팀장
                              </span>
                            )}
                          </div>

                          {(worker.position ||
                            worker.phone) && (
                            <div
                              style={{
                                marginTop:
                                  "2px",

                                color:
                                  "#64748b",

                                fontSize:
                                  "10px",
                              }}
                            >
                              {[
                                worker.position,
                                worker.phone,
                              ]
                                .filter(
                                  Boolean,
                                )
                                .join(
                                  " · ",
                                )}
                            </div>
                          )}
                        </div>
                      </label>
                    );
                  },
                )}
              </div>
            </div>

            {/* 현재 배정 요약 */}

            {(selectedLeader ||
              selectedMembers.length >
                0) && (
              <div
                style={{
                  marginTop:
                    "12px",

                  padding:
                    "10px",

                  borderRadius:
                    "9px",

                  background:
                    "#f8fafc",

                  color:
                    "#475569",

                  fontSize:
                    "11px",

                  lineHeight:
                    "1.6",
                }}
              >
                {selectedLeader && (
                  <div>
                    <strong>
                      팀장:
                    </strong>{" "}
                    {
                      selectedLeader.name
                    }
                  </div>
                )}

                {selectedMembers.length >
                  0 && (
                  <div>
                    <strong>
                      담당:
                    </strong>{" "}
                    {selectedMembers
                      .map(
                        (worker) =>
                          worker.name,
                      )
                      .join(", ")}
                  </div>
                )}
              </div>
            )}

            {/* 메시지 */}

            {message && (
              <div
                style={{
                  marginTop:
                    "10px",

                  padding:
                    "9px 10px",

                  borderRadius:
                    "8px",

                  background:
                    message.startsWith(
                      "✅",
                    )
                      ? "#f0fdf4"
                      : "#fef2f2",

                  color:
                    message.startsWith(
                      "✅",
                    )
                      ? "#166534"
                      : "#b91c1c",

                  fontSize:
                    "11px",

                  fontWeight:
                    "700",

                  whiteSpace:
                    "pre-wrap",
                }}
              >
                {message}
              </div>
            )}

            {/* 저장 */}

            <button
              type="button"
              disabled={
                saving ||
                loading ||
                workersLoading
              }
              onClick={
                handleSave
              }
              style={{
                width: "100%",

                marginTop:
                  "12px",

                padding:
                  "11px",

                border:
                  "none",

                borderRadius:
                  "9px",

                background:
                  saving
                    ? "#94a3b8"
                    : "#111827",

                color:
                  "#ffffff",

                fontSize:
                  "13px",

                fontWeight:
                  "900",

                cursor:
                  saving
                    ? "default"
                    : "pointer",
              }}
            >
              {saving
                ? "배정 저장 중..."
                : "담당 시공자 저장"}
            </button>
          </>
        )}
    </section>
  );
              }
