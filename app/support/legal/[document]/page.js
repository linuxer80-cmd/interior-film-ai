import Link from "next/link";
import { notFound } from "next/navigation";
import { legalDrafts, LEGAL_DRAFT_VERSION } from "../../../../lib/legalDrafts.mjs";
import styles from "../../support.module.css";

export const metadata = { title: "약관 검토용 초안 | 필름장이", robots: { index: false, follow: false } };

export default async function LegalDraftPage({ params, searchParams }) {
  const { document } = await params;
  const query = await searchParams;
  const doc = legalDrafts[document];
  if (!Object.hasOwn(legalDrafts, document)) notFound();
  const from = query?.from === "worker" ? "worker" : "admin";
  return <main className={styles.page}>
    <header className={styles.header}>
      <Link href={`/support?from=${from}`} aria-label="고객지원으로 돌아가기" data-ui-link="icon">‹</Link><h1>{doc.title}</h1>
    </header>
    <aside style={{ padding: 16, border: "1px solid #d6b36e", background: "#fff6df", borderRadius: 12, lineHeight: 1.8 }}>
      <strong>검토용 초안 · 아직 시행되지 않았습니다</strong>
      <p>운영 정보와 처리 절차 확인 후 정식 공개합니다. 현재 동의를 받거나 기존 회원에게 소급 적용하지 않습니다.</p>
      <small>작성일: 2026.10.15 · 버전: {LEGAL_DRAFT_VERSION}</small>
    </aside>
    <article style={{ lineHeight: 1.9, overflowWrap: "anywhere" }}>
      {doc.sections.map(([title,body]) => <section key={title} style={{ margin: "28px 0" }}>
        <h2 style={{ fontSize: 18 }}>{title}</h2>
        {body.split("\n").map((text,i) => <p key={i}>{text}</p>)}
      </section>)}
    </article>
    {document === "sharing" && <fieldset disabled style={{ padding: 16, border: "1px solid #ddd", borderRadius: 12 }}>
      <legend>동의 화면 예시 · 저장되지 않음</legend>
      <label style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <input type="checkbox" defaultChecked={false} />
        [선택] 시공사진 및 비식별 시공정보의 공통 사례 활용에 동의합니다.
      </label>
      <p>동의 저장·철회·자료 검토 기능을 마련한 뒤 활성화합니다.</p>
    </fieldset>}
    <p>문의: <a href="mailto:linuxer80@gmail.com" data-ui-link="inline">linuxer80@gmail.com</a></p>
  </main>;
}
