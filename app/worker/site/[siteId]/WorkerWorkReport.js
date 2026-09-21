"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../../lib/supabase";

const EXPENSE_TYPES = [
  { value: "parking", label: "주차비" },
  { value: "meal", label: "식대" },
  { value: "fuel", label: "유류비" },
  { value: "toll", label: "통행료" },
  { value: "material", label: "추가 자재비" },
  { value: "other", label: "기타" },
];

function emptyMaterial() {
  return {
    brand: "",
    product_code: "",
    product_name: "",
    quantity: "",
    unit: "m",
    unit_price: "",
    memo: "",
  };
}

function emptyExpense() {
  return {
    expense_type: "parking",
    amount: "",
    description: "",
    expense_date: new Date().toISOString().slice(0, 10),
  };
}

function formatNumber(value) {
  if (value === "" || value === null || value === undefined) {
    return "";
  }

  const onlyNumber = String(value).replace(/[^\d]/g, "");

  if (!onlyNumber) {
    return "";
  }

  return Number(onlyNumber).toLocaleString("ko-KR");
}

function parseNumber(value) {
  if (value === "" || value === null || value === undefined) {
    return "";
  }

  const number = Number(String(value).replace(/[^\d.-]/g, ""));

  return Number.isFinite(number) ? number : "";
}

function createPreviewFiles(files) {
  return files.map((file) => ({
    file,
    url: URL.createObjectURL(file),
  }));
}

function revokePreviews(previews) {
  previews.forEach((item) => {
    if (item?.url) {
      URL.revokeObjectURL(item.url);
    }
  });
}

