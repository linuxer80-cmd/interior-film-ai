"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../../../lib/supabase";
import {
  confirmedSize,
} from "../../../lib/cuttingPhotoImport.mjs";

async function preparePhoto(file) {
  if (
    !file.type.startsWith("image/") ||
    file.size > 20000000
  ) {
    throw new Error("20MB 이하의 사진을 선택해주세요.");
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
      2200 / Math.max(img.width, img.height)
    );

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);

    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(
      img,
      0,
      0,
      canvas.width,
      canvas.height
    );

    for (const quality of [0.9, 0.8, 0.7]) {
      const blob = await new Promise(resolve =>
        canvas.toBlob(resolve, "image/jpeg", quality)
      );

      if (blob && blob.size <= 550000) {
        return {
          name: file.name,
          blob,
          url: URL.createObjectURL(blob),
        };
      }
    }

    throw new Error(
      "글씨를 보존하려면 사진을 한 페이지씩 가까이 촬영해주세요."
    );
  } catch (error) {
    throw new Error(
      error?.message ||
        "사진을 열지 못했습니다. JPG 또는 PNG로 선택해주세요."
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

const box = {
  background: "#fff",
  border: "1px solid #ddd",
  borderRadius: 14,
  padding: 16,
  margin: "16px 0",
};

const inputStyle = {
  width: "100%",
  minWidth: 0,
  padding: 9,
  border: "1px solid #ccc",
  borderRadius: 8,
  boxSizing: "border-box",
};

export default function CuttingPhotoImport({
  siteId,
  colors = [],
  onApply,
  onBusy,
}) {
  const [photos, setPhotos] = useState([]);
  const [rows, setRows] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const photoRef = useRef([]);
  const lock = useRef(false);
  const abort = useRef(null);

  useEffect(
    () => () => {
      abort.current?.abort();

      photoRef.current.forEach(photo =>
        URL.revokeObjectURL(photo.url)
      );
    },
    []
  );

  function setWorking(value) {
    lock.current = value;
    setBusy(value);
    onBusy(value);
  }

  function clearAnalysis() {
    setRows([]);
    setWarnings([]);
    setMessage("");
  }

  function replacePhotos(next) {
    photoRef.current = next;
    setPhotos(next);
    clearAnalysis();
  }

  async function choose(event) {
    const files = Array.from(
      event.target.files || []
    );

    event.target.value = "";

    if (!files.length || lock.current) return;

    if (photos.length + files.length > 6) {
      setMessage(
        "한 번에 최대 6장까지 선택해주세요."
      );
      return;
    }

    setWorking(true);
    setMessage("");

    const added = [];

    try {
      for (const file of files) {
        added.push(await preparePhoto(file));
      }

      replacePhotos([...photos, ...added]);
    } catch (error) {
      added.forEach(photo =>
        URL.revokeObjectURL(photo.url)
      );

      setMessage(error.message);
    } finally {
      setWorking(false);
    }
  }

  function move(index, offset) {
    const next = [...photos];
    const target = index + offset;

    if (target < 0 || target >= next.length) return;

    [next[index], next[target]] = [
      next[target],
      next[index],
    ];

    replacePhotos(next);
  }

  function remove(index) {
    URL.revokeObjectURL(photos[index].url);

    replacePhotos(
      photos.filter((_, photoIndex) =>
        photoIndex !== index
      )
    );
  }

  function edit(id, field, value) {
    setRows(previous =>
      previous.map(row =>
        row.id === id
          ? { ...row, [field]: value }
          : row
      )
    );
  }

  async function analyze() {
    if (lock.current || !photos.length) return;

    setWorking(true);
    clearAnalysis();

    const controller = new AbortController();
    abort.current = controller;

    const timeout = setTimeout(
      () => controller.abort(),
      65000
    );

    try {
      const { data, error } =
        await supabase.auth.getSession();

      if (error || !data?.session?.access_token) {
        throw new Error(
          "시공자로 다시 로그인해주세요."
        );
      }

      const form = new FormData();

      photos.forEach((photo, index) =>
        form.append(
          "images",
          photo.blob,
          "page-" + (index + 1) + ".jpg"
        )
      );

      const response = await fetch(
        "/api/worker/cutting-notes" +
          (
            siteId
              ? "?siteId=" + encodeURIComponent(siteId)
              : ""
          ),
        {
          method: "POST",
          body: form,
          signal: controller.signal,
          headers: {
            Authorization:
              "Bearer " + data.session.access_token,
          },
        }
      );

      const result = await response
        .json()
        .catch(() => null);

      if (!response.ok) {
        throw new Error(
          result?.error ||
            "사진을 나눠 다시 분석해주세요."
        );
      }

      setRows(result.rows);
      setWarnings(result.warnings);

      if (!result.rows.length) {
        setMessage(
          "재단 항목을 읽지 못했습니다. 사진 또는 분석 안내를 확인해주세요."
        );
      }
    } catch (error) {
      setMessage(
        error.name === "AbortError"
          ? "분석이 중단됐습니다. 사진을 나눠 다시 시도해주세요."
          : error.message
      );
    } finally {
      clearTimeout(timeout);
      abort.current = null;
      setWorking(false);
    }
  }

  function apply() {
    if (lock.current) return;

    try {
      const selected = rows.filter(row =>
        row.include
      );

      if (!selected.length) {
        throw new Error(
          "추가할 항목을 확인하고 체크해주세요."
        );
      }

      selected.forEach(confirmedSize);

      onApply(rows);

      setRows([]);
      setWarnings([]);

      setMessage(
        selected.length +
          "개 항목을 추가했습니다. 보유 롤 길이와 결 방향을 확인한 뒤 계산해주세요."
      );
    } catch (error) {
      setMessage(error.message);
    }
  }

  return (
    <section style={box}>
      <h2 style={{ marginTop: 0 }}>
        종이 재단표 불러오기
      </h2>

      <p>
        사진 여러 장을 순서대로 분석합니다.
        값과 기호를 확인한 항목만 체크해 추가하세요.
      </p>

      <fieldset
        disabled={busy}
        style={{
          border: 0,
          padding: 0,
          minWidth: 0,
        }}
      >
        <label
          style={{
            display: "block",
            marginBottom: 12,
          }}
        >
          사진 선택 / 더 추가하기 (최대 6장)
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={choose}
            style={{
              display: "block",
              marginTop: 8,
            }}
          />
        </label>

        <div
          style={{
            display: "flex",
            gap: 12,
            overflowX: "auto",
            paddingBottom: 12,
          }}
        >
          {photos.map((photo, index) => (
            <div
              key={photo.url}
              style={{ flex: "0 0 130px" }}
            >
              <a
                href={photo.url}
                target="_blank"
                rel="noreferrer"
              >
                <img
                  src={photo.url}
                  alt={(index + 1) + "번 재단표"}
                  style={{
                    width: 130,
                    height: 150,
                    objectFit: "contain",
                  }}
                />
              </a>

              <p
                style={{
                  fontSize: 12,
                  overflowWrap: "anywhere",
                }}
              >
                {index + 1}. {photo.name}
              </p>

              <button
                type="button"
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                앞으로
              </button>{" "}

              <button
                type="button"
                disabled={
                  index === photos.length - 1
                }
                onClick={() => move(index, 1)}
              >
                뒤로
              </button>{" "}

              <button
                type="button"
                onClick={() => remove(index)}
              >
                삭제
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={analyze}
          disabled={!photos.length}
        >
          {rows.length
            ? "다시 분석하기"
            : "재단표 분석하기"}
        </button>
      </fieldset>

      {busy && (
        <p role="status">
          사진을 준비하거나 분석 중입니다…
        </p>
      )}

      {warnings.length > 0 && (
        <div
          style={{
            background: "#fff7ed",
            padding: 12,
          }}
        >
          <strong>분석 확인사항</strong>

          {warnings.map((warning, index) => (
            <p key={index}>{warning}</p>
          ))}
        </div>
      )}

      <datalist id="cutting-photo-colors">
        {colors.map(color => (
          <option key={color} value={color} />
        ))}
      </datalist>

      {rows.map((row, index) => (
        <article
          key={row.id}
          style={{
            ...box,
            background: row.include
              ? "#f0fdf4"
              : "#fafafa",
          }}
        >
          <label>
            <input
              type="checkbox"
              checked={row.include}
              onChange={event =>
                edit(
                  row.id,
                  "include",
                  event.target.checked
                )
              }
            />{" "}
            {index + 1}. 확인했고 추가합니다
          </label>

          <p style={{ fontSize: 13 }}>
            <a
              href={photos[row.page - 1]?.url}
              target="_blank"
              rel="noreferrer"
            >
              사진 {row.page} 보기
            </a>
            {" "}· {row.raw}
          </p>

          {row.notes && (
            <p style={{ fontSize: 13 }}>
              {row.notes}
            </p>
          )}

          {row.issues.length > 0 && (
            <p
              style={{
                color: "#b45309",
                fontSize: 13,
              }}
            >
              확인: {row.issues.join(" / ")}
            </p>
          )}

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
              ["color", "필름코드"],
              ["width", "폭"],
              ["height", "길이"],
              ["quantity", "수량(장)"],
            ].map(([key, label]) => (
              <label
                key={key}
                style={{ fontSize: 13 }}
              >
                {label}

                <input
                  style={inputStyle}
                  value={row[key] ?? ""}
                  list={
                    key === "color"
                      ? "cutting-photo-colors"
                      : undefined
                  }
                  type={
                    [
                      "width",
                      "height",
                      "quantity",
                    ].includes(key)
                      ? "number"
                      : "text"
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

            <label style={{ fontSize: 13 }}>
              치수 단위

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
                  단위 확인 필요
                </option>
                <option value="mm">mm</option>
                <option value="cm">cm</option>
              </select>
            </label>
          </div>
        </article>
      ))}

      {rows.length > 0 && (
        <button
          type="button"
          onClick={apply}
          disabled={busy}
        >
          확인한{" "}
          {rows.filter(row => row.include).length}
          개를 기존 목록에 추가
        </button>
      )}

      {message && (
        <p
          role="status"
          style={{ whiteSpace: "pre-wrap" }}
        >
          {message}
        </p>
      )}

      <p
        style={{
          fontSize: 12,
          color: "#64748b",
        }}
      >
        같은 치수도 별도 재단일 수 있어 자동 삭제하지
        않습니다. 취소·완료 항목은 확인 후 추가 체크를
        빼주세요. 사진 원본은 현재 화면에서만 보관합니다.
      </p>
    </section>
  );
            }
