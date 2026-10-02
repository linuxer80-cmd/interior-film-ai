"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  return onlyNumber
    ? Number(onlyNumber).toLocaleString("ko-KR")
    : "";
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
    if (item?.url) URL.revokeObjectURL(item.url);
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
  const [labor, setLabor] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [workerError, setWorkerError] = useState("");
  const [workersLoading, setWorkersLoading] = useState(true);
  const [beforeFiles, setBeforeFiles] = useState([]);
  const [afterFiles, setAfterFiles] = useState([]);
  const [beforePreviews, setBeforePreviews] = useState([]);
  const [afterPreviews, setAfterPreviews] = useState([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const submitting = useRef(false);
  const uploadedFiles = useRef(new Set());
  const previewState = useRef({ before: [], after: [] });

  previewState.current = {
    before: beforePreviews,
    after: afterPreviews,
  };

  useEffect(
    () => () => {
      revokePreviews(previewState.current.before);
      revokePreviews(previewState.current.after);
    },
    [],
  );

  useEffect(() => {
    setWorkRegion(site?.region || "");
  }, [site?.id, site?.region]);

  useEffect(() => {
    let active = true;
    setWorkersLoading(true);
    setWorkerError("");

    getAccessToken()
      .then(async (token) => {
        const response = await fetch(
          `/api/worker/site-work-report?siteId=${encodeURIComponent(siteId)}`,
          {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
          },
        );

        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(
            result.error || "시공자 정보를 불러오지 못했습니다.",
          );
        }

        if (active) setWorkers(result.laborWorkers || []);
      })
      .catch((error) => {
        if (active) setWorkerError(error.message);
      })
      .finally(() => {
        if (active) setWorkersLoading(false);
      });

    return () => {
      active = false;
    };
  }, [siteId]);

  const laborAmount = (item) =>
    Math.round(
      Number(parseNumber(item.days) || 0) *
        Number(parseNumber(item.daily_wage) || 0) +
        Number(parseNumber(item.allowance) || 0),
    );

  const laborTotal = labor.reduce(
    (sum, item) => sum + laborAmount(item),
    0,
  );

  const materialTotal = materials.reduce(
    (sum, item) =>
      sum +
      Number(parseNumber(item.quantity) || 0) *
        Number(parseNumber(item.unit_price) || 0),
    0,
  );

  const expenseTotal = useMemo(
    () =>
      expenses.reduce(
        (sum, item) => sum + Number(parseNumber(item.amount) || 0),
        0,
      ),
    [expenses],
  );

  function updateLabor(index, key, value) {
    setLabor((current) =>
      current.map((item, i) => {
        if (i !== index) return item;

        if (key === "worker_id") {
          const person = workers.find((worker) => worker.id === value);

          return {
            ...item,
            worker_id: value,
            daily_wage: person?.daily_wage ?? "",
          };
        }

        return { ...item, [key]: value };
      }),
    );
  }

  function handleBeforeFiles(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    revokePreviews(beforePreviews);
    setBeforeFiles(files);
    setBeforePreviews(createPreviewFiles(files));
    setMessage("");
  }

  function handleAfterFiles(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    revokePreviews(afterPreviews);
    setAfterFiles(files);
    setAfterPreviews(createPreviewFiles(files));
    setMessage("");
  }

  function removeBeforePhoto(index) {
    if (beforePreviews[index]?.url) {
      URL.revokeObjectURL(beforePreviews[index].url);
    }
    setBeforeFiles((rows) => rows.filter((_, i) => i !== index));
    setBeforePreviews((rows) => rows.filter((_, i) => i !== index));
  }

  function removeAfterPhoto(index) {
    if (afterPreviews[index]?.url) {
      URL.revokeObjectURL(afterPreviews[index].url);
    }
    setAfterFiles((rows) => rows.filter((_, i) => i !== index));
    setAfterPreviews((rows) => rows.filter((_, i) => i !== index));
  }

  function addMaterial() {
    setMaterials((rows) => [...rows, emptyMaterial()]);
  }

  function updateMaterial(index, key, value) {
    setMaterials((rows) =>
      rows.map((item, i) =>
        i === index ? { ...item, [key]: value } : item,
      ),
    );
  }

  function removeMaterial(index) {
    setMaterials((rows) => rows.filter((_, i) => i !== index));
  }

  function addExpense() {
    setExpenses((rows) => [...rows, emptyExpense()]);
  }

  function updateExpense(index, key, value) {
    setExpenses((rows) =>
      rows.map((item, i) =>
        i === index ? { ...item, [key]: value } : item,
      ),
    );
  }

  function removeExpense(index) {
    setExpenses((rows) => rows.filter((_, i) => i !== index));
  }

  async function getAccessToken() {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error) throw error;
    if (!session?.access_token) {
      throw new Error("로그인이 필요합니다.");
    }

    return session.access_token;
  }

  async function uploadPhotos({ accessToken, photoType, files }) {
    if (!files.length) return { success: true, count: 0 };

    for (const file of files) {
      if (uploadedFiles.current.has(file)) continue;

      const formData = new FormData();
      formData.append("siteId", siteId);
      formData.append("photoType", photoType);
      formData.append("photos", file);

      const response = await fetch("/api/worker/site-photos", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: formData,
      });

      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.success) {
        throw new Error(
          result?.error || "사진 등록 중 오류가 발생했습니다.",
        );
      }

      uploadedFiles.current.add(file);
    }

    return { success: true, count: files.length };
  }

  async function saveReport({ accessToken }) {
    const normalizedMaterials = materials
      .filter(
        (item) => item.product_code.trim() || item.product_name.trim(),
      )
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
      .filter((item) => Number(parseNumber(item.amount) || 0) > 0)
      .map((item) => ({
        expense_type: item.expense_type || "other",
        amount: Number(parseNumber(item.amount) || 0),
        description: item.description.trim() || null,
        expense_date:
          item.expense_date || new Date().toISOString().slice(0, 10),
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
        labor: labor.map((item) => ({
          worker_id: item.worker_id,
          days: Number(parseNumber(item.days)),
          daily_wage: Number(parseNumber(item.daily_wage)),
          allowance: Number(parseNumber(item.allowance) || 0),
        })),
        materials: normalizedMaterials,
        expenses: normalizedExpenses,
      }),
    });

    const result = await response.json().catch(() => null);

    if (!response.ok || !result?.success) {
      throw new Error(
        result?.error || "완료보고 저장 중 오류가 발생했습니다.",
      );
    }

    return result;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting.current) return;

    setMessage("");

    if (!siteId) {
      setMessage("❌ 현장 정보가 없습니다.");
      return;
    }
    if (!workSummary.trim()) {
      setMessage("❌ 실제 시공 내용을 입력해주세요.");
      return;
    }
    if (!afterFiles.length) {
      setMessage("❌ 시공 완료 사진을 1장 이상 등록해주세요.");
      return;
    }
    if (workerError || workersLoading) {
      setMessage(
        "❌ " + (workerError || "시공자 정보를 불러오는 중입니다."),
      );
      return;
    }

    const ids = new Set();

    for (const item of labor) {
      const days = Number(parseNumber(item.days));
      const wage = parseNumber(item.daily_wage);
      const allowance = Number(parseNumber(item.allowance) || 0);

      if (
        !workers.some((worker) => worker.id === item.worker_id) ||
        ids.has(item.worker_id) ||
        !Number.isFinite(days) ||
        days <= 0 ||
        days > 366 ||
        wage === "" ||
        !Number.isSafeInteger(wage) ||
        wage < 0 ||
        !Number.isSafeInteger(allowance) ||
        allowance < 0
      ) {
        setMessage(
          "❌ 시공자, 근무일수, 일당, 팀장수당을 확인해주세요. 같은 시공자는 한 번만 입력하세요.",
        );
        return;
      }

      ids.add(item.worker_id);
    }

    for (const item of materials) {
      if (
        !(item.product_code.trim() || item.product_name.trim()) ||
        parseNumber(item.quantity) === "" ||
        Number(parseNumber(item.quantity)) <= 0 ||
        parseNumber(item.unit_price) === "" ||
        Number(parseNumber(item.unit_price)) < 0
      ) {
        setMessage(
          "❌ 자재의 제품코드 또는 제품명, 사용량, 단가를 입력해주세요. 무상 자재는 단가를 0으로 입력하세요.",
        );
        return;
      }
    }

    submitting.current = true;
    setSaving(true);

    try {
      const accessToken = await getAccessToken();

      if (beforeFiles.length) {
        setMessage("📷 시공 전 사진을 등록하고 있습니다...");
        await uploadPhotos({
          accessToken,
          photoType: "before",
          files: beforeFiles,
        });
      }

      setMessage("📷 시공 완료 사진을 등록하고 있습니다...");

      const afterResult = await uploadPhotos({
        accessToken,
        photoType: "after",
        files: afterFiles,
      });

      setMessage("📝 완료보고와 자재·경비를 저장하고 있습니다...");
      const reportResult = await saveReport({ accessToken });

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
        `❌ ${error?.message || "완료보고 제출 중 오류가 발생했습니다."}`,
      );
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "grid", gap: 16 }}>
      <section style={sectionStyle}>
        <strong>📷 시공 전 사진</strong>
        <p style={helpStyle}>작업 시작 전 현장 상태를 등록합니다.</p>
        <PhotoInput
          label="시공 전 사진 선택"
          disabled={saving}
          onChange={handleBeforeFiles}
        />
        <PhotoPreviewGrid
          previews={beforePreviews}
          onRemove={removeBeforePhoto}
          disabled={saving}
        />
      </section>

      <section style={sectionStyle}>
        <strong>📝 실제 시공 내용</strong>
        <FieldLabel text="시공 지역">
          <input
            value={workRegion}
            disabled={saving}
            onChange={(e) => setWorkRegion(e.target.value)}
            placeholder="예: 인천 서구"
            style={inputStyle}
          />
        </FieldLabel>
        <FieldLabel text="실제 시공 내용 *">
          <textarea
            required
            rows={4}
            value={workSummary}
            disabled={saving}
            onChange={(e) => setWorkSummary(e.target.value)}
            placeholder="예: 싱크대 상부장/하부장 필름 시공"
            style={inputStyle}
          />
        </FieldLabel>
      </section>

      <section style={sectionStyle}>
        <div style={headingStyle}>
          <strong>👷 시공자별 인건비</strong>
          <button
            type="button"
            disabled={saving || workersLoading || Boolean(workerError)}
            style={smallAddButtonStyle}
            onClick={() =>
              setLabor((rows) => [
                ...rows,
                {
                  worker_id: "",
                  days: "1",
                  daily_wage: "",
                  allowance: "0",
                },
              ])
            }
          >
            + 인건비
          </button>
        </div>

        <p style={helpStyle}>
          실제 근무일수 × 일당 + 팀장수당 합계로 계산합니다.
          팀장수당은 이 현장 전체 금액을 입력하세요.
          제출한 비용은 관리자 매출수익에 자동 반영됩니다.
        </p>

        {workersLoading && <p>시공자 정보를 불러오는 중...</p>}
        {workerError && (
          <p role="alert" style={{ color: "#b91c1c" }}>
            {workerError}
          </p>
        )}
        {!labor.length && (
          <EmptyBox text="+ 인건비를 눌러 실제 근무한 시공자를 입력하세요." />
        )}

        {labor.map((item, index) => (
          <div key={index} style={rowStyle}>
            <div style={headingStyle}>
              <strong>인건비 {index + 1}</strong>
              <button
                type="button"
                disabled={saving}
                style={removeButtonStyle}
                onClick={() =>
                  setLabor((rows) => rows.filter((_, i) => i !== index))
                }
              >
                삭제
              </button>
            </div>

            <FieldLabel text="시공자">
              <select
                required
                value={item.worker_id}
                disabled={saving}
                style={inputStyle}
                onChange={(e) =>
                  updateLabor(index, "worker_id", e.target.value)
                }
              >
                <option value="">시공자 선택</option>
                {workers.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </FieldLabel>

            <FieldLabel text="실제 근무일수 (반일은 0.5)">
              <input
                required
                type="number"
                min="0.01"
                max="366"
                step="0.01"
                value={item.days}
                disabled={saving}
                style={inputStyle}
                onChange={(e) =>
                  updateLabor(index, "days", e.target.value)
                }
              />
            </FieldLabel>

            <FieldLabel text="일당 (원)">
              <input
                required
                inputMode="numeric"
                value={formatNumber(item.daily_wage)}
                disabled={saving}
                style={inputStyle}
                onChange={(e) =>
                  updateLabor(
                    index,
                    "daily_wage",
                    parseNumber(e.target.value),
                  )
                }
              />
            </FieldLabel>

            <FieldLabel text="팀장수당 합계 (원, 없으면 0)">
              <input
                inputMode="numeric"
                value={formatNumber(item.allowance)}
                disabled={saving}
                style={inputStyle}
                onChange={(e) =>
                  updateLabor(
                    index,
                    "allowance",
                    parseNumber(e.target.value),
                  )
                }
              />
            </FieldLabel>

            <p style={totalStyle}>
              인건비 {laborAmount(item).toLocaleString("ko-KR")}원
            </p>
          </div>
        ))}

        <p style={totalStyle}>
          인건비 합계 {laborTotal.toLocaleString("ko-KR")}원
        </p>
      </section>

      <section style={sectionStyle}>
        <div style={headingStyle}>
          <strong>📦 실제 사용 자재</strong>
          <button
            type="button"
            disabled={saving}
            style={smallAddButtonStyle}
            onClick={addMaterial}
          >
            + 자재
          </button>
        </div>

        <p style={helpStyle}>
          사용량과 해당 단위의 단가를 입력하면 자재비가 계산됩니다.
          무상 자재는 단가 0을 입력하세요.
        </p>

        {!materials.length && (
          <EmptyBox text="사용 자재가 있으면 + 자재를 눌러 입력하세요." />
        )}

        {materials.map((item, index) => (
          <div key={index} style={rowStyle}>
            <div style={headingStyle}>
              <strong>자재 {index + 1}</strong>
              <button
                type="button"
                disabled={saving}
                style={removeButtonStyle}
                onClick={() => removeMaterial(index)}
              >
                삭제
              </button>
            </div>

            {[
              ["brand", "제조사"],
              ["product_code", "제품코드 예: GS115"],
              ["product_name", "제품명"],
            ].map(([key, label]) => (
              <FieldLabel key={key} text={label}>
                <input
                  value={item[key]}
                  disabled={saving}
                  style={inputStyle}
                  onChange={(e) =>
                    updateMaterial(index, key, e.target.value)
                  }
                />
              </FieldLabel>
            ))}

            <FieldLabel text="실제 사용량">
              <input
                required
                type="number"
                min="0.001"
                step="any"
                value={item.quantity}
                disabled={saving}
                style={inputStyle}
                onChange={(e) =>
                  updateMaterial(index, "quantity", e.target.value)
                }
              />
            </FieldLabel>

            <FieldLabel text="사용 단위">
              <select
                value={item.unit}
                disabled={saving}
                style={inputStyle}
                onChange={(e) =>
                  updateMaterial(index, "unit", e.target.value)
                }
              >
                {["m", "㎡", "롤", "장", "개"].map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </select>
            </FieldLabel>

            <FieldLabel text="사용 단위당 단가 (원) *">
              <input
                required
                inputMode="numeric"
                value={formatNumber(item.unit_price)}
                disabled={saving}
                style={inputStyle}
                onChange={(e) =>
                  updateMaterial(
                    index,
                    "unit_price",
                    parseNumber(e.target.value),
                  )
                }
              />
            </FieldLabel>

            <FieldLabel text="자재 메모">
              <input
                value={item.memo}
                disabled={saving}
                style={inputStyle}
                onChange={(e) =>
                  updateMaterial(index, "memo", e.target.value)
                }
              />
            </FieldLabel>

            <p style={totalStyle}>
              자재비{" "}
              {(
                Number(parseNumber(item.quantity) || 0) *
                Number(parseNumber(item.unit_price) || 0)
              ).toLocaleString("ko-KR")}
              원
            </p>
          </div>
        ))}

        <p style={totalStyle}>
          자재비 합계 {materialTotal.toLocaleString("ko-KR")}원
        </p>
      </section>

      <section style={sectionStyle}>
        <div style={headingStyle}>
          <strong>🧾 현장 경비</strong>
          <button
            type="button"
            disabled={saving}
            style={smallAddButtonStyle}
            onClick={addExpense}
          >
            + 경비
          </button>
        </div>

        {!expenses.length && (
          <EmptyBox text="경비가 있으면 + 경비를 눌러 입력하세요." />
        )}

        {expenses.map((item, index) => (
          <div key={index} style={rowStyle}>
            <div style={headingStyle}>
              <strong>경비 {index + 1}</strong>
              <button
                type="button"
                disabled={saving}
                style={removeButtonStyle}
                onClick={() => removeExpense(index)}
              >
                삭제
              </button>
            </div>

            <FieldLabel text="경비 구분">
              <select
                value={item.expense_type}
                disabled={saving}
                style={inputStyle}
                onChange={(e) =>
                  updateExpense(index, "expense_type", e.target.value)
                }
              >
                {EXPENSE_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </FieldLabel>

            <FieldLabel text="금액 (원)">
              <input
                inputMode="numeric"
                value={formatNumber(item.amount)}
                disabled={saving}
                style={inputStyle}
                onChange={(e) =>
                  updateExpense(
                    index,
                    "amount",
                    parseNumber(e.target.value),
                  )
                }
              />
            </FieldLabel>

            <FieldLabel text="사용 날짜">
              <input
                type="date"
                value={item.expense_date}
                disabled={saving}
                style={inputStyle}
                onChange={(e) =>
                  updateExpense(index, "expense_date", e.target.value)
                }
              />
            </FieldLabel>

            <FieldLabel text="내용">
              <input
                value={item.description}
                disabled={saving}
                style={inputStyle}
                onChange={(e) =>
                  updateExpense(index, "description", e.target.value)
                }
              />
            </FieldLabel>
          </div>
        ))}

        <p style={totalStyle}>
          경비 합계 {expenseTotal.toLocaleString("ko-KR")}원
        </p>
      </section>

      <section style={sectionStyle}>
        <strong>📷 시공 완료 사진 *</strong>
        <p style={helpStyle}>완료사진을 1장 이상 등록해주세요.</p>
        <PhotoInput
          label="완료 사진 선택"
          disabled={saving}
          onChange={handleAfterFiles}
        />
        <PhotoPreviewGrid
          previews={afterPreviews}
          onRemove={removeAfterPhoto}
          disabled={saving}
        />
      </section>

      <section style={sectionStyle}>
        <strong>📝 메모</strong>
        <textarea
          rows={4}
          value={memo}
          disabled={saving}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="관리자에게 전달할 내용"
          style={{ ...inputStyle, marginTop: 10 }}
        />
      </section>

      <div
        style={{
          ...sectionStyle,
          background: "#eff6ff",
          lineHeight: 1.8,
        }}
      >
        <strong>보고서 비용 합계</strong>
        <br />
        인건비 {laborTotal.toLocaleString("ko-KR")}원 · 자재비{" "}
        {materialTotal.toLocaleString("ko-KR")}원 · 경비{" "}
        {expenseTotal.toLocaleString("ko-KR")}원
        <br />
        <strong>
          총{" "}
          {(laborTotal + materialTotal + expenseTotal).toLocaleString(
            "ko-KR",
          )}
          원
        </strong>
        <p style={helpStyle}>
          같은 자재 구매비를 추가 자재비에 다시 입력하면 중복됩니다.
        </p>
      </div>

      <div
        style={{
          padding: 12,
          borderRadius: 11,
          background: "#fffbeb",
          color: "#92400e",
          fontSize: 12,
          lineHeight: 1.6,
        }}
      >
        관리자 검수 및 실제 견적금액 입력 전에는 AI 견적자료로
        등록되지 않습니다.
      </div>

      {message && (
        <div
          role="status"
          style={{
            padding: 12,
            borderRadius: 10,
            background: message.startsWith("❌")
              ? "#fef2f2"
              : "#eff6ff",
            color: message.startsWith("❌") ? "#b91c1c" : "#1d4ed8",
            wordBreak: "break-word",
          }}
        >
          {message}
        </div>
      )}

      <button
        type="submit"
        disabled={saving || workersLoading || Boolean(workerError)}
        style={{
          padding: 14,
          border: 0,
          borderRadius: 11,
          background: saving ? "#94a3b8" : "#16a34a",
          color: "white",
          fontWeight: 900,
        }}
      >
        {saving ? "제출 중..." : "✅ 완료보고 제출"}
      </button>
    </form>
  );
}

function FieldLabel({ text, children }) {
  return (
    <label style={{ display: "block", marginTop: 12 }}>
      <div
        style={{
          fontSize: 12,
          fontWeight: 800,
          color: "#475569",
          marginBottom: 6,
        }}
      >
        {text}
      </div>
      {children}
    </label>
  );
}

function PhotoInput({ label, disabled, onChange }) {
  return (
    <label
      style={{
        display: "block",
        padding: 12,
        marginTop: 12,
        border: "1px dashed #94a3b8",
        borderRadius: 10,
        textAlign: "center",
      }}
    >
      📷 {label}
      <input
        type="file"
        accept="image/*"
        multiple
        disabled={disabled}
        onChange={onChange}
        style={{ display: "none" }}
      />
    </label>
  );
}

function PhotoPreviewGrid({ previews, onRemove, disabled }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3,minmax(0,1fr))",
        gap: 7,
        marginTop: 10,
      }}
    >
      {previews.map((item, index) => (
        <div
          key={`${item.file.name}-${index}`}
          style={{
            position: "relative",
            aspectRatio: "1 / 1",
            overflow: "hidden",
            borderRadius: 9,
          }}
        >
          <img
            src={item.url}
            alt={`선택 사진 ${index + 1}`}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
          <button
            type="button"
            disabled={disabled}
            aria-label={`사진 ${index + 1} 삭제`}
            onClick={() => onRemove(index)}
            style={{
              position: "absolute",
              top: 5,
              right: 5,
              border: 0,
              borderRadius: 20,
              background: "#0f172acc",
              color: "white",
              width: 25,
              height: 25,
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

function EmptyBox({ text }) {
  return (
    <p
      style={{
        ...helpStyle,
        padding: 12,
        background: "#f8fafc",
        borderRadius: 10,
      }}
    >
      {text}
    </p>
  );
}

const sectionStyle = {
  padding: 14,
  border: "1px solid #e2e8f0",
  borderRadius: 14,
  background: "#fff",
};

const rowStyle = {
  padding: 12,
  marginTop: 10,
  borderRadius: 11,
  background: "#f8fafc",
};

const headingStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 8,
};

const helpStyle = {
  fontSize: 12,
  color: "#64748b",
  lineHeight: 1.6,
};

const totalStyle = {
  textAlign: "right",
  fontWeight: 900,
  color: "#1d4ed8",
};

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: 11,
  border: "1px solid #cbd5e1",
  borderRadius: 9,
  background: "white",
  fontSize: 13,
};

const smallAddButtonStyle = {
  padding: "8px 10px",
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  background: "white",
  fontSize: 12,
  fontWeight: 900,
};

const removeButtonStyle = {
  padding: "5px 8px",
  border: "1px solid #fecaca",
  borderRadius: 7,
  background: "white",
  color: "#dc2626",
  fontSize: 11,
};
