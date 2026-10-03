"use client";

import {
  useEffect,
  useState,
} from "react";

import { loadMyWorkerSites } from "../../utils/workerSites";
import FilmCuttingOptimizer from "./FilmCuttingOptimizer";

export default function CuttingWorkspace() {
  const [context, setContext] = useState(null);
  const [error, setError] = useState("");

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
      .then((data) => {
        if (!active) return;

        setContext({
          ...data,
          selectedMaterialId:
            params.get("materialId"),
          storageKey:
            `film-cutting-v2:${data.worker.worker_id}:` +
            `${siteId || "general"}`,
        });
      })
      .catch((error) => {
        if (active) {
          setError(error.message);
        }
      });

    return () => {
      active = false;
    };
  }, []);

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
    <FilmCuttingOptimizer
      key={context.storageKey}
      context={context}
    />
  );
}
