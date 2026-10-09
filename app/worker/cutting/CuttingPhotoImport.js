"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";
import { supabase } from "../../../lib/supabase";
import {
  confirmedSize,
  normalizePhotoRow,
  photoRowProblem,
} from "../../../lib/cuttingPhotoImport.mjs";

const box = {
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 14,
  padding: 16,
  margin: "12px 0",
};

const inputStyle = {
  width: "100%",
  minWidth: 0,
  minHeight: 44,
  padding: 9,
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  boxSizing: "border-box",
  fontSize: 16,
};

async function preparePhoto(file) {
  if (
    !file.type.startsWith("image/") ||
    file.size > 20000000
  ) {
    throw Error(
      "20MB 이하의 사진을 선택해주세요."
    );
  }

  const url = URL.createObjectURL(file);

  try {
    const img = new Image();

    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = url;
    });

    const scale = Math.min(
      1,
      2200 /
        Math.max(img.width, img.height)
    );

    const canvas =
      document.createElement("canvas");

    canvas.width = Math.max(
      1,
      Math.round(img.width * scale)
    );
    canvas.height = Math.max(
      1,
      Math.round(img.height * scale)
    );

    const ctx = canvas.getContext("2d");

    if (!ctx) {
      throw Error(
        "사진을 준비하지 못했습니다."
      );
    }

    ctx.fillStyle = "#fff";
    ctx.fillRect(
      0,
      0,
      canvas.width,
      canvas.height
    );
    ctx.drawImage(
      img,
      0,
      0,
      canvas.width,
      canvas.height
    );

    for (const quality of [0.9, 0.8, 0.7]) {
      const blob = await new Promise(
        resolve =>
          canvas.toBlob(
            resolve,
            "image/jpeg",
            quality
          )
      );

      if (
        blob &&
        blob.size <= 550000
      ) {
        return {
          name: file.name,
          blob,
          url: URL.createObjectURL(blob),
        };
      }
    }

    throw Error(
      "사진을 한 페이지씩 가까이 촬영해주세요."
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function CuttingPhotoImport({
  siteId,
  colors = [],
  onApply,
  onBusy,
}) {
  const [photos, setPhotos] = useState([]);
  const [rows, setRows] = useState([]);
  const [addedIds, setAddedIds] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [defaultColor, setDefaultColor] =
    useState("");
  const [busy, setBusy] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);
  const [message, setMessage] = useState("");

  const photoRef = useRef([]);
  const lock = useRef(false);
  const abort = useRef(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;

    return () => {
      alive.current = false;
      abort.current?.abort();

      photoRef.current.forEach(photo =>
        URL.revokeObjectURL(photo.url)
      );
    };
  }, []);

  function setWorking(value) {
    lock.current = value;

    if (alive.current) {
      setBusy(value);
      onBusy?.(value);
    }
  }

  async function choose(event) {
    const files = Array.from(
      event.target.files || []
    );
    event.target.value = "";

    if (
      lock.current ||
      !files.length
    ) {
      return;
    }

    if (files.length > 6) {
      setMessage(
        "한 번에 최대 6장까지 선택해주세요."
      );
      return;
    }

    if (
      rows.some(
        row =>
          !addedIds.includes(row.id)
      ) &&
      !window.confirm(
        "확인하지 않은 항목이 남아 있습니다. 새 사진으로 바꿀까요? 이미 추가된 사이즈는 유지됩니다."
      )
    ) {
      return;
    }

    setWorking(true);
    setMessage("");

    const prepared = [];

    try {
      for (const file of files) {
        prepared.push(
          await preparePhoto(file)
        );
      }

      if (!alive.current) {
        prepared.forEach(photo =>
          URL.revokeObjectURL(photo.url)
        );
        return;
      }

      photoRef.current.forEach(photo =>
        URL.revokeObjectURL(photo.url)
      );

      photoRef.current = prepared;
      setPhotos(prepared);
      setRows([]);
      setAddedIds([]);
      setWarnings([]);
      setAnalyzed(false);
    } catch (cause) {
      prepared.forEach(photo =>
        URL.revokeObjectURL(photo.url)
      );

      if (alive.current) {
        setMessage(
          cause.message ||
            "사진을 열지 못했습니다."
        );
      }
    } finally {
      setWorking(false);
    }
  }

  function move(index, offset) {
    if (lock.current || analyzed) return;

    const next = [...photos];
    const target = index + offset;

    if (
      target < 0 ||
      target >= next.length
    ) {
      return;
    }

    [next[index], next[target]] = [
      next[target],
      next[index],
    ];

    photoRef.current = next;
    setPhotos(next);
  }

  async function analyze() {
    if (
      lock.current ||
      !photos.length ||
      analyzed
    ) {
      return;
    }

    setWorking(true);
    setMessage("");
    setWarnings([]);

    const controller =
      new AbortController();

    abort.current = controller;

    const timeout = setTimeout(
      () => controller.abort(),
      65000
    );

    try {
      const { data, error } =
        await supabase.auth.getSession();

      if (
        error ||
        !data.session?.access_token
      ) {
        throw Error(
          "시공자로 다시 로그인해주세요."
        );
      }

      const form = new FormData();

      photos.forEach((photo, index) =>
        form.append(
          "images",
          photo.blob,
          `page-${index + 1}.jpg`
        )
      );

      const response = await fetch(
        "/api/worker/cutting-notes" +
          (
            siteId
              ? "?siteId=" +
                encodeURIComponent(siteId)
              : ""
          ),
        {
          method: "POST",
          body: form,
          signal: controller.signal,
          headers: {
            Authorization:
              "Bearer " +
              data.session.access_token,
          },
        }
      );

      const result = await response
        .json()
        .catch(() => null);

      if (
        !response.ok ||
        !Array.isArray(result?.rows) ||
        !Array.isArray(result?.warnings)
      ) {
        throw Error(
          result?.error ||
            "사진을 나눠 다시 분석해주세요."
        );
      }

      if (!alive.current) return;

      const batchId =
        Date.now() +
        "-" +
        Math.random()
          .toString(36)
          .slice(2, 10);

      const needsPhotoReview =
        result.warnings.some(warning =>
          /중복|겹친|겹침|동일.{0,10}사진|수정.{0,10}전후/.test(
            warning
          )
        );

      const normalized = result.rows.map(
        (row, index) => {
          const next = normalizePhotoRow(
            row,
            colors,
            defaultColor
          );

          return {
            ...next,
            id: `${batchId}:${index}`,
            importKey: `${batchId}:${index}`,
            issues: needsPhotoReview
              ? [
                  ...next.issues,
                  "사진 중복·수정 여부를 확인해주세요.",
                ]
              : next.issues,
          };
        }
      );

      setRows(normalized);
      setWarnings(result.warnings);
      setAnalyzed(true);

      const ready = normalized.filter(
        row =>
          !photoRowProblem(
            row,
            colors
          )
      );

      if (!normalized.length) {
        setMessage(
          "읽힌 사이즈가 없습니다. 사진을 확인해주세요."
        );
        return;
      }

      if (!ready.length) {
        setMessage(
          `${normalized.length}개 항목을 아래 확인 목록에서 확인해주세요.`
        );
        return;
      }

      try {
        await onApply(
          ready.map(row => ({
            ...row,
            include: true,
          }))
        );

        if (!alive.current) return;

        setAddedIds(
          ready.map(row => row.id)
        );

        setMessage(
          `${ready.length}개 자동 입력 완료 · ${
            normalized.length - ready.length
          }개 확인 필요`
        );
      } catch (cause) {
        if (alive.current) {
          setMessage(
            "자동 추가를 완료하지 못했습니다. " +
              cause.message +
              " 아래 항목은 아직 추가되지 않았습니다."
          );
        }
      }
    } catch (cause) {
      if (alive.current) {
        setMessage(
          cause.name === "AbortError"
            ? "분석 시간이 길어졌습니다. 사진을 나눠 다시 시도해주세요."
            : cause.message
        );
      }
    } finally {
      clearTimeout(timeout);
      abort.current = null;
      setWorking(false);
    }
  }

  function edit(id, field, value) {
    setRows(previous =>
      previous.map(row =>
        row.id === id
          ? {
              ...row,
              [field]: value,
            }
          : row
      )
    );
  }

  async function confirmRow(row) {
    if (
      lock.current ||
      addedIds.includes(row.id)
    ) {
      return;
    }

    const confirmed = {
      ...row,
      issues: [],
      include: true,
    };

    const problem = photoRowProblem(
      confirmed,
      colors
    );

    if (problem) {
      setMessage(problem);
      return;
    }

    setWorking(true);

    try {
      await onApply([confirmed]);

      if (!alive.current) return;

      setRows(previous =>
        previous.map(item =>
          item.id === row.id
            ? confirmed
            : item
        )
      );

      setAddedIds(previous => [
        ...new Set([
          ...previous,
          row.id,
        ]),
      ]);

      setMessage(
        "확인한 사이즈를 추가했습니다."
      );
    } catch (cause) {
      if (alive.current) {
        setMessage(cause.message);
      }
    } finally {
      setWorking(false);
    }
  }

  const pending = rows.filter(
    row => !addedIds.includes(row.id)
  );

  const added = rows.filter(
    row => addedIds.includes(row.id)
  );

  const selectedDefault =
    colors.length === 1
      ? colors[0]
      : defaultColor;

  return (
    <section style={box}>
      <h2 style={{ marginTop: 0 }}>
        종이 재단표 자동 입력
      </h2>

      <p
        style={{
          fontSize: 13,
          lineHeight: 1.7,
          color: "#64748b",
        }}
      >
        읽힌 사이즈는 바로 입력하고,
        확인이 필요한 항목만 아래에 모아드립니다.
      </p>

      <fieldset
        disabled={busy}
        style={{
          border: 0,
          padding: 0,
          minWidth: 0,
        }}
      >
        {colors.length > 1 && (
          <label
            style={{
              display: "block",
              marginBottom: 14,
            }}
          >
            재단표에 필름코드가 없을 때 사용할 필름
            <select
              style={inputStyle}
              value={defaultColor}
              disabled={analyzed}
              onChange={event =>
                setDefaultColor(
                  event.target.value
                )
              }
            >
              <option value="">
                항목별로 확인하기
              </option>

              {colors.map(color => (
                <option
                  key={color}
                  value={color}
                >
                  {color}
                </option>
              ))}
            </select>
          </label>
        )}

        {colors.length === 1 && (
          <p>
            사용 필름: {selectedDefault}
          </p>
        )}

        <label>
          재단표 사진 선택 · 최대 6장
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={choose}
            style={{
              display: "block",
              marginTop: 8,
              marginBottom: 14,
            }}
          />
        </label>

        <div
          style={{
            display: "flex",
            gap: 10,
            overflowX: "auto",
            paddingBottom: 12,
          }}
        >
          {photos.map((photo, index) => (
            <div
              key={photo.url}
              style={{
                flex: "0 0 120px",
              }}
            >
              <a
                href={photo.url}
                target="_blank"
                rel="noreferrer"
              >
                <img
                  src={photo.url}
                  alt={`${index + 1}번 재단표`}
                  style={{
                    width: 120,
                    height: 140,
                    objectFit: "contain",
                  }}
                />
              </a>

              <small>
                사진 {index + 1}
              </small>

              {!analyzed && (
                <div
                  style={{
                    display: "flex",
                    gap: 4,
                    marginTop: 6,
                  }}
                >
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() =>
                      move(index, -1)
                    }
                  >
                    ←
                  </button>

                  <button
                    type="button"
                    disabled={
                      index ===
                      photos.length - 1
                    }
                    onClick={() =>
                      move(index, 1)
                    }
                  >
                    →
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={analyze}
          disabled={
            !photos.length ||
            analyzed
          }
          style={{
            ...inputStyle,
            background: "#2563eb",
            color: "#fff",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          {analyzed
            ? "분석 완료"
            : "사진 분석하고 자동 입력"}
        </button>
      </fieldset>

      {busy && (
        <p role="status">
          사진을 준비하거나 분석 중입니다…
        </p>
      )}

      {message && (
        <p
          role="status"
          style={{
            whiteSpace: "pre-wrap",
            lineHeight: 1.7,
          }}
        >
          {message}
        </p>
      )}

      {warnings.length > 0 && (
        <details
          style={{
            background: "#fff7ed",
            padding: 12,
            borderRadius: 10,
          }}
        >
          <summary>
            사진 분석 안내 {warnings.length}건
          </summary>

          {warnings.map((warning, index) => (
            <p key={index}>{warning}</p>
          ))}
        </details>
      )}

      {added.length > 0 && (
        <details
          style={{
            marginTop: 14,
            padding: 12,
            background: "#f0fdf4",
            borderRadius: 10,
          }}
        >
          <summary>
            입력 완료 {added.length}개 보기
          </summary>

          {added.map(row => {
            const size = confirmedSize(row);

            return (
              <p key={row.id}>
                {row.location || "위치 미지정"}
                {" · "}
                {row.part || "부위 미지정"}
                <br />
                {row.color}
                {" · "}
                {size.width}×{size.height}mm
                {" · "}
                {size.quantity}장
              </p>
            );
          })}
        </details>
      )}

      {pending.length > 0 && (
        <h3 style={{ marginTop: 20 }}>
          확인 필요한 항목 {pending.length}개
        </h3>
      )}

      {pending.map(row => {
        const problem = photoRowProblem(
          row,
          colors
        );

        return (
          <article
            key={row.id}
            style={{
              ...box,
              background: "#fffbeb",
            }}
          >
            <a
              href={
                photos[row.page - 1]?.url
              }
              target="_blank"
              rel="noreferrer"
            >
              사진 {row.page} 원본 보기
            </a>

            <p
              style={{
                whiteSpace: "pre-wrap",
              }}
            >
              {row.raw}
            </p>

            {problem && (
              <p
                style={{
                  color: "#b45309",
                  fontSize: 13,
                }}
              >
                {problem}
              </p>
            )}

            {row.notes && (
              <p
                style={{
                  color: "#64748b",
                  fontSize: 12,
                }}
              >
                {row.notes}
              </p>
            )}

            <fieldset
              disabled={busy}
              style={{
                border: 0,
                padding: 0,
                minWidth: 0,
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(2, minmax(0, 1fr))",
                  gap: 8,
                }}
              >
                {[
                  ["location", "위치"],
                  ["part", "부위"],
                  ["width", "가로"],
                  ["height", "세로"],
                  ["quantity", "수량"],
                ].map(([key, title]) => (
                  <label key={key}>
                    {title}

                    <input
                      style={inputStyle}
                      value={row[key] ?? ""}
                      type={
                        [
                          "width",
                          "height",
                          "quantity",
                        ].includes(key)
                          ? "number"
                          : "text"
                      }
                      step={
                        key === "quantity"
                          ? "1"
                          : "any"
                      }
                      onChange={event =>
                        edit(
                          row.id,
                          key,
                          event.target.value
                        )
                      }
                    />
                  </label>
                ))}

                <label>
                  단위
                  <select
                    style={inputStyle}
                    value={row.unit}
                    onChange={event =>
                      edit(
                        row.id,
                        "unit",
                        event.target.value
                      )
                    }
                  >
                    <option value="unknown">
                      단위 선택
                    </option>
                    <option value="mm">
                      mm
                    </option>
                    <option value="cm">
                      cm
                    </option>
                    <option value="m">
                      m
                    </option>
                  </select>
                </label>
              </div>

              <label
                style={{
                  display: "block",
                  marginTop: 10,
                }}
              >
                사용할 필름

                {colors.length ? (
                  <select
                    style={inputStyle}
                    value={
                      colors.includes(
                        row.color
                      )
                        ? row.color
                        : ""
                    }
                    onChange={event =>
                      edit(
                        row.id,
                        "color",
                        event.target.value
                      )
                    }
                  >
                    <option value="">
                      현장 필름 선택
                    </option>

                    {colors.map(color => (
                      <option
                        key={color}
                        value={color}
                      >
                        {color}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    style={inputStyle}
                    value={row.color}
                    onChange={event =>
                      edit(
                        row.id,
                        "color",
                        event.target.value
                      )
                    }
                  />
                )}
              </label>

              <button
                type="button"
                onClick={() =>
                  confirmRow(row)
                }
                style={{
                  ...inputStyle,
                  marginTop: 12,
                  background: "#2563eb",
                  color: "#fff",
                  fontWeight: 800,
                }}
              >
                숫자·수량 확인 후 추가
              </button>

              <button
                type="button"
                onClick={() =>
                  setRows(previous =>
                    previous.filter(
                      item =>
                        item.id !== row.id
                    )
                  )
                }
                style={{
                  marginTop: 10,
                }}
              >
                이 항목 제외
              </button>
            </fieldset>
          </article>
        );
      })}

      <p
        style={{
          color: "#64748b",
          fontSize: 12,
          lineHeight: 1.7,
        }}
      >
        100.2000 → 100×2000mm
        <br />
        2.4*3.5 → 2400×3500mm
        <br />
        수량 표기가 없으면 1장으로 입력합니다.
        같은 치수의 다른 항목은 각각 유지합니다.
      </p>
    </section>
  );
                      }
