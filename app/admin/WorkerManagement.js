"use client";

import { useMemo, useState } from "react";

import WorkerSummary from "./workers/WorkerSummary";
import WorkerCard from "./workers/WorkerCard";
import WorkerFormModal from "./workers/WorkerFormModal";
import WorkerInviteModal from "./workers/WorkerInviteModal";

/* =========================================================
   시공자 등록 / 수정 폼

   시공자 기본정보:
   - 이름
   - 전화번호
   - 기본 일당

   역할은 시공자 등록에서 정하지 않는다.
   현장 배정 시 leader / member 로 지정한다.
========================================================= */

const EMPTY_FORM = {
  name: "",
  phone: "",
  daily_wage: "",
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
  /* =========================================================
     등록 / 수정
  ========================================================= */

  const [showForm, setShowForm] =
    useState(false);

  const [
    editingWorker,
    setEditingWorker,
  ] = useState(null);

  const [form, setForm] =
    useState(EMPTY_FORM);

  const [
    localMessage,
    setLocalMessage,
  ] = useState("");

  /* =========================================================
     목록
  ========================================================= */

  const [
    showInactive,
    setShowInactive,
  ] = useState(false);

  /* =========================================================
     계정 초대
  ========================================================= */

  const [
    inviteWorker,
    setInviteWorker,
  ] = useState(null);

  const [
    inviteUrl,
    setInviteUrl,
  ] = useState("");

  const [
    inviteMessage,
    setInviteMessage,
  ] = useState("");

  const [
    inviteLoadingId,
    setInviteLoadingId,
  ] = useState(null);

  /* =========================================================
     시공자 목록 계산
  ========================================================= */

  const visibleWorkers =
    useMemo(() => {
      if (showInactive) {
        return workers;
      }

      return workers.filter(
        (worker) =>
          worker.is_active !== false,
      );
    }, [
      workers,
      showInactive,
    ]);

  const activeCount =
    useMemo(
      () =>
        workers.filter(
          (worker) =>
            worker.is_active !==
            false,
        ).length,
      [workers],
    );

  const inactiveCount =
    useMemo(
      () =>
        workers.filter(
          (worker) =>
            worker.is_active ===
            false,
        ).length,
      [workers],
    );

  const linkedCount =
    useMemo(
      () =>
        workers.filter(
          (worker) =>
            Boolean(
              worker.user_id,
            ),
        ).length,
      [workers],
    );

  /* =========================================================
     입력값 변경
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

  /* =========================================================
     신규 등록 열기
  ========================================================= */

  function openCreateForm() {
    setEditingWorker(null);

    setForm({
      ...EMPTY_FORM,
    });

    setLocalMessage("");

    setShowForm(true);
  }

  /* =========================================================
     수정 열기
  ========================================================= */

  function openEditForm(worker) {
    setEditingWorker(worker);

    setForm({
      name:
        worker?.name || "",

      phone:
        worker?.phone || "",

      daily_wage:
        worker?.daily_wage ===
          null ||
        worker?.daily_wage ===
          undefined
          ? ""
          : String(
              worker.daily_wage,
            ),
    });

    setLocalMessage("");

    setShowForm(true);
  }

  /* =========================================================
     등록 / 수정 닫기
  ========================================================= */

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
     등록 / 수정 저장
  ========================================================= */

  async function handleSubmit(
    event,
  ) {
    event.preventDefault();

    setLocalMessage("");

    const cleanName =
      String(
        form?.name || "",
      ).trim();

    const cleanPhone =
      String(
        form?.phone || "",
      ).trim();

    const cleanDailyWage =
      String(
        form?.daily_wage || "",
      )
        .replace(
          /[^\d]/g,
          "",
        )
        .trim();

    /* ---------------------------------------------------------
       신규 등록에서만 이름 검사

       수정 모드에서는 이름을 변경하지 않는다.
    --------------------------------------------------------- */

    if (
      !editingWorker?.id &&
      !cleanName
    ) {
      setLocalMessage(
        "❌ 시공자 이름을 입력해주세요.",
      );

      return;
    }

    if (!cleanPhone) {
      setLocalMessage(
        "❌ 전화번호를 입력해주세요.",
      );

      return;
    }

    if (!cleanDailyWage) {
      setLocalMessage(
        "❌ 기본 일당을 입력해주세요.",
      );

      return;
    }

    const wageNumber =
      Number(cleanDailyWage);

    if (
      !Number.isFinite(
        wageNumber,
      ) ||
      wageNumber < 0
    ) {
      setLocalMessage(
        "❌ 기본 일당을 확인해주세요.",
      );

      return;
    }

    const submitForm = {
      name: cleanName,
      phone: cleanPhone,
      daily_wage:
        cleanDailyWage,
    };

    try {
      let result;

      /* -------------------------------------------------------
         수정
      ------------------------------------------------------- */

      if (
        editingWorker?.id
      ) {
        if (
          typeof updateWorker !==
          "function"
        ) {
          throw new Error(
            "시공자 수정 기능을 사용할 수 없습니다.",
          );
        }

        /*
         * updateWorker에서는
         * 이름을 DB에 업데이트하지 않는다.
         *
         * 전화번호와 기본 일당만 수정한다.
         */

        result =
          await updateWorker(
            editingWorker.id,
            submitForm,
          );
      }

      /* -------------------------------------------------------
         신규 등록
      ------------------------------------------------------- */

      else {
        if (
          typeof createWorker !==
          "function"
        ) {
          throw new Error(
            "시공자 등록 기능을 사용할 수 없습니다.",
          );
        }

        result =
          await createWorker(
            submitForm,
          );
      }

      if (
        !result?.success
      ) {
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

      setLocalMessage("");
    } catch (error) {
      console.error(
        "시공자 저장:",
        error,
      );

      setLocalMessage(
        `❌ ${
          error?.message ||
          "저장에 실패했습니다."
        }`,
      );
    }
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

    if (
      typeof setWorkerActive !==
      "function"
    ) {
      return;
    }

    const nextActive =
      worker.is_active === false;

    const text =
      nextActive
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
     계정 초대 생성
  ========================================================= */

  async function handleCreateInvite(
    worker,
  ) {
    if (!worker?.id) {
      return;
    }

    if (worker.user_id) {
      setInviteWorker(
        worker,
      );

      setInviteUrl("");

      setInviteMessage(
        "✅ 이미 로그인 계정이 연결된 시공자입니다.",
      );

      return;
    }

    if (
      worker.is_active ===
      false
    ) {
      setInviteWorker(
        worker,
      );

      setInviteUrl("");

      setInviteMessage(
        "❌ 비활성 시공자는 계정을 초대할 수 없습니다.",
      );

      return;
    }

    if (
      typeof createWorkerInvite !==
      "function"
    ) {
      setInviteWorker(
        worker,
      );

      setInviteUrl("");

      setInviteMessage(
        "❌ 계정 초대 기능을 사용할 수 없습니다.",
      );

      return;
    }

    setInviteWorker(
      worker,
    );

    setInviteUrl("");

    setInviteMessage("");

    setInviteLoadingId(
      worker.id,
    );

    try {
      const result =
        await createWorkerInvite(
          worker,
        );

      if (
        !result?.success
      ) {
        setInviteMessage(
          `❌ ${
            result?.error ||
            "초대코드 생성에 실패했습니다."
          }`,
        );

        return;
      }

      if (
        !result.inviteCode
      ) {
        setInviteMessage(
          "❌ 초대코드를 확인할 수 없습니다.",
        );

        return;
      }

      const origin =
        typeof window !==
        "undefined"
          ? window.location
              .origin
          : "";

      const url =
        `${origin}/worker/invite/${result.inviteCode}`;

      setInviteUrl(url);

      setInviteMessage(
        `✅ ${
          worker.name ||
          "시공자"
        } 계정 초대 링크가 생성되었습니다.`,
      );
    } catch (error) {
      console.error(
        "시공자 계정 초대:",
        error,
      );

      setInviteMessage(
        `❌ ${
          error?.message ||
          "초대 링크 생성에 실패했습니다."
        }`,
      );
    } finally {
      setInviteLoadingId(
        null,
      );
    }
  }

  /* =========================================================
     초대창 닫기
  ========================================================= */

  function closeInvite() {
    if (
      inviteLoadingId
    ) {
      return;
    }

    setInviteWorker(null);

    setInviteUrl("");

    setInviteMessage("");
  }

  /* =========================================================
     초대 링크 복사
  ========================================================= */

  async function copyInviteUrl() {
    if (!inviteUrl) {
      return;
    }

    try {
      if (
        typeof navigator !==
          "undefined" &&
        navigator.clipboard
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

  /* =========================================================
     초대 링크 공유
  ========================================================= */

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

  /* =========================================================
     화면
  ========================================================= */

  return (
    <>
      <section>
        {/* =====================================================
            상단
        ===================================================== */}

        <div
          style={{
            display: "flex",

            alignItems:
              "center",

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
                  "18px",

                fontWeight:
                  "900",

                color:
                  "#111827",
              }}
            >
              시공자 관리
            </div>

            <div
              style={{
                marginTop:
                  "3px",

                color:
                  "#64748b",

                fontSize:
                  "12px",
              }}
            >
              시공자를 등록하고
              계정과 기본 일당을
              관리합니다.
            </div>
          </div>

          <button
            type="button"
            onClick={
              openCreateForm
            }
            style={{
              flex:
                "0 0 auto",

              border:
                "none",

              borderRadius:
                "10px",

              padding:
                "10px 13px",

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
            }}
          >
            + 시공자 등록
          </button>
        </div>

        {/* =====================================================
            요약
        ===================================================== */}

        <WorkerSummary
          activeCount={
            activeCount
          }
          linkedCount={
            linkedCount
          }
          inactiveCount={
            inactiveCount
          }
        />

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

            marginBottom:
              "12px",

            padding:
              "9px 10px",

            border:
              "1px solid #e2e8f0",

            borderRadius:
              "9px",

            background:
              "#ffffff",

            color:
              "#475569",

            fontSize:
              "12px",

            fontWeight:
              "700",

            cursor:
              "pointer",
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
              marginBottom:
                "12px",

              padding:
                "10px 12px",

              borderRadius:
                "9px",

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

              fontSize:
                "13px",

              fontWeight:
                "700",

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
          workers.length ===
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
                  "13px",
              }}
            >
              시공자 정보를
              불러오는 중입니다...
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
                padding:
                  "35px 15px",

                border:
                  "1px dashed #cbd5e1",

                borderRadius:
                  "12px",

                background:
                  "#f8fafc",

                textAlign:
                  "center",
              }}
            >
              <div
                style={{
                  fontSize:
                    "28px",

                  marginBottom:
                    "7px",
                }}
              >
                👷
              </div>

              <div
                style={{
                  color:
                    "#334155",

                  fontWeight:
                    "800",
                }}
              >
                등록된 시공자가
                없습니다.
              </div>

              <div
                style={{
                  marginTop:
                    "5px",

                  color:
                    "#64748b",

                  fontSize:
                    "12px",
                }}
              >
                시공자를 먼저
                등록하면 현장에
                배정할 수 있습니다.
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
                key={
                  worker.id
                }

                worker={
                  worker
                }

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

          form={
            form
          }

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

          onClose={
            closeForm
          }
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
