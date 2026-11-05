import Link from "next/link";
import { termsOfService, TERMS_EFFECTIVE_DATE, TERMS_URL } from "../../../../lib/termsOfService.mjs";
import styles from "../privacy/privacy.module.css";

export const metadata = {
  title: "이용약관 | 필름장이 · 현장 AI 비서",
  description: "기분좋은공간의 필름장이와 현장 AI 비서 이용 조건 및 고객지원 안내입니다.",
  alternates: { canonical: TERMS_URL },
};

export default function TermsOfServicePage() {
  return <main className={styles.page}>
    <header className={styles.header}>
      <p className={styles.brand}>필름장이 · 현장 AI 비서</p>
      <h1>이용약관</h1>
      <p>운영자: 기분좋은공간</p>
      <p className={styles.date}>시행일: <time dateTime={TERMS_EFFECTIVE_DATE}>2026년 11월 6일</time></p>
    </header>
    <aside className={styles.contact} aria-label="사업자 정보 및 문의">
      <p>상호: 기분좋은공간 · 대표자: 정근호</p>
      <p>사업자등록번호: 699-38-00540</p>
      <p>사업장: 인천광역시 서해구 연희로45번길 8, 1층(연희동)</p>
      <div className={styles.actions}>
        <a href="tel:050713283930">고객 문의: 0507-1328-3930</a>
        <a href="mailto:linuxer80@gmail.com">linuxer80@gmail.com</a>
      </div>
    </aside>
    <nav className={styles.contents} aria-label="이용약관 목차">
      <h2>목차</h2>
      <ol>{termsOfService.map(section => <li key={section.id}><a href={`#${section.id}`}>{section.title}</a></li>)}</ol>
    </nav>
    <article>{termsOfService.map(section => <section id={section.id} key={section.id} className={styles.section}>
      <h2>{section.title}</h2>
      {section.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
    </section>)}</article>
    <footer className={styles.footer}>
      <Link href="/support/legal/privacy">개인정보처리방침</Link>
      <Link href="/account/delete">계정 및 데이터 삭제 요청</Link>
      <Link href="/support">고객지원</Link>
      <small>기분좋은공간 · 이용약관 {TERMS_EFFECTIVE_DATE}</small>
    </footer>
  </main>;
}
