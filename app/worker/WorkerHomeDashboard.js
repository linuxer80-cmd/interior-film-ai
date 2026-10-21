"use client";

import HomeSchedule from "../components/HomeSchedule";
import usePersonalMenus from "../../lib/usePersonalMenus";
import {relationshipRequest} from "../../lib/workerRelationshipClient";
import LaborNotifications from "../components/LaborNotifications";
import WorkerConnectionPanel from "../components/WorkerDirectoryClient";
import AchievementBadges from "../components/AchievementBadges";
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
  { id: "business-card", href: "/business-card?from=worker", icon: "businessCard", title: "디지털 명함", subtitle: "내 로고와 정보로 만드는 나만의 명함" },
  { id: "notebook", href: "/worker/notebook", icon: "notebook", title: "실측수첩", subtitle: "장소별 치수·사진·메모 · 재단 연결" },
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
    title: "업체 창고 재고",
    subtitle:
      "연결된 업체의 전체 창고 필름 검색",
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
  homeProfile,
  sites = [],
  onOpen,
}) {
  const { orderedMenus, record } = usePersonalMenus(menus, "worker");
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
      <div className="wp-hello">
        <span>
          {worker?.worker_name || "시공자"}님,
          반갑습니다
        </span>

        <span className="wp-date">
          {dateLabel}
        </span>
      </div>

      <HomeSchedule sites={sites} worker onOpen={onOpen} />

      <div className="wp-section-title">
        <h3>오늘의 할 일</h3>

        <Link href="/worker/menu/sites" data-ui-link="action">
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
                <small style={{ whiteSpace: "normal", overflow: "visible", overflowWrap: "anywhere", lineHeight: 1.5 }}>
                  {[site.address || site.site_address, site.address_detail]
                    .map(value => String(value || "").trim())
                    .filter(Boolean).join(" ") ||
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

            <Link href="/worker/menu/sites" data-ui-link="action">
              내 일정 확인 →
            </Link>
          </div>
        )}
      </div>

      {homeProfile}

      {/* 배정 알림은 유지하고 직원 홈의 구인 탐색 메뉴만 숨깁니다. */}
      {employeeHome===null && <p role="status">{relationshipError || '업체 소속을 확인하고 있습니다…'}{relationshipError && <button type="button" onClick={()=>setRelationshipReload(v=>v+1)}>다시 확인</button>}</p>}
      <LaborNotifications view="worker" />
      <WorkerConnectionPanel compact />
      <AchievementBadges scope="worker" compact />

      <TomorrowTasks />

      <nav
        className="wp-grid"
        aria-label="시공자 주요 메뉴"
      >
        {orderedMenus.filter(menu => employeeHome !== false ? menu.id !== "jobs" : true).map(menu => (
          <Link
            key={menu.id}
            href={
              menu.href ||
              `/worker/menu/${menu.id}`
            }
            onClick={event => record(menu, event)}
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

        {['notebook', 'sites', 'attendance', 'samples']
          .map(id => menus.find(menu => menu.id === id))
          .map(menu => (
            <Link
              key={menu.id}
              href={menu.href || `/worker/menu/${menu.id}`}
              onClick={event => record(menu, event)}
            >
              <ToolIllustration kind={menu.id === "sites" ? "camera" : menu.icon} size={36} className="film-nav-image" />

              <small>{menu.id === "attendance" ? "근무기록" : menu.id === "samples" ? "필름 샘플" : menu.title}</small>
            </Link>
          ))}
        <Link href="/worker/more"><span aria-hidden="true" style={{ fontSize: 30 }}>▦</span><small>더보기</small></Link>
      </nav>
    </section>
  );
}



