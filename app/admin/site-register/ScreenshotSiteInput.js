"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../../../lib/supabase";
import {
  screenshotFields,
  validScreenshotDate,
} from "../../../lib/siteScreenshot";

async function prepareImage(file) {
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size > 20000000
  ) {
    throw Error(
      "JPG·PNG·WEBP 사진을 선택해주세요. 원본은 장당 20MB까지 가능합니다."
    );
  }

  const image = await createImageBitmap(file);

  try {
    if (
      image.width * image.height > 40000000 ||
      image.height > 10000
    ) {
      throw Error(
        "너무 긴 캡처는 글자가 작아집니다. 여러 장으로 나눠주세요."
      );
    }

    const ratio = Math.min(
      1,
      2400 / Math.max(image.width, image.height)
    );

    const canvas = document.createElement("canvas");

    canvas.width = Math.max(
      1,
      Math.round(image.width * ratio)
    );
    canvas.height = Math.max(
      1,
      Math.round(image.height * ratio)
    );

    const ctx = canvas.getContext("2d");

    if (!ctx) {
      throw Error(
        "이미지를 준비하지 못했습니다. 다른 브라우저에서 다시 시도해주세요."
      );
    }

    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.88)
    );

    if (!blob) throw Error("사진 변환에 실패했습니다.");

    return new File([blob], "screenshot.jpg", {
      type: "image/jpeg",
    });
  } finally {
    image.close();
  }
}

async function token() {
  const { data, error } = await supabase.auth.getSession();

  if (error || !data?.session?.access_token) {
    throw Error("다시 로그인해주세요.");
  }

  return data.session.access_token;
}

