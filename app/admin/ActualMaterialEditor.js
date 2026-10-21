"use client";

import MaterialPurchaseCost from "./MaterialPurchaseCost";
import MaterialFilmPicker from "../components/MaterialFilmPicker";
import ActualMaterialPricePicker from "./ActualMaterialPricePicker";
import {sameFilmProduct} from "../../lib/hyundaiFilmCode";
import { useState } from "react";
import { supabase } from "../../lib/supabase";

const empty = {
  brand: "",
  product_code: "",
  product_name: "",
  quantity: "",
  unit: "m",
  unit_price: "",
  memo: "",
};

const won = (value) =>
  `${Number(value || 0).toLocaleString("ko-KR")}원`;

const pricePending = (item) =>
  Number(item.quantity) > 0 && (item.unit_price == null || item.unit_price === "");

const field = {
  width: "100%",
  boxSizing: "border-box",
  padding: 12,
  border: "1px solid #cbd5e1",
  borderRadius: 10,
  fontSize: 16,
};

const button = {
  padding: "10px 14px",
  border: "1px solid #cbd5e1",
  borderRadius: 10,
  background: "white",
  cursor: "pointer",
  fontWeight: 700,
};

export default function ActualMaterialEditor({
  siteId,
  materials = [],
  onSaved,
}) {
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [priceLoading,setPriceLoading]=useState(false);
  const [priceOnlyOffer,setPriceOnlyOffer]=useState(null);

  async function submit(method, item) {
    setBusy(true);
    setPriceOnlyOffer(null);
    setError("");
    setMessage("");

    try {
      const {
        data,
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !data?.session?.access_token) {
        throw new Error("관리자 로그인이 필요합니다.");
      }

      const original=materials.find(row=>row.id===item.id);
      const purchase=item._purchaseCost;
      const applyPurchase=method==="PATCH"&&purchase&&original&&Number(item.unit_price)===Number(purchase.unitPrice)&&Number(item.quantity)===Number(purchase.quantity)&&["brand","product_code","product_name","quantity","unit","memo"].every(key=>String(item[key]??"")===String(original[key]??""));
      const response = await fetch(
        applyPurchase?"/api/admin/material-purchase-cost":"/api/admin/site-materials",
        {
          method:applyPurchase?"POST":method,
          headers: {
            Authorization: `Bearer ${data.session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(applyPurchase?{materialId:item.id,action:"apply",optionId:purchase.optionId,version:purchase.version,confirmMetres:false}:{ ...item, siteId }),
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        if(result.priceOnlyMaterial)setPriceOnlyOffer({material:result.priceOnlyMaterial,unit_price:String(item.unit_price)});
        throw new Error(
          result.error || "자재 저장에 실패했습니다."
        );
      }

      setDraft(null);
      setMessage(
        result.priceSource === "manual"
          ? "단가를 저장했습니다. 반출·반입 사용량은 유지하고 자재비를 다시 계산했습니다."
          : method === "DELETE"
          ? "자재를 삭제했습니다."
          : "자재를 저장했습니다. 매출수익을 다시 조회하면 반영됩니다."
      );

      await onSaved?.();
    } catch (cause) {
      setError(cause.message || "저장에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  function edit(item) {
    setPriceOnlyOffer(null);
    setError("");
    setMessage("");

    setDraft({
      ...empty,
      ...item,
      quantity: String(item.quantity ?? ""),
      unit_price: String(
        item.unit_price ??
          (Number(item.quantity) > 0 &&
          item.total_price != null
            ? Number(item.total_price) / Number(item.quantity)
            : "")
      ),
    });
  }

  const pendingCount = materials.filter(pricePending).length;
  const total = materials.reduce(
    (sum, item) =>
      sum +
      (pricePending(item) ? 0 : Number(
        item.total_price ??
          Number(item.quantity || 0) *
            Number(item.unit_price || 0)
      )),
    0
  );

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <button
        type="button"
        disabled={busy || !!draft}
        onClick={() => edit(empty)}
        style={{ ...button, color: "#1d4ed8" }}
      >
        ＋ 사용 자재 추가
      </button>

      {!materials.length && (
        <p style={{ color: "#64748b" }}>
          등록된 실제 사용 자재가 없습니다.
        </p>
      )}

      {materials.map((item) => (
        <div
          key={item.id}
          style={{
            padding: 14,
            border: "1px solid #e2e8f0",
            borderRadius: 12,
          }}
        >
          <strong>
            {[
              item.brand,
              item.product_code,
              item.product_name,
            ]
              .filter(Boolean)
              .join(" · ") || "자재"}
          </strong>

          <p
            style={{
              margin: "8px 0",
              color: "#475569",
            }}
          >
            {item.quantity} {item.unit} ×{" "}
            {item.unit_price == null
              ? "단가 미입력"
              : won(item.unit_price)}
            <br />
            자재비{" "}
            {pricePending(item)
              ? "계산 대기 · 단가 미입력"
              : won(item.total_price ?? Number(item.quantity || 0) * Number(item.unit_price || 0))}
          </p>

          <MaterialPurchaseCost
            material={item}
            disabled={busy || !!draft}
            onSaved={onSaved}
          />

          {item.memo && (
            <p style={{ fontSize: 13, color: "#64748b" }}>
              {item.memo}
            </p>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              disabled={busy || !!draft}
              onClick={() => edit(item)}
              style={button}
            >
              수정
            </button>

            <button
              type="button"
              disabled={busy || !!draft}
              onClick={() => {
                if (
                  window.confirm(
                    "이 실제 사용 자재를 삭제하시겠습니까? 자재비에서도 제외됩니다."
                  )
                ) {
                  submit("DELETE", item);
                }
              }}
              style={{ ...button, color: "#b91c1c" }}
            >
              삭제
            </button>
          </div>
        </div>
      ))}

      {!!materials.length && (
        <strong style={{ textAlign: "right" }}>
          {pendingCount > 0
            ? <>입력된 자재비 소계 {won(total)}<br />단가 미입력 {pendingCount}건 · 전체 자재비 계산 대기</>
            : <>실제 자재비 합계 {won(total)}</>}
        </strong>
      )}

      {draft && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if(priceLoading){setError("매입단가 확인이 끝난 뒤 저장해주세요.");return;}
            submit(draft.id ? "PATCH" : "POST", draft);
          }}
          style={{
            display: "grid",
            gap: 12,
            padding: 14,
            background: "#eff6ff",
            borderRadius: 12,
          }}
        >
          <strong>
            {draft.id ? "사용 자재 수정" : "사용 자재 추가"}
          </strong>

          {[
            ["brand", "브랜드"],
            ["product_code", "제품 코드"],
            ["product_name", "제품명"],
            ["quantity", "실제 사용량"],
            ["unit", "단위 (m, 개, 롤 등)"],
            ["unit_price", "단가 (원 / 위 단위)"],
            ["memo", "메모"],
          ].map(([key, label]) => key === "product_code" ? (
            <MaterialFilmPicker
              key={key}
              value={draft}
              disabled={busy}
              onChange={product => {setPriceOnlyOffer(null);setDraft(current => {
                if(!current)return current;
                const original=materials.find(row=>row.id===current.id);
                const same=original&&sameFilmProduct(original.brand,original.product_code,product.brand,product.product_code);
                return {...current,...product,...(same?{brand:original.brand,product_code:original.product_code,product_name:original.product_name}:{}),unit_price:same?current.unit_price:"",_purchaseCost:null};
              });}}
            />
          ) : (
            <label
              key={key}
              style={{
                display: "grid",
                gap: 5,
                fontSize: 14,
              }}
            >
              {label}
              <input
                style={field}
                disabled={busy}
                type={
                  key === "quantity" || key === "unit_price"
                    ? "number"
                    : "text"
                }
                step={
                  key === "quantity"
                    ? "0.001"
                    : key === "unit_price"
                      ? "any"
                      : undefined
                }
                min={
                  key === "quantity"
                    ? "0.001"
                    : key === "unit_price"
                      ? "0"
                      : undefined
                }
                required={
                  key === "quantity" ||
                  key === "unit_price" ||
                  key === "unit"
                }
                value={draft[key] ?? ""}
                onChange={(event) => {
                  setPriceOnlyOffer(null);
                  setDraft({
                    ...draft,
                    [key]: event.target.value,
                    _purchaseCost:null,
                  });}
                }
              />
            </label>
          ))}

          <ActualMaterialPricePicker siteId={siteId} value={draft} disabled={busy} onPending={setPriceLoading}
            onApply={(price,context)=>setDraft(current=>{
              if(!current)return current;
              const key=[siteId,current.id||"",current.brand||"",current.product_code||"",current.unit||""].join("|");
              if(key!==context.key || (context.automatic && current.unit_price!==context.expected))return current;
              return {...current,unit_price:String(price),_purchaseCost:context.purchase||null};
            })}/>
          <strong>
            자재비{" "}
            {won(
              Math.round(
                Number(draft.quantity || 0) *
                  Number(draft.unit_price || 0)
              )
            )}
          </strong>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              disabled={busy}
              type="button"
              style={button}
              onClick={() => setDraft(null)}
            >
              취소
            </button>

            <button
              disabled={busy || priceLoading}
              type="submit"
              style={{
                ...button,
                background: "#2563eb",
                color: "white",
              }}
            >
              {busy ? "저장 중…" : "자재 저장"}
            </button>
          </div>
        </form>
      )}

      {error && (
        <p role="alert" style={{ color: "#b91c1c" }}>
          {error}
        </p>
      )}

      {priceOnlyOffer&&draft&&<div style={{padding:14,border:"1px solid #d5dfcd",borderRadius:12}}>
        <p>기존 자재 확인</p>
        <p>{[priceOnlyOffer.material.brand,priceOnlyOffer.material.product_code,priceOnlyOffer.material.product_name].filter(Boolean).join(" · ")}<br/>
        사용량 {priceOnlyOffer.material.quantity}{priceOnlyOffer.material.unit} · 단가 {won(priceOnlyOffer.unit_price)}</p>
        <p>제품·사용량·메모는 기존 기록을 유지하고 단가만 저장합니다.</p>
        <button type="button" disabled={busy} style={button} onClick={()=>{
          const corrected={...draft,...priceOnlyOffer.material,unit_price:priceOnlyOffer.unit_price,_purchaseCost:null};
          setDraft(corrected);submit("PATCH",corrected);
        }}>기존 자재의 단가만 저장</button>
      </div>}
      {message && (
        <p role="status" style={{ color: "#166534" }}>
          {message}
        </p>
      )}
    </div>
  );
}
