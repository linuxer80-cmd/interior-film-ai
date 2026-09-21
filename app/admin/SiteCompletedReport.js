"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  supabase,
} from "../../lib/supabase";

/* =========================================================
   기본 설정
========================================================= */

const PHOTO_BUCKET = "work-photos";

const SIGNED_URL_SECONDS = 1800;

const EXPENSE_LABELS = {
  parking: "주차비",
  meal: "식비",
  fuel: "유류비",
  toll: "통행료",
  material: "추가 자재비",
  other: "기타",
};

/* =========================================================
   공용 함수
========================================================= */

function formatWon(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "-";
  }

  const number = Number(value);

  if (
    !Number.isFinite(number)
  ) {
    return "-";
  }

  return `${number.toLocaleString(
    "ko-KR",
  )}원`;
}

function formatQuantity(
  value,
  unit,
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "-";
  }

  const number = Number(value);

  const quantity =
    Number.isFinite(number)
      ? number.toLocaleString(
          "ko-KR",
        )
      : String(value);

  return `${quantity}${
    unit ? ` ${unit}` : ""
  }`;
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return "-";
  }

  return new Intl.DateTimeFormat(
    "ko-KR",
    {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    },
  ).format(date);
}

function formatDate(value) {
  if (!value) {
    return "-";
  }

  const date =
    new Date(
      `${value}T00:00:00`,
    );

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "ko-KR",
    {
      year: "numeric",
      month: "long",
      day: "numeric",
    },
  ).format(date);
}

/* =========================================================
   완료보고 컴포넌트
========================================================= */

