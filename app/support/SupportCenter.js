"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import styles from "./support.module.css";

const HelpChat = dynamic(() => import("../admin/HelpChat"), {
  loading: () => <p role="status">사용 안내를 불러오는 중…</p>,
});
const chatUrl = "https://pf.kakao.com/_HUwkj/chat";
const guides = [
  ["현장 등록·일정 배정", "관리자 홈 → 현장 관리에서 현장명·주소·일정을 등록하세요. 추가정보에서 고객·자재·사진을 입력하고 시공자를 배정할 수 있습니다."],
  ["자재 반출·반납", "현장에 사용할 필름을 선택해 반출하고, 작업 후 롤별 남은 길이를 입력해 반납하세요. 사용량은 반출량에서 반납량을 빼서 계산합니다. 전량 사용한 롤은 0m로 반납하세요."],
  ["잘못 입력한 반납량 수정", "현장 자재의 ‘반납 완료’에서 해당 제품 옆 ‘수정’을 누르세요. 저장하면 창고 재고와 현장 사용량에 반영됩니다. 보고서 제출 후 수정이 제한되면 관리자에게 반려를 요청하세요."],
  ["완료보고 작성", "내 현장 → 완료보고에서 사진, 작업 내용·사용량, 경비를 확인하세요. 마지막 확인 화면의 미완료 항목을 누르면 입력 위치로 이동합니다. 임시저장과 제출은 별개입니다."],
  ["업체 견적서 작성", "관리자 현장 상세의 상담 견적서에서 필름 물량·인건비·경비를 확인하고 수량·단가·금액을 수정하세요. 저장 후 PDF 미리보기에서 인쇄 또는 PDF 저장을 선택하세요."],
];
const faqs = [
  ["카카오 이메일이 기존 계정과 달라도 연결할 수 있나요?", "기존 이메일 계정으로 로그인한 뒤 카카오 계정 연결을 진행하세요. 다른 회원에 이미 연결됐다는 안내가 나오면 새 업체를 만들지 말고 고객지원에 문의해주세요."],
  ["알림이 오지 않아요.", "기기와 브라우저의 알림 허용 상태를 확인하고 앱에서 알림을 다시 설정해주세요. 계속 안 오면 기기 종류와 알림을 받지 못한 시간을 알려주세요."],
  ["작성한 보고서가 다른 휴대폰에 안 보여요.", "제출 전 임시저장은 현재 기기·브라우저에 저장됩니다. 작성한 기기에서 완료보고를 제출해주세요."],
  ["시공자가 매입단가를 입력해야 하나요?", "매입단가는 관리자가 관리합니다. 시공자는 자재의 반출·반납량과 실제 작업 내용을 확인해주세요."],
  ["구독 취소와 환불 신청은 같은가요?", "구독 취소는 다음 자동결제를 중단하는 기능입니다. 이미 결제한 내역의 환불 문의는 관리자 요금제·결제 화면에서 별도로 신청해주세요."],
];

export default function SupportCenter({ from, version }) {
  const worker = from === "worker";
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href={worker ? "/worker/more" : "/admin"} aria-label={worker ? "더보기로 돌아가기" : "관리자 홈으로 돌아가기"} data-ui-link="icon">‹</Link>
        <h1>고객지원</h1>
      </header>
      <a className={styles.contact} href={chatUrl} target="_blank" rel="noopener noreferrer">
        카카오톡 문의하기 <span aria-hidden="true">↗</span>
      </a>
      <p className={styles.note}>사용 문의나 오류 화면을 카카오 채널로 보내주세요.</p>

      <section className={styles.list} aria-label="고객지원 메뉴">
        <details>
          <summary>사용 안내</summary>
          <div className={styles.body}>
            {guides.map(([title, text]) => <details key={title}><summary>{title}</summary><p>{text}</p></details>)}
            {!worker && <details><summary>AI에게 사용 방법 물어보기</summary><HelpChat embedded /></details>}
          </div>
        </details>
        <details>
          <summary>자주 묻는 질문</summary>
          <div className={styles.body}>{faqs.map(([title, text]) => <details key={title}><summary>{title}</summary><p>{text}</p></details>)}</div>
        </details>
        <details>
          <summary>문의하기 / 오류 신고</summary>
          <div className={styles.body}>
            <p>문제가 생긴 화면, 발생 시간, 어떤 버튼을 눌렀는지 함께 알려주시면 확인에 도움이 됩니다.</p>
            <p>화면 캡처에 있는 고객 전화번호·주소 등은 가려주세요. 비밀번호는 보내지 마세요.</p>
            <a href={chatUrl} target="_blank" rel="noopener noreferrer" data-ui-link="action">카카오 채널에서 문의하기 ↗</a>
          </div>
        </details>
        <details>
          <summary>요금제·결제 안내</summary>
          <div className={styles.body}>
            <p>이용 중인 요금제, 다음 결제일, 결제 내역과 환불 신청은 업체 관리자 계정에서 확인할 수 있습니다.</p>
            {worker ? <p>소속 업체 요금제는 해당 업체 관리자에게 문의해주세요.</p> : <Link href="/admin/billing" data-ui-link="action">내 요금제·결제 내역 확인 ›</Link>}
          </div>
        </details>
        <details>
          <summary>약관 및 정책</summary>
          <div className={styles.body}>
            <Link className={styles.row} href={`/support/legal/terms?from=${from}`}>이용약관 <small>검토용 초안 ›</small></Link>
            <Link className={styles.row} href={`/support/legal/privacy?from=${from}`}>개인정보처리방침 <small>검토용 초안 ›</small></Link>
            <Link className={styles.row} href={`/support/legal/sharing?from=${from}`}>공통 사례 활용 선택 동의 <small>검토용 초안 ›</small></Link>
            <Link className={styles.row} href="/admin/billing">정기결제·취소·환불 안내 <span aria-hidden="true">›</span></Link>
            <p className={styles.note}>결제 안내는 업체 관리자 로그인이 필요합니다. 정책 관련 문의는 카카오 채널로 보내주세요.</p>
          </div>
        </details>
        <details>
          <summary>앱 정보</summary>
          <div className={styles.body}>
            <p><strong>필름장이</strong> · 버전 {version}</p>
            <h2>최근 업데이트 · 2026.10.15</h2>
            <ul><li>현장 상세 메뉴와 자재 사용량 표시 간소화</li><li>자재 반납량 수정</li><li>물량·인건비·경비 중심 업체 견적서</li><li>고객지원 메뉴 추가</li></ul>
          </div>
        </details>
      </section>
    </main>
  );
}
