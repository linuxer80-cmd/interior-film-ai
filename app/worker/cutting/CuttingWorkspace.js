"use client";

import { useEffect, useState } from "react";
import {
  loadMyWorkerSites,
} from "../../utils/workerSites";
import {
  appendPhotoRows,
} from "../../../lib/cuttingPhotoImport.mjs";
import { filmLabel } from "./FilmThumbnail";
import FilmCuttingOptimizer from "./FilmCuttingOptimizer";
import CuttingPhotoImport from "./CuttingPhotoImport";

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
      siteId
        ? { siteId }
        : { profileOnly: true }
    )
      .then(data => {
        if (!active) return;

        setContext({
          ...data,
          selectedMaterialId:
            params.get("materialId"),
          storageKey:
            "film-cutting-v2:" +
            data.worker.worker_id +
            ":" +
            (siteId || "general"),
        });
      })
      .catch(error => {
        if (active) setError(error.message);
      });

    return () => {
      active = false;
    };
  }, []);

  function applyPhotos(rows) {
    const raw = window.localStorage.getItem(
      context.storageKey
    );

    const draft = raw ? JSON.parse(raw) : null;

    const makeId = prefix =>
      prefix + "-" + crypto.randomUUID();

    const next = appendPhotoRows(
      draft,
      rows,
      makeId
    );

    // 저장에 성공한 경우에만 기존 재단 화면을 다시 불러옵니다.
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

        <a href="/worker">
          내 현장으로 돌아가기
        </a>
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

  return (
    <>
      <div
        style={{
          maxWidth: 760,
          margin: "auto",
          padding: "0 16px",
        }}
      >
        <CuttingPhotoImport
          siteId={context.site?.site_id}
          colors={[
            ...new Set(
              (context.materials || []).map(
                filmLabel
              )
            ),
          ]}
          onApply={applyPhotos}
          onBusy={setPhotoBusy}
        />
      </div>

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
          key={
            context.storageKey +
            ":" +
            revision
          }
          context={context}
        />
      </fieldset>
    </>
  );
}
