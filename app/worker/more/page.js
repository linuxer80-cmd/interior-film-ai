import Link from "next/link";
import styles from "../../support/support.module.css";
export const metadata = { title: "더보기 | 필름장이" };
const menus = [
  ["/support?from=worker", "고객지원"],
  ["/worker/account", "개인설정"],
  ["/worker/companies", "소속 업체"],
  ["/worker/menu/pay", "근무금액"],
  ["/worker/attendance", "출퇴근기록"],
  ["/worker/inventory", "현장 자재 재고"],
  ["/samples?from=worker", "필름 샘플 보기"],
];
export default function WorkerMorePage() {
  return <main className={styles.page}>
    <header className={styles.header}><Link href="/worker" aria-label="시공자 홈으로 돌아가기">‹</Link><h1>더보기</h1></header>
    <nav className={styles.list} aria-label="시공자 추가 메뉴" style={{ padding: "0 16px" }}>
      {menus.map(([href,label]) => <Link className={styles.row} key={href} href={href}>{label}<span aria-hidden="true">›</span></Link>)}
    </nav>
  </main>;
}
