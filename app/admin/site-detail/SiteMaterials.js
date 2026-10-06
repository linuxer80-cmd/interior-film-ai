"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { supabase } from "../../../lib/supabase";

import {
  formatWon,
  formatQuantity,
} from "./siteDetailUtils";

const endpoint = "/api/admin/site-planned-materials";

const emptyForm = () => ({
  id: crypto.randomUUID(),
  brand: "",
  product_code: "",
  product_name: "",
  quantity: "",
  unit: "m",
  unit_price: "",
  memo: "",
});

const box = {
  border: "1px solid #e2e8f0",
  borderRadius: 16,
  padding: 16,
  background: "#fff",
  minWidth: 0,
};

const button = {
  padding: "11px 14px",
  border: "1px solid #cbd5e1",
  borderRadius: 12,
  background: "#fff",
  color: "#1e293b",
  fontWeight: 700,
  cursor: "pointer",
};

const input = {
  width: "100%",
  boxSizing: "border-box",
  padding: 12,
  border: "1px solid #cbd5e1",
  borderRadius: 10,
  fontSize: 16,
  background: "#fff",
  color: "#111827",
};

async function api(method, siteId, body, signal) {
  const { data, error } = await supabase.auth.getSession();

  if (error || !data.session?.access_token) {
    throw new Error("다시 로그인해주세요.");
  }

  const response = await fetch(
    method === "GET"
      ? `${endpoint}?siteId=${encodeURIComponent(siteId)}`
      : endpoint,
    {
      method,
      signal,
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
        "Content-Type": "application/json",
      },
      ...(method === "GET"
        ? {}
        : {
            body: JSON.stringify({
              ...body,
              siteId,
            }),
          }),
    }
  );

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      result.error || "자재 요청을 처리하지 못했습니다."
    );
  }

  return result;
}

