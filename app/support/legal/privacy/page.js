import Link from "next/link";
import {
  privacyPolicy,
  PRIVACY_POLICY_EFFECTIVE_DATE,
  PRIVACY_POLICY_URL,
  PRIVACY_POLICY_VERSION,
  PRIVACY_CONTACT_EMAIL,
} from "../../../../lib/privacyPolicy.mjs";
import styles from "./privacy.module.css";

export const metadata = {
  title: "개인정보처리방침 | 필름장이 · 현장 AI 비서",
  description: "기분좋은공간이 운영하는 필름장이와 현장 AI 비서의 개인정보 처리 항목, 이용 목적, 보유·삭제 기준 및 권리 행사 안내입니다.",
  alternates: { canonical: PRIVACY_POLICY_URL },
};

export default function PrivacyPolicyPage() {
  return <main className={styles.page}>
    <header className={styles.header}>
      <p className={styles.brand}>필름장이 · 현장 AI 비서</p>
      <h1>개인정보처리방침</h1>
      <p>운영자: 기분좋은공간</p>
      <p className={styles.date}>시행일: <time dateTime={PRIVACY_POLICY_VERSION}>{PRIVACY_POLICY_EFFECTIVE_DATE}</time></p>
    </header>
    <aside className={styles.contact} aria-label="개인정보 문의 및 삭제 요청">
      <p>개인정보 문의와 삭제 요청은 앱 설치·로그인 없이 이메일로도 접수할 수 있습니다.</p>
      <div className={styles.actions}>
        <a href={`mailto:${PRIVACY_CONTACT_EMAIL}`}>{PRIVACY_CONTACT_EMAIL}</a>
        <Link href="/account/delete">계정 및 데이터 삭제 요청</Link>
      </div>
    </aside>
    <nav className={styles.contents} aria-label="개인정보처리방침 목차">
      <h2>목차</h2>
      <ol>{privacyPolicy.map(section => <li key={section.id}>
        <a href={`#${section.id}`}>{section.title.replace(/^\d+\. /, "")}</a>
      </li>)}</ol>
    </nav>
    <article>
      {privacyPolicy.map(section => <section id={section.id} key={section.id} className={styles.section}>
        <h2>{section.title}</h2>
        {section.paragraphs?.map(text => <p key={text}>{text}</p>)}
        {section.columns && <div className={styles.tableWrap} role="region" aria-label={section.title} tabIndex={0}>
          <table>
            <caption className={styles.srOnly}>{section.title}</caption>
            <thead><tr>{section.columns.map(column => <th key={column} scope="col">{column}</th>)}</tr></thead>
            <tbody>{section.rows.map(row => <tr key={row[0]}>{row.map((cell, i) => i === 0
              ? <th key={i} scope="row">{cell}</th>
              : <td key={i}>{cell}</td>)}</tr>)}</tbody>
          </table>
        </div>}
        {section.bullets && <ul>{section.bullets.map(text => <li key={text}>{text}</li>)}</ul>}
        {section.after?.map(text => <p key={text}>{text}</p>)}
        {section.links && <ul className={styles.links}>{section.links.map(link => <li key={link.href}>
          <a href={link.href}>{link.label}</a>
        </li>)}</ul>}
      </section>)}
    </article>
    <footer className={styles.footer}>
      <Link href="/support">고객지원</Link><a href="#">맨 위로</a>
      <small>기분좋은공간 · 개인정보처리방침 {PRIVACY_POLICY_VERSION}</small>
    </footer>
  </main>;
}
