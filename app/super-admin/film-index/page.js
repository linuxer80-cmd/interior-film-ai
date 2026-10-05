"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabase";
import {
  PROFILE_VERSION,
  imageProfile,
  readProfiles,
} from "../../../lib/filmImageSimilarity.mjs";
import { getFilmSampleUrl } from "../../components/FilmSampleImage";

export default function FilmIndexPage() {
  const [allowed, setAllowed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(
    "권한 확인 중…"
  );
  const [progress, setProgress] = useState({
    done: 0,
    total: 0,
    saved: 0,
  });
  const [errors, setErrors] = useState([]);

  const task = useRef(null);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser();

        if (error || !user) {
          throw new Error(
            "슈퍼관리자 계정으로 로그인해 주세요."
          );
        }

        const result = await supabase
          .from("super_admins")
          .select("user_id")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .maybeSingle();

        if (result.error || !result.data) {
          throw new Error(
            "활성 슈퍼관리자만 사용할 수 있습니다."
          );
        }

        if (active) {
          setAllowed(true);
          setStatus(
            "신규·변경 샘플 분석을 시작할 수 있습니다."
          );
        }
      } catch (error) {
        if (active) {
          setStatus(error.message);
        }
      }
    })();

    return () => {
      active = false;
      task.current?.abort();
      task.current = null;
    };
  }, []);

  async function run(force = false) {
    if (task.current) return;

    const controller = new AbortController();
    task.current = controller;

    const signal = controller.signal;
    const current = () =>
      task.current === controller;

    setBusy(true);
    setErrors([]);
    setProgress({
      done: 0,
      total: 0,
      saved: 0,
    });
    setStatus("분석 대상 확인 중…");

    try {
      const products = [];

      for (let from = 0; ; from += 500) {
        const { data, error } = await supabase
          .from("film_products")
          .select(
            "id,brand,product_code,sample_image_path,updated_at"
          )
          .eq("is_active", true)
          .order("id")
          .range(from, from + 499)
          .abortSignal(signal);

        if (signal.aborted) {
          throw new DOMException(
            "취소됨",
            "AbortError"
          );
        }

        if (error) throw error;

        products.push(...(data || []));

        if (!data || data.length < 500) {
          break;
        }
      }

      const ready = new Set(
        (
          await readProfiles(supabase, signal)
        ).map((row) => row.product_id)
      );

      const pending = products.filter(
        (product) =>
          getFilmSampleUrl(
            product.sample_image_path
          ) &&
          (force || !ready.has(product.id))
      );

      let next = 0;
      let done = 0;
      let saved = 0;

      const failures = [];

      if (current()) {
        setProgress({
          done,
          saved,
          total: pending.length,
        });
        setStatus("이미지 특징 분석 중…");
      }

      async function worker() {
        while (
          !signal.aborted &&
          next < pending.length
        ) {
          const product = pending[next++];

          try {
            // 같은 주소로 교체된 이미지도 다시 확인합니다.
            const url = new URL(
              getFilmSampleUrl(
                product.sample_image_path
              ),
              window.location.origin
            );

            url.searchParams.set(
              "film_profile",
              `${PROFILE_VERSION}-${product.updated_at}-${
                force ? Date.now() : ""
              }`
            );

            const profile = await imageProfile(
              url.href,
              signal
            );

            if (signal.aborted) return;

            const { error } = await supabase
              .from("film_image_profiles")
              .upsert(
                {
                  product_id: product.id,
                  sample_image_path:
                    product.sample_image_path,
                  source_updated_at:
                    product.updated_at,
                  version: PROFILE_VERSION,
                  profile,
                  analyzed_at:
                    new Date().toISOString(),
                },
                {
                  onConflict: "product_id",
                }
              )
              .abortSignal(signal);

            if (signal.aborted) return;

            if (error) throw error;

            saved++;
          } catch (error) {
            if (signal.aborted) return;

            failures.push(
              `${product.brand} ${product.product_code}: ${
                error.message || "분석 실패"
              }`
            );
          }

          done++;

          if (current()) {
            setProgress({
              done,
              saved,
              total: pending.length,
            });
            setErrors([...failures]);
          }
        }
      }

      await Promise.all([
        worker(),
        worker(),
        worker(),
      ]);

      if (current()) {
        setStatus(
          signal.aborted
            ? "중지했습니다. 저장된 결과는 유지됩니다."
            : `완료: ${saved}개 저장, ${failures.length}개 실패. 다시 시작하면 미완료 샘플만 처리합니다.`
        );
      }
    } catch (error) {
      if (current()) {
        setStatus(
          signal.aborted
            ? "중지했습니다. 다시 시작하면 이어서 처리합니다."
            : error.message
        );
      }
    } finally {
      if (current()) {
        task.current = null;
        setBusy(false);
      }
    }
  }

  return (
    <main
      style={{
        maxWidth: 720,
        margin: "auto",
        padding: 24,
      }}
    >
      <Link href="/super-admin">
        슈퍼관리자로 돌아가기
      </Link>

      <h1>필름 샘플 이미지 분석</h1>

      <p>
        색상과 무늬 특징을 저장합니다. 고객이
        검색할 때 원본 이미지를 다시 분석하지
        않습니다.
      </p>

      <p>
        분석 중에는 화면을 열어 두세요.
        중지하거나 화면을 닫아도 저장된 결과는
        유지됩니다. 새 샘플이나 수정된 제품은
        다음 실행에서 분석합니다.
      </p>

      <p role="status">{status}</p>

      {allowed && (
        <div>
          <button
            disabled={busy}
            onClick={() => run(false)}
          >
            신규·변경 샘플 분석 / 이어서 시작
          </button>{" "}

          <button
            disabled={busy}
            onClick={() => run(true)}
          >
            전체 다시 분석
          </button>{" "}

          {busy && (
            <button
              onClick={() =>
                task.current?.abort()
              }
            >
              중지
            </button>
          )}
        </div>
      )}

      <p>
        처리 {progress.done} / {progress.total}개
        · 저장 {progress.saved}개
        · 실패 {errors.length}개
      </p>

      {progress.total > 0 && (
        <progress
          value={progress.done}
          max={progress.total}
          style={{ width: "100%" }}
        />
      )}

      {errors.length > 0 && (
        <details>
          <summary>실패한 샘플 보기</summary>

          <ul>
            {errors.map((error, index) => (
              <li key={index}>{error}</li>
            ))}
          </ul>
        </details>
      )}

      <p>
        <Link href="/samples">
          샘플 검색 확인하기
        </Link>
      </p>

      <style jsx>{`
        button {
          padding: 12px;
          margin: 6px 0;
          border: 1px solid #ccc;
          border-radius: 10px;
          background: white;
          color: #111;
        }

        button:disabled {
          opacity: 0.5;
        }

        p {
          line-height: 1.7;
        }

        li {
          overflow-wrap: anywhere;
        }
      `}</style>
    </main>
  );
        }
