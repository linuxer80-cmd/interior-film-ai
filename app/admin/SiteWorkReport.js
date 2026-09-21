"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

/* =========================================================
   기본값
========================================================= */

const EMPTY_MATERIAL = {
  brand: "",
  product_code: "",
  product_name: "",
  quantity: "",
  unit: "m",
  unit_price: "",
  memo: "",
};

const EMPTY_EXPENSE = {
  expense_type: "parking",
  amount: "",
  description: "",
  expense_date: "",
};

const EXPENSE_TYPES = [
  {
    value: "parking",
    label: "주차비",
  },
  {
    value: "meal",
    label: "식비",
  },
  {
    value: "fuel",
    label: "유류비",
  },
  {
    value: "toll",
    label: "통행료",
  },
  {
    value: "material",
    label: "추가 자재비",
  },
  {
    value: "other",
    label: "기타",
  },
];

/* =========================================================
   날짜
========================================================= */

function getToday() {
  const now = new Date();

  const year =
    now.getFullYear();

  const month =
    String(
      now.getMonth() + 1,
    ).padStart(
      2,
      "0",
    );

  const day =
    String(
      now.getDate(),
    ).padStart(
      2,
      "0",
    );

  return `${year}-${month}-${day}`;
}

/* =========================================================
   숫자
========================================================= */

function formatWon(value) {
  const number =
    Number(value || 0);

  return `${number.toLocaleString()}원`;
}

/* =========================================================
   메인
========================================================= */

