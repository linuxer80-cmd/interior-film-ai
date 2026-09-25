"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  formatWon,
  getLeader,
  getMembers,
} from "./siteDetailUtils";

/* =========================================================
   값 처리
========================================================= */

function valueOrEmpty(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return String(value);
}

function hasAmount(value) {
  return !(
    value === null ||
    value === undefined ||
    value === ""
  );
}

/* =========================================================
   현장 기본정보
========================================================= */

export default function SiteBasicInfo({
  site,
  updateSiteBasicInfo,
}) {
  const [
    editing,
    setEditing,
  ] = useState(false);

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [
    message,
    setMessage,
  ] = useState("");

  const [
    form,
    setForm,
  ] = useState({
    customer_name: "",
    customer_phone: "",

    site_name: "",

    address: "",
    address_detail: "",
    region: "",

    work_type: "",
    work_description: "",

    contract_amount: "",
    deposit_amount: "",

    memo: "",
  });

  /* =======================================================
     현장 정보 → 수정폼 동기화
  ======================================================= */

  useEffect(() => {
    if (!site) {
      return;
    }

    setForm({
      customer_name:
        valueOrEmpty(
          site.customer_name,
        ),

      customer_phone:
        valueOrEmpty(
          site.customer_phone,
        ),

      site_name:
        valueOrEmpty(
          site.site_name,
        ),

      address:
        valueOrEmpty(
          site.address,
        ),

      address_detail:
        valueOrEmpty(
          site.address_detail,
        ),

      region:
        valueOrEmpty(
          site.region,
        ),

      work_type:
        valueOrEmpty(
          site.work_type,
        ),

      work_description:
        valueOrEmpty(
          site.work_description,
        ),

      contract_amount:
        valueOrEmpty(
          site.contract_amount,
        ),

      deposit_amount:
        valueOrEmpty(
          site.deposit_amount,
        ),

      memo:
        valueOrEmpty(
          site.memo,
        ),
    });

    setMessage("");
  }, [
    site?.id,
    site?.customer_name,
    site?.customer_phone,
    site?.site_name,
    site?.address,
    site?.address_detail,
    site?.region,
    site?.work_type,
    site?.work_description,
    site?.contract_amount,
    site?.deposit_amount,
    site?.memo,
  ]);

  if (!site) {
    return null;
  }

  const leader =
    getLeader(site);

  const members =
    getMembers(site);

  const memberNames =
    members
      .map(
        (item) =>
          item?.workers?.name,
      )
      .filter(Boolean)
      .join(", ");

  const fullAddress = [
    site.address,
    site.address_detail,
  ]
    .filter(Boolean)
    .join(" ");

  /* =======================================================
     입력 변경
  ======================================================= */

  function updateField(
    field,
    value,
  ) {
    setForm(
      (prev) => ({
        ...prev,
        [field]: value,
      }),
    );
  }

  /* =======================================================
     수정 시작
  ======================================================= */

  function startEditing() {
    setForm({
      customer_name:
        valueOrEmpty(
          site.customer_name,
        ),

      customer_phone:
        valueOrEmpty(
          site.customer_phone,
        ),

      site_name:
        valueOrEmpty(
          site.site_name,
        ),

      address:
        valueOrEmpty(
          site.address,
        ),

      address_detail:
        valueOrEmpty(
          site.address_detail,
        ),

      region:
        valueOrEmpty(
          site.region,
        ),

      work_type:
        valueOrEmpty(
          site.work_type,
        ),

      work_description:
        valueOrEmpty(
          site.work_description,
        ),

      contract_amount:
        valueOrEmpty(
          site.contract_amount,
        ),

      deposit_amount:
        valueOrEmpty(
          site.deposit_amount,
        ),

      memo:
        valueOrEmpty(
          site.memo,
        ),
    });

    setMessage("");
    setEditing(true);
  }

  /* =======================================================
     수정 취소
  ======================================================= */

  function cancelEditing() {
    if (saving) {
      return;
    }

    setForm({
      customer_name:
        valueOrEmpty(
          site.customer_name,
        ),

      customer_phone:
        valueOrEmpty(
          site.customer_phone,
        ),

      site_name:
        valueOrEmpty(
          site.site_name,
        ),

      address:
        valueOrEmpty(
          site.address,
        ),

      address_detail:
        valueOrEmpty(
          site.address_detail,
        ),

      region:
        valueOrEmpty(
          site.region,
        ),

      work_type:
        valueOrEmpty(
          site.work_type,
        ),

      work_description:
        valueOrEmpty(
          site.work_description,
        ),

      contract_amount:
        valueOrEmpty(
          site.contract_amount,
        ),

      deposit_amount:
        valueOrEmpty(
          site.deposit_amount,
        ),

      memo:
        valueOrEmpty(
          site.memo,
        ),
    });

    setMessage("");
    setEditing(false);
  }

  /* =======================================================
     저장
  ======================================================= */

  async function saveBasicInfo(
    event,
  ) {
    event.preventDefault();

    if (
      typeof updateSiteBasicInfo !==
      "function"
    ) {
      setMessage(
        "❌ 기본정보 저장 기능이 연결되지 않았습니다.",
      );

      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const result =
        await updateSiteBasicInfo({
          siteId:
            site.id,

          customer_name:
            form.customer_name,

          customer_phone:
            form.customer_phone,

          site_name:
            form.site_name,

          address:
            form.address,

          address_detail:
            form.address_detail,

          region:
            form.region,

          work_type:
            form.work_type,

          work_description:
            form.work_description,

          contract_amount:
            form.contract_amount,

          deposit_amount:
            form.deposit_amount,

          memo:
            form.memo,
        });

      if (
        !result?.success
      ) {
        setMessage(
          `❌ ${
            result?.error ||
            "저장에 실패했습니다."
          }`,
        );

        return;
      }

      setMessage(
        "✅ 기본정보가 저장되었습니다.",
      );

      setEditing(false);
    } catch (error) {
      console.error(
        "현장 기본정보 저장 오류:",
        error,
      );

      setMessage(
        `❌ ${
          error?.message ||
          "저장 중 오류가 발생했습니다."
        }`,
      );
    } finally {
      setSaving(false);
    }
  }

  /* =======================================================
     조회 화면
  ======================================================= */

  if (!editing) {
    return (
      <section
        style={{
          marginTop: "14px",
          paddingTop: "14px",
          borderTop:
            "1px solid #e5e7eb",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent:
              "space-between",
            gap: "10px",
            marginBottom: "4px",
          }}
        >
          <div
            style={{
              fontSize: "14px",
              fontWeight: "900",
              color: "#111827",
            }}
          >
            👤 현장 기본정보
          </div>

          <button
            type="button"
            onClick={
              startEditing
            }
            style={{
              flex: "0 0 auto",
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
                "12px",
              fontWeight:
                "800",
              cursor:
                "pointer",
            }}
          >
            ✏️ 기본정보 수정
          </button>
        </div>

        {message && (
          <MessageBox
            message={
              message
            }
          />
        )}

        <DetailRow
          label="고객"
          value={
            site.customer_name ||
            "미정"
          }
        />

        <DetailRow
          label="전화번호"
          value={
            site.customer_phone ||
            "미정"
          }
        />

        <DetailRow
          label="현장명"
          value={
            site.site_name ||
            "미정"
          }
        />

        <DetailRow
          label="주소"
          value={
            fullAddress ||
            "미정"
          }
        />

        <DetailRow
          label="지역"
          value={
            site.region ||
            "미정"
          }
        />

        <DetailRow
          label="시공 종류"
          value={
            site.work_type ||
            "미정"
          }
        />

        <DetailRow
          label="작업 내용"
          value={
            site.work_description ||
            "미정"
          }
        />

        <DetailRow
          label="계약금액"
          value={
            hasAmount(
              site.contract_amount,
            )
              ? formatWon(
                  site.contract_amount,
                )
              : "미정"
          }
        />

        <DetailRow
          label="계약금 / 선금"
          value={
            hasAmount(
              site.deposit_amount,
            )
              ? formatWon(
                  site.deposit_amount,
                )
              : "미정"
          }
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
            memberNames ||
            "미배정"
          }
        />

        <DetailRow
          label="메모"
          value={
            site.memo ||
            "미정"
          }
        />
      </section>
    );
  }

  /* =======================================================
     수정 화면
  ======================================================= */

  return (
    <section
      style={{
        marginTop: "14px",
        paddingTop: "14px",
        borderTop:
          "1px solid #e5e7eb",
      }}
    >
      <div
        style={{
          fontSize: "14px",
          fontWeight: "900",
          color: "#111827",
          marginBottom: "10px",
        }}
      >
        ✏️ 현장 기본정보 수정
      </div>

      <form
        onSubmit={
          saveBasicInfo
        }
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "1fr 1fr",
            gap: "8px",
          }}
        >
          <Field
            label="고객명"
          >
            <input
              type="text"
              value={
                form.customer_name
              }
              onChange={(
                event,
              ) =>
                updateField(
                  "customer_name",
                  event.target
                    .value,
                )
              }
              placeholder="미정"
              disabled={
                saving
              }
              style={
                inputStyle
              }
            />
          </Field>

          <Field
            label="전화번호"
          >
            <input
              type="tel"
              value={
                form.customer_phone
              }
              onChange={(
                event,
              ) =>
                updateField(
                  "customer_phone",
                  event.target
                    .value,
                )
              }
              placeholder="010-0000-0000"
              disabled={
                saving
              }
              style={
                inputStyle
              }
            />
          </Field>
        </div>

        <Field
          label="현장명"
        >
          <input
            type="text"
            value={
              form.site_name
            }
            onChange={(
              event,
            ) =>
              updateField(
                "site_name",
                event.target
                  .value,
              )
            }
            placeholder="예: 검단 ○○아파트"
            disabled={
              saving
            }
            style={
              inputStyle
            }
          />
        </Field>

        <Field
          label="주소"
        >
          <input
            type="text"
            value={
              form.address
            }
            onChange={(
              event,
            ) =>
              updateField(
                "address",
                event.target
                  .value,
              )
            }
            placeholder="현장 주소"
            disabled={
              saving
            }
            style={
              inputStyle
            }
          />
        </Field>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "1fr 1fr",
            gap: "8px",
          }}
        >
          <Field
            label="상세주소"
          >
            <input
              type="text"
              value={
                form.address_detail
              }
              onChange={(
                event,
              ) =>
                updateField(
                  "address_detail",
                  event.target
                    .value,
                )
              }
              placeholder="동 / 호수"
              disabled={
                saving
              }
              style={
                inputStyle
              }
            />
          </Field>

          <Field
            label="지역"
          >
            <input
              type="text"
              value={
                form.region
              }
              onChange={(
                event,
              ) =>
                updateField(
                  "region",
                  event.target
                    .value,
                )
              }
              placeholder="예: 인천 서구"
              disabled={
                saving
              }
              style={
                inputStyle
              }
            />
          </Field>
        </div>

        <Field
          label="시공 종류"
        >
          <input
            type="text"
            value={
              form.work_type
            }
            onChange={(
              event,
            ) =>
              updateField(
                "work_type",
                event.target
                  .value,
              )
            }
            placeholder="예: 아파트 인테리어필름"
            disabled={
              saving
            }
            style={
              inputStyle
            }
          />
        </Field>

        <Field
          label="작업 내용"
        >
          <textarea
            value={
              form.work_description
            }
            onChange={(
              event,
            ) =>
              updateField(
                "work_description",
                event.target
                  .value,
              )
            }
            placeholder="예: 싱크대, 방문·문틀, 신발장"
            disabled={
              saving
            }
            rows={3}
            style={{
              ...inputStyle,
              resize:
                "vertical",
              lineHeight:
                "1.5",
            }}
          />
        </Field>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "1fr 1fr",
            gap: "8px",
          }}
        >
          <Field
            label="계약금액"
          >
            <input
              type="number"
              min="0"
              inputMode="numeric"
              value={
                form.contract_amount
              }
              onChange={(
                event,
              ) =>
                updateField(
                  "contract_amount",
                  event.target
                    .value,
                )
              }
              placeholder="미정"
              disabled={
                saving
              }
              style={
                inputStyle
              }
            />
          </Field>

          <Field
            label="계약금 / 선금"
          >
            <input
              type="number"
              min="0"
              inputMode="numeric"
              value={
                form.deposit_amount
              }
              onChange={(
                event,
              ) =>
                updateField(
                  "deposit_amount",
                  event.target
                    .value,
                )
              }
              placeholder="미정"
              disabled={
                saving
              }
              style={
                inputStyle
              }
            />
          </Field>
        </div>

        <Field
          label="메모"
        >
          <textarea
            value={
              form.memo
            }
            onChange={(
              event,
            ) =>
              updateField(
                "memo",
                event.target
                  .value,
              )
            }
            placeholder="상담 내용이나 현장 메모"
            disabled={
              saving
            }
            rows={4}
            style={{
              ...inputStyle,
              resize:
                "vertical",
              lineHeight:
                "1.5",
            }}
          />
        </Field>

        {message && (
          <MessageBox
            message={
              message
            }
          />
        )}

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
            onClick={
              cancelEditing
            }
            disabled={
              saving
            }
            style={{
              padding:
                "11px 12px",
              border:
                "1px solid #cbd5e1",
              borderRadius:
                "9px",
              background:
                "#ffffff",
              color:
                "#475569",
              fontSize:
                "13px",
              fontWeight:
                "800",
              cursor:
                saving
                  ? "not-allowed"
                  : "pointer",
              opacity:
                saving
                  ? 0.6
                  : 1,
            }}
          >
            취소
          </button>

          <button
            type="submit"
            disabled={
              saving
            }
            style={{
              padding:
                "11px 12px",
              border:
                "none",
              borderRadius:
                "9px",
              background:
                "#2563eb",
              color:
                "#ffffff",
              fontSize:
                "13px",
              fontWeight:
                "900",
              cursor:
                saving
                  ? "not-allowed"
                  : "pointer",
              opacity:
                saving
                  ? 0.65
                  : 1,
            }}
          >
            {saving
              ? "저장 중..."
              : "💾 기본정보 저장"}
          </button>
        </div>
      </form>
    </section>
  );
}

