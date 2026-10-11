"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import useAdminCompany from "../hooks/useAdminCompany";

import {
  SHOWCASE_BUCKET,
  safeHttpUrl,
} from "../../../lib/showcaseValidation.mjs";

import styles from "./page.module.css";

const services = [
  "문·문틀",
  "싱크대",
  "붙박이장·신발장",
  "샤시·몰딩",
];

const emptyProfile = {
  introduction: "",
  regions: "",
  services: [],
  business_name: "",
  representative_name: "",
  business_number: "",
  business_address: "",
  public_phone: "",
  public_email: "",
  blog_url: "",
  place_url: "",
  is_published: false,
};

const emptyCase = {
  title: "",
  category: "문·문틀",
  region: "",
  description: "",
  film: "",
  before_paths: [],
  after_paths: [],
  is_published: false,
  sort_order: 0,
};

const fields = [
  ["business_name", "사업자등록증상 상호", 100],
  ["representative_name", "대표자명", 100],
  ["business_number", "사업자등록번호", 30],
  ["business_address", "사업장 주소", 300],
  ["public_phone", "공개할 상담 전화번호", 30],
  ["public_email", "공개할 이메일", 200],
  ["regions", "시공 상담 지역", 300],
  ["blog_url", "시공 블로그 주소", 1000],
  ["place_url", "플레이스 주소", 1000],
];

