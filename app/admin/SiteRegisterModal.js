"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { quoteSeed } from "../../lib/consultationQuote";
import WorkDatePicker from "./WorkDatePicker";
import { koreanDay } from "../utils/workerCalendar";
import CallContentAiInput from "./site-register/CallContentAiInput";
import CustomerChoice from "./site-register/CustomerChoice";
import ScreenshotSiteInput from "./site-register/ScreenshotSiteInput";
import { tradeApi } from "../components/TradeClients";

const emptyForm = {
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

const emptyCustomer = {
  type: "personal",
  clientId: "",
  contactId: "",
  name: "",
  phone: "",
};

const material = () => ({
  local_id: crypto.randomUUID(),
  film_product_id: null,
  brand: "",
  product_code: "",
  product_name: "",
  unit: "m",
  unit_price: "",
  memo: "",
});

export default function SiteRegisterModal({
  open,
  onClose,
  createSite,
  loading = false,
}) {
  const [consultation, setConsultation] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [customer, setCustomer] = useState(emptyCustomer);
  const [materials, setMaterials] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [screenshotBusy, setScreenshotBusy] = useState(false);
  const [saved, setSaved] = useState(null);

  const lock = useRef(false);
  const pendingLink = useRef(null);

  const previews = useMemo(
    () => photos.map((file) => ({
      file,
      url: URL.createObjectURL(file),
    })),
    [photos]
  );

  useEffect(
    () => () => {
      previews.forEach((item) =>
        URL.revokeObjectURL(item.url)
      );
    },
    [previews]
  );

  useEffect(() => {
    if (!open) return;

    setConsultation(null);
    setForm({ ...emptyForm, work_dates: [] });
    setCustomer({ ...emptyCustomer });
    setMaterials([]);
    setPhotos([]);
    setMessage("");
    setSaved(null);
    pendingLink.current = null;
  }, [open]);

  const blocked = busy || loading || screenshotBusy;

  function field(key, value) {
    setForm((previous) => ({
      ...previous,
      [key]: value,
    }));
  }

  function choose(next) {
    setCustomer(next);

    setForm((previous) => ({
      ...previous,
      customer_name: next.name,
      customer_phone: next.phone,
    }));
  }

  function applyAnalysis(data, origin = "call") {
    if (!data || typeof data !== "object") return;

    setConsultation((previous) => {
      const next = quoteSeed(data);

      return {
        ...next,
        items: [
          ...new Map(
            [
              ...(previous?.items || []),
              ...next.items,
            ].map((item) => [JSON.stringify(item), item])
          ).values(),
        ],
        other_schedule: [
          previous?.other_schedule,
          next.other_schedule,
        ]
          .filter(Boolean)
          .filter((value, index, array) =>
            array.indexOf(value) === index
          )
          .join("\n"),
      };
    });

    setForm((previous) => {
      const next = {
        ...previous,
        source: origin === "screenshot" ? "other" : "phone",
      };

      Object.keys(emptyForm)
        .filter((key) =>
          ![
            "work_dates",
            "contract_amount",
            "deposit_amount",
          ].includes(key)
        )
        .forEach((key) => {
          if (
            customer.type === "business" &&
            ["customer_name", "customer_phone"].includes(key)
          ) {
            return;
          }

          if (
            data[key] != null &&
            String(data[key]).trim() &&
            (
              origin !== "screenshot" ||
              key === "source" ||
              !String(previous[key] ?? "").trim()
            )
          ) {
            next[key] = String(data[key]).trim();
          }
        });

      next.work_dates = [
        ...new Set([
          ...previous.work_dates,
          ...(
            Array.isArray(data.work_dates)
              ? data.work_dates
              : [data.date]
          )
            .filter(Boolean)
            .map(koreanDay)
            .filter(Boolean),
        ]),
      ].sort();

      return next;
    });

    if (Array.isArray(data.materials)) {
      setMaterials((previous) => [
        ...previous,
        ...data.materials
          .filter((item) =>
            item && typeof item === "object"
          )
          .map((item) => ({
            ...material(),
            ...Object.fromEntries(
              [
                "brand",
                "product_code",
                "product_name",
                "unit",
                "memo",
              ]
                .filter((key) => item[key] != null)
                .map((key) => [key, String(item[key])])
            ),
          })),
      ]);
    }

    setMessage(
      origin === "screenshot"
        ? "상담중 현장으로 등록합니다. 견적서 초안은 현장 상세의 상담 견적서에서 확인하고 가격을 직접 입력하세요."
        : "상담중 현장으로 등록합니다. 견적서 초안은 현장 상세에서 확인하세요."
    );
  }

  async function finishLink() {
    await tradeApi(pendingLink.current);
    pendingLink.current = null;

    window.dispatchEvent(new Event("trade-clients-changed"));
    onClose();
  }

  async function submit(event) {
    event.preventDefault();

    if (lock.current || loading || screenshotBusy) return;

    lock.current = true;
    setBusy(true);
    setMessage("");

    try {
      if (saved) {
        if (pendingLink.current) await finishLink();
        return;
      }

      if (
        customer.type === "business" &&
        !customer.clientId
      ) {
        throw Error("거래처를 선택해주세요.");
      }

      const days = [
        ...new Set(
          form.work_dates
            .filter(Boolean)
            .map(koreanDay)
            .filter(Boolean)
        ),
      ].sort();

      if (days.length > 366) {
        throw Error(
          "시공일은 최대 366일까지 선택할 수 있습니다."
        );
      }

      let customerName = form.customer_name;
      let customerPhone = form.customer_phone;

      if (customer.type === "business") {
        const data = await tradeApi();

        const client = data.clients?.find(
          (item) => item.id === customer.clientId
        );

        const person = data.contacts?.find(
          (item) =>
            item.id === customer.contactId &&
            item.client_id === customer.clientId
        );

        if (
          !client ||
          (customer.contactId && !person)
        ) {
          throw Error(
            "거래처 또는 담당자가 변경됐습니다. 다시 선택해주세요."
          );
        }

        customerName = client.name;
        customerPhone = person?.phone || client.phone || "";
      }

      const result = await createSite({
        ...form,
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_type: customer.type,
        work_dates: days,
        schedule_date: days[0] || null,
        schedule_start: days.length
          ? new Date(`${days[0]}T00:00:00+09:00`).toISOString()
          : null,
        schedule_end: days.length
          ? new Date(
              `${days.at(-1)}T23:59:00+09:00`
            ).toISOString()
          : null,
        status: consultation
          ? "consulting"
          : days.length
            ? "scheduled"
            : "consulting",
        consultation_quote_seed: consultation
          ? {
              ...consultation,
              work_date: days.join(", "),
            }
          : null,
        materials: materials
          .filter((item) =>
            item.product_code.trim() ||
            item.product_name.trim()
          )
          .map((item) => ({
            ...item,
            quantity: 0,
            total_price:
              item.unit_price === "" ? null : 0,
          })),
        request_photos: photos,
      });

      if (result?.site?.id) {
        setSaved(result.site);

        if (customer.type === "business") {
          pendingLink.current = {
            action: "link",
            siteId: result.site.id,
            clientId: customer.clientId,
            contactId: customer.contactId || null,
            revision: 0,
            requestId: crypto.randomUUID(),
          };
        }
      }

      if (!result?.success) {
        if (pendingLink.current) {
          try {
            await tradeApi(pendingLink.current);
            pendingLink.current = null;

            window.dispatchEvent(
              new Event("trade-clients-changed")
            );
          } catch {
            // 같은 요청으로 거래처 연결을 다시 시도합니다.
          }
        }

        throw Error(
          result?.error || "현장 등록에 실패했습니다."
        );
      }

      if (pendingLink.current) {
        await finishLink();
      } else {
        window.dispatchEvent(
          new Event("trade-clients-changed")
        );
        onClose();
      }
    } catch (error) {
      setMessage(error.message || "저장에 실패했습니다.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  if (!open) return null;

  const inputs = (items) =>
    items.map(([key, label, type = "text"]) => (
      <label key={key}>
        {label}
        <input
          type={type}
          min={type === "number" ? 0 : undefined}
          value={form[key]}
          readOnly={
            customer.type === "business" &&
            ["customer_name", "customer_phone"].includes(key)
          }
          onChange={(event) => field(key, event.target.value)}
        />
      </label>
    ));

  return (
    <div
      className="site-register-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="현장 등록"
    >
      <div className="site-register-panel">
        <header>
          <h2>
            {consultation ? "상담중 현장 등록" : "현장 등록"}
          </h2>
          <button
            type="button"
            disabled={blocked}
            onClick={onClose}
          >
            닫기
          </button>
        </header>

        <form onSubmit={submit}>
          <fieldset
            disabled={blocked || !!saved}
            className="site-register-fields"
          >
            <ScreenshotSiteInput
              onApply={(data) =>
                applyAnalysis(data, "screenshot")
              }
              disabled={busy || loading || !!saved}
              onBusyChange={setScreenshotBusy}
            />

            <CallContentAiInput
              onApply={applyAnalysis}
              disabled={blocked || !!saved}
            />

            <section>
              <h3>시공 일정</h3>
              <p>
                실제 시공일을 선택하세요.
                미선택 시 상담중으로 등록합니다.
              </p>
              <WorkDatePicker
                value={form.work_dates}
                onChange={(value) =>
                  field("work_dates", value)
                }
                disabled={blocked || !!saved}
              />
            </section>

            <section>
              <h3>고객 / 현장</h3>

              <CustomerChoice
                value={customer}
                onChange={choose}
                disabled={blocked || !!saved}
              />

              <div className="site-register-grid">
                {inputs([
                  [
                    "customer_name",
                    customer.type === "business"
                      ? "업체명"
                      : "고객명",
                  ],
                  ["customer_phone", "전화번호", "tel"],
                ])}
              </div>

              {inputs([
                ["site_name", "현장명"],
                ["address", "주소"],
              ])}

              <div className="site-register-grid">
                {inputs([
                  ["address_detail", "상세주소"],
                  ["region", "지역"],
                ])}
              </div>
            </section>

            <section>
              <h3>시공 내용</h3>

              {inputs([["work_type", "시공 종류"]])}

              <label>
                상세 작업내용
                <textarea
                  rows={3}
                  value={form.work_description}
                  onChange={(event) =>
                    field("work_description", event.target.value)
                  }
                />
              </label>
            </section>

            <section>
              <h3>시공 자재</h3>

              <button
                type="button"
                onClick={() =>
                  setMaterials((previous) => [
                    ...previous,
                    material(),
                  ])
                }
              >
                + 자재 추가
              </button>

              {materials.map((item, index) => (
                <div
                  className="site-register-material"
                  key={item.local_id}
                >
                  <strong>자재 {index + 1}</strong>

                  <button
                    type="button"
                    onClick={() =>
                      setMaterials((previous) =>
                        previous.filter((row) =>
                          row.local_id !== item.local_id
                        )
                      )
                    }
                  >
                    삭제
                  </button>

                  {[
                    ["brand", "브랜드"],
                    ["product_code", "제품코드"],
                    ["product_name", "제품명 / 색상"],
                    ["unit_price", "원가 단가 (선택)"],
                    ["memo", "자재 메모"],
                  ].map(([key, label]) => (
                    <label key={key}>
                      {label}
                      <input
                        type={
                          key === "unit_price"
                            ? "number"
                            : "text"
                        }
                        min={key === "unit_price" ? 0 : undefined}
                        value={item[key]}
                        onChange={(event) =>
                          setMaterials((previous) =>
                            previous.map((row) =>
                              row.local_id === item.local_id
                                ? {
                                    ...row,
                                    [key]: event.target.value,
                                  }
                                : row
                            )
                          )
                        }
                      />
                    </label>
                  ))}

                  <label>
                    단위
                    <select
                      value={item.unit}
                      onChange={(event) =>
                        setMaterials((previous) =>
                          previous.map((row) =>
                            row.local_id === item.local_id
                              ? {
                                  ...row,
                                  unit: event.target.value,
                                }
                              : row
                          )
                        )
                      }
                    >
                      <option value="m">m</option>
                      <option value="m2">㎡</option>
                      <option value="roll">롤</option>
                      <option value="ea">개</option>
                    </select>
                  </label>
                </div>
              ))}
            </section>

            <section>
              <h3>시공 요청사진</h3>

              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(event) => {
                  const selected = Array.from(
                    event.target.files || []
                  ).filter((file) =>
                    file.type.startsWith("image/")
                  );

                  setPhotos((previous) => [
                    ...previous,
                    ...selected,
                  ]);

                  event.target.value = "";
                }}
              />

              <div className="site-register-grid">
                {previews.map((item, index) => (
                  <div key={item.url}>
                    <img
                      src={item.url}
                      alt={`요청사진 ${index + 1}`}
                      style={{
                        width: "100%",
                        height: 140,
                        objectFit: "cover",
                      }}
                    />

                    <button
                      type="button"
                      onClick={() =>
                        setPhotos((previous) =>
                          previous.filter(
                            (_, photoIndex) =>
                              index !== photoIndex
                          )
                        )
                      }
                    >
                      사진 삭제
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h3>계약 정보</h3>

              <div className="site-register-grid">
                {inputs([
                  ["contract_amount", "계약금액", "number"],
                  ["deposit_amount", "계약금 / 선금", "number"],
                ])}
              </div>

              <label>
                접수 경로
                <select
                  value={form.source}
                  onChange={(event) =>
                    field("source", event.target.value)
                  }
                >
                  {[
                    ["phone", "전화"],
                    ["ai_estimate", "AI 견적"],
                    ["lead", "고객 상담"],
                    ["direct", "직접 등록"],
                    ["other", "기타"],
                  ].map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </section>

            <section>
              <label>
                메모
                <textarea
                  rows={3}
                  value={form.memo}
                  onChange={(event) =>
                    field("memo", event.target.value)
                  }
                />
              </label>
            </section>
          </fieldset>

          {message && (
            <p
              role="alert"
              style={{
                whiteSpace: "pre-wrap",
                color: "#b91c1c",
              }}
            >
              {message}
            </p>
          )}

          {saved && (
            <p>
              현장은 이미 등록됐습니다. 다시 등록하지 마세요.{" "}
              {pendingLink.current
                ? "아래 버튼으로 거래처 연결만 다시 시도하세요."
                : "현장 상세에서 추가정보를 확인해주세요."}
            </p>
          )}

          <footer>
            <button
              type="button"
              disabled={blocked}
              onClick={onClose}
            >
              닫기
            </button>

            {(!saved || pendingLink.current) && (
              <button type="submit" disabled={blocked}>
                {blocked
                  ? "저장 중…"
                  : saved
                    ? "거래처 연결 재시도"
                    : "현장 등록"}
              </button>
            )}
          </footer>
        </form>
      </div>

      <style jsx>{`
        .site-register-overlay {
          position: fixed;
          inset: 0;
          background: #0008;
          z-index: 2000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 12px;
        }
        .site-register-panel {
          background: #f8fafc;
          border-radius: 20px;
          width: 100%;
          max-width: 760px;
          max-height: 94dvh;
          overflow: auto;
          padding: 18px;
          box-sizing: border-box;
        }
        header, footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
        }
        header {
          position: sticky;
          top: -18px;
          background: #f8fafc;
          z-index: 2;
          padding: 10px 0;
        }
        h2 {
          margin: 0;
        }
        h3 {
          margin-top: 0;
        }
        .site-register-fields {
          border: 0;
          padding: 0;
          margin: 0;
          min-width: 0;
        }
        section {
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          padding: 16px;
          margin: 16px 0;
        }
        .site-register-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }
        .site-register-material {
          border: 1px solid #ddd;
          border-radius: 10px;
          padding: 12px;
          margin-top: 12px;
        }
        .site-register-panel :global(label) {
          display: block;
          margin: 10px 0;
          font-weight: 700;
        }
        .site-register-panel :global(input:not([type="radio"])),
        .site-register-panel :global(select),
        .site-register-panel :global(textarea) {
          display: block;
          box-sizing: border-box;
          width: 100%;
          padding: 12px;
          margin-top: 6px;
          border: 1px solid #cbd5e1;
          border-radius: 9px;
          font-size: 16px;
          background: white;
          color: #111827;
        }
        button {
          padding: 12px;
          border: 1px solid #cbd5e1;
          border-radius: 10px;
          background: white;
          cursor: pointer;
        }
        button:disabled {
          opacity: .5;
          cursor: default;
        }
        button[type="submit"] {
          background: #243648;
          color: white;
        }
        p {
          line-height: 1.6;
        }
        footer {
          padding: 14px 0;
        }
      `}</style>
    </div>
  );
                    }
