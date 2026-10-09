import { supabase } from "./supabase";

const attempts = new Map();

const statusLabels = {
  consulting: "상담중",
  scheduled: "시공 예정",
  in_progress: "시공 중",
  completed: "시공 완료",
  cancelled: "취소",
  canceled: "취소",
};

function selectExistingSite(result) {
  return new Promise((resolve, reject) => {
    const dialog = document.createElement("dialog");

    if (typeof dialog.showModal !== "function") {
      reject(
        new Error(
          "현장 선택창을 지원하는 최신 Chrome에서 다시 시도해주세요."
        )
      );
      return;
    }

    dialog.style.cssText = `
      width: min(92vw, 620px);
      max-height: 85dvh;
      overflow-y: auto;
      box-sizing: border-box;
      border: 1px solid #cbd5e1;
      border-radius: 18px;
      padding: 20px;
      background: #ffffff;
      color: #243648;
      box-shadow: 0 20px 70px #0005;
    `;

    const title = document.createElement("h3");
    title.textContent = "같은 현장인지 확인해주세요";
    title.style.margin = "0 0 12px";
    dialog.append(title);

    const description = document.createElement("p");
    description.textContent =
      "기존 현장을 선택하면 새 현장을 만들지 않고 상담 내용을 추가합니다. 기존 가격·수량·확정 일정은 유지합니다.";
    description.style.cssText =
      "font-size:14px;line-height:1.7;";
    dialog.append(description);

    let finished = false;

    function finish(value) {
      if (finished) return;
      finished = true;
      dialog.close();
      dialog.remove();
      resolve(value);
    }

    function addButton(label, value, secondary = false) {
      const button = document.createElement("button");

      button.type = "button";
      button.textContent = label;

      button.style.cssText = `
        display: block;
        width: 100%;
        margin: 10px 0;
        padding: 14px;
        border: 1px solid #cbd5e1;
        border-radius: 12px;
        background: ${secondary ? "#ffffff" : "#eff6ff"};
        color: #243648;
        text-align: left;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        font: inherit;
        line-height: 1.7;
        cursor: pointer;
      `;

      button.addEventListener("click", () => finish(value));
      dialog.append(button);
    }

    for (const site of result.candidates || []) {
      const name =
        site.site_name ||
        site.customer_name ||
        "현장명 없음";

      const address = [
        site.address,
        site.address_detail,
      ].filter(Boolean).join(" ");

      const status =
        statusLabels[site.status] || site.status || "";

      const label = [
        site.exact ? "전화번호·현장 정보 일치" : "같은 현장 후보",
        `${name} · ${status}`,
        site.customer_name || "",
        site.customer_phone || "",
        address,
        "→ 이 현장에 상담 추가",
      ].filter(Boolean).join("\n");

      addButton(label, {
        targetId: site.id,
        createNew: false,
      });
    }

    if (result.allow_new) {
      addButton(
        "다른 공사입니다 · 신규 현장 등록",
        {
          targetId: null,
          createNew: true,
        },
        true
      );
    } else {
      const notice = document.createElement("p");

      notice.textContent =
        "진행 중인 현장의 전화번호와 현장 정보가 일치하여 중복 신규 등록을 막았습니다. 별도 공사라면 입력한 주소·동호수·현장명을 확인해주세요.";

      notice.style.cssText =
        "font-size:13px;line-height:1.7;color:#92400e;";

      dialog.append(notice);
    }

    addButton("취소 · 입력 내용 유지", null, true);

    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      finish(null);
    });

    document.body.append(dialog);
    dialog.showModal();
  });
}

export async function saveConsultation(data) {
  const {
    data: sessionData,
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !sessionData?.session?.user?.id) {
    throw new Error("관리자로 다시 로그인해주세요.");
  }

  const userId = sessionData.session.user.id;

  const fingerprint = JSON.stringify({
    userId,
    data,
  });

  let attempt = attempts.get(fingerprint);

  if (!attempt) {
    attempt = {
      requestId: crypto.randomUUID(),
      targetId: null,
      createNew: false,
    };

    attempts.set(fingerprint, attempt);
  }

  for (;;) {
    const { data: result, error } = await supabase.rpc(
      "save_consultation_site",
      {
        p_request_id: attempt.requestId,
        p_data: data,
        p_target_id: attempt.targetId,
        p_create_new: attempt.createNew,
      }
    );

    if (error) {
      if (
        ["PGRST202", "42883"].includes(error.code)
      ) {
        throw new Error(
          "중복 현장 방지 SQL을 먼저 실행해주세요."
        );
      }

      throw new Error(
        error.message ||
        "상담 저장에 실패했습니다. 입력을 유지한 채 다시 시도해주세요."
      );
    }

    if (!result) {
      throw new Error(
        "저장 결과를 확인하지 못했습니다. 같은 내용으로 다시 시도해주세요."
      );
    }

    if (result.needs_choice) {
      const selection = await selectExistingSite(result);

      if (!selection) {
        throw new Error(
          "등록을 취소했습니다. 입력 내용은 유지됩니다."
        );
      }

      attempt = {
        requestId: crypto.randomUUID(),
        targetId: selection.targetId,
        createNew: selection.createNew,
      };

      attempts.set(fingerprint, attempt);
      continue;
    }

    if (!result.site?.id) {
      throw new Error("저장된 현장 정보를 확인하지 못했습니다.");
    }

    attempts.delete(fingerprint);
    return result;
  }
}