export default function WorkerWorkReport({
  siteId,
  site,
  onSubmitted,
}) {
  const [workRegion, setWorkRegion] = useState("");
  const [workSummary, setWorkSummary] = useState("");
  const [memo, setMemo] = useState("");

  const [materials, setMaterials] = useState([]);
  const [expenses, setExpenses] = useState([]);

  const [beforeFiles, setBeforeFiles] = useState([]);
  const [afterFiles, setAfterFiles] = useState([]);

  const [beforePreviews, setBeforePreviews] = useState([]);
  const [afterPreviews, setAfterPreviews] = useState([]);

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setWorkRegion(site?.region || "");
  }, [site?.id, site?.region]);

  useEffect(() => {
    return () => {
      revokePreviews(beforePreviews);
      revokePreviews(afterPreviews);
    };
  }, [beforePreviews, afterPreviews]);

  const expenseTotal = useMemo(() => {
    return expenses.reduce((sum, item) => {
      const amount = Number(parseNumber(item.amount) || 0);
      return sum + amount;
    }, 0);
  }, [expenses]);

  function handleBeforeFiles(event) {
    const files = Array.from(event.target.files || []);

    if (!files.length) {
      return;
    }

    revokePreviews(beforePreviews);

    setBeforeFiles(files);
    setBeforePreviews(createPreviewFiles(files));
    setMessage("");
  }

  function handleAfterFiles(event) {
    const files = Array.from(event.target.files || []);

    if (!files.length) {
      return;
    }

    revokePreviews(afterPreviews);

    setAfterFiles(files);
    setAfterPreviews(createPreviewFiles(files));
    setMessage("");
  }

  function removeBeforePhoto(index) {
    const preview = beforePreviews[index];

    if (preview?.url) {
      URL.revokeObjectURL(preview.url);
    }

    setBeforeFiles((current) =>
      current.filter((_, itemIndex) => itemIndex !== index),
    );

    setBeforePreviews((current) =>
      current.filter((_, itemIndex) => itemIndex !== index),
    );
  }

  function removeAfterPhoto(index) {
    const preview = afterPreviews[index];

    if (preview?.url) {
      URL.revokeObjectURL(preview.url);
    }

    setAfterFiles((current) =>
      current.filter((_, itemIndex) => itemIndex !== index),
    );

    setAfterPreviews((current) =>
      current.filter((_, itemIndex) => itemIndex !== index),
    );
  }

  function addMaterial() {
    setMaterials((current) => [...current, emptyMaterial()]);
  }

  function updateMaterial(index, key, value) {
    setMaterials((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              [key]: value,
            }
          : item,
      ),
    );
  }

  function removeMaterial(index) {
    setMaterials((current) =>
      current.filter((_, itemIndex) => itemIndex !== index),
    );
  }

  function addExpense() {
    setExpenses((current) => [...current, emptyExpense()]);
  }

  function updateExpense(index, key, value) {
    setExpenses((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              [key]: value,
            }
          : item,
      ),
    );
  }

  function removeExpense(index) {
    setExpenses((current) =>
      current.filter((_, itemIndex) => itemIndex !== index),
    );
  }

  async function getAccessToken() {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error) {
      throw error;
    }

    const token = session?.access_token;

    if (!token) {
      throw new Error("로그인이 필요합니다.");
    }

    return token;
  }

  async function uploadPhotos({
    accessToken,
    photoType,
    files,
  }) {
    if (!files.length) {
      return {
        success: true,
        count: 0,
      };
    }

    const formData = new FormData();

    formData.append("siteId", siteId);
    formData.append("photoType", photoType);

    files.forEach((file) => {
      formData.append("photos", file);
    });

    const response = await fetch("/api/worker/site-photos", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: formData,
    });

    const result = await response.json().catch(() => null);

    if (!response.ok || !result?.success) {
      throw new Error(
        result?.error ||
          `${photoType} 사진 등록 중 오류가 발생했습니다.`,
      );
    }

    return result;
  }

  async function saveReport({
    accessToken,
  }) {
    const normalizedMaterials = materials
      .filter((item) => {
        return (
          item.product_code.trim() ||
          item.product_name.trim()
        );
      })
      .map((item) => ({
        brand: item.brand.trim() || null,
        product_code: item.product_code.trim() || null,
        product_name: item.product_name.trim() || null,
        quantity:
          item.quantity === ""
            ? 0
            : Number(parseNumber(item.quantity) || 0),
        unit: item.unit.trim() || "m",
        unit_price:
          item.unit_price === ""
            ? null
            : Number(parseNumber(item.unit_price) || 0),
        memo: item.memo.trim() || null,
      }));

    const normalizedExpenses = expenses
      .filter((item) => {
        return Number(parseNumber(item.amount) || 0) > 0;
      })
      .map((item) => ({
        expense_type: item.expense_type || "other",
        amount: Number(parseNumber(item.amount) || 0),
        description: item.description.trim() || null,
        expense_date:
          item.expense_date ||
          new Date().toISOString().slice(0, 10),
      }));

    const response = await fetch("/api/worker/site-work-report", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        siteId,
        work_region: workRegion.trim() || null,
        work_summary: workSummary.trim(),
        memo: memo.trim() || null,
        materials: normalizedMaterials,
        expenses: normalizedExpenses,
      }),
    });

    const result = await response.json().catch(() => null);

    if (!response.ok || !result?.success) {
      throw new Error(
        result?.error ||
          "완료보고 저장 중 오류가 발생했습니다.",
      );
    }

    return result;
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (saving) {
      return;
    }

    setMessage("");

    if (!siteId) {
      setMessage("❌ 현장 정보가 없습니다.");
      return;
    }

    if (!workSummary.trim()) {
      setMessage("❌ 실제 시공 내용을 입력해주세요.");
      return;
    }

    if (afterFiles.length === 0) {
      setMessage("❌ 시공 완료 사진을 1장 이상 등록해주세요.");
      return;
    }

    setSaving(true);

    try {
      const accessToken = await getAccessToken();

      /*
       * 1. 시공 전 사진
       *
       * 선택한 경우에만 업로드합니다.
       */
      if (beforeFiles.length > 0) {
        setMessage("📷 시공 전 사진을 등록하고 있습니다...");

        await uploadPhotos({
          accessToken,
          photoType: "before",
          files: beforeFiles,
        });
      }

      /*
       * 2. 완료보고 / 실제자재 / 경비
       *
       * 이 단계에서는 work_items / work_photos에
       * 아무것도 등록하지 않습니다.
       */
      setMessage("📝 완료보고를 저장하고 있습니다...");

      const reportResult = await saveReport({
        accessToken,
      });

      /*
       * 3. 시공 완료 사진
       */
      setMessage("📷 시공 완료 사진을 등록하고 있습니다...");

      const afterResult = await uploadPhotos({
        accessToken,
        photoType: "after",
        files: afterFiles,
      });

      /*
       * 중요
       *
       * 여기까지 완료되어도 AI 견적자료로 등록하지 않습니다.
       *
       * site_photos
       * work_reports
       * site_materials(actual)
       * site_expenses
       *
       * 에만 저장됩니다.
       *
       * 관리자 검수 + 실제 견적금액 입력 + 승인 후
       * 별도의 관리자 기능에서 AI 자료로 넘깁니다.
       */

      setMessage(
        `✅ 완료보고가 제출되었습니다. 완료사진 ${afterResult?.count || afterFiles.length}장이 등록되었습니다. 관리자 검수를 기다려주세요.`,
      );

      if (typeof onSubmitted === "function") {
        await onSubmitted({
          report: reportResult,
          afterPhotos: afterResult,
        });
      }
    } catch (error) {
      console.error("Worker work report submit error:", error);

      setMessage(
        `❌ ${
          error?.message ||
          "완료보고 제출 중 오류가 발생했습니다."
        }`,
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        display: "grid",
        gap: "16px",
      }}
    >
      <section
        style={{
          padding: "14px",
          border: "1px solid #e2e8f0",
          borderRadius: "14px",
          background: "#ffffff",
        }}
      >
        <div
          style={{
            fontSize: "16px",
            fontWeight: "900",
            color: "#111827",
          }}
        >
          📷 시공 전 사진
        </div>

        <div
          style={{
            marginTop: "5px",
            fontSize: "12px",
            lineHeight: "1.5",
            color: "#64748b",
          }}
        >
          실제 작업을 시작하기 전 현장 상태를 등록합니다.
        </div>

        <label
          style={{
            display: "block",
            marginTop: "12px",
            padding: "12px",
            border: "1px dashed #94a3b8",
            borderRadius: "10px",
            background: "#f8fafc",
            textAlign: "center",
            fontSize: "13px",
            fontWeight: "800",
            color: "#334155",
            cursor: saving ? "not-allowed" : "pointer",
          }}
        >
          📷 시공 전 사진 선택
          <input
            type="file"
            accept="image/*"
            multiple
            disabled={saving}
            onChange={handleBeforeFiles}
            style={{
              display: "none",
            }}
          />
        </label>

        {beforePreviews.length > 0 && (
          <PhotoPreviewGrid
            previews={beforePreviews}
            onRemove={removeBeforePhoto}
            disabled={saving}
          />
        )}
      </section>

      <section
        style={{
          padding: "14px",
          border: "1px solid #e2e8f0",
          borderRadius: "14px",
          background: "#ffffff",
        }}
      >
        <div
          style={{
            fontSize: "16px",
            fontWeight: "900",
            color: "#111827",
          }}
        >
          📝 실제 시공 내용
        </div>

        <FieldLabel text="시공 지역">
          <input
            type="text"
            value={workRegion}
            disabled={saving}
            onChange={(event) => setWorkRegion(event.target.value)}
            placeholder="예: 인천 서구"
            style={inputStyle}
          />
        </FieldLabel>

        <FieldLabel text="실제 시공 내용 *">
          <textarea
            value={workSummary}
            disabled={saving}
            onChange={(event) => setWorkSummary(event.target.value)}
            placeholder="예: 싱크대 상부장/하부장 필름 시공"
            rows={4}
            style={{
              ...inputStyle,
              resize: "vertical",
              lineHeight: "1.5",
            }}
          />
        </FieldLabel>
      </section>

      <section
        style={{
          padding: "14px",
          border: "1px solid #e2e8f0",
          borderRadius: "14px",
          background: "#ffffff",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "16px",
                fontWeight: "900",
                color: "#111827",
              }}
            >
              📦 실제 사용 자재
            </div>

            <div
              style={{
                marginTop: "4px",
                fontSize: "12px",
                color: "#64748b",
              }}
            >
              실제 현장에서 사용한 필름을 입력합니다.
            </div>
          </div>

          <button
            type="button"
            disabled={saving}
            onClick={addMaterial}
            style={smallAddButtonStyle}
          >
            + 자재
          </button>
        </div>

        {materials.length === 0 ? (
          <EmptyBox text="사용 자재가 있으면 + 자재를 눌러 입력하세요." />
        ) : (
          <div
            style={{
              display: "grid",
              gap: "10px",
              marginTop: "12px",
            }}
          >
            {materials.map((material, index) => (
              <div
                key={index}
                style={{
                  padding: "12px",
                  border: "1px solid #e2e8f0",
                  borderRadius: "11px",
                  background: "#f8fafc",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "8px",
                    marginBottom: "10px",
                  }}
                >
                  <strong
                    style={{
                      fontSize: "13px",
                      color: "#111827",
                    }}
                  >
                    자재 {index + 1}
                  </strong>

                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => removeMaterial(index)}
                    style={removeButtonStyle}
                  >
                    삭제
                  </button>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "8px",
                  }}
                >
                  <input
                    type="text"
                    value={material.brand}
                    disabled={saving}
                    onChange={(event) =>
                      updateMaterial(
                        index,
                        "brand",
                        event.target.value,
                      )
                    }
                    placeholder="제조사"
                    style={inputStyle}
                  />

                  <input
                    type="text"
                    value={material.product_code}
                    disabled={saving}
                    onChange={(event) =>
                      updateMaterial(
                        index,
                        "product_code",
                        event.target.value,
                      )
                    }
                    placeholder="제품코드 예: GS115"
                    style={inputStyle}
                  />
                </div>

                <input
                  type="text"
                  value={material.product_name}
                  disabled={saving}
                  onChange={(event) =>
                    updateMaterial(
                      index,
                      "product_name",
                      event.target.value,
                    )
                  }
                  placeholder="제품명"
                  style={{
                    ...inputStyle,
                    marginTop: "8px",
                  }}
                />

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 90px",
                    gap: "8px",
                    marginTop: "8px",
                  }}
                >
                  <input
                    type="text"
                    inputMode="decimal"
                    value={material.quantity}
                    disabled={saving}
                    onChange={(event) =>
                      updateMaterial(
                        index,
                        "quantity",
                        event.target.value,
                      )
                    }
                    placeholder="사용량"
                    style={inputStyle}
                  />

                  <select
                    value={material.unit}
                    disabled={saving}
                    onChange={(event) =>
                      updateMaterial(
                        index,
                        "unit",
                        event.target.value,
                      )
                    }
                    style={inputStyle}
                  >
                    <option value="m">m</option>
                    <option value="㎡">㎡</option>
                    <option value="롤">롤</option>
                    <option value="장">장</option>
                    <option value="개">개</option>
                  </select>
                </div>

                <input
                  type="text"
                  inputMode="numeric"
                  value={formatNumber(material.unit_price)}
                  disabled={saving}
                  onChange={(event) =>
                    updateMaterial(
                      index,
                      "unit_price",
                      parseNumber(event.target.value),
                    )
                  }
                  placeholder="자재 단가 (선택)"
                  style={{
                    ...inputStyle,
                    marginTop: "8px",
                  }}
                />

                <input
                  type="text"
                  value={material.memo}
                  disabled={saving}
                  onChange={(event) =>
                    updateMaterial(
                      index,
                      "memo",
                      event.target.value,
                    )
                  }
                  placeholder="자재 메모"
                  style={{
                    ...inputStyle,
                    marginTop: "8px",
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      <section
        style={{
          padding: "14px",
          border: "1px solid #e2e8f0",
          borderRadius: "14px",
          background: "#ffffff",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "16px",
                fontWeight: "900",
                color: "#111827",
              }}
            >
              💳 현장 경비
            </div>

            <div
              style={{
                marginTop: "4px",
                fontSize: "12px",
                color: "#64748b",
              }}
            >
              주차비, 식대 등 실제 발생 경비입니다.
            </div>
          </div>

          <button
            type="button"
            disabled={saving}
            onClick={addExpense}
            style={smallAddButtonStyle}
          >
            + 경비
          </button>
        </div>

        {expenses.length === 0 ? (
          <EmptyBox text="현장 경비가 있으면 + 경비를 눌러 입력하세요." />
        ) : (
          <div
            style={{
              display: "grid",
              gap: "10px",
              marginTop: "12px",
            }}
          >
            {expenses.map((expense, index) => (
              <div
                key={index}
                style={{
                  padding: "12px",
                  border: "1px solid #e2e8f0",
                  borderRadius: "11px",
                  background: "#f8fafc",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "8px",
                    marginBottom: "10px",
                  }}
                >
                  <strong
                    style={{
                      fontSize: "13px",
                      color: "#111827",
                    }}
                  >
                    경비 {index + 1}
                  </strong>

                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => removeExpense(index)}
                    style={removeButtonStyle}
                  >
                    삭제
                  </button>
                </div>

                <select
                  value={expense.expense_type}
                  disabled={saving}
                  onChange={(event) =>
                    updateExpense(
                      index,
                      "expense_type",
                      event.target.value,
                    )
                  }
                  style={inputStyle}
                >
                  {EXPENSE_TYPES.map((type) => (
                    <option
                      key={type.value}
                      value={type.value}
                    >
                      {type.label}
                    </option>
                  ))}
                </select>

                <input
                  type="text"
                  inputMode="numeric"
                  value={formatNumber(expense.amount)}
                  disabled={saving}
                  onChange={(event) =>
                    updateExpense(
                      index,
                      "amount",
                      parseNumber(event.target.value),
                    )
                  }
                  placeholder="금액"
                  style={{
                    ...inputStyle,
                    marginTop: "8px",
                  }}
                />

                <input
                  type="text"
                  value={expense.description}
                  disabled={saving}
                  onChange={(event) =>
                    updateExpense(
                      index,
                      "description",
                      event.target.value,
                    )
                  }
                  placeholder="내용 예: 아파트 주차비"
                  style={{
                    ...inputStyle,
                    marginTop: "8px",
                  }}
                />

                <input
                  type="date"
                  value={expense.expense_date}
                  disabled={saving}
                  onChange={(event) =>
                    updateExpense(
                      index,
                      "expense_date",
                      event.target.value,
                    )
                  }
                  style={{
                    ...inputStyle,
                    marginTop: "8px",
                  }}
                />
              </div>
            ))}

            <div
              style={{
                padding: "10px 12px",
                borderRadius: "10px",
                background: "#f1f5f9",
                textAlign: "right",
                fontSize: "13px",
                fontWeight: "900",
                color: "#111827",
              }}
            >
              경비 합계 {expenseTotal.toLocaleString("ko-KR")}원
            </div>
          </div>
        )}
      </section>

      <section
        style={{
          padding: "14px",
          border: "1px solid #e2e8f0",
          borderRadius: "14px",
          background: "#ffffff",
        }}
      >
        <div
          style={{
            fontSize: "16px",
            fontWeight: "900",
            color: "#111827",
          }}
        >
          📷 시공 완료 사진 *
        </div>

        <div
          style={{
            marginTop: "5px",
            fontSize: "12px",
            lineHeight: "1.5",
            color: "#64748b",
          }}
        >
          완료보고 제출을 위해 1장 이상 등록해주세요.
        </div>

        <label
          style={{
            display: "block",
            marginTop: "12px",
            padding: "12px",
            border: "1px dashed #94a3b8",
            borderRadius: "10px",
            background: "#f8fafc",
            textAlign: "center",
            fontSize: "13px",
            fontWeight: "800",
            color: "#334155",
            cursor: saving ? "not-allowed" : "pointer",
          }}
        >
          📷 완료 사진 선택
          <input
            type="file"
            accept="image/*"
            multiple
            disabled={saving}
            onChange={handleAfterFiles}
            style={{
              display: "none",
            }}
          />
        </label>

        {afterPreviews.length > 0 && (
          <PhotoPreviewGrid
            previews={afterPreviews}
            onRemove={removeAfterPhoto}
            disabled={saving}
          />
        )}
      </section>

      <section
        style={{
          padding: "14px",
          border: "1px solid #e2e8f0",
          borderRadius: "14px",
          background: "#ffffff",
        }}
      >
        <div
          style={{
            fontSize: "16px",
            fontWeight: "900",
            color: "#111827",
          }}
        >
          📝 메모
        </div>

        <textarea
          value={memo}
          disabled={saving}
          onChange={(event) => setMemo(event.target.value)}
          placeholder="관리자에게 전달할 내용이 있으면 입력하세요."
          rows={4}
          style={{
            ...inputStyle,
            marginTop: "10px",
            resize: "vertical",
            lineHeight: "1.5",
          }}
        />
      </section>

      <div
        style={{
          padding: "12px",
          border: "1px solid #fde68a",
          borderRadius: "11px",
          background: "#fffbeb",
          color: "#92400e",
          fontSize: "12px",
          lineHeight: "1.6",
        }}
      >
        완료보고 제출 후 관리자가 시공 내용과 사진을 확인합니다.
        관리자 검수 및 실제 견적금액 입력 전에는 AI 견적자료로
        등록되지 않습니다.
      </div>

      {message && (
        <div
          style={{
            padding: "12px",
            borderRadius: "10px",
            background: message.startsWith("❌")
              ? "#fef2f2"
              : message.startsWith("✅")
                ? "#f0fdf4"
                : "#eff6ff",
            color: message.startsWith("❌")
              ? "#b91c1c"
              : message.startsWith("✅")
                ? "#166534"
                : "#1d4ed8",
            fontSize: "13px",
            fontWeight: "800",
            lineHeight: "1.5",
            wordBreak: "break-word",
          }}
        >
          {message}
        </div>
      )}

      <button
        type="submit"
        disabled={saving}
        style={{
          width: "100%",
          padding: "14px",
          border: "none",
          borderRadius: "11px",
          background: saving ? "#94a3b8" : "#16a34a",
          color: "#ffffff",
          fontSize: "15px",
          fontWeight: "900",
          cursor: saving ? "not-allowed" : "pointer",
        }}
      >
        {saving ? "제출 중..." : "✅ 완료보고 제출"}
      </button>
    </form>
  );
}

