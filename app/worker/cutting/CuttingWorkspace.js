"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";
import { loadMyWorkerSites } from "../../utils/workerSites";
import { reportRequest } from "../../utils/reportClient";
import {
  appendPhotoRows,
  confirmedSize,
  issuedCuttingRolls,
  seedIssuedDraft,
} from "../../../lib/cuttingPhotoImport.mjs";
import { filmLabel } from "./FilmThumbnail";
import FilmCuttingOptimizer from "./FilmCuttingOptimizer";
import CuttingPhotoImport from "./CuttingPhotoImport";

const makeId = prefix =>
  `${prefix}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;

const panel = {
  maxWidth: 760,
  margin: "12px auto",
  padding: "0 16px",
};

function materialsOf(data) {
  if (data.materialsError) {
    throw Error(data.materialsError);
  }

  return (data.materials || []).filter(
    material =>
      material &&
      (
        material.product_code ||
        material.code ||
        material.product_name ||
        material.name
      )
  );
}

export default function CuttingWorkspace() {
  const [context, setContext] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [stockBusy, setStockBusy] = useState(false);

  const stockLock = useRef(false);

  useEffect(() => {
    let active = true;

    const siteId = new URLSearchParams(
      window.location.search
    ).get("siteId");

    async function load() {
      try {
        const [data, stock] = await Promise.all([
          loadMyWorkerSites(
            siteId
              ? { siteId }
              : { profileOnly: true }
          ),
          siteId
            ? reportRequest(
                `/api/film-stock?siteId=${encodeURIComponent(
                  siteId
                )}`
              )
            : Promise.resolve(null),
        ]);

        if (!active) return;

        if (siteId && !data.site) {
          throw Error(
            "현장 정보를 불러오지 못했습니다."
          );
        }

        if (!data.worker?.worker_id) {
          throw Error(
            "시공자 정보를 확인하지 못했습니다."
          );
        }

        const materials = materialsOf(data);

        const storageKey =
          "film-cutting-v2:" +
          data.worker.worker_id +
          ":" +
          (siteId || "general");

        let issued = [];
        let stockPending = false;

        if (siteId) {
          issued = issuedCuttingRolls(
            stock,
            materials,
            siteId
          );

          const raw =
            window.localStorage.getItem(
              storageKey
            );

          const draft = raw
            ? JSON.parse(raw)
            : null;

          const seeded = seedIssuedDraft(
            draft,
            issued,
            makeId
          );

          stockPending = seeded.pending;

          if (seeded.draft !== draft) {
            window.localStorage.setItem(
              storageKey,
              JSON.stringify(seeded.draft)
            );
          }
        }

        if (!active) return;

        setContext({
          ...data,
          materials,
          storageKey,
          selectedMaterialId: null,
          restrictMaterials: Boolean(siteId),
          issued,
          stockPending,
        });
      } catch (cause) {
        if (active) {
          setError(
            cause.message ||
              "재단페이지를 불러오지 못했습니다."
          );
        }
      }
    }

    load();

    return () => {
      active = false;
    };
  }, []);

  async function reloadIssuedRolls() {
    if (
      stockLock.current ||
      photoBusy ||
      !context?.site
    ) {
      return;
    }

    stockLock.current = true;
    setStockBusy(true);
    setNotice("");

    try {
      const siteId = context.site.site_id;

      const [data, stock] = await Promise.all([
        loadMyWorkerSites({ siteId }),
        reportRequest(
          `/api/film-stock?siteId=${encodeURIComponent(
            siteId
          )}`
        ),
      ]);

      const materials = materialsOf(data);

      const issued = issuedCuttingRolls(
        stock,
        materials,
        siteId
      );

      if (!issued.length) {
        throw Error(
          "현재 이 현장에 반출 중인 롤이 없습니다."
        );
      }

      const raw =
        window.localStorage.getItem(
          context.storageKey
        );

      const draft = raw
        ? JSON.parse(raw)
        : null;

      if (
        draft &&
        (
          draft.result ||
          Object.values(
            draft.progress || {}
          ).some(Boolean) ||
          draft.rolls?.some(
            roll => Number(roll.lengthM) > 0
          )
        ) &&
        !window.confirm(
          "롤 길이를 현재 반출 기록으로 다시 적용합니다. 부위와 사이즈는 유지하고 도면·완료 체크는 초기화합니다. 이미 재단했다면 실제 남은 길이를 확인해주세요."
        )
      ) {
        return;
      }

      const seeded = seedIssuedDraft(
        draft,
        issued,
        makeId,
        true
      );

      window.localStorage.setItem(
        context.storageKey,
        JSON.stringify(seeded.draft)
      );

      setContext(previous => ({
        ...previous,
        ...data,
        materials,
        issued,
        stockPending: false,
        selectedMaterialId: null,
      }));

      setRevision(value => value + 1);
      setNotice(
        `반출 기록의 ${issued.length}롤을 적용했습니다.`
      );
    } catch (cause) {
      setNotice(cause.message);
    } finally {
      stockLock.current = false;
      setStockBusy(false);
    }
  }

  function applyPhotos(rows) {
    const allowed = new Set(
      context.materials.map(filmLabel)
    );

    const selected = rows.filter(
      row => row.include
    );

    for (const row of selected) {
      confirmedSize(row);

      if (
        context.restrictMaterials &&
        !allowed.has(
          String(row.color || "")
            .trim()
            .toUpperCase()
        )
      ) {
        throw Error(
          "현장에 등록된 필름을 선택해주세요."
        );
      }
    }

    const raw =
      window.localStorage.getItem(
        context.storageKey
      );

    const draft = raw
      ? JSON.parse(raw)
      : null;

    const next = appendPhotoRows(
      draft,
      rows,
      makeId
    );

    if (next !== draft) {
      window.localStorage.setItem(
        context.storageKey,
        JSON.stringify(next)
      );

      setRevision(value => value + 1);
    }

    return selected.length;
  }

  if (error) {
    return (
      <main style={{ padding: 24 }}>
        <p role="alert">{error}</p>
        <a href="/worker">
          내 현장으로 돌아가기
        </a>
        <button
          type="button"
          onClick={() =>
            window.location.reload()
          }
          style={{
            display: "block",
            marginTop: 16,
          }}
        >
          다시 확인
        </button>
      </main>
    );
  }

  if (!context) {
    return (
      <main style={{ padding: 24 }}>
        현장 필름과 반출 롤을 불러오고 있습니다…
      </main>
    );
  }

  if (
    context.restrictMaterials &&
    !context.materials.length
  ) {
    return (
      <main style={{ padding: 24 }}>
        <h2>
          {context.site?.site_name || "현장"} 재단
        </h2>
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

  const total = Number(
    context.issued
      .reduce(
        (sum, roll) =>
          sum + Number(roll.lengthM),
        0
      )
      .toFixed(3)
  );

  return (
    <>
      {context.site && (
        <section style={panel}>
          <div
            style={{
              padding: 14,
              background: "#eff6ff",
              border: "1px solid #bfdbfe",
              borderRadius: 12,
              lineHeight: 1.7,
            }}
          >
            <strong>
              반출 중 {context.issued.length}롤 · {total}m
            </strong>

            <p
              style={{
                margin: "5px 0",
                fontSize: 13,
              }}
            >
              {context.stockPending
                ? "저장된 재단 계획을 유지했습니다. 반출 롤을 적용하려면 아래 버튼을 누르세요."
                : context.issued.length
                  ? "반출 기록의 롤별 길이를 자동 입력했습니다. 실제로 재단한 뒤에는 남은 길이를 확인해주세요."
                  : "반출 중인 롤이 없습니다. 현장에서 롤 반출을 등록해주세요."}
            </p>

            <button
              type="button"
              onClick={reloadIssuedRolls}
              disabled={
                stockBusy || photoBusy
              }
              style={{
                padding: "10px 12px",
                borderRadius: 9,
                border: "1px solid #93c5fd",
                background: "#fff",
                fontWeight: 700,
              }}
            >
              {stockBusy
                ? "불러오는 중…"
                : "반출 롤 다시 불러오기"}
            </button>

            {notice && (
              <p role="status">{notice}</p>
            )}
          </div>
        </section>
      )}

      <fieldset
        disabled={photoBusy || stockBusy}
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
          ...panel,
          marginBottom: 24,
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
          📷 종이 재단표 자동 입력
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