export default function CustomerPageAdmin() {
  const {
    companyId,
    companyName,
    companySlug,
    initializeCompany,
    adminError,
  } = useAdminCompany();

  const [profile, setProfile] = useState(emptyProfile);
  const [cases, setCases] = useState([]);
  const [draft, setDraft] = useState(emptyCase);
  const [previews, setPreviews] = useState({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [savedPublished, setSavedPublished] = useState(false);

  useEffect(() => {
    initializeCompany();
  }, []);

  useEffect(() => {
    if (!companyId) {
      return;
    }

    let cancelled = false;

    async function load() {
      setReady(false);
      setMessage("고객페이지 설정을 불러오는 중입니다.");

      const [p, c] = await Promise.all([
        supabase
          .from("company_public_profiles")
          .select("*")
          .eq("company_id", companyId)
          .maybeSingle(),

        supabase
          .from("company_public_cases")
          .select("*")
          .eq("company_id", companyId)
          .order("sort_order")
          .order("created_at", { ascending: false }),
      ]);

      if (cancelled) {
        return;
      }

      if (p.error || c.error) {
        setMessage(
          `설정을 불러오지 못했습니다. SQL 설치와 관리자 권한을 확인해주세요. ${
            p.error?.message || c.error?.message
          }`
        );
        return;
      }

      setProfile({
        ...emptyProfile,
        business_name: companyName,
        ...(p.data || {}),
      });

      setCases(c.data || []);
      setSavedPublished(p.data?.is_published === true);
      setReady(true);
      setMessage("");
    }

    load().catch((error) => {
      if (!cancelled) {
        setMessage(error.message);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [companyId, companyName]);

  useEffect(() => {
    let cancelled = false;

    const paths = [
      ...draft.before_paths,
      ...draft.after_paths,
    ];

    if (!paths.length) {
      setPreviews({});
      return;
    }

    supabase.storage
      .from(SHOWCASE_BUCKET)
      .createSignedUrls(paths, 1800)
      .then(({ data, error }) => {
        if (cancelled) {
          return;
        }

        if (error) {
          setMessage(`사진 미리보기 오류: ${error.message}`);
          return;
        }

        setPreviews(
          Object.fromEntries(
            (data || [])
              .filter((item) => item.signedUrl)
              .map((item) => [item.path, item.signedUrl])
          )
        );
      });

    return () => {
      cancelled = true;
    };
  }, [draft.before_paths, draft.after_paths]);

  async function saveProfile(event) {
    event.preventDefault();

    if (!ready || busy) {
      return;
    }

    for (const key of ["blog_url", "place_url"]) {
      if (profile[key] && !safeHttpUrl(profile[key])) {
        setMessage(
          "링크는 http 또는 https 주소로 입력해주세요."
        );
        return;
      }
    }

    if (
      profile.is_published &&
      (
        !profile.business_name.trim() ||
        !profile.introduction.trim() ||
        !profile.services.length
      )
    ) {
      setMessage(
        "공개하려면 상호, 업체 소개와 제공하는 서비스를 입력해주세요."
      );
      return;
    }

    setBusy(true);

    try {
      const payload = Object.fromEntries(
        Object.keys(emptyProfile).map(
          (key) => [key, profile[key]]
        )
      );

      const { error } = await supabase
        .from("company_public_profiles")
        .upsert(
          {
            ...payload,
            company_id: companyId,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "company_id" }
        )
        .select("company_id")
        .single();

      if (error) {
        throw error;
      }

      setSavedPublished(profile.is_published);

      setMessage(
        profile.is_published
          ? "업체 정보가 저장되었습니다. 공개 설정한 사례도 고객페이지에 표시됩니다."
          : "저장되었습니다. 업체 소개와 모든 사례는 고객페이지에서 숨겨집니다."
      );
    } catch (error) {
      setMessage(`저장 실패: ${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function uploadPhotos(event, key) {
    const files = [...(event.target.files || [])];
    event.target.value = "";

    if (!files.length || !ready || busy) {
      return;
    }

    if (files.length + draft[key].length > 4) {
      setMessage(
        "시공 전·후 사진은 각각 최대 4장입니다."
      );
      return;
    }

    if (
      files.some(
        (file) =>
          ![
            "image/jpeg",
            "image/png",
            "image/webp",
          ].includes(file.type) ||
          file.size > 5 * 1024 * 1024
      )
    ) {
      setMessage(
        "사진은 JPG·PNG·WEBP, 장당 5MB 이하로 선택해주세요."
      );
      return;
    }

    setBusy(true);
    const uploaded = [];

    try {
      for (const file of files) {
        const extension = {
          "image/jpeg": "jpg",
          "image/png": "png",
          "image/webp": "webp",
        }[file.type];

        const path =
          `${companyId}/${crypto.randomUUID()}.${extension}`;

        const { error } = await supabase.storage
          .from(SHOWCASE_BUCKET)
          .upload(path, file, {
            contentType: file.type,
            upsert: false,
          });

        if (error) {
          throw error;
        }

        uploaded.push(path);
      }

      setMessage(
        "사진을 준비했습니다. 사례 저장을 눌러야 등록됩니다."
      );
    } catch (error) {
      setMessage(
        `사진 업로드 실패: ${error.message}. 업로드된 사진은 아래에 유지됩니다.`
      );
    } finally {
      if (uploaded.length) {
        setDraft((value) => ({
          ...value,
          [key]: [...value[key], ...uploaded],
        }));
      }

      setBusy(false);
    }
  }

  async function saveCase(event) {
    event.preventDefault();

    if (!ready || busy) {
      return;
    }

    if (
      !draft.title.trim() ||
      !draft.description.trim() ||
      !draft.after_paths.length
    ) {
      setMessage(
        "제목·작업 설명·완료 사진을 등록해주세요."
      );
      return;
    }

    setBusy(true);

    try {
      const payload = Object.fromEntries(
        Object.keys(emptyCase).map(
          (key) => [key, draft[key]]
        )
      );

      payload.company_id = companyId;
      payload.updated_at = new Date().toISOString();

      const query = draft.id
        ? supabase
            .from("company_public_cases")
            .update(payload)
            .eq("company_id", companyId)
            .eq("id", draft.id)
        : supabase
            .from("company_public_cases")
            .insert(payload);

      const { data, error } = await query
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      setCases((value) =>
        [
          ...value.filter((item) => item.id !== data.id),
          data,
        ].sort((a, b) => a.sort_order - b.sort_order)
      );

      setDraft(emptyCase);

      setMessage(
        data.is_published && savedPublished
          ? "시공 사례가 공개되었습니다."
          : "시공 사례를 저장했습니다. 업체 소개와 사례 모두 공개로 설정해야 고객에게 표시됩니다."
      );
    } catch (error) {
      setMessage(`사례 저장 실패: ${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <a href="/admin">‹ 관리자 홈</a>

      <h1>고객페이지 관리</h1>

      <p>
        사진 견적 아래에 표시할 {companyName}의
        업체 정보와 실제 시공 사례를 등록합니다.
      </p>

      {companySlug && (
        <a
          href={`/estimate/${encodeURIComponent(companySlug)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          고객페이지 열기 ↗
        </a>
      )}

      <p role="status" className={styles.status}>
        {adminError || message}
      </p>

      <form
        onSubmit={saveProfile}
        className={styles.panel}
      >
        <h2>업체 소개·사업자 정보</h2>

        <p>
          아래 정보는 공개 설정 후 고객에게 표시됩니다.
          고객 개인 정보는 입력하지 마세요.
        </p>

        <fieldset disabled={!ready || busy}>
          {fields.map(([key, label, max]) => (
            <label key={key}>
              {label}

              <input
                value={profile[key]}
                maxLength={max}
                type={
                  key === "public_email" ? "email" : "text"
                }
                onChange={(event) =>
                  setProfile((value) => ({
                    ...value,
                    [key]: event.target.value,
                  }))
                }
              />
            </label>
          ))}

          <label>
            업체 소개

            <textarea
              rows={5}
              value={profile.introduction}
              maxLength={3000}
              placeholder="실제로 제공하는 시공 서비스와 상담 방식을 소개해주세요."
              onChange={(event) =>
                setProfile((value) => ({
                  ...value,
                  introduction: event.target.value,
                }))
              }
            />
          </label>

          <h3>제공하는 시공 서비스</h3>

          {services.map((service) => (
            <label
              className={styles.check}
              key={service}
            >
              <input
                type="checkbox"
                checked={profile.services.includes(service)}
                onChange={(event) =>
                  setProfile((value) => ({
                    ...value,

                    services: event.target.checked
                      ? [...value.services, service]
                      : value.services.filter(
                          (item) => item !== service
                        ),
                  }))
                }
              />

              {service}
            </label>
          ))}

          <label className={styles.check}>
            <input
              type="checkbox"
              checked={profile.is_published}
              onChange={(event) =>
                setProfile((value) => ({
                  ...value,
                  is_published: event.target.checked,
                }))
              }
            />

            업체 소개와 공개 시공 사례를 고객페이지에 표시
          </label>

          <button type="submit">업체 정보 저장</button>
        </fieldset>
      </form>

      <form onSubmit={saveCase} className={styles.panel}>
        <h2>
          {draft.id ? "시공 사례 수정" : "새 시공 사례 등록"}
        </h2>

        <p>
          실제 같은 현장의 사진을 사용하세요.
          얼굴·상세 주소·연락처가 보이지 않는
          공개용 사진을 선택해주세요.
        </p>

        <fieldset disabled={!ready || busy}>
          <label>
            사례 제목

            <input
              required
              maxLength={100}
              value={draft.title}
              onChange={(event) =>
                setDraft((value) => ({
                  ...value,
                  title: event.target.value,
                }))
              }
            />
          </label>

          <label>
            시공 부위

            <select
              value={draft.category}
              onChange={(event) =>
                setDraft((value) => ({
                  ...value,
                  category: event.target.value,
                }))
              }
            >
              {services.map((service) => (
                <option key={service}>{service}</option>
              ))}
            </select>
          </label>

          <label>
            지역 — 시·구까지만

            <input
              maxLength={100}
              value={draft.region}
              onChange={(event) =>
                setDraft((value) => ({
                  ...value,
                  region: event.target.value,
                }))
              }
            />
          </label>

          <label>
            사용 필름 브랜드·제품번호

            <input
              maxLength={200}
              value={draft.film}
              onChange={(event) =>
                setDraft((value) => ({
                  ...value,
                  film: event.target.value,
                }))
              }
            />
          </label>

          <label>
            실제 작업 내용

            <textarea
              required
              rows={4}
              maxLength={3000}
              value={draft.description}
              onChange={(event) =>
                setDraft((value) => ({
                  ...value,
                  description: event.target.value,
                }))
              }
            />
          </label>

          {[
            ["before_paths", "시공 전 사진 (선택)"],
            [
              "after_paths",
              "완료 사진 (첫 사진이 대표 사진)",
            ],
          ].map(([key, label]) => (
            <div className={styles.upload} key={key}>
              <label>
                {label}

                <input
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) =>
                    uploadPhotos(event, key)
                  }
                />
              </label>

              <div className={styles.photos}>
                {draft[key].map((path, index) => (
                  <div key={path}>
                    {previews[path] && (
                      <img
                        src={previews[path]}
                        alt={`${label} ${index + 1}`}
                      />
                    )}

                    <span>
                      {index + 1}번
                      {key === "after_paths" && index === 0
                        ? " · 대표"
                        : ""}
                    </span>

                    <button
                      type="button"
                      onClick={() =>
                        setDraft((value) => ({
                          ...value,
                          [key]: value[key].filter(
                            (item) => item !== path
                          ),
                        }))
                      }
                    >
                      선택 해제
                    </button>

                    {index > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          setDraft((value) => ({
                            ...value,

                            [key]: [
                              path,
                              ...value[key].filter(
                                (item) => item !== path
                              ),
                            ],
                          }))
                        }
                      >
                        맨 앞으로
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          <label>
            노출 순서 (작은 숫자부터)

            <input
              type="number"
              min={0}
              max={9999}
              value={draft.sort_order}
              onChange={(event) =>
                setDraft((value) => ({
                  ...value,
                  sort_order: Number(event.target.value),
                }))
              }
            />
          </label>

          <label className={styles.check}>
            <input
              type="checkbox"
              checked={draft.is_published}
              onChange={(event) =>
                setDraft((value) => ({
                  ...value,
                  is_published: event.target.checked,
                }))
              }
            />

            이 사례를 고객페이지에 공개
          </label>

          <button type="submit">사례 저장</button>

          <button
            type="button"
            onClick={() => setDraft(emptyCase)}
          >
            새 사례 작성
          </button>
        </fieldset>
      </form>

      <section className={styles.panel}>
        <h2>등록한 사례 {cases.length}개</h2>

        {cases.map((item) => (
          <div className={styles.item} key={item.id}>
            <div>
              <strong>{item.title}</strong>

              <small>
                {item.is_published
                  ? "공개 설정"
                  : "비공개"}

                {!savedPublished &&
                  " · 업체 페이지 비공개"}
              </small>
            </div>

            <button
              disabled={busy || !ready}
              onClick={() => {
                setDraft(item);

                setMessage(
                  "위 사례 수정 영역에서 내용을 수정하고 저장해주세요."
                );
              }}
            >
              수정·공개 설정
            </button>
          </div>
        ))}

        {ready && !cases.length && (
          <p>
            완료 사진과 설명을 등록하면
            시공 사례를 만들 수 있습니다.
          </p>
        )}
      </section>
    </main>
  );
  }
