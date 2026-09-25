"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import CallContentAiInput from "./site-register/CallContentAiInput";

/* =========================================================
   오늘 날짜
========================================================= */

function getTodayString() {
  const now = new Date();

  const year = now.getFullYear();

  const month = String(
    now.getMonth() + 1,
  ).padStart(2, "0");

  const day = String(
    now.getDate(),
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/* =========================================================
   날짜 + 시간을 ISO로 변환
========================================================= */

function makeDateTime(
  date,
  time,
) {
  if (!date || !time) {
    return null;
  }

  const localDate = new Date(
    `${date}T${time}:00`,
  );

  if (
    Number.isNaN(
      localDate.getTime(),
    )
  ) {
    return null;
  }

  return localDate.toISOString();
}

/* =========================================================
   기본 폼
========================================================= */

const initialForm = {
  date: "",
  start_time: "09:00",
  end_time: "18:00",

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

/* =========================================================
   빈 자재
========================================================= */

function makeEmptyMaterial() {
  return {
    local_id:
      crypto.randomUUID(),

    film_product_id:
      null,

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

/* =========================================================
   컴포넌트
========================================================= */

export default function SiteRegisterModal({
  open,
  onClose,
  createSite,
  loading = false,
}) {
  const [
    form,
    setForm,
  ] = useState(initialForm);

  const [
    materials,
    setMaterials,
  ] = useState([]);

  const [
    requestPhotos,
    setRequestPhotos,
  ] = useState([]);

  const [
    localMessage,
    setLocalMessage,
  ] = useState("");

  /* =======================================================
     팝업 열릴 때 초기화
  ======================================================= */

  useEffect(() => {
    if (!open) {
      return;
    }

    setForm({
      ...initialForm,
      date: getTodayString(),
    });

    setMaterials([]);
    setRequestPhotos([]);
    setLocalMessage("");
  }, [open]);

  /* =======================================================
     사진 미리보기
  ======================================================= */

  const photoPreviews =
    useMemo(
      () =>
        requestPhotos.map(
          (file) => ({
            file,

            url:
              URL.createObjectURL(
                file,
              ),
          }),
        ),
      [requestPhotos],
    );

  useEffect(() => {
    return () => {
      photoPreviews.forEach(
        (item) => {
          URL.revokeObjectURL(
            item.url,
          );
        },
      );
    };
  }, [photoPreviews]);

  /* =======================================================
     일반 입력 변경
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
     AI 통화 분석 결과 적용
  ======================================================= */

  function applyCallAnalysis(
    data,
  ) {
    if (
      !data ||
      typeof data !== "object"
    ) {
      return;
    }

    const fields = [
      "date",
      "start_time",
      "end_time",

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

    /*
     * AI가 실제로 찾은 값만
     * 현재 입력폼에 적용합니다.
     *
     * AI가 빈값을 반환했다고 해서
     * 관리자가 이미 입력한 값을
     * 지우지 않습니다.
     */

    setForm(
      (prev) => {
        const next = {
          ...prev,

          source:
            "phone",
        };

        fields.forEach(
          (field) => {
            const value =
              data[field];

            if (
              value !== null &&
              value !== undefined &&
              String(value).trim() !==
                ""
            ) {
              next[field] =
                String(
                  value,
                ).trim();
            }
          },
        );

        return next;
      },
    );

    /* -------------------------------------------------------
       AI가 찾은 자재 추가
    ------------------------------------------------------- */

    if (
      Array.isArray(
        data.materials,
      ) &&
      data.materials.length >
        0
    ) {
      const aiMaterials =
        data.materials
          .filter(
            (item) =>
              item &&
              typeof item ===
                "object",
          )
          .map(
            (item) => ({
              ...makeEmptyMaterial(),

              brand:
                item.brand
                  ? String(
                      item.brand,
                    ).trim()
                  : "",

              product_code:
                item.product_code
                  ? String(
                      item.product_code,
                    ).trim()
                  : "",

              product_name:
                item.product_name
                  ? String(
                      item.product_name,
                    ).trim()
                  : "",

              quantity:
                item.quantity !==
                  null &&
                item.quantity !==
                  undefined
                  ? String(
                      item.quantity,
                    ).trim()
                  : "",

              unit:
                item.unit
                  ? String(
                      item.unit,
                    ).trim()
                  : "m",

              memo:
                item.memo
                  ? String(
                      item.memo,
                    ).trim()
                  : "",
            }),
          )
          .filter(
            (item) =>
              item.brand ||
              item.product_code ||
              item.product_name ||
              item.quantity ||
              item.memo,
          );

      if (
        aiMaterials.length >
        0
      ) {
        setMaterials(
          (prev) => [
            ...prev,
            ...aiMaterials,
          ],
        );
      }
    }

    setLocalMessage(
      "✅ 통화내용을 일정등록 화면에 반영했습니다. 내용을 확인한 후 등록해주세요.",
    );
  }

  /* =======================================================
     자재 추가
  ======================================================= */

  function addMaterial() {
    setMaterials(
      (prev) => [
        ...prev,
        makeEmptyMaterial(),
      ],
    );
  }

  /* =======================================================
     자재 변경
  ======================================================= */

  function updateMaterial(
    localId,
    field,
    value,
  ) {
    setMaterials(
      (prev) =>
        prev.map(
          (material) => {
            if (
              material.local_id !==
              localId
            ) {
              return material;
            }

            const next = {
              ...material,
              [field]: value,
            };

            /*
             * 수량 또는 단가 변경 시
             * 총액 자동 계산
             */

            if (
              field ===
                "quantity" ||
              field ===
                "unit_price"
            ) {
              const quantity =
                Number(
                  field ===
                    "quantity"
                    ? value
                    : next.quantity,
                );

              const unitPrice =
                Number(
                  field ===
                    "unit_price"
                    ? value
                    : next.unit_price,
                );

              if (
                Number.isFinite(
                  quantity,
                ) &&
                Number.isFinite(
                  unitPrice,
                ) &&
                quantity >= 0 &&
                unitPrice >= 0
              ) {
                next.total_price =
                  quantity *
                  unitPrice;
              }
            }

            return next;
          },
        ),
    );
  }

  /* =======================================================
     자재 삭제
  ======================================================= */

  function removeMaterial(
    localId,
  ) {
    setMaterials(
      (prev) =>
        prev.filter(
          (material) =>
            material.local_id !==
            localId,
        ),
    );
  }

  /* =======================================================
     요청사진 선택
  ======================================================= */

  function handlePhotoFiles(
    event,
  ) {
    const files =
      Array.from(
        event.target.files ||
          [],
      ).filter(
        (file) =>
          file.type.startsWith(
            "image/",
          ),
      );

    if (!files.length) {
      return;
    }

    setRequestPhotos(
      (prev) => [
        ...prev,
        ...files,
      ],
    );

    /*
     * 같은 사진 재선택 가능
     */

    event.target.value =
      "";
  }

  /* =======================================================
     요청사진 삭제
  ======================================================= */

  function removePhoto(
    index,
  ) {
    setRequestPhotos(
      (prev) =>
        prev.filter(
          (
            _,
            photoIndex,
          ) =>
            photoIndex !==
            index,
        ),
    );
  }

  /* =======================================================
     저장
  ======================================================= */

  async function handleSubmit(
    event,
  ) {
    event.preventDefault();

    setLocalMessage("");

    /* -------------------------------------------------------
       필수값 검사
    ------------------------------------------------------- */

    if (!form.date) {
      setLocalMessage(
        "❌ 시공 날짜를 선택해주세요.",
      );

      return;
    }

    if (!form.start_time) {
      setLocalMessage(
        "❌ 시작 시간을 입력해주세요.",
      );

      return;
    }

    if (
      !form.customer_name.trim()
    ) {
      setLocalMessage(
        "❌ 고객명을 입력해주세요.",
      );

      return;
    }

    if (
      !form.address.trim()
    ) {
      setLocalMessage(
        "❌ 현장 주소를 입력해주세요.",
      );

      return;
    }

    /* -------------------------------------------------------
       시간 변환
    ------------------------------------------------------- */

    const scheduleStart =
      makeDateTime(
        form.date,
        form.start_time,
      );

    const scheduleEnd =
      form.end_time
        ? makeDateTime(
            form.date,
            form.end_time,
          )
        : null;

    if (!scheduleStart) {
      setLocalMessage(
        "❌ 시작 시간을 확인해주세요.",
      );

      return;
    }

    if (
      scheduleEnd &&
      new Date(
        scheduleEnd,
      ).getTime() <
        new Date(
          scheduleStart,
        ).getTime()
    ) {
      setLocalMessage(
        "❌ 종료 시간은 시작 시간보다 늦어야 합니다.",
      );

      return;
    }

    /* -------------------------------------------------------
       입력된 자재만 저장
    ------------------------------------------------------- */

    const cleanMaterials =
      materials
        .filter(
          (material) =>
            material.product_code.trim() ||
            material.product_name.trim(),
        )
        .map(
          (material) => ({
            film_product_id:
              material.film_product_id ||
              null,

            brand:
              material.brand.trim(),

            product_code:
              material.product_code.trim(),

            product_name:
              material.product_name.trim(),

            quantity:
              material.quantity,

            unit:
              material.unit ||
              "m",

            unit_price:
              material.unit_price,

            total_price:
              material.total_price,

            memo:
              material.memo.trim(),
          }),
        );

    /* -------------------------------------------------------
       저장
    ------------------------------------------------------- */

    const result =
      await createSite({
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

        schedule_start:
          scheduleStart,

        schedule_end:
          scheduleEnd,

        work_type:
          form.work_type,

        work_description:
          form.work_description,

        contract_amount:
          form.contract_amount,

        deposit_amount:
          form.deposit_amount,

        source:
          form.source,

        memo:
          form.memo,

        materials:
          cleanMaterials,

        request_photos:
          requestPhotos,
      });

    if (!result?.success) {
      setLocalMessage(
        `❌ ${
          result?.error ||
          "현장 등록에 실패했습니다."
        }`,
      );

      return;
    }

    setLocalMessage(
      `✅ 현장 일정이 등록되었습니다.${
        cleanMaterials.length
          ? `\n자재 ${cleanMaterials.length}건 저장`
          : ""
      }${
        requestPhotos.length
          ? `\n요청사진 ${requestPhotos.length}장 저장`
          : ""
      }`,
    );

    setTimeout(
      () => {
        onClose();
      },
      500,
    );
  }

  /* =======================================================
     닫힌 상태
  ======================================================= */

  if (!open) {
    return null;
  }

  /* =======================================================
     공통 스타일
  ======================================================= */

  const inputStyle = {
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
      "14px",

    outline:
      "none",
  };

  const labelStyle = {
    display: "block",

    marginBottom: "6px",

    color: "#334155",

    fontSize: "13px",

    fontWeight: "700",
  };

  const fieldStyle = {
    marginBottom: "14px",
  };

  const sectionStyle = {
    marginBottom: "16px",

    padding: "14px",

    border:
      "1px solid #e2e8f0",

    borderRadius: "12px",

    background:
      "#ffffff",
  };

  const sectionTitleStyle = {
    marginBottom: "12px",

    fontSize: "15px",

    fontWeight: "800",

    color: "#111827",
  };

  /* =======================================================
     화면
  ======================================================= */

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

        zIndex: 1000,

        display: "flex",

        alignItems:
          "flex-start",

        justifyContent:
          "center",

        padding:
          "24px 12px",

        background:
          "rgba(15, 23, 42, 0.55)",

        overflowY: "auto",
      }}
    >
      <div
        onClick={(
          event,
        ) =>
          event.stopPropagation()
        }
        style={{
          width: "100%",

          maxWidth: "620px",

          background:
            "#ffffff",

          borderRadius:
            "16px",

          boxShadow:
            "0 20px 50px rgba(0,0,0,0.20)",

          overflow:
            "hidden",
        }}
      >
        {/* ===============================================
            제목
        =============================================== */}

        <div
          style={{
            display: "flex",

            alignItems:
              "center",

            justifyContent:
              "space-between",

            padding: "16px",

            borderBottom:
              "1px solid #e5e7eb",
          }}
        >
          <div>
            <div
              style={{
                fontSize:
                  "18px",

                fontWeight:
                  "800",

                color:
                  "#111827",
              }}
            >
              새 현장 / 일정 추가
            </div>

            <div
              style={{
                marginTop:
                  "4px",

                fontSize:
                  "12px",

                color:
                  "#64748b",
              }}
            >
              현장정보, 자재,
              요청사진을 한 번에
              등록합니다.
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

              fontSize: "25px",

              lineHeight: 1,

              cursor:
                loading
                  ? "default"
                  : "pointer",

              color:
                "#64748b",
            }}
          >
            ×
          </button>
        </div>

        {/* ===============================================
            FORM
        =============================================== */}

        <form
          onSubmit={
            handleSubmit
          }
          style={{
            padding: "16px",

            background:
              "#f8fafc",
          }}
        >
          {/* =============================================
              통화내용 AI 자동입력
          ============================================= */}

          <CallContentAiInput
            disabled={loading}
            onApply={
              applyCallAnalysis
            }
          />

          {/* =============================================
              일정
          ============================================= */}

          <div
            style={
              sectionStyle
            }
          >
            <div
              style={
                sectionTitleStyle
              }
            >
              📅 시공 일정
            </div>

            <div
              style={
                fieldStyle
              }
            >
              <label
                style={
                  labelStyle
                }
              >
                시공 날짜 *
              </label>

              <input
                type="date"
                value={
                  form.date
                }
                onChange={(
                  event,
                ) =>
                  updateField(
                    "date",
                    event.target
                      .value,
                  )
                }
                style={
                  inputStyle
                }
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
                style={
                  fieldStyle
                }
              >
                <label
                  style={
                    labelStyle
                  }
                >
                  시작 시간 *
                </label>

                <input
                  type="time"
                  value={
                    form.start_time
                  }
                  onChange={(
                    event,
                  ) =>
                    updateField(
                      "start_time",
                      event.target
                        .value,
                    )
                  }
                  style={
                    inputStyle
                  }
                />
              </div>

              <div
                style={
                  fieldStyle
                }
              >
                <label
                  style={
                    labelStyle
                  }
                >
                  종료 시간
                </label>

                <input
                  type="time"
                  value={
                    form.end_time
                  }
                  onChange={(
                    event,
                  ) =>
                    updateField(
                      "end_time",
                      event.target
                        .value,
                    )
                  }
                  style={
                    inputStyle
                  }
                />
              </div>
            </div>
          </div>

          {/* =============================================
              고객 / 현장
          ============================================= */}

          <div
            style={
              sectionStyle
            }
          >
            <div
              style={
                sectionTitleStyle
              }
            >
              👤 고객 / 현장
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
                style={
                  fieldStyle
                }
              >
                <label
                  style={
                    labelStyle
                  }
                >
                  고객명 *
                </label>

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
                  placeholder="홍길동"
                  style={
                    inputStyle
                  }
                />
              </div>

              <div
                style={
                  fieldStyle
                }
              >
                <label
                  style={
                    labelStyle
                  }
                >
                  전화번호
                </label>

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
                  style={
                    inputStyle
                  }
                />
              </div>
            </div>

            <div
              style={
                fieldStyle
              }
            >
              <label
                style={
                  labelStyle
                }
              >
                현장명
              </label>

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
                style={
                  inputStyle
                }
              />
            </div>

            <div
              style={
                fieldStyle
              }
            >
              <label
                style={
                  labelStyle
                }
              >
                주소 *
              </label>

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
                style={
                  inputStyle
                }
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
                style={
                  fieldStyle
                }
              >
                <label
                  style={
                    labelStyle
                  }
                >
                  상세주소
                </label>

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
                  placeholder="101동 1001호"
                  style={
                    inputStyle
                  }
                />
              </div>

              <div
                style={
                  fieldStyle
                }
              >
                <label
                  style={
                    labelStyle
                  }
                >
                  지역
                </label>

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
                  style={
                    inputStyle
                  }
                />
              </div>
            </div>
          </div>

          {/* =============================================
              시공 내용
          ============================================= */}

          <div
            style={
              sectionStyle
            }
          >
            <div
              style={
                sectionTitleStyle
              }
            >
              🛠️ 시공 내용
            </div>

            <div
              style={
                fieldStyle
              }
            >
              <label
                style={
                  labelStyle
                }
              >
                시공 종류
              </label>

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
                placeholder="예: 싱크대 / 방문 / 문틀"
                style={
                  inputStyle
                }
              />
            </div>

            <div
              style={
                fieldStyle
              }
            >
              <label
                style={
                  labelStyle
                }
              >
                상세 작업내용
              </label>

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
                placeholder="예: 싱크대 상하부장, 방문 3개, 문틀 3개"
                rows={3}
                style={{
                  ...inputStyle,

                  resize:
                    "vertical",
                }}
              />
            </div>
          </div>

          {/* =============================================
              시공 자재
          ============================================= */}

          <div
            style={
              sectionStyle
            }
          >
            <div
              style={{
                display: "flex",

                justifyContent:
                  "space-between",

                alignItems:
                  "center",

                gap: "10px",

                marginBottom:
                  "12px",
              }}
            >
              <div
                style={{
                  ...sectionTitleStyle,

                  marginBottom: 0,
                }}
              >
                📦 시공 자재
              </div>

              <button
                type="button"
                onClick={
                  addMaterial
                }
                disabled={loading}
                style={{
                  border:
                    "1px solid #111827",

                  borderRadius:
                    "8px",

                  padding:
                    "8px 11px",

                  background:
                    "#ffffff",

                  color:
                    "#111827",

                  fontSize:
                    "12px",

                  fontWeight:
                    "800",

                  cursor:
                    loading
                      ? "default"
                      : "pointer",
                }}
              >
                + 자재 추가
              </button>
            </div>

            {materials.length ===
              0 && (
              <div
                style={{
                  padding: "14px",

                  border:
                    "1px dashed #cbd5e1",

                  borderRadius:
                    "10px",

                  background:
                    "#f8fafc",

                  color:
                    "#64748b",

                  fontSize:
                    "13px",

                  textAlign:
                    "center",
                }}
              >
                사용할 필름이
                정해졌다면 자재를
                추가해주세요.
              </div>
            )}

            {materials.map(
              (
                material,
                index,
              ) => (
                <div
                  key={
                    material.local_id
                  }
                  style={{
                    marginTop:
                      "10px",

                    padding:
                      "12px",

                    border:
                      "1px solid #e2e8f0",

                    borderRadius:
                      "10px",

                    background:
                      "#f8fafc",
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

                      marginBottom:
                        "10px",
                    }}
                  >
                    <strong
                      style={{
                        fontSize:
                          "13px",
                      }}
                    >
                      자재{" "}
                      {index + 1}
                    </strong>

                    <button
                      type="button"
                      onClick={() =>
                        removeMaterial(
                          material.local_id,
                        )
                      }
                      style={{
                        border:
                          "none",

                        background:
                          "transparent",

                        color:
                          "#dc2626",

                        fontWeight:
                          "800",

                        cursor:
                          "pointer",
                      }}
                    >
                      삭제
                    </button>
                  </div>

                  <div
                    style={{
                      display:
                        "grid",

                      gridTemplateColumns:
                        "1fr 1fr",

                      gap: "8px",
                    }}
                  >
                    <div
                      style={
                        fieldStyle
                      }
                    >
                      <label
                        style={
                          labelStyle
                        }
                      >
                        제조사
                      </label>

                      <input
                        type="text"
                        value={
                          material.brand
                        }
                        onChange={(
                          event,
                        ) =>
                          updateMaterial(
                            material.local_id,
                            "brand",
                            event
                              .target
                              .value,
                          )
                        }
                        placeholder="예: 현대보닥"
                        style={
                          inputStyle
                        }
                      />
                    </div>

                    <div
                      style={
                        fieldStyle
                      }
                    >
                      <label
                        style={
                          labelStyle
                        }
                      >
                        제품코드
                      </label>

                      <input
                        type="text"
                        value={
                          material.product_code
                        }
                        onChange={(
                          event,
                        ) =>
                          updateMaterial(
                            material.local_id,
                            "product_code",
                            event
                              .target
                              .value,
                          )
                        }
                        placeholder="예: S115"
                        style={
                          inputStyle
                        }
                      />
                    </div>
                  </div>

                  <div
                    style={
                      fieldStyle
                    }
                  >
                    <label
                      style={
                        labelStyle
                      }
                    >
                      제품명 / 색상
                    </label>

                    <input
                      type="text"
                      value={
                        material.product_name
                      }
                      onChange={(
                        event,
                      ) =>
                        updateMaterial(
                          material.local_id,
                          "product_name",
                          event.target
                            .value,
                        )
                      }
                      placeholder="제품명 또는 색상"
                      style={
                        inputStyle
                      }
                    />
                  </div>

                  <div
                    style={{
                      display:
                        "grid",

                      gridTemplateColumns:
                        "2fr 1fr",

                      gap: "8px",
                    }}
                  >
                    <div
                      style={
                        fieldStyle
                      }
                    >
                      <label
                        style={
                          labelStyle
                        }
                      >
                        예상 사용량
                      </label>

                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        inputMode="decimal"
                        value={
                          material.quantity
                        }
                        onChange={(
                          event,
                        ) =>
                          updateMaterial(
                            material.local_id,
                            "quantity",
                            event
                              .target
                              .value,
                          )
                        }
                        placeholder="예: 20"
                        style={
                          inputStyle
                        }
                      />
                    </div>

                    <div
                      style={
                        fieldStyle
                      }
                    >
                      <label
                        style={
                          labelStyle
                        }
                      >
                        단위
                      </label>

                      <select
                        value={
                          material.unit
                        }
                        onChange={(
                          event,
                        ) =>
                          updateMaterial(
                            material.local_id,
                            "unit",
                            event
                              .target
                              .value,
                          )
                        }
                        style={
                          inputStyle
                        }
                      >
                        <option value="m">
                          m
                        </option>

                        <option value="m2">
                          ㎡
                        </option>

                        <option value="roll">
                          롤
                        </option>

                        <option value="ea">
                          개
                        </option>
                      </select>
                    </div>
                  </div>

                  <div
                    style={{
                      display:
                        "grid",

                      gridTemplateColumns:
                        "1fr 1fr",

                      gap: "8px",
                    }}
                  >
                    <div
                      style={
                        fieldStyle
                      }
                    >
                      <label
                        style={
                          labelStyle
                        }
                      >
                        단가
                      </label>

                      <input
                        type="number"
                        min="0"
                        inputMode="numeric"
                        value={
                          material.unit_price
                        }
                        onChange={(
                          event,
                        ) =>
                          updateMaterial(
                            material.local_id,
                            "unit_price",
                            event
                              .target
                              .value,
                          )
                        }
                        placeholder="0"
                        style={
                          inputStyle
                        }
                      />
                    </div>

                    <div
                      style={
                        fieldStyle
                      }
                    >
                      <label
                        style={
                          labelStyle
                        }
                      >
                        예상 자재금액
                      </label>

                      <input
                        type="number"
                        min="0"
                        inputMode="numeric"
                        value={
                          material.total_price
                        }
                        onChange={(
                          event,
                        ) =>
                          updateMaterial(
                            material.local_id,
                            "total_price",
                            event
                              .target
                              .value,
                          )
                        }
                        placeholder="0"
                        style={
                          inputStyle
                        }
                      />
                    </div>
                  </div>

                  <div
                    style={
                      fieldStyle
                    }
                  >
                    <label
                      style={
                        labelStyle
                      }
                    >
                      자재 메모
                    </label>

                    <input
                      type="text"
                      value={
                        material.memo
                      }
                      onChange={(
                        event,
                      ) =>
                        updateMaterial(
                          material.local_id,
                          "memo",
                          event.target
                            .value,
                        )
                      }
                      placeholder="예: 상부장 사용"
                      style={
                        inputStyle
                      }
                    />
                  </div>
                </div>
              ),
            )}
          </div>

          {/* =============================================
              요청사진
          ============================================= */}

          <div
            style={
              sectionStyle
            }
          >
            <div
              style={
                sectionTitleStyle
              }
            >
              📷 시공 요청사진
            </div>

            <label
              style={{
                display: "block",

                padding: "16px",

                border:
                  "2px dashed #cbd5e1",

                borderRadius:
                  "10px",

                background:
                  "#f8fafc",

                textAlign:
                  "center",

                cursor:
                  loading
                    ? "default"
                    : "pointer",
              }}
            >
              <div
                style={{
                  fontSize:
                    "26px",
                }}
              >
                📷
              </div>

              <div
                style={{
                  marginTop:
                    "5px",

                  color:
                    "#111827",

                  fontSize:
                    "14px",

                  fontWeight:
                    "800",
                }}
              >
                사진 선택
              </div>

              <div
                style={{
                  marginTop:
                    "4px",

                  color:
                    "#64748b",

                  fontSize:
                    "12px",
                }}
              >
                고객이 보내준
                현장사진을 여러 장
                선택할 수 있습니다.
              </div>

              <input
                type="file"
                accept="image/*"
                multiple
                disabled={loading}
                onChange={
                  handlePhotoFiles
                }
                style={{
                  display:
                    "none",
                }}
              />
            </label>

            {photoPreviews.length >
              0 && (
              <>
                <div
                  style={{
                    marginTop:
                      "10px",

                    color:
                      "#475569",

                    fontSize:
                      "12px",

                    fontWeight:
                      "700",
                  }}
                >
                  선택된 사진{" "}
                  {
                    photoPreviews.length
                  }
                  장
                </div>

                <div
                  style={{
                    display:
                      "grid",

                    gridTemplateColumns:
                      "repeat(3, 1fr)",

                    gap: "8px",

                    marginTop:
                      "8px",
                  }}
                >
                  {photoPreviews.map(
                    (
                      item,
                      index,
                    ) => (
                      <div
                        key={`${item.file.name}-${index}`}
                        style={{
                          position:
                            "relative",

                          aspectRatio:
                            "1 / 1",

                          borderRadius:
                            "9px",

                          overflow:
                            "hidden",

                          background:
                            "#e2e8f0",
                        }}
                      >
                        <img
                          src={
                            item.url
                          }
                          alt={`요청사진 ${
                            index +
                            1
                          }`}
                          style={{
                            width:
                              "100%",

                            height:
                              "100%",

                            objectFit:
                              "cover",
                          }}
                        />

                        <button
                          type="button"
                          onClick={() =>
                            removePhoto(
                              index,
                            )
                          }
                          style={{
                            position:
                              "absolute",

                            top: "5px",

                            right:
                              "5px",

                            width:
                              "28px",

                            height:
                              "28px",

                            border:
                              "none",

                            borderRadius:
                              "50%",

                            background:
                              "rgba(0,0,0,0.72)",

                            color:
                              "#ffffff",

                            fontSize:
                              "16px",

                            fontWeight:
                              "800",

                            cursor:
                              "pointer",
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ),
                  )}
                </div>
              </>
            )}
          </div>

          {/* =============================================
              계약 정보
          ============================================= */}

          <div
            style={
              sectionStyle
            }
          >
            <div
              style={
                sectionTitleStyle
              }
            >
              💰 계약 정보
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
                style={
                  fieldStyle
                }
              >
                <label
                  style={
                    labelStyle
                  }
                >
                  계약금액
                </label>

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
                  placeholder="1000000"
                  style={
                    inputStyle
                  }
                />
              </div>

              <div
                style={
                  fieldStyle
                }
              >
                <label
                  style={
                    labelStyle
                  }
                >
                  계약금 / 선금
                </label>

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
                  placeholder="300000"
                  style={
                    inputStyle
                  }
                />
              </div>
            </div>

            <div
              style={
                fieldStyle
              }
            >
              <label
                style={
                  labelStyle
                }
              >
                접수 경로
              </label>

              <select
                value={
                  form.source
                }
                onChange={(
                  event,
                ) =>
                  updateField(
                    "source",
                    event.target
                      .value,
                  )
                }
                style={
                  inputStyle
                }
              >
                <option value="phone">
                  전화
                </option>

                <option value="ai_estimate">
                  AI 견적
                </option>

                <option value="lead">
                  고객 상담
                </option>

                <option value="direct">
                  직접 등록
                </option>

                <option value="other">
                  기타
                </option>
              </select>
            </div>
          </div>

          {/* =============================================
              메모
          ============================================= */}

          <div
            style={
              sectionStyle
            }
          >
            <div
              style={
                sectionTitleStyle
              }
            >
              📝 현장 메모
            </div>

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
              placeholder="예: 지하 2층 주차, 오전 9시 고객 통화 후 입장"
              rows={3}
              style={{
                ...inputStyle,

                resize:
                  "vertical",
              }}
            />
          </div>

          {/* =============================================
              결과 메시지
          ============================================= */}

          {localMessage && (
            <div
              style={{
                marginBottom:
                  "14px",

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
                  "13px",

                fontWeight:
                  "700",

                whiteSpace:
                  "pre-wrap",
              }}
            >
              {localMessage}
            </div>
          )}

          {/* =============================================
              하단 버튼
          ============================================= */}

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
                border:
                  "1px solid #cbd5e1",

                borderRadius:
                  "10px",

                padding: "12px",

                background:
                  "#ffffff",

                color:
                  "#334155",

                fontWeight:
                  "700",

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
                border: "none",

                borderRadius:
                  "10px",

                padding: "12px",

                background:
                  loading
                    ? "#94a3b8"
                    : "#111827",

                color:
                  "#ffffff",

                fontWeight:
                  "800",

                cursor:
                  loading
                    ? "default"
                    : "pointer",
              }}
            >
              {loading
                ? "등록 중..."
                : "현장 일정 등록"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
                  }
