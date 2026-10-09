"use client";

import { useEffect, useState } from "react";
import { loadMyWorkerSites } from "../../utils/workerSites";
import { appendPhotoRows } from "../../../lib/cuttingPhotoImport.mjs";
import { filmLabel } from "./FilmThumbnail";
import FilmCuttingOptimizer from "./FilmCuttingOptimizer";
import CuttingPhotoImport from "./CuttingPhotoImport";

const normalize = value =>
  String(value || "").trim().toUpperCase();

export default function CuttingWorkspace() {
  const [context, setContext] = useState(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [photoBusy, setPhotoBusy] = useState(false);

  useEffect(() => {
    let active = true;

    const params = new URLSearchParams(
      window.location.search
    );

    const siteId = params.get("siteId");

    loadMyWorkerSites(
      siteId ? { siteId } : { profileOnly: true }
    )
      .then(data => {
        if (!active) return;

        if (siteId && !data.site) {
          throw new Error(
            "현장 정보를 불러오지 못했습니다."
          );
        }

        if (data.materialsError) {
          throw new Error(data.materialsError);
        }

        if (!data.worker?.worker_id) {
          throw new Error(
            "시공자 정보를 확인하지 못했습니다. 다시 로그인해주세요."
          );
        }

        setContext({
          ...data,
          materials: (data.materials || []).filter(
            material =>
              material &&
              (
                material.product_code ||
                material.code ||
                material.product_name ||
                material.name
              )
          ),
          selectedMaterialId: null,
          restrictMaterials: Boolean(siteId),
          storageKey:
            "film-cutting-v2:" +
            data.worker.worker_id +
            ":" +
            (siteId || "general"),
        });
      })
      .catch(cause => {
        if (active) {
          setError(
            cause.message ||
              "재단페이지를 불러오지 못했습니다."
          );
        }
      });

    return () => {
      active = false;
    };
  }, []);

  function applyPhotos(rows) {
    const materials = context.materials;
    const allowed = new Set(materials.map(filmLabel));

    const nextRows = rows.map(row => {
      if (!row.include || !context.restrictMaterials) {
        return row;
      }

      const color = normalize(row.color);

      if (allowed.has(color)) {
        return { ...row, color };
      }

      const matches = materials.filter(
        material =>
          normalize(
            material.product_code || material.code
          ) === color
      );

      const labels = [
        ...new Set(matches.map(filmLabel)),
      ];

      if (labels.length !== 1) {
        throw new Error(
          `"${row.color || "미선택"}" 필름을 이 현장에 등록된 브랜드 / 제품번호로 수정해주세요.`
        );
      }

      return { ...row, color: labels[0] };
    });

    const raw = window.localStorage.getItem(
      context.storageKey
    );

    const draft = raw ? JSON.parse(raw) : null;

    if (
      Object.values(draft?.progress || {}).some(Boolean)
    ) {
      throw new Error(
        "완료 체크가 있는 도면입니다. 먼저 재단 계획 다시 작성을 눌러주세요."
      );
    }

    const next = appendPhotoRows(
      draft,
      nextRows,
      prefix =>
        prefix +
        "-" +
        Date.now() +
        "-" +
        Math.random().toString(36).slice(2, 10)
    );

    window.localStorage.setItem(
      context.storageKey,
      JSON.stringify(next)
    );

    setRevision(value => value + 1);
  }

  if (error) {
    return (
      <main style={{ padding: 24 }}>
        <p role="alert">{error}</p>
        <a href="/worker">내 현장으로 돌아가기</a>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{ display: "block", marginTop: 16 }}
        >
          다시 확인
        </button>
      </main>
    );
  }

  if (!context) {
    return (
      <main style={{ padding: 24 }}>
        현장 재단 기록을 준비하고 있습니다…
      </main>
    );
  }

  if (
    context.restrictMaterials &&
    !context.materials.length
  ) {
    return (
      <main style={{ padding: 24 }}>
        <h2>{context.site?.site_name || "현장"} 재단</h2>
        <p>
          등록된 필름이 없습니다.
          관리자에게 현장 필름 등록을 요청해주세요.
        </p>
        <a
          href={`/worker/site/${context.site.site_id}?section=film`}
        >
          ← 현장으로 돌아가기
        </a>
      </main>
    );
  }

  return (
    <>
      <fieldset
        disabled={photoBusy}
        style={{
          border: 0,
          padding: 0,
          margin: 0,
          minWidth: 0,
        }}
      >
        <FilmCuttingOptimizer
          key={`${context.storageKey}:${revision}`}
          context={context}
        />
      </fieldset>

      <details
        style={{
          maxWidth: 760,
          margin: "0 auto 24px",
          padding: "0 16px",
        }}
      >
        <summary
          style={{
            padding: 16,
            background: "#fff",
            border: "1px solid #e2e8f0",
            borderRadius: 12,
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          📷 종이 재단표 사진으로 입력하기
        </summary>

        <CuttingPhotoImport
          siteId={context.site?.site_id}
          colors={[
            ...new Set(
              context.materials.map(filmLabel)
            ),
          ]}
          onApply={applyPhotos}
          onBusy={setPhotoBusy}
        />
      </details>
    </>
  );
}
