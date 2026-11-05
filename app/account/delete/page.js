import Link from "next/link";
import DeletionRequest from "./DeletionRequest";
import styles from "../../support/support.module.css";

export const metadata = { title: "계정 및 데이터 삭제 요청 | 현장 AI 비서 · 필름장이" };
const email = "linuxer80@gmail.com";
const requests = [
  ["관리자 개인 계정 삭제", "관리자 개인 계정 삭제 요청"],
  ["시공자 개인 계정 삭제", "시공자 개인 계정 삭제 요청"],
  ["업체와 시공자 연결 해제", "업체와 시공자 연결 해제 요청"],
  ["업체 서비스 종료 및 자료 처리", "업체 서비스 종료 및 자료 처리 요청"],
];
export default function AccountDeletionPage() {
  return <main className={styles.page}>
    <header className={styles.header}><h1>계정 및 데이터 삭제 요청</h1></header>
    <p>현장 AI 비서와 필름장이는 기분좋은공간이 운영합니다.</p>
    <DeletionRequest />
    <h2>이메일로 요청하기</h2>
    <p>로그인이 어렵거나 연결 해제·업체 서비스 종료를 요청하려면 아래 항목을 선택해 주세요.</p>
    <ul>{requests.map(([label, subject]) => <li key={subject}>
      <a href={`mailto:${email}?subject=${encodeURIComponent(subject)}`}>{label}</a>
    </li>)}</ul>
    <p>이메일: <a href={`mailto:${email}`}>{email}</a></p>
    <h2>요청 및 처리 방법</h2>
    <ol>
      <li>가입 이메일과 원하는 처리 범위를 알려주세요. 비밀번호는 보내지 마세요.</li>
      <li>본인과 삭제 범위를 확인할 수 있는 요청은 자동 처리합니다. 추가 확인이 필요한 요청은 운영자가 삭제·보관 범위를 안내한 뒤 처리합니다.</li>
      <li>업체의 유일한 관리자가 탈퇴하려는 경우 관리자 권한 이전 또는 업체 서비스 종료 여부를 확인합니다.</li>
    </ol>
    <h2>다른 이용자와 공동 자료</h2>
    <p>관리자 개인 탈퇴나 업체 서비스 종료 요청만으로 소속 시공자의 개인 계정을 자동으로 삭제하지 않습니다. 시공자의 개인 계정 삭제는 해당 시공자의 요청과 본인 확인에 따라 별도로 처리합니다.</p>
    <p>연결 해제는 업체와 시공자의 소속 및 접근 관계를 종료하는 요청이며 개인 계정 삭제와 다릅니다. 공동 현장·사진·보고서 등은 권한과 다른 이용자의 권리 및 적법한 보존 근거를 확인한 뒤 처리합니다.</p>
    <h2>보존 및 기기 자료</h2>
    <p>법령상 보존해야 하는 결제·거래 기록 등은 적용되는 기간 동안 보관할 수 있습니다. 실제 삭제·보관 대상과 기간은 요청을 확인한 후 안내합니다.</p>
    <p>휴대폰에 저장된 원본 통화녹음은 서버 계정 삭제로 지워지지 않습니다. 기기에서 직접 삭제해주세요.</p>
    <p><Link href="/support/legal/privacy">개인정보처리방침과 보유·삭제 기준 보기</Link></p>
    <Link href="/support">고객지원으로 이동</Link>
  </main>;
}