function FieldLabel({
  text,
  children,
}) {
  return (
    <label
      style={{
        display: "block",
        marginTop: "12px",
      }}
    >
      <div
        style={{
          marginBottom: "6px",
          fontSize: "12px",
          fontWeight: "800",
          color: "#475569",
        }}
      >
        {text}
      </div>

      {children}
    </label>
  );
}

function PhotoPreviewGrid({
  previews,
  onRemove,
  disabled,
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
        gap: "7px",
        marginTop: "10px",
      }}
    >
      {previews.map((item, index) => (
        <div
          key={`${item.file.name}-${index}`}
          style={{
            position: "relative",
            aspectRatio: "1 / 1",
            overflow: "hidden",
            borderRadius: "9px",
            border: "1px solid #e2e8f0",
            background: "#f8fafc",
          }}
        >
          <img
            src={item.url}
            alt={`선택 사진 ${index + 1}`}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
            }}
          />

          <button
            type="button"
            disabled={disabled}
            onClick={() => onRemove(index)}
            style={{
              position: "absolute",
              top: "5px",
              right: "5px",
              width: "25px",
              height: "25px",
              border: "none",
              borderRadius: "999px",
              background: "rgba(15,23,42,0.78)",
              color: "#ffffff",
              fontSize: "15px",
              fontWeight: "900",
              cursor: disabled ? "not-allowed" : "pointer",
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

function EmptyBox({
  text,
}) {
  return (
    <div
      style={{
        marginTop: "12px",
        padding: "14px 10px",
        border: "1px dashed #cbd5e1",
        borderRadius: "10px",
        background: "#f8fafc",
        color: "#64748b",
        fontSize: "12px",
        textAlign: "center",
      }}
    >
      {text}
    </div>
  );
}

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "11px 10px",
  border: "1px solid #cbd5e1",
  borderRadius: "9px",
  background: "#ffffff",
  color: "#111827",
  fontSize: "13px",
  outline: "none",
};

const smallAddButtonStyle = {
  flex: "0 0 auto",
  padding: "8px 10px",
  border: "1px solid #cbd5e1",
  borderRadius: "8px",
  background: "#ffffff",
  color: "#334155",
  fontSize: "12px",
  fontWeight: "900",
  cursor: "pointer",
};

const removeButtonStyle = {
  padding: "5px 8px",
  border: "1px solid #fecaca",
  borderRadius: "7px",
  background: "#ffffff",
  color: "#dc2626",
  fontSize: "11px",
  fontWeight: "800",
  cursor: "pointer",
};
