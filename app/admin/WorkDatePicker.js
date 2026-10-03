"use client";

import { useEffect, useMemo, useState } from "react";
import WorkDatePicker from "./WorkDatePicker";
import CallContentAiInput from "./site-register/CallContentAiInput";

function makeDateTime(date, time) {
  if (!date || !time) return null;
  const value = new Date(`${date}T${time}:00+09:00`);
  return Number.isNaN(value.getTime()) ? null : value.toISOString();
}

function validDay(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return false;
  }

  const date = new Date(`${value}T00:00:00Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

const initialForm = {
  work_dates: [],
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
  source: "phone",
  memo: "",
};

function makeEmptyMaterial() {
  return {
    local_id: crypto.randomUUID(),
    film_product_id: null,
    brand: "",
    product_code: "",
    product_name: "",
    quantity: "",
    unit: "m",
    unit_price: "",
    total_price: "",
    memo: "",
  };
}

export default function SiteRegisterModal({
  open,
  onClose,
  createSite,
  loading = false,
}) {
  const [form, setForm] = useState(initialForm);
  const [materials, setMaterials] = useState([]);
  const [requestPhotos, setRequestPhotos] = useState([]);
  const [localMessage, setLocalMessage] = useState("");

  useEffect(() => {
    if (!open) return;
    setForm({ ...initialForm });
    setMaterials([]);
    setRequestPhotos([]);
    setLocalMessage("");
  }, [open]);

  const photoPreviews = useMemo(
    () =>
      requestPhotos.map((file) => ({
        file,
        url: URL.createObjectURL(file),
      })),
    [requestPhotos]
  );

  useEffect(() => {
    return () => {
      photoPreviews.forEach((item) => URL.revokeObjectURL(item.url));
    };
  }, [photoPreviews]);

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function applyCallAnalysis(data) {
    if (!data || typeof data !== "object") return;

    const fields = [
      "customer_name",
      "customer_phone",
      "site_name",
      "address",
      "address_detail",
      "region",
      "work_type",
      "work_description",
      "contract_amount",
      "deposit_amount",
      "memo",
    ];

    setForm((prev) => {
      const next = { ...prev, source: "phone" };

      fields.forEach((field) => {
        const value = data[field];
        if (
          value !== null &&
          value !== undefined &&
          String(value).trim() !== ""
        ) {
          next[field] = String(value).trim();
        }
      });

      // AI가 전달한 실제 날짜만 추가합니다.
      // 시작일과 종료일 사이를 자동으로 채우지 않습니다.
      const aiDates = Array.isArray(data.work_dates)
        ? data.work_dates
        : data.date
          ? [data.date]
          : [];

      const validDates = aiDates.filter(validDay);

      if (validDates.length) {
        next.work_dates = [
          ...new Set([...prev.work_dates, ...validDates]),
        ].sort();
      }

      return next;
    });

    if (Array.isArray(data.materials) && data.materials.length) {
      const aiMaterials = data.materials
        .filter((item) => item && typeof item === "object")
        .map((item) => ({
          ...makeEmptyMaterial(),
          brand: item.brand ? String(item.brand).trim() : "",
          product_code: item.product_code
            ? String(item.product_code).trim()
            : "",
          product_name: item.product_name
            ? String(item.product_name).trim()
            : "",
          quantity:
            item.quantity !== null && item.quantity !== undefined
              ? String(item.quantity).trim()
              : "",
          unit: item.unit ? String(item.unit).trim() : "m",
          unit_price:
            item.unit_price !== null && item.unit_price !== undefined
              ? String(item.unit_price).trim()
              : "",
          total_price:
            item.total_price !== null && item.total_price !== undefined
              ? String(item.total_price).trim()
              : "",
          memo: item.memo ? String(item.memo).trim() : "",
        }))
        .filter(
          (item) =>
            item.brand ||
            item.product_code ||
            item.product_name ||
            item.quantity ||
            item.memo
        );

      if (aiMaterials.length) {
        setMaterials((prev) => [...prev, ...aiMaterials]);
      }
    }

    setLocalMessage(
      "✅ 통화내용을 반영했습니다. 시공 날짜와 내용을 확인한 후 등록해주세요."
    );
  }

  function addMaterial() {
    setMaterials((prev) => [...prev, makeEmptyMaterial()]);
  }

  function updateMaterial(localId, field, value) {
    setMaterials((prev) =>
      prev.map((material) => {
        if (material.local_id !== localId) return material;

        const next = { ...material, [field]: value };

        if (field === "quantity" || field === "unit_price") {
          const quantity = Number(next.quantity);
          const unitPrice = Number(next.unit_price);

          if (
            Number.isFinite(quantity) &&
            Number.isFinite(unitPrice) &&
            quantity >= 0 &&
            unitPrice >= 0
          ) {
            next.total_price = quantity * unitPrice;
          }
        }

        return next;
      })
    );
  }

  function removeMaterial(localId) {
    setMaterials((prev) =>
      prev.filter((material) => material.local_id !== localId)
    );
  }

  function handlePhotoFiles(event) {
    const files = Array.from(event.target.files || []).filter((file) =>
      file.type.startsWith("image/")
    );

    if (files.length) {
      setRequestPhotos((prev) => [...prev, ...files]);
    }

    event.target.value = "";
  }

  function removePhoto(index) {
    setRequestPhotos((prev) =>
      prev.filter((_, photoIndex) => photoIndex !== index)
    );
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (loading) return;

    setLocalMessage("");

    const dates = [...new Set(form.work_dates)].sort();

    if (dates.some((date) => !validDay(date)) || dates.length > 366) {
      setLocalMessage(
        "❌ 시공 날짜를 확인해주세요. 최대 366일 선택할 수 있습니다."
      );
      return;
    }

    const hasConfirmedSchedule = dates.length > 0;
    const scheduleStart = hasConfirmedSchedule
      ? makeDateTime(dates[0], "00:00")
      : null;
    const scheduleEnd = hasConfirmedSchedule
      ? makeDateTime(dates[dates.length - 1], "23:59")
      : null;

    const cleanMaterials = materials
      .filter(
        (material) =>
          String(material.product_code || "").trim() ||
          String(material.product_name || "").trim()
      )
      .map((material) => ({
        film_product_id: material.film_product_id || null,
        brand: String(material.brand || "").trim(),
        product_code: String(material.product_code || "").trim(),
        product_name: String(material.product_name || "").trim(),
        quantity: material.quantity,
        unit: material.unit || "m",
        unit_price: material.unit_price,
        total_price: material.total_price,
        memo: String(material.memo || "").trim(),
      }));

    try {
      const result = await createSite({
        customer_name: form.customer_name,
        customer_phone: form.customer_phone,
        site_name: form.site_name,
        address: form.address,
        address_detail: form.address_detail,
        region: form.region,
        work_dates: dates,
        schedule_date: dates[0] || null,
        schedule_start: scheduleStart,
        schedule_end: scheduleEnd,
        status: hasConfirmedSchedule ? "scheduled" : "consulting",
        work_type: form.work_type,
        work_description: form.work_description,
        contract_amount: form.contract_amount,
        deposit_amount: form.deposit_amount,
        source: form.source,
        memo: form.memo,
        materials: cleanMaterials,
        request_photos: requestPhotos,
      });

      if (!result?.success) {
        setLocalMessage(
          `❌ ${result?.error || "현장 등록에 실패했습니다."}`
        );
        return;
      }

      setLocalMessage(
        `✅ ${
          hasConfirmedSchedule
            ? `선택한 ${dates.length}일의 시공 일정이 등록되었습니다.`
            : "상담중 현장으로 등록되었습니다."
        }${
          cleanMaterials.length
            ? `\n자재 ${cleanMaterials.length}건 저장`
            : ""
        }${
          requestPhotos.length
            ? `\n요청사진 ${requestPhotos.length}장 저장`
            : ""
        }`
      );

      setTimeout(() => onClose(), 500);
    } catch (error) {
      setLocalMessage(
        `❌ ${error?.message || "현장 등록 중 오류가 발생했습니다."}`
      );
    }
  }

  if (!open) return null;

  const inputStyle = {
    width: "100%",
    boxSizing: "border-box",
    padding: "11px 12px",
    border: "1px solid #cbd5e1",
    borderRadius: 9,
    background: "#fff",
    color: "#111827",
    fontSize: 14,
  };

  const labelStyle = {
    display: "block",
    marginBottom: 6,
    color: "#334155",
    fontSize: 13,
    fontWeight: 700,
  };

  const fieldStyle = { marginBottom: 14 };

  const sectionStyle = {
    marginBottom: 16,
    padding: 14,
    border: "1px solid #e2e8f0",
    borderRadius: 12,
    background: "#fff",
  };

  const sectionTitleStyle = {
    marginBottom: 12,
    fontSize: 15,
    fontWeight: 800,
    color: "#111827",
  };

  const gridStyle = {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 8,
  };

  function formInput(field, label, placeholder = "", type = "text") {
    return (
      <div style={fieldStyle}>
        <label style={labelStyle}>{label}</label>
        <input
          type={type}
          value={form[field]}
          disabled={loading}
          onChange={(event) => updateField(field, event.target.value)}
          placeholder={placeholder}
          style={inputStyle}
          {...(type === "number"
            ? { min: "0", inputMode: "numeric" }
            : {})}
        />
      </div>
    );
  }

  function materialInput(
    material,
    field,
    label,
    placeholder = "",
    type = "text",
    step
  ) {
    return (
      <div style={fieldStyle}>
        <label style={labelStyle}>{label}</label>
        <input
          type={type}
          value={material[field]}
          disabled={loading}
          onChange={(event) =>
            updateMaterial(material.local_id, field, event.target.value)
          }
          placeholder={placeholder}
          style={inputStyle}
          {...(type === "number"
            ? {
                min: "0",
                inputMode: step ? "decimal" : "numeric",
                ...(step ? { step } : {}),
              }
            : {})}
        />
      </div>
    );
  }

  return (
    <div
      onClick={() => {
        if (!loading) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "24px 12px",
        background: "rgba(15,23,42,0.55)",
        overflowY: "auto",
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 620,
          background: "#fff",
          borderRadius: 16,
          boxShadow: "0 20px 50px rgba(0,0,0,0.20)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: 16,
            borderBottom: "1px solid #e5e7eb",
          }}
        >
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>
              새 현장 / 일정 추가
            </div>
            <div
              style={{
                marginTop: 4,
                fontSize: 12,
                color: "#64748b",
                lineHeight: 1.6,
              }}
            >
              미정 정보가 있어도 상담중 현장으로 먼저 등록할 수 있습니다.
            </div>
          </div>

          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            aria-label="닫기"
            style={{
              border: "none",
              background: "transparent",
              fontSize: 25,
              color: "#64748b",
            }}
          >
            ×
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          style={{ padding: 16, background: "#f8fafc" }}
        >
          <CallContentAiInput
            disabled={loading}
            onApply={applyCallAnalysis}
          />

          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>📅 시공 날짜</div>

            <WorkDatePicker
              value={form.work_dates}
              onChange={(dates) => updateField("work_dates", dates)}
              disabled={loading}
            />

            <p
              style={{
                fontSize: 12,
                color: "#64748b",
                lineHeight: 1.6,
                marginBottom: 0,
              }}
            >
              실제로 일하는 날짜만 선택하세요. 등록 후 현장 상세에서
              날짜별 팀장과 팀원을 배정할 수 있습니다.
            </p>
          </div>

          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>👤 고객 / 현장</div>

            <div style={gridStyle}>
              {formInput("customer_name", "고객명", "홍길동")}
              {formInput(
                "customer_phone",
                "전화번호",
                "010-0000-0000",
                "tel"
              )}
            </div>

            {formInput("site_name", "현장명", "예: 검단 ○○아파트")}
            {formInput("address", "주소", "현장 주소")}

            <div style={gridStyle}>
              {formInput(
                "address_detail",
                "상세주소",
                "101동 1001호"
              )}
              {formInput("region", "지역", "예: 인천 서구")}
            </div>
          </div>

          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>🛠️ 시공 내용</div>

            {formInput(
              "work_type",
              "시공 종류",
              "예: 싱크대 / 방문 / 문틀"
            )}

            <div style={fieldStyle}>
              <label style={labelStyle}>상세 작업내용</label>
              <textarea
                value={form.work_description}
                disabled={loading}
                onChange={(event) =>
                  updateField("work_description", event.target.value)
                }
                placeholder="예: 싱크대 상하부장, 방문 3개, 문틀 3개"
                rows={3}
                style={{ ...inputStyle, resize: "vertical" }}
              />
            </div>
          </div>

          <div style={sectionStyle}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10,
                marginBottom: 12,
              }}
            >
              <div style={{ ...sectionTitleStyle, marginBottom: 0 }}>
                📦 시공 자재
              </div>

              <button
                type="button"
                onClick={addMaterial}
                disabled={loading}
                style={{
                  border: "1px solid #111827",
                  borderRadius: 8,
                  padding: "8px 11px",
                  background: "#fff",
                  fontSize: 12,
                  fontWeight: 800,
                }}
              >
                + 자재 추가
              </button>
            </div>

            {!materials.length && (
              <div
                style={{
                  padding: 14,
                  border: "1px dashed #cbd5e1",
                  borderRadius: 10,
                  background: "#f8fafc",
                  color: "#64748b",
                  fontSize: 13,
                  textAlign: "center",
                }}
              >
                사용할 필름이 정해졌다면 자재를 추가해주세요.
              </div>
            )}

            {materials.map((material, index) => (
              <div
                key={material.local_id}
                style={{
                  marginTop: 10,
                  padding: 12,
                  border: "1px solid #e2e8f0",
                  borderRadius: 10,
                  background: "#f8fafc",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 10,
                  }}
                >
                  <strong style={{ fontSize: 13 }}>
                    자재 {index + 1}
                  </strong>

                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => removeMaterial(material.local_id)}
                    style={{
                      border: "none",
                      background: "transparent",
                      color: "#dc2626",
                      fontWeight: 800,
                    }}
                  >
                    삭제
                  </button>
                </div>

                <div style={gridStyle}>
                  {materialInput(
                    material,
                    "brand",
                    "제조사",
                    "예: 현대보닥"
                  )}
                  {materialInput(
                    material,
                    "product_code",
                    "제품코드",
                    "예: S115"
                  )}
                </div>

                {materialInput(
                  material,
                  "product_name",
                  "제품명 / 색상",
                  "제품명 또는 색상"
                )}

                <div
                  style={{
                    ...gridStyle,
                    gridTemplateColumns: "2fr 1fr",
                  }}
                >
                  {materialInput(
                    material,
                    "quantity",
                    "예상 사용량",
                    "예: 20",
                    "number",
                    "0.1"
                  )}

                  <div style={fieldStyle}>
                    <label style={labelStyle}>단위</label>
                    <select
                      value={material.unit}
                      disabled={loading}
                      onChange={(event) =>
                        updateMaterial(
                          material.local_id,
                          "unit",
                          event.target.value
                        )
                      }
                      style={inputStyle}
                    >
                      <option value="m">m</option>
                      <option value="m2">㎡</option>
                      <option value="roll">롤</option>
                      <option value="ea">개</option>
                    </select>
                  </div>
                </div>

                <div style={gridStyle}>
                  {materialInput(
                    material,
                    "unit_price",
                    "단가",
                    "0",
                    "number"
                  )}
                  {materialInput(
                    material,
                    "total_price",
                    "예상 자재금액",
                    "0",
                    "number"
                  )}
                </div>

                {materialInput(
                  material,
                  "memo",
                  "자재 메모",
                  "예: 상부장 사용"
                )}
              </div>
            ))}
          </div>

          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>📷 시공 요청사진</div>

            <label
              style={{
                display: "block",
                padding: 16,
                border: "2px dashed #cbd5e1",
                borderRadius: 10,
                background: "#f8fafc",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 26 }}>📷</div>
              <div
                style={{
                  marginTop: 5,
                  fontSize: 14,
                  fontWeight: 800,
                }}
              >
                사진 선택
              </div>
              <div
                style={{
                  marginTop: 4,
                  color: "#64748b",
                  fontSize: 12,
                }}
              >
                고객이 보내준 현장사진을 여러 장 선택할 수 있습니다.
              </div>

              <input
                type="file"
                accept="image/*"
                multiple
                disabled={loading}
                onChange={handlePhotoFiles}
                style={{ display: "none" }}
              />
            </label>

            {photoPreviews.length > 0 && (
              <>
                <div
                  style={{
                    marginTop: 10,
                    color: "#475569",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  선택된 사진 {photoPreviews.length}장
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: 8,
                    marginTop: 8,
                  }}
                >
                  {photoPreviews.map((item, index) => (
                    <div
                      key={`${item.file.name}-${index}`}
                      style={{
                        position: "relative",
                        aspectRatio: "1 / 1",
                        borderRadius: 9,
                        overflow: "hidden",
                        background: "#e2e8f0",
                      }}
                    >
                      <img
                        src={item.url}
                        alt={`요청사진 ${index + 1}`}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                        }}
                      />

                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => removePhoto(index)}
                        aria-label={`요청사진 ${index + 1} 삭제`}
                        style={{
                          position: "absolute",
                          top: 5,
                          right: 5,
                          width: 28,
                          height: 28,
                          border: "none",
                          borderRadius: "50%",
                          background: "rgba(0,0,0,0.72)",
                          color: "#fff",
                          fontSize: 16,
                          fontWeight: 800,
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>💰 계약 정보</div>

            <div style={gridStyle}>
              {formInput(
                "contract_amount",
                "계약금액",
                "1000000",
                "number"
              )}
              {formInput(
                "deposit_amount",
                "계약금 / 선금",
                "300000",
                "number"
              )}
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>접수 경로</label>
              <select
                value={form.source}
                disabled={loading}
                onChange={(event) =>
                  updateField("source", event.target.value)
                }
                style={inputStyle}
              >
                <option value="phone">전화</option>
                <option value="ai_estimate">AI 견적</option>
                <option value="lead">고객 상담</option>
                <option value="direct">직접 등록</option>
                <option value="other">기타</option>
              </select>
            </div>
          </div>

          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>📝 현장 메모</div>

            <textarea
              value={form.memo}
              disabled={loading}
              onChange={(event) =>
                updateField("memo", event.target.value)
              }
              placeholder="예: 지하 2층 주차, 고객 통화 후 입장"
              rows={3}
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </div>

          {localMessage && (
            <div
              role="status"
              style={{
                marginBottom: 14,
                padding: "10px 12px",
                borderRadius: 9,
                background: localMessage.startsWith("✅")
                  ? "#f0fdf4"
                  : "#fef2f2",
                color: localMessage.startsWith("✅")
                  ? "#166534"
                  : "#b91c1c",
                fontSize: 13,
                fontWeight: 700,
                whiteSpace: "pre-wrap",
              }}
            >
              {localMessage}
            </div>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 2fr",
              gap: 8,
            }}
          >
            <button
              type="button"
              disabled={loading}
              onClick={onClose}
              style={{
                border: "1px solid #cbd5e1",
                borderRadius: 10,
                padding: 12,
                background: "#fff",
                color: "#334155",
                fontWeight: 700,
              }}
            >
              취소
            </button>

            <button
              type="submit"
              disabled={loading}
              style={{
                border: "none",
                borderRadius: 10,
                padding: 12,
                background: loading ? "#94a3b8" : "#111827",
                color: "#fff",
                fontWeight: 800,
              }}
            >
              {loading ? "등록 중..." : "현장 등록"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
