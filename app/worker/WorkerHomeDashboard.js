"use client";

import {relationshipRequest} from "../../lib/workerRelationshipClient";
import LaborNotifications from "../components/LaborNotifications";
import { useEffect, useState } from "react";
import Link from "next/link";
import TomorrowTasks from "../components/TomorrowTasks";
import SavedCommuteSummary from "../components/SavedCommuteSummary";
import ToolIllustration from "../components/ui/ToolIllustration";

import {
  koreanDay,
  siteStatus,
  workerMonth,
} from "../utils/workerCalendar";

const menus = [
  { id: "samples", href: "/samples?from=worker", icon: "customer", title: "필름 샘플 보기", subtitle: "브랜드·색상별 필름 샘플 확인" },
  {
    id: "jobs",
    href: "/jobs?view=worker",
    icon: "recruitment",
    title: "구인 찾기 · 내 구직",
    subtitle:
      "현장 구인 확인 · 내 구직 공개",
  },
  {
    id: "account",
    href: "/worker/account",
    icon: "people",
    title: "개인설정",
    subtitle:
      "프로필·일당·계좌·활동 지역 설정",
  },
  {
    id: "attendance",
    href: "/worker/attendance",
    icon: "attendance",
    title: "출퇴근기록",
    subtitle:
      "출근·퇴근 시간과 기록 위치 확인",
  },
  {
    id: "sites",
    icon: "house",
    title: "내 현장",
    subtitle: "오늘, 새로운 공간으로",
  },
  {
    id: "film",
    icon: "film",
    title: "필름 · 재단",
    subtitle:
      "정확한 재단이 좋은 마감의 시작",
  },
  {
    id: "inventory",
    href: "/worker/inventory",
    icon: "stock",
    title: "현장 자재 재고",
    subtitle:
      "팀장으로 맡은 현장의 사용 필름 재고 확인",
  },
  {
    id: "report",
    icon: "report",
    title: "완료보고",
    subtitle:
      "작업한 결과를 간단하게 기록",
  },
  {
    id: "pay",
    icon: "money",
    title: "근무금액",
    subtitle:
      "오늘의 노력, 정확한 정산으로",
  },
];

