"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { reportRequest } from "../utils/reportClient";
import {
  filmCodeInfo,
  isHyundaiFilm,
  normalizeFilmCode,
  receiptMatchesProduct,
  receiptSearchCode,
  resolveFilmType,
} from "../../lib/hyundaiFilmCode";

const typeNames = {
  non_fire: "비방염",
  fire: "방염",
  unknown: "확인 필요",
};

const positive = value =>
  String(value).trim() !== "" &&
  Number.isFinite(Number(value)) &&
  Number(value) > 0 &&
  Number(value) <= 1000000;

const close = (a, b) =>
  Math.abs(Number(a) - Number(b)) <= 0.001;

const productCode = product =>
  product?.product_code || product?.code || "";

function applyCodeType(row, brand = row.brand) {
  const resolved = resolveFilmType(
    brand,
    row.code,
    row.priceType
  );

  return {
    ...row,
    brand: brand || row.brand || "",
    priceType: resolved.conflict
      ? row.priceType
      : resolved.resolvedType,
  };
}

function matchesReturn(row, roll, purchase, dealerId) {
  if (
    roll.status !== "available" ||
    !purchase ||
    purchase.dealer_id !== dealerId ||
    !receiptMatchesProduct(row, roll)
  ) {
    return false;
  }

  const receiptType = resolveFilmType(
    roll.brand,
    row.code,
    row.priceType
  );

  const stockType = resolveFilmType(
    roll.brand,
    roll.product_code,
    purchase.price_type
  );

  return (
    !receiptType.conflict &&
    !stockType.conflict &&
    receiptType.resolvedType !== "unknown" &&
    receiptType.resolvedType === stockType.resolvedType
  );
}

