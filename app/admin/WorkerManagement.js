"use client";

import { useMemo, useState } from "react";

const EMPTY_FORM = {
  name: "",
  phone: "",
  position: "",
  specialties: "",
  memo: "",
};

export default function WorkerManagement({
  workers = [],
  workersLoading = false,
  workersMessage = "",

  createWorker,
  updateWorker,
  setWorkerActive,
  createWorkerInvite,
}) {
  const [showForm, setShowForm] =
    useState(false);

  const [editingWorker, setEditingWorker] =
    useState(null);

  const [showInactive, setShowInactive] =
    useState(false);

  const [form, setForm] =
    useState(EMPTY_FORM);

  const [localMessage, setLocalMessage] =
    useState("");

  const [inviteWorker, setInviteWorker] =
    useState(null);

  const [inviteUrl, setInviteUrl] =
    useState("");

  const [inviteLoadingId, setInviteLoadingId] =
    useState(null);

  const [inviteMessage, setInviteMessage] =
    useState("");

  /* =========================================================
     목록
  ========================================================= */

  const visibleWorkers = useMemo(() => {
    if (showInactive) {
      return workers;
    }

    return workers.filter(
      (worker) =>
        worker.is_active !== false,
    );
  }, [workers, showInactive]);

  const activeCount = useMemo(
    () =>
      workers.filter(
        (worker) =>
          worker.is_active !== false,
      ).length,
    [workers],
  );

  const inactiveCount = useMemo(
    () =>
      workers.filter(
        (worker) =>
          worker.is_active === false,
      ).length,
    [workers],
  );

  const linkedCount = useMemo(
    () =>
      workers.filter(
        (worker) =>
          Boolean(worker.user_id),
      ).length,
    [workers],
  );

  /* =========================================================
     입력
  ========================================================= */

  function updateField(
    field,
    value,
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function openCreateForm() {
    setEditingWorker(null);

    setForm({
      ...EMPTY_FORM,
    });

    setLocalMessage("");
    setShowForm(true);
  }

  function openEditForm(worker) {
    setEditingWorker(worker);

    setForm({
      name:
        worker?.name || "",

      phone:
        worker?.phone || "",

      position:
        worker?.position || "",

      specialties:
        Array.isArray(
          worker?.specialties,
        )
          ? worker.specialties.join(
              ", ",
            )
          : "",

      memo:
        worker?.memo || "",
    });

    setLocalMessage("");
    setShowForm(true);
  }

  function closeForm() {
    if (workersLoading) {
      return;
    }

    setShowForm(false);
    setEditingWorker(null);

    setForm({
      ...EMPTY_FORM,
    });

    setLocalMessage("");
  }

  /* =========================================================
     저장
  ========================================================= */

  async function handleSubmit(
    event,
  ) {
    event.preventDefault();

    setLocalMessage("");

    if (!form.name.trim()) {
      setLocalMessage(
        "❌ 시공자 이름을 입력해주세요.",
      );
      return;
    }

    let result;

    if (editingWorker?.id) {
      result =
        await updateWorker(
          editingWorker.id,
          form,
        );
    } else {
      result =
        await createWorker(
          form,
        );
    }

    if (!result?.success) {
      setLocalMessage(
        `❌ ${
          result?.error ||
          "저장에 실패했습니다."
        }`,
      );
      return;
    }

    setShowForm(false);
    setEditingWorker(null);

    setForm({
      ...EMPTY_FORM,
    });
  }

  /* =========================================================
     활성 / 비활성
  ========================================================= */

  async function handleActiveChange(
    worker,
  ) {
    if (!worker?.id) {
      return;
    }

    const nextActive =
      worker.is_active === false;

    const text = nextActive
      ? `${worker.name} 시공자를 다시 활성화할까요?`
      : `${worker.name} 시공자를 비활성화할까요?\n\n과거 현장 기록은 삭제되지 않습니다.`;

    const confirmed =
      window.confirm(text);

    if (!confirmed) {
      return;
    }

    await setWorkerActive(
      worker.id,
      nextActive,
    );
  }

  /* =========================================================
     계정 초대
  ========================================================= */

  async function handleCreateInvite(
    worker,
  ) {
    if (
      !worker?.id ||
      worker.user_id ||
      worker.is_active === false
    ) {
      return;
    }

    if (
      typeof createWorkerInvite !==
      "function"
    ) {
      setInviteMessage(
        "❌ 계정 초대 기능을 사용할 수 없습니다.",
      );
      return;
    }

    setInviteLoadingId(
      worker.id,
    );

    setInviteMessage("");
    setInviteUrl("");
    setInviteWorker(worker);

    try {
      const result =
        await createWorkerInvite(
          worker,
        );

      if (!result?.success) {
        setInviteMessage(
          `❌ ${
            result?.error ||
            "초대코드 생성에 실패했습니다."
          }`,
        );
        return;
      }

      if (!result.inviteCode) {
        setInviteMessage(
          "❌ 초대코드를 확인할 수 없습니다.",
        );
        return;
      }

      const origin =
        typeof window !==
        "undefined"
          ? window.location.origin
          : "";

      const url =
        `${origin}/worker/invite/${result.inviteCode}`;

      setInviteUrl(url);

      setInviteMessage(
        `✅ ${worker.name} 시공자의 계정 초대 링크가 생성되었습니다.`,
      );
    } catch (error) {
      console.error(
        "시공자 초대 링크 생성:",
        error,
      );

      setInviteMessage(
        `❌ ${
          error?.message ||
          "초대 링크 생성에 실패했습니다."
        }`,
      );
    } finally {
      setInviteLoadingId(null);
    }
  }

  function closeInvite() {
    if (inviteLoadingId) {
      return;
    }

    setInviteWorker(null);
    setInviteUrl("");
    setInviteMessage("");
  }

  async function copyInviteUrl() {
    if (!inviteUrl) {
      return;
    }

    try {
      if (
        navigator?.clipboard
          ?.writeText
      ) {
        await navigator.clipboard.writeText(
          inviteUrl,
        );

        setInviteMessage(
          "✅ 초대 링크를 복사했습니다.",
        );

        return;
      }

      window.prompt(
        "아래 초대 링크를 복사해주세요.",
        inviteUrl,
      );
    } catch (error) {
      console.error(
        "초대 링크 복사:",
        error,
      );

      window.prompt(
        "아래 초대 링크를 복사해주세요.",
        inviteUrl,
      );
    }
  }

  async function shareInviteUrl() {
    if (!inviteUrl) {
      return;
    }

    const workerName =
      inviteWorker?.name ||
      "시공자";

    const shareText =
      `${workerName}님, 시공자 계정을 등록해주세요.`;

    try {
      if (
        typeof navigator !==
          "undefined" &&
        navigator.share
      ) {
        await navigator.share({
          title:
            "시공자 계정 초대",
          text:
            shareText,
          url:
            inviteUrl,
        });

        return;
      }

      await copyInviteUrl();
    } catch (error) {
      if (
        error?.name ===
        "AbortError"
      ) {
        return;
      }

      console.error(
        "초대 링크 공유:",
        error,
      );

      await copyInviteUrl();
    }
  }

  return (
    <>
      <section>
        {/* =====================================================
            상단
        ===================================================== */}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent:
              "space-between",
            gap: "10px",
            marginBottom: "14px",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "18px",
                fontWeight: "900",
                color: "#111827",
              }}
            >
              시공자 관리
            </div>

            <div
              style={{
                marginTop: "3px",
                color: "#64748b",
                fontSize: "12px",
              }}
            >
              현장에 배정할 팀장과
              시공자를 관리합니다.
            </div>
          </div>

          <button
            type="button"
            onClick={openCreateForm}
            style={{
              flex: "0 0 auto",
              border: "none",
              borderRadius: "10px",
              padding: "10px 13px",
              background: "#111827",
              color: "#ffffff",
              fontSize: "13px",
              fontWeight: "800",
              cursor: "pointer",
            }}
          >
            + 시공자 등록
          </button>
        </div>

        {/* =====================================================
            요약
        ===================================================== */}

        <div
          style={{
            display: "grid",

            gridTemplateColumns:
              "repeat(3, 1fr)",

            gap: "8px",

            marginBottom: "12px",
          }}
        >
          <SummaryBox
            label="활성 시공자"
            value={activeCount}
          />

          <SummaryBox
            label="계정 연결"
            value={linkedCount}
          />

          <SummaryBox
            label="비활성"
            value={inactiveCount}
          />
        </div>

        {/* =====================================================
            비활성 표시
        ===================================================== */}

        <button
          type="button"
          onClick={() =>
            setShowInactive(
              (current) =>
                !current,
            )
          }
          style={{
            width: "100%",

            marginBottom: "12px",

            padding: "9px 10px",

            border:
              "1px solid #e2e8f0",

            borderRadius: "9px",

            background: "#ffffff",

            color: "#475569",

            fontSize: "12px",
            fontWeight: "700",

            cursor: "pointer",
          }}
        >
          {showInactive
            ? "활성 시공자만 보기"
            : `비활성 시공자도 보기 (${inactiveCount})`}
        </button>

        {/* =====================================================
            메시지
        ===================================================== */}

        {workersMessage && (
          <div
            style={{
              marginBottom: "12px",

              padding: "10px 12px",

              borderRadius: "9px",

              background:
                workersMessage.startsWith(
                  "✅",
                )
                  ? "#f0fdf4"
                  : "#fef2f2",

              color:
                workersMessage.startsWith(
                  "✅",
                )
                  ? "#166534"
                  : "#b91c1c",

              fontSize: "13px",
              fontWeight: "700",

              whiteSpace:
                "pre-wrap",
            }}
          >
            {workersMessage}
          </div>
        )}

        {/* =====================================================
            로딩
        ===================================================== */}

        {workersLoading &&
          workers.length === 0 && (
            <div
              style={{
                padding: "30px 12px",

                textAlign: "center",

                color: "#64748b",

                fontSize: "13px",
              }}
            >
              시공자 정보를 불러오는
              중입니다...
            </div>
          )}

        {/* =====================================================
            빈 목록
        ===================================================== */}

        {!workersLoading &&
          visibleWorkers.length ===
            0 && (
            <div
              style={{
                padding: "35px 15px",

                border:
                  "1px dashed #cbd5e1",

                borderRadius: "12px",

                background: "#f8fafc",

                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontSize: "28px",
                  marginBottom: "7px",
                }}
              >
                👷
              </div>

              <div
                style={{
                  color: "#334155",
                  fontWeight: "800",
                }}
              >
                등록된 시공자가 없습니다.
              </div>

              <div
                style={{
                  marginTop: "5px",

                  color: "#64748b",

                  fontSize: "12px",
                }}
              >
                시공자를 먼저 등록하면
                현장에 배정할 수 있습니다.
              </div>
            </div>
          )}

        {/* =====================================================
            시공자 목록
        ===================================================== */}

        <div
          style={{
            display: "grid",
            gap: "9px",
          }}
        >
          {visibleWorkers.map(
            (worker) => (
              <WorkerCard
                key={worker.id}
                worker={worker}
                inviteLoading={
                  inviteLoadingId ===
                  worker.id
                }
                onInvite={() =>
                  handleCreateInvite(
                    worker,
                  )
                }
                onEdit={() =>
                  openEditForm(
                    worker,
                  )
                }
                onActiveChange={() =>
                  handleActiveChange(
                    worker,
                  )
                }
              />
            ),
          )}
        </div>
      </section>

      {/* =======================================================
          등록 / 수정 모달
      ======================================================= */}

      {showForm && (
        <WorkerFormModal
          editingWorker={
            editingWorker
          }
          form={form}
          loading={
            workersLoading
          }
          localMessage={
            localMessage
          }
          updateField={
            updateField
          }
          onSubmit={
            handleSubmit
          }
          onClose={closeForm}
        />
      )}

      {/* =======================================================
          계정 초대 모달
      ======================================================= */}

      {inviteWorker && (
        <WorkerInviteModal
          worker={
            inviteWorker
          }
          inviteUrl={
            inviteUrl
          }
          message={
            inviteMessage
          }
          loading={
            Boolean(
              inviteLoadingId,
            )
          }
          onCopy={
            copyInviteUrl
          }
          onShare={
            shareInviteUrl
          }
          onClose={
            closeInvite
          }
        />
      )}
    </>
  );
}