export default function SiteMaterials({ site }) {
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [canWrite, setCanWrite] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const lock = useRef(false);
  const formRef = useRef(null);
  const loadController = useRef(null);

  const siteId = site?.id;

  const load = useCallback(async () => {
    loadController.current?.abort();

    const controller = new AbortController();
    loadController.current = controller;

    setLoading(true);

    try {
      const result = await api(
        "GET",
        siteId,
        null,
        controller.signal
      );

      if (controller.signal.aborted) return;

      setMaterials(result.materials);
      setCanWrite(result.canWrite);
    } catch (error) {
      if (!controller.signal.aborted) {
        setCanWrite(false);
        setMessage(
          error.message || "자재를 불러오지 못했습니다."
        );
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [siteId]);

  useEffect(() => {
    if (siteId) load();

    return () => {
      loadController.current?.abort();
    };
  }, [load, siteId]);

  useEffect(() => {
    if (form) {
      formRef.current?.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
    }
  }, [form?.id]);

  function openForm(material) {
    setMessage("");
    setEditing(Boolean(material));

    setForm(
      material
        ? {
            ...material,
            unit_price: material.unit_price ?? "",
            memo: material.memo || "",
            brand: material.brand || "",
            product_code: material.product_code || "",
            product_name: material.product_name || "",
          }
        : emptyForm()
    );
  }

  async function save(event) {
    event.preventDefault();

    if (lock.current || !canWrite) return;

    if (
      !form.product_code.trim() &&
      !form.product_name.trim()
    ) {
      setMessage("제품코드 또는 제품명을 입력해주세요.");
      return;
    }

    lock.current = true;
    setBusy(true);
    setMessage("");

    try {
      await api(
        editing ? "PATCH" : "POST",
        siteId,
        form
      );

      setForm(null);
      setMessage("예정 자재를 저장했습니다.");

      await load();
    } catch (error) {
      setMessage(
        error.message ||
          "저장하지 못했습니다. 입력 내용은 유지됩니다."
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function remove(material) {
    if (
      lock.current ||
      !canWrite ||
      !window.confirm(
        `${
          material.product_code || material.product_name
        } 예정 자재를 삭제할까요?`
      )
    ) {
      return;
    }

    lock.current = true;
    setBusy(true);
    setMessage("");

    try {
      await api("DELETE", siteId, {
        id: material.id,
      });

      if (form?.id === material.id) {
        setForm(null);
      }

      setMessage("예정 자재를 삭제했습니다.");

      await load();
    } catch (error) {
      setMessage(
        error.message || "삭제하지 못했습니다."
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  function field(key, label, props = {}) {
    return (
      <label
        style={{
          display: "grid",
          gap: 7,
          fontWeight: 600,
          minWidth: 0,
        }}
      >
        {label}

        <input
          style={input}
          value={form[key]}
          onChange={(event) =>
            setForm((value) => ({
              ...value,
              [key]: event.target.value,
            }))
          }
          {...props}
        />
      </label>
    );
  }

  return (
    <section
      style={{
        marginTop: 18,
        paddingTop: 14,
        borderTop: "1px solid #e2e8f0",
      }}
      aria-label="예정 시공 자재"
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 10,
          marginBottom: 14,
        }}
      >
        <h3
          style={{
            margin: 0,
            flex: 1,
          }}
        >
          📦 예정 시공 자재{" "}
          <small style={{ color: "#64748b" }}>
            {materials.length}건
          </small>
        </h3>

        <button
          type="button"
          style={button}
          disabled={busy || loading}
          onClick={() => {
            setMessage("");
            load();
          }}
        >
          새로고침
        </button>

        {canWrite && (
          <button
            type="button"
            style={{
              ...button,
              background: "#2563eb",
              color: "#fff",
            }}
            disabled={busy || loading}
            onClick={() => openForm(null)}
          >
            ＋ 자재 추가
          </button>
        )}
      </div>

      {message && (
        <p
          role="status"
          style={{
            ...box,
            background: "#f8fafc",
            overflowWrap: "anywhere",
          }}
        >
          {message}
        </p>
      )}

      {!loading &&
        !canWrite &&
        site?.status === "cancelled" && (
          <p>
            취소된 현장은 자재 조회만 가능합니다.
          </p>
        )}

      {form && (
        <form
          ref={formRef}
          onSubmit={save}
          style={{
            ...box,
            background: "#eff6ff",
            marginBottom: 16,
          }}
        >
          <h4 style={{ margin: "0 0 14px" }}>
            {editing
              ? "예정 자재 수정"
              : "예정 자재 추가"}
          </h4>

          <fieldset
            disabled={busy || !canWrite}
            style={{
              border: 0,
              padding: 0,
              margin: 0,
              display: "grid",
              gap: 14,
              minWidth: 0,
            }}
          >
            {field("brand", "브랜드", {
              placeholder: "예: 영림 인테리어필름",
              maxLength: 100,
            })}

            {field("product_code", "제품코드", {
              placeholder: "예: PX449",
              maxLength: 100,
            })}

            {field("product_name", "제품명", {
              placeholder: "예: 발렌블랑",
              maxLength: 200,
            })}

            <small>
              제품코드와 제품명 중 하나는 입력해주세요.
            </small>

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "minmax(0, 1fr) minmax(0, 1fr)",
                gap: 12,
              }}
            >
              {field("quantity", "예정 수량", {
                type: "number",
                inputMode: "decimal",
                min: "0.001",
                max: "1000000",
                step: "any",
                required: true,
              })}

              {field("unit", "단위", {
                placeholder: "m / 롤 / 개",
                maxLength: 20,
                required: true,
              })}
            </div>

            {field(
              "unit_price",
              "단가 (선택 · 원)",
              {
                type: "number",
                inputMode: "decimal",
                min: "0",
                max: "100000000",
                step: "any",
                placeholder: "미정이면 비워두세요",
              }
            )}

            <label
              style={{
                display: "grid",
                gap: 7,
                fontWeight: 600,
              }}
            >
              자재 메모

              <textarea
                style={{
                  ...input,
                  resize: "vertical",
                }}
                rows={3}
                maxLength={1000}
                placeholder="시공 부위 또는 자재 전달사항"
                value={form.memo}
                onChange={(event) =>
                  setForm((value) => ({
                    ...value,
                    memo: event.target.value,
                  }))
                }
              />
            </label>

            <div
              style={{
                display: "flex",
                gap: 10,
              }}
            >
              <button
                style={{
                  ...button,
                  background: "#2563eb",
                  color: "#fff",
                }}
                type="submit"
              >
                {busy ? "저장 중…" : "저장"}
              </button>

              <button
                style={button}
                type="button"
                onClick={() => setForm(null)}
              >
                취소
              </button>
            </div>
          </fieldset>
        </form>
      )}

      {loading ? (
        <p role="status">
          자재를 불러오는 중입니다…
        </p>
      ) : materials.length === 0 ? (
        <div
          style={{
            ...box,
            textAlign: "center",
            color: "#64748b",
          }}
        >
          등록된 예정 시공 자재가 없습니다.
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gap: 12,
          }}
        >
          {materials.map((material) => (
            <article
              key={material.id}
              style={{
                ...box,
                overflowWrap: "anywhere",
              }}
            >
              <strong style={{ fontSize: 18 }}>
                {material.product_code ||
                  material.product_name}
              </strong>

              <p
                style={{
                  margin: "8px 0",
                  color: "#64748b",
                }}
              >
                {[
                  material.brand,
                  material.product_name,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>

              <p>
                예정 수량:{" "}
                <b>
                  {formatQuantity(
                    material.quantity,
                    material.unit
                  )}
                </b>
              </p>

              {material.unit_price != null && (
                <p>
                  단가{" "}
                  {formatWon(material.unit_price)}
                  {" · "}
                  합계{" "}
                  {formatWon(material.total_price)}
                </p>
              )}

              {material.memo && (
                <p
                  style={{
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {material.memo}
                </p>
              )}

              {canWrite && (
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                  }}
                >
                  <button
                    type="button"
                    style={button}
                    disabled={busy || loading}
                    onClick={() => openForm(material)}
                  >
                    수정
                  </button>

                  <button
                    type="button"
                    style={{
                      ...button,
                      color: "#b91c1c",
                    }}
                    disabled={busy || loading}
                    onClick={() => remove(material)}
                  >
                    삭제
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
            }
