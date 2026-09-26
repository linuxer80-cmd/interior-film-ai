"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import {
  formatWon,
  formatQuantity,
} from "./siteDetailUtils";

/* =========================================================
   예정 시공 자재
========================================================= */

export default function SiteMaterials({
  site,
}) {
  const [materials, setMaterials] = useState([]);

  const [loading, setLoading] =
    useState(false);

  const [message, setMessage] =
    useState("");

  /* =======================================================
     예정 시공 자재 불러오기
  ======================================================= */

  const loadMaterials = useCallback(
    async () => {
      if (!site?.id) {
        setMaterials([]);
        setMessage("");
        return;
      }

      setLoading(true);
      setMessage("");

      try {
        const {
          data,
          error,
        } = await supabase
          .from("site_materials")
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
          .eq("site_id", site.id)
          .eq(
            "material_type",
            "planned",
          )
          .order("created_at", {
            ascending: true,
          });

        if (error) {
          throw error;
        }

        setMaterials(data || []);
      } catch (error) {
        console.error(
          "현장 예정 자재 로드 오류:",
          error,
        );

        setMaterials([]);

        setMessage(
          `❌ 예정 시공 자재를 불러오지 못했습니다: ${
            error?.message ||
            "알 수 없는 오류"
          }`,
        );
      } finally {
        setLoading(false);
      }
    },
    [site?.id],
  );

  /* =======================================================
     현장 변경 시 자재 다시 불러오기
  ======================================================= */

  useEffect(() => {
    loadMaterials();
  }, [loadMaterials]);

  /* =======================================================
     화면
  ======================================================= */

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
          alignItems: "center",
          justifyContent:
            "space-between",
          gap: "10px",
          marginBottom: "10px",
        }}
      >
        <div
          style={{
            fontSize: "14px",
            fontWeight: "900",
            color: "#111827",
          }}
        >
          📦 예정 시공 자재
        </div>

        {!loading && (
          <div
            style={{
              fontSize: "11px",
              fontWeight: "800",
              color: "#64748b",
            }}
          >
            {materials.length}건
          </div>
        )}
      </div>

      {/* =========================
          로딩
      ========================= */}

      {loading && (
        <LoadingBox />
      )}

      {/* =========================
          오류
      ========================= */}

      {!loading && message && (
        <MessageBox
          message={message}
        />
      )}

      {/* =========================
          자재 없음
      ========================= */}

      {!loading &&
        !message &&
        materials.length === 0 && (
          <EmptyBox
            text="등록된 예정 시공 자재가 없습니다."
          />
        )}

      {/* =========================
          자재 목록
      ========================= */}

      {!loading &&
        !message &&
        materials.length > 0 && (
          <div
            style={{
              display: "grid",
              gap: "8px",
            }}
          >
            {materials.map(
              (material, index) => (
                <MaterialCard
                  key={material.id}
                  material={material}
                  index={index}
                />
              ),
            )}
          </div>
        )}
    </section>
  );
}

/* =========================================================
   예정 자재 카드
========================================================= */

function MaterialCard({
  material,
  index,
}) {
  const title =
    material.product_code ||
    material.product_name ||
    `자재 ${index + 1}`;

  const hasUnitPrice =
    material.unit_price !== null &&
    material.unit_price !==
      undefined;

  const hasTotalPrice =
    material.total_price !== null &&
    material.total_price !==
      undefined;

  return (
    <div
      style={{
        padding: "12px",

        border:
          "1px solid #e2e8f0",

        borderRadius: "11px",

        background: "#f8fafc",
      }}
    >
      {/* =========================
          제품명 / 수량
      ========================= */}

      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
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
              wordBreak: "break-word",
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

                wordBreak: "break-word",
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
            flex: "0 0 auto",

            padding: "4px 7px",

            borderRadius: "999px",

            background: "#ffffff",

            border:
              "1px solid #e2e8f0",

            fontSize: "11px",
            fontWeight: "800",

            color: "#334155",
          }}
        >
          {formatQuantity(
            material.quantity,
            material.unit,
          )}
        </div>
      </div>

      {/* =========================
          단가 / 합계
      ========================= */}

      {(hasUnitPrice ||
        hasTotalPrice) && (
        <div
          style={{
            marginTop: "9px",

            display: "grid",

            gap: "4px",

            fontSize: "11px",

            color: "#475569",
          }}
        >
          {hasUnitPrice && (
            <div>
              단가{" "}
              <strong>
                {formatWon(
                  material.unit_price,
                )}
              </strong>
            </div>
          )}

          {hasTotalPrice && (
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
      )}

      {/* =========================
          자재 메모
      ========================= */}

      {material.memo && (
        <div
          style={{
            marginTop: "8px",

            paddingTop: "8px",

            borderTop:
              "1px solid #e2e8f0",

            fontSize: "11px",

            color: "#64748b",

            whiteSpace: "pre-wrap",

            wordBreak: "break-word",
          }}
        >
          {material.memo}
        </div>
      )}
    </div>
  );
}

/* =========================================================
   로딩
========================================================= */

function LoadingBox() {
  return (
    <div
      style={{
        padding: "16px 12px",

        border:
          "1px dashed #cbd5e1",

        borderRadius: "11px",

        background: "#f8fafc",

        color: "#64748b",

        fontSize: "12px",

        textAlign: "center",
      }}
    >
      예정 시공 자재를
      불러오는 중입니다...
    </div>
  );
}

/* =========================================================
   오류 메시지
========================================================= */

function MessageBox({
  message,
}) {
  return (
    <div
      style={{
        padding: "11px 12px",

        borderRadius: "10px",

        background: "#fef2f2",

        color: "#b91c1c",

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
   빈 데이터
========================================================= */

function EmptyBox({
  text,
}) {
  return (
    <div
      style={{
        padding: "16px 12px",

        border:
          "1px dashed #cbd5e1",

        borderRadius: "11px",

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