/* =========================================================
   요약 카드
========================================================= */

function SummaryBox({
  label,
  value,
}) {
  return (
    <div
      style={{
        padding: "11px",

        border:
          "1px solid #e2e8f0",

        borderRadius: "10px",

        background: "#ffffff",

        textAlign: "center",
      }}
    >
      <div
        style={{
          color: "#64748b",
          fontSize: "11px",
        }}
      >
        {label}
      </div>

      <div
        style={{
          marginTop: "3px",

          color: "#111827",

          fontSize: "21px",
          fontWeight: "900",
        }}
      >
        {value}
      </div>
    </div>
  );
}

/* =========================================================
   시공자 카드
========================================================= */

function WorkerCard({
  worker,
  inviteLoading,
  onInvite,
  onEdit,
  onActiveChange,
}) {
  const active =
    worker.is_active !== false;

  const accountLinked =
    Boolean(worker.user_id);

  const specialties =
    Array.isArray(
      worker.specialties,
    )
      ? worker.specialties
      : [];

  return (
    <div
      style={{
        padding: "13px",

        border:
          "1px solid #e2e8f0",

        borderRadius: "12px",

        background: active
          ? "#ffffff"
          : "#f8fafc",

        opacity: active
          ? 1
          : 0.7,
      }}
    >
      <div
        style={{
          display: "flex",

          alignItems:
            "flex-start",

          justifyContent:
            "space-between",

          gap: "10px",
        }}
      >
        <div
          style={{
            minWidth: 0,
            flex: "1 1 auto",
          }}
        >
          <div
            style={{
              display: "flex",

              alignItems:
                "center",

              flexWrap: "wrap",

              gap: "6px",
            }}
          >
            <strong
              style={{
                color: "#111827",

                fontSize: "15px",
              }}
            >
              {worker.name}
            </strong>

            {worker.position && (
              <span
                style={{
                  padding:
                    "3px 7px",

                  borderRadius:
                    "999px",

                  background:
                    "#eff6ff",

                  color:
                    "#1d4ed8",

                  fontSize:
                    "10px",

                  fontWeight:
                    "800",
                }}
              >
                {worker.position}
              </span>
            )}

            {!active && (
              <span
                style={{
                  padding:
                    "3px 7px",

                  borderRadius:
                    "999px",

                  background:
                    "#f1f5f9",

                  color:
                    "#64748b",

                  fontSize:
                    "10px",

                  fontWeight:
                    "800",
                }}
              >
                비활성
              </span>
            )}
          </div>

          {worker.phone && (
            <div
              style={{
                marginTop: "6px",

                color: "#475569",

                fontSize: "12px",
              }}
            >
              📞 {worker.phone}
            </div>
          )}

          <div
            style={{
              marginTop: "8px",
            }}
          >
            {accountLinked ? (
              <span
                style={{
                  display:
                    "inline-block",

                  padding:
                    "5px 8px",

                  borderRadius:
                    "999px",

                  background:
                    "#f0fdf4",

                  color:
                    "#166534",

                  fontSize:
                    "10px",

                  fontWeight:
                    "800",
                }}
              >
                ✅ 계정 연결됨
              </span>
            ) : (
              <span
                style={{
                  display:
                    "inline-block",

                  padding:
                    "5px 8px",

                  borderRadius:
                    "999px",

                  background:
                    "#fff7ed",

                  color:
                    "#c2410c",

                  fontSize:
                    "10px",

                  fontWeight:
                    "800",
                }}
              >
                계정 미연결
              </span>
            )}
          </div>

          {specialties.length >
            0 && (
            <div
              style={{
                display: "flex",

                flexWrap: "wrap",

                gap: "4px",

                marginTop: "8px",
              }}
            >
              {specialties.map(
                (
                  specialty,
                  index,
                ) => (
                  <span
                    key={`${specialty}-${index}`}
                    style={{
                      padding:
                        "4px 7px",

                      borderRadius:
                        "6px",

                      background:
                        "#f1f5f9",

                      color:
                        "#475569",

                      fontSize:
                        "10px",

                      fontWeight:
                        "700",
                    }}
                  >
                    {specialty}
                  </span>
                ),
              )}
            </div>
          )}

          {worker.memo && (
            <div
              style={{
                marginTop: "8px",

                color: "#64748b",

                fontSize: "11px",

                lineHeight: "1.5",

                whiteSpace:
                  "pre-wrap",
              }}
            >
              {worker.memo}
            </div>
          )}
        </div>

        <div
          style={{
            display: "grid",

            gap: "5px",

            flex: "0 0 auto",

            minWidth: "82px",
          }}
        >
          {!accountLinked &&
            active && (
            <button
              type="button"
              disabled={
                inviteLoading
              }
              onClick={
                onInvite
              }
              style={{
                padding:
                  "7px 9px",

                border:
                  "1px solid #2563eb",

                borderRadius:
                  "8px",

                background:
                  inviteLoading
                    ? "#dbeafe"
                    : "#eff6ff",

                color:
                  "#1d4ed8",

                fontSize:
                  "11px",

                fontWeight:
                  "800",

                cursor:
                  inviteLoading
                    ? "default"
                    : "pointer",
              }}
            >
              {inviteLoading
                ? "생성 중..."
                : "🔗 계정 초대"}
            </button>
          )}

          {accountLinked && (
            <div
              style={{
                padding:
                  "7px 8px",

                border:
                  "1px solid #bbf7d0",

                borderRadius:
                  "8px",

                background:
                  "#f0fdf4",

                color:
                  "#166534",

                fontSize:
                  "10px",

                fontWeight:
                  "800",

                textAlign:
                  "center",
              }}
            >
              연결 완료
            </div>
          )}

          <button
            type="button"
            onClick={onEdit}
            style={{
              padding:
                "7px 10px",

              border:
                "1px solid #cbd5e1",

              borderRadius:
                "8px",

              background:
                "#ffffff",

              color:
                "#334155",

              fontSize:
                "11px",

              fontWeight:
                "700",

              cursor:
                "pointer",
            }}
          >
            수정
          </button>

          <button
            type="button"
            onClick={
              onActiveChange
            }
            style={{
              padding:
                "7px 10px",

              border:
                "1px solid #cbd5e1",

              borderRadius:
                "8px",

              background:
                active
                  ? "#ffffff"
                  : "#111827",

              color:
                active
                  ? "#64748b"
                  : "#ffffff",

              fontSize:
                "11px",

              fontWeight:
                "700",

              cursor:
                "pointer",
            }}
          >
            {active
              ? "비활성"
              : "재활성"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   계정 초대 모달
========================================================= */

function WorkerInviteModal({
  worker,
  inviteUrl,
  message,
  loading,
  onCopy,
  onShare,
  onClose,
}) {
  return (
    <div
      onClick={() => {
        if (!loading) {
          onClose();
        }
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1300,

        display: "flex",

        alignItems:
          "flex-start",

        justifyContent:
          "center",

        padding: "30px 12px",

        background:
          "rgba(15,23,42,0.60)",

        overflowY: "auto",
      }}
    >
      <div
        onClick={(event) =>
          event.stopPropagation()
        }
        style={{
          width: "100%",

          maxWidth: "500px",

          padding: "16px",

          borderRadius: "15px",

          background: "#ffffff",

          boxShadow:
            "0 20px 50px rgba(0,0,0,0.20)",
        }}
      >
        <div
          style={{
            display: "flex",

            alignItems:
              "flex-start",

            justifyContent:
              "space-between",

            gap: "10px",
          }}
        >
          <div>
            <div
              style={{
                color: "#111827",

                fontSize: "17px",

                fontWeight: "900",
              }}
            >
              🔗 시공자 계정 초대
            </div>

            <div
              style={{
                marginTop: "4px",

                color: "#64748b",

                fontSize: "12px",
              }}
            >
              {worker?.name ||
                "시공자"}
              님에게 보낼 계정
              등록 링크입니다.
            </div>
          </div>

          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            style={{
              border: "none",

              background:
                "transparent",

              color: "#64748b",

              fontSize: "26px",

              cursor:
                loading
                  ? "default"
                  : "pointer",
            }}
          >
            ×
          </button>
        </div>

        {message && (
          <div
            style={{
              marginTop: "14px",

              padding: "10px 12px",

              borderRadius: "9px",

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

              fontSize: "12px",

              fontWeight: "700",

              whiteSpace:
                "pre-wrap",
            }}
          >
            {message}
          </div>
        )}

        {loading && (
          <div
            style={{
              marginTop: "14px",

              padding: "16px",

              border:
                "1px solid #e2e8f0",

              borderRadius: "10px",

              color: "#64748b",

              textAlign: "center",

              fontSize: "13px",

              fontWeight: "700",
            }}
          >
            초대 링크를 생성하고
            있습니다...
          </div>
        )}

        {!loading &&
          inviteUrl && (
          <>
            <div
              style={{
                marginTop: "14px",

                color: "#334155",

                fontSize: "12px",

                fontWeight: "800",
              }}
            >
              초대 링크
            </div>

            <div
              style={{
                marginTop: "6px",

                padding: "11px",

                border:
                  "1px solid #cbd5e1",

                borderRadius: "9px",

                background:
                  "#f8fafc",

                color: "#334155",

                fontSize: "11px",

                lineHeight: "1.5",

                wordBreak:
                  "break-all",

                userSelect:
                  "all",
              }}
            >
              {inviteUrl}
            </div>

            <div
              style={{
                display: "grid",

                gridTemplateColumns:
                  "1fr 1fr",

                gap: "8px",

                marginTop: "12px",
              }}
            >
              <button
                type="button"
                onClick={onCopy}
                style={{
                  padding: "11px",

                  border:
                    "1px solid #cbd5e1",

                  borderRadius:
                    "9px",

                  background:
                    "#ffffff",

                  color:
                    "#334155",

                  fontSize:
                    "13px",

                  fontWeight:
                    "800",

                  cursor:
                    "pointer",
                }}
              >
                📋 링크 복사
              </button>

              <button
                type="button"
                onClick={onShare}
                style={{
                  padding: "11px",

                  border: "none",

                  borderRadius:
                    "9px",

                  background:
                    "#2563eb",

                  color:
                    "#ffffff",

                  fontSize:
                    "13px",

                  fontWeight:
                    "800",

                  cursor:
                    "pointer",
                }}
              >
                📤 공유하기
              </button>
            </div>

            <div
              style={{
                marginTop: "10px",

                padding: "9px 10px",

                borderRadius: "8px",

                background:
                  "#fff7ed",

                color: "#9a3412",

                fontSize: "11px",

                lineHeight: "1.5",
              }}
            >
              이 초대 링크는
              시공자 본인에게만
              전달해주세요. 초대는
              7일 후 만료됩니다.
            </div>
          </>
        )}

        <button
          type="button"
          disabled={loading}
          onClick={onClose}
          style={{
            width: "100%",

            marginTop: "14px",

            padding: "11px",

            border:
              "1px solid #cbd5e1",

            borderRadius: "9px",

            background: "#ffffff",

            color: "#475569",

            fontSize: "13px",

            fontWeight: "800",

            cursor:
              loading
                ? "default"
                : "pointer",
          }}
        >
          닫기
        </button>
      </div>
    </div>
  );
}

/* =========================================================
   등록 / 수정 모달
========================================================= */

function WorkerFormModal({
  editingWorker,
  form,
  loading,
  localMessage,
  updateField,
  onSubmit,
  onClose,
}) {
  const inputStyle = {
    width: "100%",

    boxSizing: "border-box",

    padding: "11px 12px",

    border:
      "1px solid #cbd5e1",

    borderRadius: "9px",

    background: "#ffffff",

    color: "#111827",

    fontSize: "14px",

    outline: "none",
  };

  const labelStyle = {
    display: "block",

    marginBottom: "6px",

    color: "#334155",

    fontSize: "12px",

    fontWeight: "800",
  };

  const fieldStyle = {
    marginBottom: "13px",
  };

  return (
    <div
      onClick={() => {
        if (!loading) {
          onClose();
        }
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1100,

        display: "flex",

        alignItems:
          "flex-start",

        justifyContent:
          "center",

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

          maxWidth: "520px",

          borderRadius: "15px",

          background: "#ffffff",

          boxShadow:
            "0 20px 50px rgba(0,0,0,0.20)",

          overflow: "hidden",
        }}
      >
        {/* 제목 */}

        <div
          style={{
            display: "flex",

            alignItems: "center",

            justifyContent:
              "space-between",

            padding: "15px",

            borderBottom:
              "1px solid #e5e7eb",
          }}
        >
          <div>
            <div
              style={{
                color: "#111827",

                fontSize: "17px",

                fontWeight: "900",
              }}
            >
              {editingWorker
                ? "시공자 수정"
                : "시공자 등록"}
            </div>

            <div
              style={{
                marginTop: "3px",

                color: "#64748b",

                fontSize: "11px",
              }}
            >
              회사 소속 시공자 정보를
              관리합니다.
            </div>
          </div>

          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            style={{
              border: "none",

              background:
                "transparent",

              color: "#64748b",

              fontSize: "25px",

              cursor:
                loading
                  ? "default"
                  : "pointer",
            }}
          >
            ×
          </button>
        </div>

        {/* 입력 */}

        <form
          onSubmit={onSubmit}
          style={{
            padding: "15px",
          }}
        >
          <div
            style={fieldStyle}
          >
            <label
              style={labelStyle}
            >
              이름 *
            </label>

            <input
              type="text"
              value={form.name}
              onChange={(event) =>
                updateField(
                  "name",
                  event.target
                    .value,
                )
              }
              placeholder="예: 김기사"
              style={inputStyle}
            />
          </div>

          <div
            style={{
              display: "grid",

              gridTemplateColumns:
                "1fr 1fr",

              gap: "8px",
            }}
          >
            <div
              style={fieldStyle}
            >
              <label
                style={labelStyle}
              >
                전화번호
              </label>

              <input
                type="tel"
                value={
                  form.phone
                }
                onChange={(
                  event,
                ) =>
                  updateField(
                    "phone",
                    event.target
                      .value,
                  )
                }
                placeholder="010-0000-0000"
                style={
                  inputStyle
                }
              />
            </div>

            <div
              style={fieldStyle}
            >
              <label
                style={labelStyle}
              >
                직책
              </label>

              <input
                type="text"
                value={
                  form.position
                }
                onChange={(
                  event,
                ) =>
                  updateField(
                    "position",
                    event.target
                      .value,
                  )
                }
                placeholder="예: 팀장"
                style={
                  inputStyle
                }
              />
            </div>
          </div>

          <div
            style={fieldStyle}
          >
            <label
              style={labelStyle}
            >
              전문 시공 분야
            </label>

            <input
              type="text"
              value={
                form.specialties
              }
              onChange={(event) =>
                updateField(
                  "specialties",
                  event.target
                    .value,
                )
              }
              placeholder="예: 싱크대, 문/문틀, 붙박이장"
              style={inputStyle}
            />

            <div
              style={{
                marginTop: "5px",

                color: "#94a3b8",

                fontSize: "10px",
              }}
            >
              여러 개는 쉼표(,)로
              구분해주세요.
            </div>
          </div>

          <div
            style={fieldStyle}
          >
            <label
              style={labelStyle}
            >
              메모
            </label>

            <textarea
              value={form.memo}
              onChange={(event) =>
                updateField(
                  "memo",
                  event.target
                    .value,
                )
              }
              rows={3}
              placeholder="예: 인천/김포 가능, 주말 가능"
              style={{
                ...inputStyle,
                resize:
                  "vertical",
              }}
            />
          </div>

          {localMessage && (
            <div
              style={{
                marginBottom:
                  "13px",

                padding:
                  "10px 12px",

                borderRadius:
                  "9px",

                background:
                  localMessage.startsWith(
                    "✅",
                  )
                    ? "#f0fdf4"
                    : "#fef2f2",

                color:
                  localMessage.startsWith(
                    "✅",
                  )
                    ? "#166534"
                    : "#b91c1c",

                fontSize:
                  "12px",

                fontWeight:
                  "700",

                whiteSpace:
                  "pre-wrap",
              }}
            >
              {localMessage}
            </div>
          )}

          <div
            style={{
              display: "grid",

              gridTemplateColumns:
                "1fr 2fr",

              gap: "8px",
            }}
          >
            <button
              type="button"
              disabled={loading}
              onClick={onClose}
              style={{
                padding: "11px",

                border:
                  "1px solid #cbd5e1",

                borderRadius:
                  "9px",

                background:
                  "#ffffff",

                color:
                  "#475569",

                fontWeight:
                  "800",

                cursor:
                  loading
                    ? "default"
                    : "pointer",
              }}
            >
              취소
            </button>

            <button
              type="submit"
              disabled={loading}
              style={{
                padding: "11px",

                border: "none",

                borderRadius:
                  "9px",

                background:
                  loading
                    ? "#94a3b8"
                    : "#111827",

                color:
                  "#ffffff",

                fontWeight:
                  "900",

                cursor:
                  loading
                    ? "default"
                    : "pointer",
              }}
            >
              {loading
                ? "저장 중..."
                : editingWorker
                  ? "수정 저장"
                  : "시공자 등록"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
              }
