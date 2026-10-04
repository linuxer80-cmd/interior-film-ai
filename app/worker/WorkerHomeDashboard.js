"use client";

import { useState } from "react";
import ToolIllustration from "../components/ui/ToolIllustration";
import {
  koreanDay,
  siteStatus,
  workerMonth,
} from "../utils/workerCalendar";

export default function WorkerHomeDashboard({
  worker,
  sites,
  onOpen,
}) {
  const [today] = useState(() => koreanDay());
  const [choose, setChoose] = useState(null);

  const activeSites = sites.filter(
    (site) =>
      !["cancelled", "completed"].includes(
        siteStatus(site)
      )
  );

  const entries =
    workerMonth(
      activeSites,
      today.slice(0, 7)
    ).byDay.get(today) || [];

  const menus = [
    {
      kind: "home",
      label: "내 현장",
      help: "일정과 배정 확인",
      href: "#my-sites",
    },
    {
      kind: "film",
      label: "필름·재단",
      help: "현장 필름 선택하기",
      section: "film",
    },
    {
      kind: "camera",
      label: "시공 사진",
      help: "현장에서 사진 등록",
      section: "photos",
    },
    {
      kind: "report",
      label: "완료보고",
      help: "시공 내용 작성",
      section: "report",
    },
  ];

  const selectableSites = sites.filter(
    (site) => siteStatus(site) !== "cancelled"
  );

  function openMenu(menu) {
    if (menu.href) {
      document
        .getElementById("my-sites")
        ?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });

      return;
    }

    setChoose(menu);
  }

  return (
    <>
      <section className="film-greeting">
        <div>
          <h2>
            {worker.worker_name || "시공자"}님,
            안녕하세요
          </h2>
          <p>오늘도 안전하게 시공하세요.</p>
        </div>

        <ToolIllustration
          kind="film"
          size={76}
        />
      </section>

      <section
        className="film-today"
        aria-label="오늘 내 현장"
      >
        <div className="film-section-top">
          <h2>오늘 내 현장</h2>

          <span>
            {today
              .slice(5)
              .replace("-", "월 ")}
            일 · {entries.length}개
          </span>
        </div>

        {entries.length ? (
          entries.map(({ site, role }) => (
            <button
              className="film-today-site"
              type="button"
              key={site.site_id}
              onClick={() =>
                onOpen(site.site_id)
              }
            >
              <span>
                <strong>
                  {site.site_name ||
                    site.customer_name ||
                    "현장"}
                </strong>

                <small>
                  {site.address ||
                    site.site_address ||
                    "주소는 현장 상세에서 확인하세요"}
                </small>

                <em>
                  {role === "leader"
                    ? "책임 팀장"
                    : "팀원"}
                </em>
              </span>

              <span className="film-open">
                현장 보기 →
              </span>
            </button>
          ))
        ) : (
          <p className="film-empty">
            오늘 배정된 현장이 없습니다.
            아래에서 다음 일정을 확인하세요.
          </p>
        )}
      </section>

      <section className="film-quick">
        <h2>빠른 메뉴</h2>

        <div className="film-menu-grid">
          {menus.map((menu) => (
            <button
              key={menu.label}
              type="button"
              className="film-menu-card"
              onClick={() =>
                openMenu(menu)
              }
            >
              <ToolIllustration
                kind={menu.kind}
              />

              <strong>
                {menu.label}
              </strong>

              <small>
                {menu.help}
              </small>
            </button>
          ))}
        </div>
      </section>

      {choose && (
        <section
          className="film-picker"
          aria-label={`${choose.label} 현장 선택`}
        >
          <div className="film-section-top">
            <h2>
              {choose.label} · 현장 선택
            </h2>

            <button
              type="button"
              onClick={() =>
                setChoose(null)
              }
            >
              닫기
            </button>
          </div>

          <p>작업할 현장을 선택하세요.</p>

          {selectableSites.map((site) => (
            <button
              type="button"
              className="film-picker-site"
              key={site.site_id}
              onClick={() =>
                onOpen(
                  site.site_id,
                  choose.section
                )
              }
            >
              {site.site_name ||
                site.customer_name ||
                "현장"}

              <span>열기 →</span>
            </button>
          ))}

          {!selectableSites.length && (
            <p>
              배정된 현장이 없습니다.
            </p>
          )}
        </section>
      )}
    </>
  );
          }
