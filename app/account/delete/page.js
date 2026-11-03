import Link from "next/link";
import styles from "../../support/support.module.css";

export const metadata = { title: "계정 및 데이터 삭제 요청 | 현장 AI 비서 · 필름장이" };

export default function AccountDeletionPage() {
  return <main className={styles.page}>
    <header className={styles.header}><h1>계정 및 데이터 삭제 요청</h1></header>
    <p>현장 AI 비서와 필름장이는 기분좋은공간이 운영합니다.</p>
    <h2>요청 방법</h2>
    <ol>
      <li>아래 이메일로 가입 이메일과 삭제를 원하는 계정 또는 데이터의 범위를 알려주세요. 비밀번호는 보내지 마세요.</li>
      <li>운영자가 본인과 업체 권한을 확인하고 처리 범위를 안내합니다.</li>
      <li>시공자 계정 삭제와 업체 전체 데이터 삭제는 다르므로 요청 내용을 확인한 후 처리합니다.</li>
    </ol>
    <p><a href="mailto:linuxer80@gmail.com?subject=%EA%B3%84%EC%A0%95%20%EB%B0%8F%20%EB%8D%B0%EC%9D%B4%ED%84%B0%20%EC%82%AD%EC%A0%9C%20%EC%9A%94%EC%B2%AD">삭제 요청 이메일 보내기</a></p>
    <p>이메일: <a href="mailto:linuxer80@gmail.com">linuxer80@gmail.com</a></p>
    <h2>삭제 및 보관 범위</h2>
    <p>계정 정보와 요청하신 업무 자료의 삭제 범위를 확인합니다. 업체가 관리하는 현장·사진·보고서 등 다른 사람의 업무 기록과 법령상 보존해야 하는 결제·거래 기록은 별도 검토가 필요할 수 있습니다. 실제 삭제·보관 대상과 적용 기간은 확인 후 안내합니다.</p>
    <p>휴대폰에 저장된 원본 통화녹음은 서버 계정 삭제로 지워지지 않습니다. 기기에서 직접 삭제해주세요.</p>
    <Link href="/support">고객지원으로 이동</Link>
  </main>;
}