export default function SiteCompletedReport({
  companyId,
  site,
}) {
  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    message,
    setMessage,
  ] = useState("");

  const [
    report,
    setReport,
  ] = useState(null);

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

  /* =========================================================
     경비 합계
  ========================================================= */

  const expenseTotal =
    useMemo(() => {
      return expenses.reduce(
        (
          total,
          expense,
        ) => {
          const amount =
            Number(
              expense?.amount ||
                0,
            );

          return (
            total +
            (Number.isFinite(
              amount,
            )
              ? amount
              : 0)
          );
        },
        0,
      );
    }, [expenses]);

  /* =========================================================
     실제 자재 합계
  ========================================================= */

  const materialTotal =
    useMemo(() => {
      return materials.reduce(
        (
          total,
          material,
        ) => {
          const amount =
            Number(
              material?.total_price ||
                0,
            );

          return (
            total +
            (Number.isFinite(
              amount,
            )
              ? amount
              : 0)
          );
        },
        0,
      );
    }, [materials]);

  /* =========================================================
     완료보고 조회
  ========================================================= */

  useEffect(() => {
    if (
      !companyId ||
      !site?.id
    ) {
      return;
    }

    let cancelled = false;

    async function loadCompletedReport() {
      setLoading(true);
      setMessage("");

      try {
        /*
         * 1. 완료보고 본문
         */

        const {
          data: reportData,
          error: reportError,
        } =
          await supabase
            .from(
              "work_reports",
            )
            .select(
              `
                id,
                work_region,
                work_summary,
                memo,
                started_at,
                completed_at,
                worker_id,
                created_at
              `,
            )
            .eq(
              "company_id",
              companyId,
            )
            .eq(
              "site_id",
              site.id,
            )
            .maybeSingle();

        if (reportError) {
          throw reportError;
        }

        /*
         * 2. 실제 사용 자재
         *
         * 현장 등록 당시 planned 자재와
         * 섞이지 않도록 actual만 조회합니다.
         */

        const {
          data: materialData,
          error: materialError,
        } =
          await supabase
            .from(
              "site_materials",
            )
            .select(
              `
                id,
                brand,
                product_code,
                product_name,
                quantity,
                unit,
                unit_price,
                total_price,
                memo,
                material_type,
                created_at
              `,
            )
            .eq(
              "company_id",
              companyId,
            )
            .eq(
              "site_id",
              site.id,
            )
            .eq(
              "material_type",
              "actual",
            )
            .order(
              "created_at",
              {
                ascending: true,
              },
            );

        if (materialError) {
          throw materialError;
        }

        /*
         * 3. 현장 경비
         */

        const {
          data: expenseData,
          error: expenseError,
        } =
          await supabase
            .from(
              "site_expenses",
            )
            .select(
              `
                id,
                expense_type,
                amount,
                description,
                expense_date,
                created_at
              `,
            )
            .eq(
              "company_id",
              companyId,
            )
            .eq(
              "site_id",
              site.id,
            )
            .order(
              "expense_date",
              {
                ascending: true,
              },
            )
            .order(
              "created_at",
              {
                ascending: true,
              },
            );

        if (expenseError) {
          throw expenseError;
        }

        /*
         * 4. 시공 완료사진
         */

        const {
          data: photoData,
          error: photoError,
        } =
          await supabase
            .from(
              "site_photos",
            )
            .select(
              `
                id,
                photo_type,
                storage_path,
                photo_url,
                description,
                created_at
              `,
            )
            .eq(
              "company_id",
              companyId,
            )
            .eq(
              "site_id",
              site.id,
            )
            .eq(
              "photo_type",
              "after",
            )
            .order(
              "created_at",
              {
                ascending: true,
              },
            );

        if (photoError) {
          throw photoError;
        }

        /*
         * 5. private Storage
         * signed URL 생성
         */

        const signedPhotos =
          await Promise.all(
            (
              photoData || []
            ).map(
              async (
                photo,
              ) => {
                if (
                  !photo.storage_path
                ) {
                  return {
                    ...photo,

                    signed_url:
                      photo.photo_url ||
                      "",
                  };
                }

                const {
                  data:
                    signedData,

                  error:
                    signedError,
                } =
                  await supabase.storage
                    .from(
                      PHOTO_BUCKET,
                    )
                    .createSignedUrl(
                      photo.storage_path,
                      SIGNED_URL_SECONDS,
                    );

                if (
                  signedError
                ) {
                  console.error(
                    "완료사진 signed URL 오류:",
                    signedError,
                  );

                  return {
                    ...photo,
                    signed_url: "",
                  };
                }

                return {
                  ...photo,

                  signed_url:
                    signedData
                      ?.signedUrl ||
                    "",
                };
              },
            ),
          );

        if (cancelled) {
          return;
        }

        setReport(
          reportData || null,
        );

        setMaterials(
          materialData || [],
        );

        setExpenses(
          expenseData || [],
        );

        setPhotos(
          signedPhotos || [],
        );

        if (!reportData) {
          setMessage(
            "완료 상태이지만 저장된 완료보고 내용이 없습니다.",
          );
        }
      } catch (error) {
        console.error(
          "시공 완료보고 조회 오류:",
          error,
        );

        if (!cancelled) {
          setReport(null);
          setMaterials([]);
          setExpenses([]);
          setPhotos([]);

          setMessage(
            `완료보고를 불러오지 못했습니다: ${
              error?.message ||
              "알 수 없는 오류"
            }`,
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadCompletedReport();

    return () => {
      cancelled = true;
    };
  }, [
    companyId,
    site?.id,
  ]);

  /* =========================================================
     로딩
  ========================================================= */

  if (loading) {
    return (
      <div
        style={{
          marginTop: "18px",

          padding: "16px",

          border:
            "1px solid #e2e8f0",

          borderRadius: "12px",

          background: "#f8fafc",

          color: "#64748b",

          fontSize: "13px",

          textAlign: "center",
        }}
      >
        시공 완료보고를
        불러오는 중입니다...
      </div>
    );
  }

  /* =========================================================
     화면
  ========================================================= */

  return (
    <section
      style={{
        marginTop: "18px",

        paddingTop: "14px",

        borderTop:
          "1px solid #e5e7eb",
      }}
    >
      {/* =========================
          제목
      ========================= */}

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
              fontSize: "15px",

              fontWeight: "900",

              color: "#111827",
            }}
          >
            📋 시공 완료 보고
          </div>

          <div
            style={{
              marginTop: "4px",

              fontSize: "11px",

              lineHeight: "1.5",

              color: "#64748b",
            }}
          >
            실제 시공 결과와 사용
            자재, 경비, 완료사진입니다.
          </div>
        </div>

        <div
          style={{
            flex: "0 0 auto",

            padding:
              "5px 8px",

            borderRadius:
              "999px",

            background:
              "#dcfce7",

            color: "#166534",

            fontSize: "11px",

            fontWeight: "900",
          }}
        >
          완료
        </div>
      </div>

      {/* =========================
          메시지
      ========================= */}

      {message && (
        <div
          style={{
            marginTop: "12px",

            padding:
              "10px 12px",

            borderRadius:
              "10px",

            background:
              "#fff7ed",

            color: "#9a3412",

            fontSize: "12px",

            fontWeight: "700",

            lineHeight: "1.5",

            wordBreak:
              "break-word",
          }}
        >
          {message}
        </div>
      )}

      {/* =========================
          완료보고 기본정보
      ========================= */}

      {report && (
        <div
          style={{
            marginTop: "14px",

            padding: "14px",

            border:
              "1px solid #bbf7d0",

            borderRadius:
              "12px",

            background:
              "#f0fdf4",
          }}
        >
          <ReportRow
            label="완료 일시"
            value={formatDateTime(
              report.completed_at,
            )}
          />

          <ReportRow
            label="시공 지역"
            value={
              report.work_region ||
              "-"
            }
          />

          <ReportRow
            label="실제 작업"
            value={
              report.work_summary ||
              "-"
            }
          />

          <ReportRow
            label="메모"
            value={
              report.memo ||
              "-"
            }
            last
          />
        </div>
      )}

      {/* =========================
          실제 사용 자재
      ========================= */}

      <div
        style={{
          marginTop: "18px",
        }}
      >
        <SectionHeader
          title="📦 실제 사용 자재"
          count={`${materials.length}건`}
        />

        {materials.length ===
        0 ? (
          <EmptyBox
            text="등록된 실제 사용 자재가 없습니다."
          />
        ) : (
          <div
            style={{
              display: "grid",

              gap: "8px",
            }}
          >
            {materials.map(
              (
                material,
                index,
              ) => (
                <MaterialCard
                  key={
                    material.id
                  }
                  material={
                    material
                  }
                  index={
                    index
                  }
                />
              ),
            )}

            {materialTotal >
              0 && (
              <TotalBox
                label="실제 자재비 합계"
                value={formatWon(
                  materialTotal,
                )}
              />
            )}
          </div>
        )}
      </div>

      {/* =========================
          현장 경비
      ========================= */}

      <div
        style={{
          marginTop: "18px",
        }}
      >
        <SectionHeader
          title="💳 현장 경비"
          count={`${expenses.length}건`}
        />

        {expenses.length ===
        0 ? (
          <EmptyBox
            text="등록된 현장 경비가 없습니다."
          />
        ) : (
          <div
            style={{
              display: "grid",

              gap: "8px",
            }}
          >
            {expenses.map(
              (
                expense,
                index,
              ) => (
                <ExpenseCard
                  key={
                    expense.id
                  }
                  expense={
                    expense
                  }
                  index={
                    index
                  }
                />
              ),
            )}

            <TotalBox
              label="현장 경비 합계"
              value={formatWon(
                expenseTotal,
              )}
            />
          </div>
        )}
      </div>

      {/* =========================
          완료 사진
      ========================= */}

      <div
        style={{
          marginTop: "18px",
        }}
      >
        <SectionHeader
          title="📷 시공 완료사진"
          count={`${photos.length}장`}
        />

        {photos.length ===
        0 ? (
          <EmptyBox
            text="등록된 시공 완료사진이 없습니다."
          />
        ) : (
          <div
            style={{
              display: "grid",

              gridTemplateColumns:
                "repeat(2, minmax(0, 1fr))",

              gap: "8px",
            }}
          >
            {photos.map(
              (
                photo,
                index,
              ) => (
                <CompletedPhotoCard
                  key={
                    photo.id
                  }
                  photo={
                    photo
                  }
                  index={
                    index
                  }
                />
              ),
            )}
          </div>
        )}
      </div>
    </section>
  );
}

/* =========================================================
   하위 UI
========================================================= */

function SectionHeader({
  title,
  count,
}) {
  return (
    <div
      style={{
        display: "flex",

        alignItems: "center",

        justifyContent:
          "space-between",

        gap: "10px",

        marginBottom: "9px",
      }}
    >
      <div
        style={{
          fontSize: "13px",

          fontWeight: "900",

          color: "#111827",
        }}
      >
        {title}
      </div>

      <div
        style={{
          fontSize: "11px",

          fontWeight: "800",

          color: "#64748b",
        }}
      >
        {count}
      </div>
    </div>
  );
}

function ReportRow({
  label,
  value,
  last = false,
}) {
  return (
    <div
      style={{
        display: "grid",

        gridTemplateColumns:
          "82px 1fr",

        gap: "10px",

        padding:
          "9px 0",

        borderBottom: last
          ? "none"
          : "1px solid #dcfce7",

        fontSize: "12px",
      }}
    >
      <div
        style={{
          color: "#64748b",

          fontWeight: "800",
        }}
      >
        {label}
      </div>

      <div
        style={{
          color: "#111827",

          fontWeight: "700",

          whiteSpace:
            "pre-wrap",

          wordBreak:
            "break-word",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function MaterialCard({
  material,
  index,
}) {
  const title =
    material.product_code ||
    material.product_name ||
    `자재 ${index + 1}`;

  return (
    <div
      style={{
        padding: "12px",

        border:
          "1px solid #e2e8f0",

        borderRadius:
          "11px",

        background:
          "#f8fafc",
      }}
    >
      <div
        style={{
          display: "flex",

          alignItems:
            "flex-start",

          justifyContent:
            "space-between",

          gap: "8px",
        }}
      >
        <div
          style={{
            minWidth: 0,
          }}
        >
          <div
            style={{
              fontSize: "13px",

              fontWeight: "900",

              color: "#111827",

              wordBreak:
                "break-word",
            }}
          >
            {title}
          </div>

          {(material.brand ||
            material.product_name) && (
            <div
              style={{
                marginTop: "3px",

                fontSize: "11px",

                color: "#64748b",

                wordBreak:
                  "break-word",
              }}
            >
              {[
                material.brand,
                material.product_name,
              ]
                .filter(Boolean)
                .join(" · ")}
            </div>
          )}
        </div>

        <div
          style={{
            flex:
              "0 0 auto",

            padding:
              "4px 7px",

            borderRadius:
              "999px",

            background:
              "#ffffff",

            border:
              "1px solid #e2e8f0",

            fontSize:
              "11px",

            fontWeight:
              "800",

            color:
              "#334155",
          }}
        >
          {formatQuantity(
            material.quantity,
            material.unit,
          )}
        </div>
      </div>

      {(material.unit_price !==
        null &&
        material.unit_price !==
          undefined) ||
      (material.total_price !==
        null &&
        material.total_price !==
          undefined) ? (
        <div
          style={{
            marginTop: "9px",

            display: "grid",

            gap: "4px",

            fontSize: "11px",

            color: "#475569",
          }}
        >
          {material.unit_price !==
            null &&
            material.unit_price !==
              undefined && (
              <div>
                단가{" "}
                <strong>
                  {formatWon(
                    material.unit_price,
                  )}
                </strong>
              </div>
            )}

          {material.total_price !==
            null &&
            material.total_price !==
              undefined && (
              <div>
                합계{" "}
                <strong>
                  {formatWon(
                    material.total_price,
                  )}
                </strong>
              </div>
            )}
        </div>
      ) : null}

      {material.memo && (
        <div
          style={{
            marginTop: "8px",

            paddingTop: "8px",

            borderTop:
              "1px solid #e2e8f0",

            fontSize: "11px",

            color: "#64748b",

            whiteSpace:
              "pre-wrap",

            wordBreak:
              "break-word",
          }}
        >
          {material.memo}
        </div>
      )}
    </div>
  );
}

function ExpenseCard({
  expense,
  index,
}) {
  const label =
    EXPENSE_LABELS[
      expense.expense_type
    ] ||
    "기타";

  return (
    <div
      style={{
        padding: "12px",

        border:
          "1px solid #e2e8f0",

        borderRadius:
          "11px",

        background:
          "#f8fafc",
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
          }}
        >
          <div
            style={{
              fontSize: "12px",

              fontWeight: "900",

              color: "#111827",
            }}
          >
            {label}
          </div>

          <div
            style={{
              marginTop: "3px",

              fontSize: "10px",

              color: "#94a3b8",
            }}
          >
            {formatDate(
              expense.expense_date,
            )}
          </div>
        </div>

        <div
          style={{
            flex:
              "0 0 auto",

            fontSize: "13px",

            fontWeight: "900",

            color: "#111827",
          }}
        >
          {formatWon(
            expense.amount,
          )}
        </div>
      </div>

      {expense.description && (
        <div
          style={{
            marginTop: "8px",

            paddingTop: "8px",

            borderTop:
              "1px solid #e2e8f0",

            fontSize: "11px",

            color: "#64748b",

            whiteSpace:
              "pre-wrap",

            wordBreak:
              "break-word",
          }}
        >
          {expense.description}
        </div>
      )}
    </div>
  );
}

function CompletedPhotoCard({
  photo,
  index,
}) {
  if (!photo.signed_url) {
    return (
      <div
        style={{
          aspectRatio:
            "1 / 1",

          display: "flex",

          alignItems:
            "center",

          justifyContent:
            "center",

          padding: "10px",

          border:
            "1px solid #e2e8f0",

          borderRadius:
            "11px",

          background:
            "#f8fafc",

          color:
            "#94a3b8",

          fontSize:
            "11px",

          fontWeight:
            "700",

          textAlign:
            "center",
        }}
      >
        사진을 불러올 수
        없습니다.
      </div>
    );
  }

  return (
    <a
      href={
        photo.signed_url
      }
      target="_blank"
      rel="noreferrer"
      style={{
        position:
          "relative",

        display: "block",

        aspectRatio:
          "1 / 1",

        overflow:
          "hidden",

        borderRadius:
          "11px",

        border:
          "1px solid #e2e8f0",

        background:
          "#f8fafc",
      }}
    >
      <img
        src={
          photo.signed_url
        }
        alt={`시공 완료사진 ${
          index + 1
        }`}
        loading="lazy"
        style={{
          width: "100%",

          height: "100%",

          objectFit:
            "cover",

          display: "block",
        }}
      />

      <div
        style={{
          position:
            "absolute",

          left: "6px",

          bottom: "6px",

          padding:
            "3px 6px",

          borderRadius:
            "999px",

          background:
            "rgba(15,23,42,0.72)",

          color:
            "#ffffff",

          fontSize:
            "10px",

          fontWeight:
            "800",
        }}
      >
        완료사진 {index + 1}
      </div>
    </a>
  );
}

function TotalBox({
  label,
  value,
}) {
  return (
    <div
      style={{
        display: "flex",

        alignItems:
          "center",

        justifyContent:
          "space-between",

        gap: "10px",

        padding:
          "11px 12px",

        borderRadius:
          "10px",

        background:
          "#111827",

        color: "#ffffff",
      }}
    >
      <div
        style={{
          fontSize: "12px",

          fontWeight: "800",
        }}
      >
        {label}
      </div>

      <div
        style={{
          fontSize: "13px",

          fontWeight: "900",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function EmptyBox({
  text,
}) {
  return (
    <div
      style={{
        padding:
          "15px 12px",

        border:
          "1px dashed #cbd5e1",

        borderRadius:
          "11px",

        background:
          "#f8fafc",

        color:
          "#64748b",

        fontSize:
          "12px",

        textAlign:
          "center",
      }}
    >
      {text}
    </div>
  );
          }