export default function SiteWorkReport({
  site,
  saving = false,
  message = "",
  onSave,
  onCancel,
}) {
  const [
    workRegion,
    setWorkRegion,
  ] = useState("");

  const [
    workSummary,
    setWorkSummary,
  ] = useState("");

  const [
    reportMemo,
    setReportMemo,
  ] = useState("");

  const [
    materials,
    setMaterials,
  ] = useState([]);

  const [
    expenses,
    setExpenses,
  ] = useState([]);

  const [
    photos,
    setPhotos,
  ] = useState([]);

  const [
    photoPreviews,
    setPhotoPreviews,
  ] = useState([]);

  const [
    localMessage,
    setLocalMessage,
  ] = useState("");

  /* =========================================================
     현장 변경 시 초기화
  ========================================================= */

  useEffect(() => {
    setWorkRegion(
      site?.region || "",
    );

    setWorkSummary(
      site?.work_description ||
        site?.work_type ||
        "",
    );

    setReportMemo("");

    setMaterials([]);

    setExpenses([]);

    setPhotos([]);

    setLocalMessage("");

    setPhotoPreviews(
      (previous) => {
        previous.forEach(
          (item) => {
            if (
              item?.url
            ) {
              URL.revokeObjectURL(
                item.url,
              );
            }
          },
        );

        return [];
      },
    );
  }, [site?.id]);

  /* =========================================================
     컴포넌트 종료 시 미리보기 URL 정리
  ========================================================= */

  useEffect(() => {
    return () => {
      photoPreviews.forEach(
        (item) => {
          if (
            item?.url
          ) {
            URL.revokeObjectURL(
              item.url,
            );
          }
        },
      );
    };
  }, [photoPreviews]);

  /* =========================================================
     합계
  ========================================================= */

  const expenseTotal =
    useMemo(() => {
      return expenses.reduce(
        (
          total,
          item,
        ) => {
          return (
            total +
            Number(
              item.amount || 0,
            )
          );
        },
        0,
      );
    }, [expenses]);

  /* =========================================================
     자재
  ========================================================= */

  function addMaterial() {
    setMaterials(
      (previous) => [
        ...previous,
        {
          ...EMPTY_MATERIAL,
        },
      ],
    );
  }

  function updateMaterial(
    index,
    field,
    value,
  ) {
    setMaterials(
      (previous) =>
        previous.map(
          (
            item,
            itemIndex,
          ) =>
            itemIndex === index
              ? {
                  ...item,
                  [field]:
                    value,
                }
              : item,
        ),
    );
  }

  function removeMaterial(
    index,
  ) {
    setMaterials(
      (previous) =>
        previous.filter(
          (
            _,
            itemIndex,
          ) =>
            itemIndex !==
            index,
        ),
    );
  }

  /* =========================================================
     경비
  ========================================================= */

  function addExpense() {
    setExpenses(
      (previous) => [
        ...previous,
        {
          ...EMPTY_EXPENSE,
          expense_date:
            getToday(),
        },
      ],
    );
  }

  function updateExpense(
    index,
    field,
    value,
  ) {
    setExpenses(
      (previous) =>
        previous.map(
          (
            item,
            itemIndex,
          ) =>
            itemIndex === index
              ? {
                  ...item,
                  [field]:
                    value,
                }
              : item,
        ),
    );
  }

  function removeExpense(
    index,
  ) {
    setExpenses(
      (previous) =>
        previous.filter(
          (
            _,
            itemIndex,
          ) =>
            itemIndex !==
            index,
        ),
    );
  }

  /* =========================================================
     사진
  ========================================================= */

  function handlePhotoFiles(
    event,
  ) {
    const selectedFiles =
      Array.from(
        event.target.files ||
          [],
      ).filter(
        (file) =>
          file.type.startsWith(
            "image/",
          ),
      );

    if (
      selectedFiles.length ===
      0
    ) {
      event.target.value = "";
      return;
    }

    const newPreviews =
      selectedFiles.map(
        (file) => ({
          file,
          url:
            URL.createObjectURL(
              file,
            ),
        }),
      );

    setPhotos(
      (previous) => [
        ...previous,
        ...selectedFiles,
      ],
    );

    setPhotoPreviews(
      (previous) => [
        ...previous,
        ...newPreviews,
      ],
    );

    event.target.value = "";
  }

  function removePhoto(
    index,
  ) {
    setPhotoPreviews(
      (previous) => {
        const target =
          previous[index];

        if (
          target?.url
        ) {
          URL.revokeObjectURL(
            target.url,
          );
        }

        return previous.filter(
          (
            _,
            itemIndex,
          ) =>
            itemIndex !==
            index,
        );
      },
    );

    setPhotos(
      (previous) =>
        previous.filter(
          (
            _,
            itemIndex,
          ) =>
            itemIndex !==
            index,
        ),
    );
  }

  /* =========================================================
     저장
  ========================================================= */

  async function handleSubmit(
    event,
  ) {
    event.preventDefault();

    if (
      saving
    ) {
      return;
    }

    if (
      !site?.id
    ) {
      setLocalMessage(
        "현장 정보가 없습니다.",
      );

      return;
    }

    if (
      !workSummary.trim()
    ) {
      setLocalMessage(
        "시공 내용을 입력해주세요.",
      );

      return;
    }

    if (
      photos.length === 0
    ) {
      setLocalMessage(
        "완료 사진을 1장 이상 등록해주세요.",
      );

      return;
    }

    if (
      typeof onSave !==
      "function"
    ) {
      setLocalMessage(
        "저장 기능이 아직 연결되지 않았습니다.",
      );

      return;
    }

    setLocalMessage("");

    await onSave({
      siteId:
        site.id,

      work_region:
        workRegion.trim(),

      work_summary:
        workSummary.trim(),

      memo:
        reportMemo.trim(),

      materials,

      expenses,

      photos,
    });
  }

  /* =========================================================
     화면
  ========================================================= */

  if (
    !site
  ) {
    return null;
  }

  return (
    <form
      onSubmit={
        handleSubmit
      }
      style={{
        display:
          "grid",
        gap:
          "18px",
      }}
    >
      {/* =====================================================
          제목
      ===================================================== */}

      <section
        style={
          sectionStyle
        }
      >
        <div
          style={{
            fontSize:
              "18px",
            fontWeight:
              "900",
            marginBottom:
              "6px",
          }}
        >
          ✅ 시공 완료 보고
        </div>

        <div
          style={{
            fontSize:
              "13px",
            color:
              "#6b7280",
            lineHeight:
              "1.5",
          }}
        >
          실제 시공 내용,
          사용 자재,
          경비,
          완료 사진을
          등록합니다.
        </div>
      </section>

      {/* =====================================================
          현장
      ===================================================== */}

      <section
        style={
          sectionStyle
        }
      >
        <SectionTitle>
          🏠 현장
        </SectionTitle>

        <div
          style={{
            display:
              "grid",
            gap:
              "8px",
          }}
        >
          <InfoRow
            label="현장명"
            value={
              site.site_name ||
              "-"
            }
          />

          <InfoRow
            label="고객명"
            value={
              site.customer_name ||
              "-"
            }
          />

          <InfoRow
            label="주소"
            value={[
              site.address,
              site.address_detail,
            ]
              .filter(Boolean)
              .join(" ") ||
              "-"}
          />
        </div>
      </section>

      {/* =====================================================
          작업 내용
      ===================================================== */}

      <section
        style={
          sectionStyle
        }
      >
        <SectionTitle>
          🛠 시공 내용
        </SectionTitle>

        <FieldLabel>
          시공 지역
        </FieldLabel>

        <input
          value={
            workRegion
          }
          onChange={(
            event,
          ) =>
            setWorkRegion(
              event.target
                .value,
            )
          }
          placeholder="예: 인천 서구"
          style={
            inputStyle
          }
        />

        <FieldLabel>
          실제 시공 내용 *
        </FieldLabel>

        <textarea
          value={
            workSummary
          }
          onChange={(
            event,
          ) =>
            setWorkSummary(
              event.target
                .value,
            )
          }
          placeholder="예: 싱크대 상하부장, 냉장고장 필름 시공"
          rows={4}
          style={{
            ...inputStyle,
            resize:
              "vertical",
          }}
        />

        <FieldLabel>
          작업 메모
        </FieldLabel>

        <textarea
          value={
            reportMemo
          }
          onChange={(
            event,
          ) =>
            setReportMemo(
              event.target
                .value,
            )
          }
          placeholder="현장 특이사항이나 추가 내용을 입력하세요."
          rows={3}
          style={{
            ...inputStyle,
            resize:
              "vertical",
          }}
        />
      </section>

      {/* =====================================================
          실제 사용 자재
      ===================================================== */}

      <section
        style={
          sectionStyle
        }
      >
        <div
          style={
            sectionHeaderStyle
          }
        >
          <SectionTitle
            noMargin
          >
            📦 실제 사용 자재
          </SectionTitle>

          <button
            type="button"
            onClick={
              addMaterial
            }
            style={
              smallButtonStyle
            }
          >
            + 자재 추가
          </button>
        </div>

        {materials.length ===
          0 ? (
          <EmptyText>
            추가 사용 자재가
            없으면 입력하지
            않아도 됩니다.
          </EmptyText>
        ) : (
          <div
            style={{
              display:
                "grid",
              gap:
                "12px",
            }}
          >
            {materials.map(
              (
                item,
                index,
              ) => (
                <div
                  key={
                    index
                  }
                  style={
                    itemCardStyle
                  }
                >
                  <div
                    style={
                      itemHeaderStyle
                    }
                  >
                    <strong>
                      자재{" "}
                      {index +
                        1}
                    </strong>

                    <button
                      type="button"
                      onClick={() =>
                        removeMaterial(
                          index,
                        )
                      }
                      style={
                        deleteButtonStyle
                      }
                    >
                      삭제
                    </button>
                  </div>

                  <div
                    style={
                      twoColumnStyle
                    }
                  >
                    <input
                      value={
                        item.brand
                      }
                      onChange={(
                        event,
                      ) =>
                        updateMaterial(
                          index,
                          "brand",
                          event
                            .target
                            .value,
                        )
                      }
                      placeholder="제조사"
                      style={
                        inputStyle
                      }
                    />

                    <input
                      value={
                        item.product_code
                      }
                      onChange={(
                        event,
                      ) =>
                        updateMaterial(
                          index,
                          "product_code",
                          event
                            .target
                            .value,
                        )
                      }
                      placeholder="제품코드"
                      style={
                        inputStyle
                      }
                    />
                  </div>

                  <input
                    value={
                      item.product_name
                    }
                    onChange={(
                      event,
                    ) =>
                      updateMaterial(
                        index,
                        "product_name",
                        event
                          .target
                          .value,
                      )
                    }
                    placeholder="제품명 / 색상"
                    style={
                      inputStyle
                    }
                  />

                  <div
                    style={
                      twoColumnStyle
                    }
                  >
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.1"
                      value={
                        item.quantity
                      }
                      onChange={(
                        event,
                      ) =>
                        updateMaterial(
                          index,
                          "quantity",
                          event
                            .target
                            .value,
                        )
                      }
                      placeholder="사용량"
                      style={
                        inputStyle
                      }
                    />

                    <select
                      value={
                        item.unit
                      }
                      onChange={(
                        event,
                      ) =>
                        updateMaterial(
                          index,
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

                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    value={
                      item.unit_price
                    }
                    onChange={(
                      event,
                    ) =>
                      updateMaterial(
                        index,
                        "unit_price",
                        event
                          .target
                          .value,
                      )
                    }
                    placeholder="단가(선택)"
                    style={
                      inputStyle
                    }
                  />

                  <input
                    value={
                      item.memo
                    }
                    onChange={(
                      event,
                    ) =>
                      updateMaterial(
                        index,
                        "memo",
                        event
                          .target
                          .value,
                      )
                    }
                    placeholder="자재 메모"
                    style={
                      inputStyle
                    }
                  />
                </div>
              ),
            )}
          </div>
        )}
      </section>

      {/* =====================================================
          경비
      ===================================================== */}

      <section
        style={
          sectionStyle
        }
      >
        <div
          style={
            sectionHeaderStyle
          }
        >
          <SectionTitle
            noMargin
          >
            💳 현장 경비
          </SectionTitle>

          <button
            type="button"
            onClick={
              addExpense
            }
            style={
              smallButtonStyle
            }
          >
            + 경비 추가
          </button>
        </div>

        {expenses.length ===
          0 ? (
          <EmptyText>
            등록할 경비가
            없으면 입력하지
            않아도 됩니다.
          </EmptyText>
        ) : (
          <div
            style={{
              display:
                "grid",
              gap:
                "12px",
            }}
          >
            {expenses.map(
              (
                item,
                index,
              ) => (
                <div
                  key={
                    index
                  }
                  style={
                    itemCardStyle
                  }
                >
                  <div
                    style={
                      itemHeaderStyle
                    }
                  >
                    <strong>
                      경비{" "}
                      {index +
                        1}
                    </strong>

                    <button
                      type="button"
                      onClick={() =>
                        removeExpense(
                          index,
                        )
                      }
                      style={
                        deleteButtonStyle
                      }
                    >
                      삭제
                    </button>
                  </div>

                  <div
                    style={
                      twoColumnStyle
                    }
                  >
                    <select
                      value={
                        item.expense_type
                      }
                      onChange={(
                        event,
                      ) =>
                        updateExpense(
                          index,
                          "expense_type",
                          event
                            .target
                            .value,
                        )
                      }
                      style={
                        inputStyle
                      }
                    >
                      {EXPENSE_TYPES.map(
                        (
                          option,
                        ) => (
                          <option
                            key={
                              option.value
                            }
                            value={
                              option.value
                            }
                          >
                            {
                              option.label
                            }
                          </option>
                        ),
                      )}
                    </select>

                    <input
                      type="date"
                      value={
                        item.expense_date
                      }
                      onChange={(
                        event,
                      ) =>
                        updateExpense(
                          index,
                          "expense_date",
                          event
                            .target
                            .value,
                        )
                      }
                      style={
                        inputStyle
                      }
                    />
                  </div>

                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    value={
                      item.amount
                    }
                    onChange={(
                      event,
                    ) =>
                      updateExpense(
                        index,
                        "amount",
                        event
                          .target
                          .value,
                      )
                    }
                    placeholder="금액"
                    style={
                      inputStyle
                    }
                  />

                  <input
                    value={
                      item.description
                    }
                    onChange={(
                      event,
                    ) =>
                      updateExpense(
                        index,
                        "description",
                        event
                          .target
                          .value,
                      )
                    }
                    placeholder="내용 예: 아파트 주차비"
                    style={
                      inputStyle
                    }
                  />
                </div>
              ),
            )}
          </div>
        )}

        <div
          style={{
            marginTop:
              "12px",
            padding:
              "12px",
            borderRadius:
              "10px",
            background:
              "#f8fafc",
            fontSize:
              "14px",
            fontWeight:
              "900",
            textAlign:
              "right",
          }}
        >
          경비 합계:{" "}
          {formatWon(
            expenseTotal,
          )}
        </div>
      </section>

      {/* =====================================================
          완료 사진
      ===================================================== */}

      <section
        style={
          sectionStyle
        }
      >
        <SectionTitle>
          📷 시공 완료 사진 *
        </SectionTitle>

        <label
          style={
            photoUploadStyle
          }
        >
          <span
            style={{
              fontSize:
                "26px",
            }}
          >
            📸
          </span>

          <span
            style={{
              fontWeight:
                "900",
            }}
          >
            완료 사진 선택
          </span>

          <span
            style={{
              fontSize:
                "12px",
              color:
                "#6b7280",
            }}
          >
            여러 장 선택 가능
          </span>

          <input
            type="file"
            accept="image/*"
            multiple
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
          <div
            style={{
              marginTop:
                "12px",
              display:
                "grid",
              gridTemplateColumns:
                "repeat(3, minmax(0, 1fr))",
              gap:
                "8px",
            }}
          >
            {photoPreviews.map(
              (
                item,
                index,
              ) => (
                <div
                  key={`${item.file?.name}-${index}`}
                  style={{
                    position:
                      "relative",
                    aspectRatio:
                      "1 / 1",
                    overflow:
                      "hidden",
                    borderRadius:
                      "10px",
                    background:
                      "#e5e7eb",
                  }}
                >
                  <img
                    src={
                      item.url
                    }
                    alt={`완료 사진 ${
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
                      top:
                        "5px",
                      right:
                        "5px",
                      width:
                        "28px",
                      height:
                        "28px",
                      border:
                        "none",
                      borderRadius:
                        "999px",
                      background:
                        "rgba(17,24,39,0.82)",
                      color:
                        "#ffffff",
                      fontWeight:
                        "900",
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
        )}
      </section>

      {/* =====================================================
          메시지
      ===================================================== */}

      {(localMessage ||
        message) && (
        <div
          style={{
            padding:
              "12px",
            borderRadius:
              "10px",
            background:
              "#fef3c7",
            color:
              "#92400e",
            fontSize:
              "13px",
            fontWeight:
              "800",
            whiteSpace:
              "pre-wrap",
          }}
        >
          {localMessage ||
            message}
        </div>
      )}

      {/* =====================================================
          버튼
      ===================================================== */}

      <div
        style={{
          display:
            "grid",
          gridTemplateColumns:
            "1fr 1.5fr",
          gap:
            "10px",
          paddingBottom:
            "8px",
        }}
      >
        <button
          type="button"
          disabled={
            saving
          }
          onClick={
            onCancel
          }
          style={{
            ...bottomButtonStyle,
            background:
              "#ffffff",
            color:
              "#374151",
            border:
              "1px solid #d1d5db",
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
            ...bottomButtonStyle,
            background:
              saving
                ? "#9ca3af"
                : "#111827",
            color:
              "#ffffff",
            border:
              "1px solid #111827",
          }}
        >
          {saving
            ? "저장 중..."
            : "시공 완료 저장"}
        </button>
      </div>
    </form>
  );
}

/* =========================================================
   작은 컴포넌트
========================================================= */

function SectionTitle({
  children,
  noMargin = false,
}) {
  return (
    <div
      style={{
        fontSize:
          "16px",
        fontWeight:
          "900",
        marginBottom:
          noMargin
            ? 0
            : "12px",
      }}
    >
      {children}
    </div>
  );
}

function FieldLabel({
  children,
}) {
  return (
    <div
      style={{
        marginTop:
          "10px",
        marginBottom:
          "6px",
        fontSize:
          "13px",
        fontWeight:
          "800",
        color:
          "#374151",
      }}
    >
      {children}
    </div>
  );
}

function InfoRow({
  label,
  value,
}) {
  return (
    <div
      style={{
        display:
          "grid",
        gridTemplateColumns:
          "80px 1fr",
        gap:
          "8px",
        fontSize:
          "13px",
        lineHeight:
          "1.5",
      }}
    >
      <div
        style={{
          color:
            "#6b7280",
          fontWeight:
            "700",
        }}
      >
        {label}
      </div>

      <div
        style={{
          color:
            "#111827",
          fontWeight:
            "800",
          wordBreak:
            "break-word",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function EmptyText({
  children,
}) {
  return (
    <div
      style={{
        padding:
          "14px",
        borderRadius:
          "10px",
        background:
          "#f8fafc",
        color:
          "#6b7280",
        fontSize:
          "13px",
        lineHeight:
          "1.5",
      }}
    >
      {children}
    </div>
  );
}

/* =========================================================
   스타일
========================================================= */

const sectionStyle = {
  padding:
    "16px",
  border:
    "1px solid #e5e7eb",
  borderRadius:
    "14px",
  background:
    "#ffffff",
};

const sectionHeaderStyle = {
  display:
    "flex",
  justifyContent:
    "space-between",
  alignItems:
    "center",
  gap:
    "10px",
  marginBottom:
    "12px",
};

const itemCardStyle = {
  padding:
    "12px",
  border:
    "1px solid #e5e7eb",
  borderRadius:
    "12px",
  background:
    "#f9fafb",
  display:
    "grid",
  gap:
    "8px",
};

const itemHeaderStyle = {
  display:
    "flex",
  justifyContent:
    "space-between",
  alignItems:
    "center",
  gap:
    "10px",
};

const twoColumnStyle = {
  display:
    "grid",
  gridTemplateColumns:
    "1fr 1fr",
  gap:
    "8px",
};

const inputStyle = {
  width:
    "100%",
  boxSizing:
    "border-box",
  padding:
    "11px 12px",
  border:
    "1px solid #d1d5db",
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

const smallButtonStyle = {
  padding:
    "8px 11px",
  border:
    "1px solid #d1d5db",
  borderRadius:
    "9px",
  background:
    "#ffffff",
  color:
    "#111827",
  fontSize:
    "12px",
  fontWeight:
    "900",
  cursor:
    "pointer",
};

const deleteButtonStyle = {
  padding:
    "5px 8px",
  border:
    "1px solid #fecaca",
  borderRadius:
    "8px",
  background:
    "#fff1f2",
  color:
    "#be123c",
  fontSize:
    "11px",
  fontWeight:
    "900",
  cursor:
    "pointer",
};

const photoUploadStyle = {
  minHeight:
    "110px",
  border:
    "2px dashed #cbd5e1",
  borderRadius:
    "12px",
  background:
    "#f8fafc",
  display:
    "flex",
  flexDirection:
    "column",
  alignItems:
    "center",
  justifyContent:
    "center",
  gap:
    "4px",
  cursor:
    "pointer",
};

const bottomButtonStyle = {
  minHeight:
    "48px",
  padding:
    "12px",
  borderRadius:
    "11px",
  fontSize:
    "14px",
  fontWeight:
    "900",
  cursor:
    "pointer",
};