export default function WorkerHomeDashboard({
  worker,
  sites = [],
  onOpen,
}) {
  const [employeeHome, setEmployeeHome] = useState(null);
  const [companyNames,setCompanyNames] = useState({});
  const [relationshipError, setRelationshipError] = useState("");
  const [relationshipReload, setRelationshipReload] = useState(0);
  useEffect(() => {
    let active = true;
    setEmployeeHome(null); setRelationshipError('');
    relationshipRequest({action:'mine'}).then(data=>{
      if(!Array.isArray(data.relationships)) throw Error('소속 정보를 확인할 수 없습니다.');
      if(active){
        setEmployeeHome(data.relationships.some(r=>r.relationship_type==='employee'));
        const names={};
        for(const r of data.relationships){
          if(r.company_id && (r.company_name || r.companyName)) names[r.company_id]=r.company_name || r.companyName;
        }
        setCompanyNames(names);
      }
    }).catch(error=>{if(active)setRelationshipError(error.message || '소속 확인에 실패했습니다.');});
    return ()=>{active=false;};
  }, [relationshipReload]);
  const [today, setToday] = useState(
    () => koreanDay()
  );

  const available = sites.filter(
    site => siteStatus(site) !== "cancelled"
  );

  const entries =
    workerMonth(
      available,
      today.slice(0, 7)
    ).byDay.get(today) || [];

  useEffect(() => {
    const timer = setInterval(
      () => setToday(koreanDay()),
      60000
    );

    return () => clearInterval(timer);
  }, []);

  const dateLabel = new Intl.DateTimeFormat(
    "ko-KR",
    {
      month: "long",
      day: "numeric",
      weekday: "short",
      timeZone: "Asia/Seoul",
    }
  ).format(
    new Date(`${today}T03:00:00Z`)
  );

  return (
    <section
      className="worker-polished"
      aria-label="시공자 홈"
    >
      {/* 배정 알림은 유지하고 직원 홈의 구인 탐색 메뉴만 숨깁니다. */}
      {employeeHome===null && <p role="status">{relationshipError || '업체 소속을 확인하고 있습니다…'}{relationshipError && <button type="button" onClick={()=>setRelationshipReload(v=>v+1)}>다시 확인</button>}</p>}
      <LaborNotifications />

      <div className="wp-hello">
        <span>
          {worker?.worker_name || "시공자"}님,
          반갑습니다
        </span>

        <span className="wp-date">
          {dateLabel}
        </span>
      </div>

      <div className="wp-hero">
        <div>
          <h2>
            오늘도
            <br />
            안전한 시공!
          </h2>

          <p>
            좋은 공간을 만드는
            <br />
            당신의 손을 응원합니다.
          </p>

          <span className="wp-hero-tag">
            나의 시공 파트너, 필름장이
          </span>
        </div>

        <div className="wp-hero-art">
          <ToolIllustration size={185} />
        </div>
      </div>

      <div className="wp-section-title">
        <h3>오늘의 현장</h3>

        <Link href="/worker/menu/sites">
          전체 일정 ›
        </Link>
      </div>

      <div className="wp-today">
        {entries.length ? (
          entries.map(({ site, role }) => (
            <button
              type="button"
              className="wp-site"
              key={site.site_id}
              onClick={() =>
                onOpen(site.site_id)
              }
            >
              <span className="wp-site-art">
                <ToolIllustration size={69} />
              </span>

              <span className="wp-site-text">
                <span style={{fontSize:12,fontWeight:800,color:"#2563eb"}}>협력 업체 · {site.company_name || site.companyName || companyNames[site.company_id] || "업체명 확인 필요"}</span>
                <small>
                  {site.address ||
                    site.site_address ||
                    "주소는 현장 상세에서 확인하세요"}
                </small>

                <strong>
                  {site.site_name ||
                    site.customer_name ||
                    "현장"}
                </strong>

                <span className="wp-role">
                  {role === "leader"
                    ? "책임 팀장"
                    : "팀원"}
                </span>

                <SavedCommuteSummary
                  siteId={site.site_id}
                  workDate={today}
                />
              </span>

              <span
                className="wp-site-arrow"
                aria-hidden="true"
              >
                ›
              </span>
            </button>
          ))
        ) : (
          <div className="wp-empty">
            <strong>
              오늘은 배정된 현장이 없어요
            </strong>

            <p>
              내 현장에서 다음 시공 일정을
              확인하세요.
            </p>

            <Link href="/worker/menu/sites">
              내 일정 확인 →
            </Link>
          </div>
        )}
      </div>

      <Link
        href="/worker/companies"
        className="wp-photo-link"
      >
        <span>
          여러 업체의 현장을 한 번에 확인하세요
        </span>

        <strong>
          소속 업체 · 통합 일정 ›
        </strong>
      </Link>

      <TomorrowTasks />

      <nav
        className="wp-grid"
        aria-label="시공자 주요 메뉴"
      >
        {menus.map(menu => (
          <Link
            key={menu.id}
            href={
              menu.href ||
              `/worker/menu/${menu.id}`
            }
            className="wp-menu"
          >
            <ToolIllustration
              kind={menu.icon}
              size="100%"
              className="photo-menu-art"
            />

            <strong>{menu.title}</strong>

            <small>{menu.subtitle}</small>

            <span
              className="wp-arrow"
              aria-hidden="true"
            >
              ›
            </span>
          </Link>
        ))}
      </nav>

      <Link
        href="/worker/menu/photos"
        className="wp-photo-link"
      >
        <span>
          시공 전·후 사진도 잊지 마세요
        </span>

        <strong>사진 등록 ›</strong>
      </Link>

      <nav
        className="wp-bottom"
        aria-label="시공자 하단 메뉴"
      >
        <Link
          href="/worker"
          aria-current="page"
        >
          <ToolIllustration kind="home" size={36} className="film-nav-image" />
          <small>홈</small>
        </Link>

        {menus
          .filter(menu =>
            ![
              "samples",
              "attendance",
              "inventory",
              "jobs",
              "account",
              "pay",
            ].includes(menu.id)
          )
          .map(menu => (
            <Link
              key={menu.id}
              href={`/worker/menu/${menu.id}`}
            >
              <ToolIllustration kind={menu.id === "sites" ? "camera" : menu.icon} size={36} className="film-nav-image" />

              <small>{menu.title}</small>
            </Link>
          ))}
        <Link href="/worker/more"><span aria-hidden="true" style={{ fontSize: 30 }}>▦</span><small>더보기</small></Link>
      </nav>
    </section>
  );
}
