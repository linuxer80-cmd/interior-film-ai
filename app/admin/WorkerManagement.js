"use client";

import { useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { koreanDay } from "../utils/workerCalendar";
import { payAmount, payDate } from "../utils/workerPay";

import WorkerSummary from "./workers/WorkerSummary";
import WorkerCard from "./workers/WorkerCard";
import WorkerFormModal from "./workers/WorkerFormModal";
import WorkerInviteModal from "./workers/WorkerInviteModal";

const EMPTY_FORM = {
  name: "",
  phone: "",
  daily_wage: "",
  pay_rate_effective_from: "",
};

export default function WorkerManagement({
  workers = [],
  workersLoading = false,
  workersMessage = "",
  createWorker,
  updateWorker,
  setWorkerActive,
  createWorkerInvite,
  loadWorkers,
}) {
  const [selfRegistration, setSelfRegistration] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingWorker, setEditingWorker] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [localMessage, setLocalMessage] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  const [inviteWorker, setInviteWorker] = useState(null);
  const [inviteUrl, setInviteUrl] = useState("");
  const [inviteMessage, setInviteMessage] = useState("");
  const [inviteLoadingId, setInviteLoadingId] = useState(null);

  async function registerMyself(payload) {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;

    if (!token) {
      throw new Error("로그인을 다시 해주세요.");
    }

    const response = await fetch("/api/admin/self-worker", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(
        result.error || "시공자 계정 연결에 실패했습니다.",
      );
    }

    await loadWorkers?.();
    return result;
  }

  async function linkMyself(worker) {
    if (
      !window.confirm(
        `${worker.name} 시공자를 현재 로그인한 관리자 계정에 연결할까요?`,
      )
    ) {
      return;
    }

    try {
      await registerMyself({ workerId: worker.id });
      setLocalMessage("✅ 내 시공자 계정이 연결되었습니다.");
    } catch (error) {
      setLocalMessage(`❌ ${error.message}`);
    }
  }

  const visibleWorkers = useMemo(() => {
    if (showInactive) return workers;

    return workers.filter(
      (worker) => worker.is_active !== false,
    );
  }, [workers, showInactive]);

  const activeCount = useMemo(
    () =>
      workers.filter(
        (worker) => worker.is_active !== false,
      ).length,
    [workers],
  );

  const inactiveCount = useMemo(
    () =>
      workers.filter(
        (worker) => worker.is_active === false,
      ).length,
    [workers],
  );

  const linkedCount = useMemo(
    () =>
      workers.filter(
        (worker) => Boolean(worker.user_id),
      ).length,
    [workers],
  );

  function updateField(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function openCreateForm() {
    setSelfRegistration(false);
    setEditingWorker(null);

    setForm({
      ...EMPTY_FORM,
      pay_rate_effective_from: koreanDay(),
    });

    setLocalMessage("");
    setShowForm(true);
  }

  function openEditForm(worker) {
    setSelfRegistration(false);
    setEditingWorker(worker);

    setForm({
      pay_rate_effective_from: koreanDay(),
      name: worker?.name || "",
      phone: worker?.phone || "",
      daily_wage:
        worker?.daily_wage === null ||
        worker?.daily_wage === undefined
          ? ""
          : String(worker.daily_wage),
    });

    setLocalMessage("");
    setShowForm(true);
  }

  function closeForm() {
    if (workersLoading) return;

    setShowForm(false);
    setEditingWorker(null);

    setForm({
      ...EMPTY_FORM,
      pay_rate_effective_from: koreanDay(),
    });

    setLocalMessage("");
  }

  function makeInviteUrl(inviteCode) {
    const origin =
      typeof window !== "undefined"
        ? window.location.origin
        : "";

    if (!origin) return "";

    return `${origin}/worker/invite/${inviteCode}`;
  }

  async function createInviteForWorker(worker) {
    if (!worker?.id) {
      return {
        success: false,
        error: "시공자 정보를 확인할 수 없습니다.",
      };
    }

    setInviteWorker(worker);
    setInviteUrl("");
    setInviteMessage("");

    if (worker.user_id) {
      setInviteMessage(
        "✅ 이미 로그인 계정이 연결된 시공자입니다.",
      );

      return {
        success: false,
        alreadyLinked: true,
      };
    }

    if (worker.is_active === false) {
      setInviteMessage(
        "❌ 비활성 시공자는 계정을 초대할 수 없습니다.",
      );

      return {
        success: false,
        error: "비활성 시공자입니다.",
      };
    }

    if (typeof createWorkerInvite !== "function") {
      setInviteMessage(
        "❌ 계정 초대 기능을 사용할 수 없습니다.",
      );

      return {
        success: false,
        error: "계정 초대 기능을 사용할 수 없습니다.",
      };
    }

    setInviteLoadingId(worker.id);

    try {
      const result = await createWorkerInvite(worker);

      if (!result?.success) {
        setInviteMessage(
          `❌ ${
            result?.error || "초대코드 생성에 실패했습니다."
          }`,
        );

        return {
          success: false,
          error:
            result?.error || "초대코드 생성에 실패했습니다.",
        };
      }

      if (!result.inviteCode) {
        setInviteMessage("❌ 초대코드를 확인할 수 없습니다.");

        return {
          success: false,
          error: "초대코드를 확인할 수 없습니다.",
        };
      }

      const url = makeInviteUrl(result.inviteCode);

      if (!url) {
        setInviteMessage(
          "❌ 초대 링크 주소를 만들 수 없습니다.",
        );

        return {
          success: false,
          error: "초대 링크 주소를 만들 수 없습니다.",
        };
      }

      setInviteUrl(url);

      setInviteMessage(
        `✅ ${
          worker.name || "시공자"
        } 계정 초대 링크가 생성되었습니다.`,
      );

      return {
        success: true,
        inviteCode: result.inviteCode,
        inviteUrl: url,
      };
    } catch (error) {
      console.error("시공자 계정 초대:", error);

      const message =
        error?.message || "초대 링크 생성에 실패했습니다.";

      setInviteMessage(`❌ ${message}`);

      return {
        success: false,
        error: message,
      };
    } finally {
      setInviteLoadingId(null);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setLocalMessage("");

    const cleanName = String(form?.name || "").trim();
    const cleanPhone = String(form?.phone || "").trim();

    const cleanDailyWage = String(form?.daily_wage || "")
      .replace(/[^\d]/g, "")
      .trim();

    if (!editingWorker?.id && !cleanName) {
      setLocalMessage("❌ 시공자 이름을 입력해주세요.");
      return;
    }

    if (!cleanPhone) {
      setLocalMessage("❌ 전화번호를 입력해주세요.");
      return;
    }

    if (!cleanDailyWage) {
      setLocalMessage("❌ 기본 일당을 입력해주세요.");
      return;
    }

    const wageNumber = Number(cleanDailyWage);

    if (!Number.isFinite(wageNumber) || wageNumber < 0) {
      setLocalMessage("❌ 기본 일당을 확인해주세요.");
      return;
    }

    const effectiveFrom = payDate(
      form.pay_rate_effective_from,
    );

    const rateChanged =
      !editingWorker ||
      payAmount(editingWorker.daily_wage) !== wageNumber;

    if (payAmount(wageNumber) === null) {
      setLocalMessage(
        "❌ 기본 일당은 0~100,000,000원 사이의 정수로 입력해주세요.",
      );
      return;
    }

    if (
      rateChanged &&
      (!effectiveFrom ||
        effectiveFrom > koreanDay() ||
        (editingWorker?.pay_rate_effective_from &&
          effectiveFrom <
            editingWorker.pay_rate_effective_from))
    ) {
      setLocalMessage(
        "❌ 적용 시작일은 이전 단가 적용일 이후부터 오늘 사이로 지정해주세요.",
      );
      return;
    }

    const submitForm = {
      name: cleanName,
      phone: cleanPhone,
      daily_wage: cleanDailyWage,
      pay_rate_effective_from: effectiveFrom,
      update_pay_rate: rateChanged,
    };

    try {
      if (selfRegistration && !editingWorker?.id) {
        await registerMyself(submitForm);

        setShowForm(false);
        setSelfRegistration(false);

        setForm({
          ...EMPTY_FORM,
          pay_rate_effective_from: koreanDay(),
        });

        setLocalMessage(
          "✅ 내 시공자 계정이 등록되었습니다.",
        );
        return;
      }

      if (editingWorker?.id) {
        if (typeof updateWorker !== "function") {
          throw new Error(
            "시공자 수정 기능을 사용할 수 없습니다.",
          );
        }

        const result = await updateWorker(
          editingWorker.id,
          submitForm,
        );

        if (!result?.success) {
          setLocalMessage(
            `❌ ${result?.error || "수정에 실패했습니다."}`,
          );
          return;
        }

        setShowForm(false);
        setEditingWorker(null);

        setForm({
          ...EMPTY_FORM,
          pay_rate_effective_from: koreanDay(),
        });

        setLocalMessage("");
        return;
      }

      if (typeof createWorker !== "function") {
        throw new Error(
          "시공자 등록 기능을 사용할 수 없습니다.",
        );
      }

      const result = await createWorker(submitForm);

      if (!result?.success) {
        setLocalMessage(
          `❌ ${
            result?.error || "시공자 등록에 실패했습니다."
          }`,
        );
        return;
      }

      if (!result.worker?.id) {
        setLocalMessage(
          "❌ 시공자는 등록되었지만 등록 정보를 확인할 수 없습니다.",
        );
        return;
      }

      const newWorker = result.worker;

      setShowForm(false);
      setEditingWorker(null);

      setForm({
        ...EMPTY_FORM,
        pay_rate_effective_from: koreanDay(),
      });

      setLocalMessage("");

      await createInviteForWorker(newWorker);
    } catch (error) {
      console.error("시공자 저장:", error);

      setLocalMessage(
        `❌ ${error?.message || "저장에 실패했습니다."}`,
      );
    }
  }

  async function handleActiveChange(worker) {
    if (!worker?.id) return;
    if (typeof setWorkerActive !== "function") return;

    const nextActive = worker.is_active === false;

    const text = nextActive
      ? `${worker.name} 시공자를 다시 활성화할까요?`
      : `${worker.name} 시공자를 비활성화할까요?\n\n과거 현장 기록은 삭제되지 않습니다.`;

    if (!window.confirm(text)) return;

    await setWorkerActive(worker.id, nextActive);
  }

  async function handleCreateInvite(worker) {
    await createInviteForWorker(worker);
  }

  function closeInvite() {
    if (inviteLoadingId) return;

    setInviteWorker(null);
    setInviteUrl("");
    setInviteMessage("");
  }

  async function copyInviteUrl() {
    if (!inviteUrl) return;

    try {
      if (
        typeof navigator !== "undefined" &&
        navigator.clipboard?.writeText
      ) {
        await navigator.clipboard.writeText(inviteUrl);
        setInviteMessage("✅ 초대 링크를 복사했습니다.");
        return;
      }

      window.prompt(
        "아래 초대 링크를 복사해주세요.",
        inviteUrl,
      );
    } catch (error) {
      console.error("초대 링크 복사:", error);

      window.prompt(
        "아래 초대 링크를 복사해주세요.",
        inviteUrl,
      );
    }
  }

  async function shareInviteUrl() {
    if (!inviteUrl) return;

    const workerName = inviteWorker?.name || "시공자";
    const shareText =
      `${workerName}님, 시공자 계정을 등록해주세요.`;

    try {
      if (
        typeof navigator !== "undefined" &&
        navigator.share
      ) {
        await navigator.share({
          title: "시공자 계정 초대",
          text: shareText,
          url: inviteUrl,
        });
        return;
      }

      await copyInviteUrl();
    } catch (error) {
      if (error?.name === "AbortError") return;

      console.error("초대 링크 공유:", error);
      await copyInviteUrl();
    }
  }

  return (
    <>
      <section>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
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
              시공자를 등록하고 계정과 기본 일당을 관리합니다.
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

          <button
            type="button"
            onClick={() => {
              setEditingWorker(null);

              setForm({
                ...EMPTY_FORM,
                pay_rate_effective_from: koreanDay(),
              });

              setLocalMessage("");
              setSelfRegistration(true);
              setShowForm(true);
            }}
            style={{
              padding: "10px 13px",
              borderRadius: 10,
              border: "1px solid #2563eb",
              background: "#eff6ff",
              color: "#1d4ed8",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            + 관리자 본인 시공자 등록
          </button>
        </div>

        <WorkerSummary
          activeCount={activeCount}
          linkedCount={linkedCount}
          inactiveCount={inactiveCount}
        />

        <button
          type="button"
          onClick={() =>
            setShowInactive((current) => !current)
          }
          style={{
            width: "100%",
            marginBottom: "12px",
            padding: "9px 10px",
            border: "1px solid #e2e8f0",
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

        {workersMessage && (
          <div
            style={{
              marginBottom: "12px",
              padding: "10px 12px",
              borderRadius: "9px",
              background: workersMessage.startsWith("✅")
                ? "#f0fdf4"
                : "#fef2f2",
              color: workersMessage.startsWith("✅")
                ? "#166534"
                : "#b91c1c",
              fontSize: "13px",
              fontWeight: "700",
              whiteSpace: "pre-wrap",
            }}
          >
            {workersMessage}
          </div>
        )}

        {workersLoading && workers.length === 0 && (
          <div
            style={{
              padding: "30px 12px",
              textAlign: "center",
              color: "#64748b",
              fontSize: "13px",
            }}
          >
            시공자 정보를 불러오는 중입니다...
          </div>
        )}

        {!workersLoading && visibleWorkers.length === 0 && (
          <div
            style={{
              padding: "35px 15px",
              border: "1px dashed #cbd5e1",
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
              시공자를 등록하면 계정 초대 링크가 자동으로
              생성됩니다.
            </div>
          </div>
        )}

        <div style={{ display: "grid", gap: "9px" }}>
          {visibleWorkers.map((worker) => (
            <WorkerCard
              key={worker.id}
              worker={worker}
              inviteLoading={inviteLoadingId === worker.id}
              onInvite={() => handleCreateInvite(worker)}
              onLinkSelf={() => linkMyself(worker)}
              onEdit={() => openEditForm(worker)}
              onActiveChange={() => handleActiveChange(worker)}
            />
          ))}
        </div>
      </section>

      {showForm && (
        <WorkerFormModal
          selfRegistration={selfRegistration}
          editingWorker={editingWorker}
          form={form}
          loading={workersLoading}
          localMessage={localMessage}
          updateField={updateField}
          onSubmit={handleSubmit}
          onClose={closeForm}
        />
      )}

      {inviteWorker && (
        <WorkerInviteModal
          worker={inviteWorker}
          inviteUrl={inviteUrl}
          message={inviteMessage}
          loading={Boolean(inviteLoadingId)}
          onCopy={copyInviteUrl}
          onShare={shareInviteUrl}
          onClose={closeInvite}
        />
      )}
    </>
  );
}