async function preparePhoto(file) {
  if (!file || file.size > 20000000) {
    throw new Error(
      "20MB 이하의 영수증 사진을 선택해주세요."
    );
  }

  const url = URL.createObjectURL(file);

  try {
    const image = new Image();

    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () =>
        reject(
          new Error(
            "사진을 열 수 없습니다. JPG나 PNG로 올려주세요."
          )
        );
      image.src = url;
    });

    const ratio = Math.min(
      1,
      2200 /
        Math.max(
          image.naturalWidth,
          image.naturalHeight
        )
    );

    const canvas = document.createElement("canvas");

    canvas.width = Math.max(
      1,
      Math.round(image.naturalWidth * ratio)
    );
    canvas.height = Math.max(
      1,
      Math.round(image.naturalHeight * ratio)
    );

    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("사진을 처리하지 못했습니다.");
    }

    context.fillStyle = "#fff";
    context.fillRect(
      0,
      0,
      canvas.width,
      canvas.height
    );
    context.drawImage(
      image,
      0,
      0,
      canvas.width,
      canvas.height
    );

    for (const quality of [0.9, 0.8, 0.7, 0.6]) {
      const blob = await new Promise(resolve =>
        canvas.toBlob(
          resolve,
          "image/jpeg",
          quality
        )
      );

      if (blob && blob.size <= 550000) {
        return new File([blob], "receipt.jpg", {
          type: "image/jpeg",
        });
      }
    }

    throw new Error(
      "사진 용량이 큽니다. 영수증 부분만 잘라 다시 올려주세요."
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function DealerReceiptImport({
  onSaved,
  onLocked,
}) {
  const [data, setData] = useState(null);
  const [file, setFile] = useState(null);
  const [rows, setRows] = useState([]);
  const [dealerId, setDealerId] = useState("");
  const [receiptInfo, setReceiptInfo] = useState("");
  const [warnings, setWarnings] = useState([]);
  const [busy, setBusy] = useState(false);
  const [batch, setBatch] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const gate = useRef(false);
  const storageKey = useRef("");
  const batchRef = useRef(null);
  const account = useRef("");
  const alive = useRef(false);

  function persist(value) {
    if (!storageKey.current) {
      throw new Error("로그인 정보를 확인해주세요.");
    }

    sessionStorage.setItem(
      storageKey.current,
      JSON.stringify(value)
    );

    batchRef.current = value;
    setBatch(value);
  }

  useEffect(() => {
    alive.current = true;

    async function start() {
      try {
        const { data: sessionData } =
          await supabase.auth.getSession();

        const userId =
          sessionData.session?.user?.id;

        if (!userId) {
          throw new Error("로그인이 필요합니다.");
        }

        account.current = userId;
        storageKey.current =
          "dealer-receipt-pending:" + userId;

        const current = await reportRequest(
          "/api/film-dealers"
        );

        if (!alive.current) return;
        setData(current);

        const raw = sessionStorage.getItem(
          storageKey.current
        );

        if (raw) {
          const saved = JSON.parse(raw);

          if (
            saved &&
            Array.isArray(saved.jobs) &&
            Number.isInteger(saved.index) &&
            saved.index >= 0 &&
            saved.index <= saved.jobs.length
          ) {
            batchRef.current = saved;
            setBatch(saved);
            setMessage(
              "이전 저장 요청이 남아 있습니다. 결과 확인을 이어서 진행해주세요."
            );
          }
        }
      } catch (e) {
        if (alive.current) setError(e.message);
      }
    }

    start();

    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    onLocked?.(busy || Boolean(batch));

    return () => onLocked?.(false);
  }, [busy, batch, onLocked]);

  function update(id, patch) {
    setRows(current =>
      current.map(row =>
        row.id === id
          ? { ...row, ...patch }
          : row
      )
    );
  }

  function changeCode(row, code) {
    const info = filmCodeInfo(row.brand, code);

    update(row.id, {
      code,
      product: null,
      products: [],
      rollIds: [],
      priceType:
        info.priceType !== "unknown"
          ? info.priceType
          : "unknown",
    });
  }

  function chooseProduct(row, product) {
    if (!product) {
      update(row.id, { product: null });
      return;
    }

    if (!receiptMatchesProduct(row, product)) {
      setError(
        "영수증 코드와 등록 제품이 다릅니다. 제품번호를 확인해주세요."
      );
      return;
    }

    const next = applyCodeType(
      { ...row, product },
      product.brand
    );

    update(row.id, {
      product,
      brand: next.brand,
      priceType: next.priceType,
      rollIds: [],
    });
  }

  async function analyze() {
    if (
      gate.current ||
      !file ||
      batchRef.current
    ) {
      return;
    }

    gate.current = true;
    setBusy(true);
    setError("");
    setMessage("");

    try {
      const image = await preparePhoto(file);

      const { data: sessionData } =
        await supabase.auth.getSession();

      const session = sessionData.session;

      if (
        !session ||
        session.user.id !== account.current
      ) {
        throw new Error(
          "로그인이 변경되었습니다. 화면을 새로 열어주세요."
        );
      }

      const form = new FormData();
      form.append("images", image);

      const response = await fetch(
        "/api/dealer-receipts",
        {
          method: "POST",
          headers: {
            Authorization:
              "Bearer " + session.access_token,
          },
          body: form,
          signal: AbortSignal.timeout(65000),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ||
            "영수증 분석에 실패했습니다."
        );
      }

      if (!alive.current) return;

      setRows(
        result.rows.map(source =>
          applyCodeType({
            ...source,
            id: crypto.randomUUID(),
            code: source.code || "",
            priceType: source.priceType || "unknown",
            issues: source.issues || [],
            lengthM: source.lengthM ?? "",
            rollCount: source.rollCount ?? "",
            totalM: source.totalM ?? "",
            credit: source.amount ?? "",
            product: null,
            products: [],
            rollIds: [],
            done: false,
          })
        )
      );

      const dealers = (
        data?.dealers || []
      ).filter(
        dealer =>
          normalizeFilmCode(dealer.name) ===
          normalizeFilmCode(result.dealer)
      );

      setDealerId(
        dealers.length === 1 ? dealers[0].id : ""
      );

      setReceiptInfo(
        [result.dealer, result.date]
          .filter(Boolean)
          .join(" · ")
      );
      setWarnings(result.warnings || []);
      setMessage(
        result.rows.length
          ? `${result.rows.length}개 품목을 읽었습니다. 내용을 확인한 뒤 저장해주세요.`
          : "읽을 수 있는 필름 품목이 없습니다."
      );
    } catch (e) {
      if (alive.current) setError(e.message);
    } finally {
      gate.current = false;
      if (alive.current) setBusy(false);
    }
  }

  async function searchProduct(row) {
    if (gate.current) return;

    gate.current = true;
    setBusy(true);
    setError("");

    try {
      const query = receiptSearchCode(row.code);

      const result = await reportRequest(
        "/api/film-dealers",
        { action: "search", query }
      );

      let products = result.products || [];

      // 비현대 브랜드의 원래 G/F 코드도 검색할 수 있도록 보완합니다.
      if (
        query !== normalizeFilmCode(row.code) &&
        !products.some(product =>
          receiptMatchesProduct(row, product)
        )
      ) {
        const original = await reportRequest(
          "/api/film-dealers",
          {
            action: "search",
            query: row.code.trim(),
          }
        );

        products = [
          ...new Map(
            [
              ...products,
              ...(original.products || []),
            ].map(product => [
              product.id,
              product,
            ])
          ).values(),
        ];
      }

      if (!alive.current) return;

      const exact = products.filter(product =>
        receiptMatchesProduct(row, product)
      );

      update(row.id, {
        products: exact,
        product: null,
      });

      if (exact.length === 1) {
        chooseProduct(row, exact[0]);
      }

      if (!exact.length) {
        setError(
          "동일한 등록 제품을 찾지 못했습니다. 브랜드·제품번호를 확인하거나 아래 화면에서 제품과 공급가를 등록해주세요."
        );
      }
    } catch (e) {
      if (alive.current) setError(e.message);
    } finally {
      gate.current = false;
      if (alive.current) setBusy(false);
    }
  }

  async function runBatch(value) {
    if (gate.current || !value) return;

    gate.current = true;
    setBusy(true);
    setError("");

    try {
      const { data: sessionData } =
        await supabase.auth.getSession();

      if (
        sessionData.session?.user?.id !==
        account.current
      ) {
        throw new Error(
          "로그인이 변경되었습니다. 화면을 새로 열어주세요."
        );
      }

      for (
        let index = value.index;
        index < value.jobs.length;
        index++
      ) {
        if (!alive.current) return;

        const result = await reportRequest(
          "/api/film-dealers",
          value.jobs[index]
        );

        value = {
          ...value,
          index: index + 1,
        };

        persist(value);

        if (!alive.current) return;

        setData(result);
        setMessage(
          `${value.jobs.length}건 중 ${value.index}건 저장 확인`
        );
      }

      sessionStorage.removeItem(
        storageKey.current
      );
      batchRef.current = null;
      setBatch(null);

      setRows(current =>
        current.map(row =>
          row.id === value.rowId
            ? { ...row, done: true }
            : row
        )
      );

      setMessage(
        "선택한 품목의 물량을 저장했습니다."
      );
      onSaved?.();
    } catch (e) {
      if (alive.current) {
        setError(
          e.message +
            " 저장 요청이 남아 있으면 결과 확인을 이어서 진행해주세요."
        );
      }
    } finally {
      gate.current = false;
      if (alive.current) setBusy(false);
    }
  }

  function saveRow(row) {
    if (
      gate.current ||
      batchRef.current ||
      row.done
    ) {
      return;
    }

    setError("");

    try {
      if (!dealerId) {
        throw new Error(
          "대리점을 선택해주세요."
        );
      }

      const memo = [
        "영수증 입력",
        receiptInfo,
        row.raw,
      ]
        .filter(Boolean)
        .join(" · ")
        .slice(0, 300);

      let jobs;

      if (row.action === "receive") {
        const count = Number(row.rollCount);

        if (
          !row.product ||
          !receiptMatchesProduct(
            row,
            row.product
          )
        ) {
          throw new Error(
            "영수증과 동일한 등록 제품을 연결해주세요."
          );
        }

        const resolved = resolveFilmType(
          row.product.brand,
          row.code,
          row.priceType
        );

        const registered = filmCodeInfo(
          row.product.brand,
          productCode(row.product)
        );

        if (resolved.conflict) {
          throw new Error(
            "제품코드의 G/F 구분과 선택한 방염 구분이 다릅니다. 코드 또는 방염 구분을 확인해주세요."
          );
        }

        if (
          registered.priceType !== "unknown" &&
          registered.priceType !==
            resolved.resolvedType
        ) {
          throw new Error(
            "연결한 등록 제품의 G/F 구분이 영수증과 다릅니다. 맞는 제품을 선택해주세요."
          );
        }

        if (
          resolved.resolvedType === "unknown" ||
          !positive(row.lengthM) ||
          !Number.isInteger(count) ||
          count < 1 ||
          count > 50
        ) {
          throw new Error(
            "방염 구분·한 롤 길이·롤 수를 확인해주세요."
          );
        }

        if (
          row.totalM !== "" &&
          (
            !positive(row.totalM) ||
            !close(
              Number(row.lengthM) * count,
              row.totalM
            )
          )
        ) {
          throw new Error(
            "한 롤 길이 × 롤 수가 영수증 총 길이와 다릅니다."
          );
        }

        const price = (
          data.prices || []
        ).find(
          item =>
            item.dealer_id === dealerId &&
            item.product_id === row.product.id &&
            item.price_type ===
              resolved.resolvedType
        );

        if (!price) {
          throw new Error(
            `이 대리점의 ${
              typeNames[resolved.resolvedType]
            } 공급가를 아래 화면에서 먼저 등록해주세요.`
          );
        }

        jobs = Array.from(
          { length: count },
          () => ({
            action: "receive",
            requestId: crypto.randomUUID(),
            dealerId,
            productId: row.product.id,
            priceType: resolved.resolvedType,
            priceRevision: price.revision,
            length: Number(row.lengthM),
            count: 1,
            location: "창고",
            memo,
          })
        );
      } else if (
        row.action === "supplier_return"
      ) {
        const purchaseMap = new Map(
          (data.purchases || []).map(item => [
            item.roll_id,
            item,
          ])
        );

        const rolls = (
          data.stock?.rolls || []
        ).filter(roll =>
          row.rollIds.includes(roll.id)
        );

        if (
          !rolls.length ||
          rolls.length !== row.rollIds.length
        ) {
          throw new Error(
            "반납할 보관 롤을 선택해주세요."
          );
        }

        if (
          rolls.some(
            roll =>
              !matchesReturn(
                row,
                roll,
                purchaseMap.get(roll.id),
                dealerId
              )
          )
        ) {
          throw new Error(
            "대리점·기본 제품·방염 구분이 일치하는 보관 롤만 반납할 수 있습니다."
          );
        }

        const total = rolls.reduce(
          (sum, roll) =>
            sum + Number(roll.remaining),
          0
        );

        if (
          !positive(row.totalM) ||
          !close(total, row.totalM)
        ) {
          throw new Error(
            `선택한 롤 잔량은 ${total}m입니다. 영수증 반납 길이와 일치해야 합니다.`
          );
        }

        if (
          row.rollCount !== "" &&
          (
            !Number.isInteger(
              Number(row.rollCount)
            ) ||
            Number(row.rollCount) !==
              rolls.length
          )
        ) {
          throw new Error(
            "영수증 롤 수와 선택한 롤 수가 다릅니다."
          );
        }

        if (
          row.credit !== "" &&
          (
            !Number.isFinite(
              Number(row.credit)
            ) ||
            Number(row.credit) < 0 ||
            Number(row.credit) >
              1000000000000
          )
        ) {
          throw new Error(
            "반납 정산금액을 확인해주세요."
          );
        }

        if (
          rolls.length > 1 &&
          row.credit !== ""
        ) {
          throw new Error(
            "여러 롤의 합산 정산금액은 임의로 배분하지 않습니다. 금액을 비우거나 한 롤씩 처리해주세요."
          );
        }

        jobs = rolls.map(roll => ({
          action: "supplier_return",
          requestId: crypto.randomUUID(),
          rollId: roll.id,
          revision: roll.revision,
          credit:
            row.credit === ""
              ? ""
              : Number(row.credit),
        }));
      } else {
        throw new Error(
          "입고 또는 대리점 반납을 선택해주세요."
        );
      }

      if (
        !confirm(
          row.action === "receive"
            ? `${row.code} ${jobs.length}롤을 입고할까요?`
            : `${row.code} ${jobs.length}롤의 남은 물량 전체를 반납할까요?`
        )
      ) {
        return;
      }

      const value = {
        rowId: row.id,
        index: 0,
        jobs,
      };

      persist(value);
      runBatch(value);
    } catch (e) {
      setError(e.message);
    }
  }

  const purchaseMap = new Map(
    (data?.purchases || []).map(item => [
      item.roll_id,
      item,
    ])
  );

  return (
    <section className="receipt">
      <h2>📷 대리점 영수증으로 물량 입력</h2>

      <p>
        영수증을 읽고 품목별로 입고·반납을
        저장합니다. 현대 GS115는 S115 비방염,
        FS115는 S115 방염으로 연결합니다.
      </p>

      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {message && (
        <p role="status">{message}</p>
      )}

      {batch && (
        <div className="notice">
          <p>
            {batch.jobs.length}건 중{" "}
            {batch.index}건 저장 확인.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              runBatch(batchRef.current)
            }
          >
            {busy
              ? "확인 중…"
              : "남은 저장 결과 확인 · 다시 시도"}
          </button>
        </div>
      )}

      <fieldset
        disabled={
          busy || Boolean(batch) || !data
        }
      >
        <label>
          영수증 사진
          <input
            type="file"
            accept="image/*"
            onChange={event =>
              setFile(
                event.target.files?.[0] || null
              )
            }
          />
        </label>

        <button
          type="button"
          disabled={!file}
          onClick={analyze}
        >
          {busy
            ? "처리 중…"
            : "영수증 분석"}
        </button>

        {receiptInfo && <p>{receiptInfo}</p>}

        {warnings.length > 0 && (
          <details>
            <summary>
              사진 분석 안내 {warnings.length}건
            </summary>
            {warnings.map((warning, index) => (
              <p key={index}>{warning}</p>
            ))}
          </details>
        )}

        {rows.length > 0 && (
          <label>
            거래 대리점
            <select
              value={dealerId}
              onChange={event => {
                setDealerId(event.target.value);
                setRows(current =>
                  current.map(row => ({
                    ...row,
                    rollIds: [],
                  }))
                );
              }}
            >
              <option value="">
                대리점 선택
              </option>
              {(data?.dealers || []).map(
                dealer => (
                  <option
                    key={dealer.id}
                    value={dealer.id}
                  >
                    {dealer.name}
                  </option>
                )
              )}
            </select>
          </label>
        )}

        {rows.map(row => {
          const brand =
            row.product?.brand || row.brand;

          const resolved = resolveFilmType(
            brand,
            row.code,
            row.priceType
          );

          const candidates = (
            data?.stock?.rolls || []
          ).filter(roll =>
            matchesReturn(
              row,
              roll,
              purchaseMap.get(roll.id),
              dealerId
            )
          );

          return (
            <article key={row.id}>
              <strong>
                {row.brand}{" "}
                {row.code || "제품번호 확인"}
                {row.done && " · 저장 완료"}
              </strong>

              <p>{row.raw}</p>

              {isHyundaiFilm(brand) &&
                resolved.priceType !==
                  "unknown" && (
                  <p className="notice">
                    코드 구분: {row.code} →{" "}
                    {resolved.baseCode}{" "}
                    {typeNames[
                      resolved.priceType
                    ]}
                  </p>
                )}

              {resolved.conflict && (
                <p className="error">
                  코드와 선택한 방염 구분이
                  다릅니다. 확인 후 수정해주세요.
                </p>
              )}

              {row.issues.length > 0 && (
                <p className="notice">
                  확인 안내:{" "}
                  {row.issues.join(" / ")}
                </p>
              )}

              <fieldset disabled={row.done}>
                <label>
                  거래 구분
                  <select
                    value={row.action}
                    onChange={event =>
                      update(row.id, {
                        action: event.target.value,
                        rollIds: [],
                      })
                    }
                  >
                    <option value="unknown">
                      확인 필요
                    </option>
                    <option value="receive">
                      대리점에서 받음 · 입고
                    </option>
                    <option value="supplier_return">
                      대리점에 반납
                    </option>
                  </select>
                </label>

                <label>
                  필름 제품번호
                  <input
                    value={row.code}
                    onChange={event =>
                      changeCode(
                        row,
                        event.target.value
                      )
                    }
                  />
                </label>

                {row.action === "receive" && (
                  <>
                    <button
                      type="button"
                      disabled={
                        !row.code.trim()
                      }
                      onClick={() =>
                        searchProduct(row)
                      }
                    >
                      등록 제품 연결
                    </button>

                    {row.products.length > 0 && (
                      <label>
                        등록 제품
                        <select
                          value={
                            row.product?.id || ""
                          }
                          onChange={event =>
                            chooseProduct(
                              row,
                              row.products.find(
                                product =>
                                  product.id ===
                                  event.target.value
                              ) || null
                            )
                          }
                        >
                          <option value="">
                            제품 선택
                          </option>
                          {row.products.map(
                            product => (
                              <option
                                key={product.id}
                                value={product.id}
                              >
                                {product.brand} /{" "}
                                {productCode(
                                  product
                                )}{" "}
                                {product.product_name ||
                                  product.name}
                              </option>
                            )
                          )}
                        </select>
                      </label>
                    )}
                  </>
                )}

                <label>
                  방염 구분
                  <select
                    value={row.priceType}
                    onChange={event =>
                      update(row.id, {
                        priceType:
                          event.target.value,
                        rollIds: [],
                      })
                    }
                  >
                    <option value="unknown">
                      확인 필요
                    </option>
                    <option value="non_fire">
                      비방염
                    </option>
                    <option value="fire">
                      방염
                    </option>
                  </select>
                </label>

                {row.action === "receive" && (
                  <>
                    <label>
                      한 롤 길이 (m)
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={row.lengthM}
                        onChange={event =>
                          update(row.id, {
                            lengthM:
                              event.target.value,
                          })
                        }
                      />
                    </label>

                    <label>
                      같은 길이의 롤 수
                      <input
                        type="number"
                        min="1"
                        max="50"
                        step="1"
                        value={row.rollCount}
                        onChange={event =>
                          update(row.id, {
                            rollCount:
                              event.target.value,
                          })
                        }
                      />
                    </label>

                    <p>
                      길이가 다른 롤은 아래
                      기존 입고 화면에서
                      롤별로 입력해주세요.
                    </p>
                  </>
                )}

                <label>
                  영수증 총 길이 (m)
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={row.totalM}
                    onChange={event =>
                      update(row.id, {
                        totalM:
                          event.target.value,
                      })
                    }
                  />
                </label>

                {row.action ===
                  "supplier_return" && (
                  <>
                    <p>
                      같은 대리점·제품·방염
                      구분의 보관 롤을
                      선택하세요. 남은 물량
                      전체를 반납합니다.
                    </p>

                    {!candidates.length && (
                      <p>
                        일치하는 보관 롤이
                        없습니다. 대리점,
                        제품번호와 방염 구분을
                        확인해주세요.
                      </p>
                    )}

                    {candidates.map(roll => {
                      const purchase =
                        purchaseMap.get(
                          roll.id
                        );
                      const stockType =
                        resolveFilmType(
                          roll.brand,
                          roll.product_code,
                          purchase?.price_type
                        );

                      return (
                        <label
                          className="check"
                          key={roll.id}
                        >
                          <input
                            type="checkbox"
                            checked={row.rollIds.includes(
                              roll.id
                            )}
                            onChange={event =>
                              update(row.id, {
                                rollIds: event
                                  .target.checked
                                  ? [
                                      ...row.rollIds,
                                      roll.id,
                                    ]
                                  : row.rollIds.filter(
                                      id =>
                                        id !==
                                        roll.id
                                    ),
                              })
                            }
                          />
                          {roll.brand} /{" "}
                          {roll.product_code}
                          {" · "}
                          {
                            typeNames[
                              stockType
                                .resolvedType
                            ]
                          }
                          {" · "}
                          {roll.label}
                          {" · "}
                          {roll.remaining}m
                        </label>
                      );
                    })}

                    <label>
                      반납 정산금액
                      (원, 공란이면 미확정)
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={row.credit}
                        onChange={event =>
                          update(row.id, {
                            credit:
                              event.target.value,
                          })
                        }
                      />
                    </label>

                    <p>
                      부가세 포함 여부를
                      확인해주세요. 여러 롤의
                      합산금액은 롤별로 나누지
                      않습니다.
                    </p>
                  </>
                )}

                <button
                  type="button"
                  disabled={
                    row.action === "unknown" ||
                    row.done ||
                    resolved.conflict
                  }
                  onClick={() => saveRow(row)}
                >
                  {row.done
                    ? "저장 완료"
                    : "확인한 물량 저장"}
                </button>
              </fieldset>
            </article>
          );
        })}
      </fieldset>

      <style jsx>{`
        .receipt {
          padding: 18px;
          border: 1px solid #c9e1f7;
          border-radius: 18px;
          background: #f3f8ff;
          color: #243648;
          margin-top: 20px;
        }
        h2 {
          font-size: 20px;
          margin-top: 0;
        }
        p {
          font-size: 14px;
          line-height: 1.7;
          overflow-wrap: anywhere;
        }
        fieldset {
          border: 0;
          padding: 0;
          margin: 0;
          min-width: 0;
        }
        article {
          padding: 16px;
          margin-top: 16px;
          border: 1px solid #dbe2ea;
          border-radius: 14px;
          background: white;
        }
        label {
          display: block;
          font-size: 14px;
          margin: 12px 0;
        }
        input,
        select {
          display: block;
          box-sizing: border-box;
          width: 100%;
          padding: 12px;
          margin-top: 6px;
          border: 1px solid #cbd5e1;
          border-radius: 10px;
          background: white;
          font-size: 16px;
        }
        button {
          padding: 12px 16px;
          border: 0;
          border-radius: 10px;
          background: #243648;
          color: white;
          font-weight: 700;
          cursor: pointer;
          margin: 6px 0;
        }
        button:disabled {
          opacity: 0.5;
          cursor: default;
        }
        .check {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px;
          background: #f1f5f9;
          border-radius: 10px;
        }
        .check input {
          width: 20px;
          height: 20px;
          flex-shrink: 0;
          margin: 0;
        }
        .notice {
          padding: 12px;
          background: #fff7e6;
          border-radius: 10px;
        }
        .error {
          color: #b91c1c;
        }
        summary {
          cursor: pointer;
        }
      `}</style>
    </section>
  );
                }