/* =========================================================
   입력 필드
========================================================= */

function Field({
  label,
  children,
}) {
  return (
    <div
      style={{
        marginTop: "9px",
      }}
    >
      <label
        style={{
          display: "block",
          marginBottom: "5px",
          color: "#475569",
          fontSize: "12px",
          fontWeight: "800",
        }}
      >
        {label}
      </label>

      {children}
    </div>
  );
}

/* =========================================================
   상세정보 한 줄
========================================================= */

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
          fontWeight: "700",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {value || "미정"}
      </div>
    </div>
  );
}

/* =========================================================
   메시지
========================================================= */

function MessageBox({
  message,
}) {
  const success =
    message.startsWith("✅");

  return (
    <div
      style={{
        marginTop: "10px",
        padding: "9px 10px",
        borderRadius: "8px",
        background:
          success
            ? "#f0fdf4"
            : "#fef2f2",
        color:
          success
            ? "#166534"
            : "#b91c1c",
        fontSize: "12px",
        fontWeight: "700",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    >
      {message}
    </div>
  );
}

/* =========================================================
   공통 입력 스타일
========================================================= */

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 11px",
  border:
    "1px solid #cbd5e1",
  borderRadius: "9px",
  background: "#ffffff",
  color: "#111827",
  fontSize: "14px",
  outline: "none",
};