export default function ScreenshotSiteInput({
  disabled = false,
  onApply,
  onBusyChange,
}) {
  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [referenceDate, setReferenceDate] = useState("");
  const [draft, setDraft] = useState(null);
  const [dates, setDates] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [usage, setUsage] = useState(null);
  const [code, setCode] = useState("");

  const lock = useRef(false);
  const requestId = useRef(null);
  const alive = useRef(true);
  const applied = useRef(false);

  useEffect(() => {
    alive.current = true;

    (async () => {
      try {
        const response = await fetch(
          "/api/admin/site-screenshot",
          {
            headers: {
              Authorization: `Bearer ${await token()}`,
            },
            cache: "no-store",
          }
        );

        const data = await response.json();

        if (alive.current) {
          if (response.ok) {
            setUsage(data.usage);
          } else {
            setError(
              data.error || "사용량을 확인하지 못했습니다."
            );
          }
        }
      } catch {
        if (alive.current) {
          setError(
            "사용량을 확인하지 못했습니다. 분석 시 다시 확인합니다."
          );
        }
      }
    })();

    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    const urls = files.map((file) =>
      URL.createObjectURL(file)
    );

    setPreviews(urls);

    return () => urls.forEach((url) =>
      URL.revokeObjectURL(url)
    );
  }, [files]);

  function activity(value) {
    lock.current = value;
    setBusy(value);
    onBusyChange?.(value);
  }

  function invalidate() {
    requestId.current = null;
    setDraft(null);
    setCode("");
    setMessage("");
    applied.current = false;
  }

  async function select(event) {
    const chosen = Array.from(event.target.files || []);
    event.target.value = "";

    if (disabled || lock.current || !chosen.length) return;

    if (files.length + chosen.length > 5) {
      setError("한 현장당 사진은 최대 5장입니다.");
      return;
    }

    activity(true);
    setError("");

    try {
      const next = [...files];

      for (const file of chosen) {
        next.push(await prepareImage(file));
      }

      if (
        next.reduce((sum, file) => sum + file.size, 0) >
        3500000
      ) {
        throw Error(
          "사진 용량이 큽니다. 장수를 줄이거나 필요한 대화 부분만 잘라주세요."
        );
      }

      if (alive.current) {
        setFiles(next);
        invalidate();
      }
    } catch (err) {
      if (alive.current) setError(err.message);
    } finally {
      activity(false);
    }
  }

  async function analyze() {
    if (disabled || lock.current || !files.length) return;

    activity(true);
    setError("");
    setMessage("");
    setCode("");

    requestId.current ||= crypto.randomUUID();

    try {
      const form = new FormData();

      form.append("requestId", requestId.current);
      form.append("referenceDate", referenceDate);
      files.forEach((file) => form.append("images", file));

      const response = await fetch(
        "/api/admin/site-screenshot",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${await token()}`,
          },
          body: form,
          signal: AbortSignal.timeout(65000),
        }
      );

      const result = await response.json();

      if (!alive.current) return;

      if (result.usage) setUsage(result.usage);

      if (!response.ok) {
        setCode(result.code || "");

        if (result.code === "RETRY_NEW") {
          requestId.current = null;
        }

        throw Error(result.error || "분석에 실패했습니다.");
      }

      setDraft(result.data);
      setDates(result.data.work_dates.join(", "));
      applied.current = false;
      setMessage(
        "분석 완료 · 아래 내용을 확인하고 등록창에 반영하세요."
      );
    } catch (err) {
      if (alive.current) {
        setError(
          err.name === "TimeoutError"
            ? "응답 확인이 지연됩니다. 같은 사진으로 결과를 다시 확인하면 중복 차감을 방지합니다."
            : err.message
        );
      }
    } finally {
      activity(false);
    }
  }

  function apply() {
    if (
      applied.current ||
      !draft ||
      disabled ||
      lock.current
    ) {
      return;
    }

    const days = dates.split(/[,\s]+/).filter(Boolean);

    if (days.some((date) => !validScreenshotDate(date))) {
      setError(
        "시공일을 YYYY-MM-DD 형식으로 입력해주세요. 여러 날짜는 쉼표로 구분합니다."
      );
      return;
    }

    for (const key of ["contract_amount", "deposit_amount"]) {
      if (
        draft[key] &&
        (
          !/^\d+$/.test(draft[key]) ||
          !Number.isSafeInteger(Number(draft[key])) ||
          Number(draft[key]) > 100000000000
        )
      ) {
        setError(
          "금액은 원 단위의 0 이상 정수로 입력해주세요."
        );
        return;
      }
    }

    onApply({
      ...draft,
      work_dates: [...new Set(days)].sort(),
      source: "other",
    });

    applied.current = true;
    setDraft(null);
    setFiles([]);
    requestId.current = null;
    setError("");
    setMessage(
      "등록창에 반영했습니다. 아래 내용과 날짜를 확인한 뒤 현장 등록을 눌러주세요."
    );
  }

  return (
    <section className="screenshot-input" aria-busy={busy}>
      <h3>문자·카톡 사진으로 현장 입력</h3>

      <p>
        한 현장의 대화 사진을 최대 5장 선택하세요.
        분석 성공 시 1회 사용하며, 직접 수정과 현장 저장에는
        추가 차감이 없습니다.
      </p>

      {usage && (
        <p className="quota">
          {usage.planName} ·{" "}
          {usage.period === "lifetime" ? "체험 누적" : "이번 달"}{" "}
          {usage.used}/{usage.limit}회 사용 ·{" "}
          {usage.remaining}회 남음
          {usage.pending > 0
            ? ` · 처리 중 ${usage.pending}건`
            : ""}
        </p>
      )}

      <label>
        대화 스크린샷 추가
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          disabled={disabled || busy}
          onChange={select}
        />
      </label>

      <div className="previews">
        {previews.map((url, index) => (
          <div key={url}>
            <img src={url} alt={`대화 사진 ${index + 1}`} />
            <button
              type="button"
              disabled={disabled || busy}
              onClick={() => {
                setFiles((list) =>
                  list.filter((_, i) => i !== index)
                );
                invalidate();
              }}
            >
              사진 {index + 1} 삭제
            </button>
          </div>
        ))}
      </div>

      <label>
        대화 기준일 (선택)
        <input
          type="date"
          value={referenceDate}
          disabled={disabled || busy}
          onChange={(event) => {
            setReferenceDate(event.target.value);
            invalidate();
          }}
        />
      </label>

      <p>
        “내일”, “다음 주”가 있으면 실제 대화한 날짜를 지정하세요.
        모르면 비워두세요. 사진은 분석을 위해 AI에 전송되며
        현장 사진첩에는 저장하지 않습니다.
      </p>

      <button
        type="button"
        className="primary"
        disabled={
          disabled || busy || !files.length || !!draft
        }
        onClick={analyze}
      >
        {busy
          ? "사진 준비·분석 중…"
          : requestId.current
            ? "결과 다시 확인"
            : "AI 분석 · 1회 사용"}
      </button>

      {error && (
        <p className="error" role="alert">{error}</p>
      )}

      {code === "LIMIT" && (
        <a href="/admin/billing">요금제 확인하기 →</a>
      )}

      {message && <p role="status">{message}</p>}

      {draft && (
        <div className="review">
          <h4>분석 결과 확인</h4>

          <p>
            이미 입력한 일반 항목은 유지하고 빈칸만 채웁니다.
            시공일과 자재는 추가됩니다.
          </p>

          {!!draft.warnings?.length && (
            <ul className="warning">
              {draft.warnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          )}

          {Object.entries(screenshotFields)
            .filter(([key]) => !key.endsWith("amount"))
            .map(([key, label]) => (
              <label key={key}>
                {label}
                {["memo", "work_description"].includes(key)
                  ? (
                    <textarea
                      rows={3}
                      value={draft[key]}
                      disabled={disabled || busy}
                      onChange={(event) =>
                        setDraft((previous) => ({
                          ...previous,
                          [key]: event.target.value,
                        }))
                      }
                    />
                  )
                  : (
                    <input
                      value={draft[key]}
                      disabled={disabled || busy}
                      inputMode={
                        key.endsWith("amount")
                          ? "numeric"
                          : undefined
                      }
                      onChange={(event) =>
                        setDraft((previous) => ({
                          ...previous,
                          [key]: event.target.value,
                        }))
                      }
                    />
                  )}
              </label>
            ))}

          <label>
            시공일 (예: 2026-10-13, 2026-10-16)
            <input
              value={dates}
              disabled={disabled || busy}
              onChange={(event) =>
                setDates(event.target.value)
              }
            />
          </label>

          {draft.materials.map((item, index) => (
            <div className="material" key={index}>
              <strong>자재 {index + 1}</strong>

              {[
                ["brand", "브랜드"],
                ["product_code", "제품번호"],
                ["product_name", "제품명 / 색상"],
                ["memo", "적용 부위 / 수량 메모"],
              ].map(([key, label]) => (
                <label key={key}>
                  {label}
                  <input
                    value={item[key]}
                    disabled={disabled || busy}
                    onChange={(event) =>
                      setDraft((previous) => ({
                        ...previous,
                        materials: previous.materials.map(
                          (material, i) =>
                            i === index
                              ? {
                                  ...material,
                                  [key]: event.target.value,
                                }
                              : material
                        ),
                      }))
                    }
                  />
                </label>
              ))}

              <button
                type="button"
                disabled={disabled || busy}
                onClick={() =>
                  setDraft((previous) => ({
                    ...previous,
                    materials: previous.materials.filter(
                      (_, i) => i !== index
                    ),
                  }))
                }
              >
                자재 제외
              </button>
            </div>
          ))}

          <button
            type="button"
            className="primary"
            disabled={disabled || busy}
            onClick={apply}
          >
            확인한 내용을 등록창에 반영
          </button>

          <button
            type="button"
            disabled={disabled || busy}
            onClick={() => {
              setDraft(null);
              setMessage(
                "결과를 닫았습니다. 다시 확인해도 같은 요청은 추가 차감하지 않습니다."
              );
            }}
          >
            결과 닫기
          </button>
        </div>
      )}

      <style jsx>{`
        .screenshot-input {
          padding: 16px;
          border: 1px solid #c3d6e9;
          border-radius: 14px;
          background: #f0f7ff;
          margin: 16px 0;
          color: #243648;
        }
        h3 {
          margin: 0 0 8px;
          font-size: 17px;
        }
        p, li {
          font-size: 13px;
          line-height: 1.6;
        }
        .quota {
          font-weight: 700;
        }
        .previews {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
        }
        img {
          width: 100%;
          height: 160px;
          object-fit: contain;
          background: #fff;
          border-radius: 8px;
        }
        button {
          border: 1px solid #cbd5e1;
          padding: 12px;
          border-radius: 9px;
          background: white;
          color: #243648;
          margin: 4px 4px 4px 0;
          font-weight: 700;
          cursor: pointer;
        }
        button:disabled {
          opacity: .5;
          cursor: default;
        }
        .primary {
          background: #243648;
          color: white;
        }
        .error {
          color: #b91c1c;
        }
        .warning {
          color: #92400e;
          background: #fffbeb;
          padding: 12px 12px 12px 28px;
        }
        .review {
          margin-top: 16px;
          border-top: 1px solid #cbd5e1;
          padding-top: 12px;
        }
        .material {
          border: 1px solid #cbd5e1;
          border-radius: 10px;
          padding: 12px;
          margin: 12px 0;
        }
      `}</style>
    </section>
  );
        }
