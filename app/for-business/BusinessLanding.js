"use client";

import { useEffect, useRef, useState } from "react";
import { features, iconPaths } from "./features";
import "./landing.css";

const START_URL = "/start?source=instagram_landing";

function Icon({ name }) {
  return <svg viewBox="0 0 34 34" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: iconPaths[name] || "" }} />;
}

export default function BusinessLanding() {
  const [activeId, setActiveId] = useState(null);
  const dialogRef = useRef(null);
  const openerRef = useRef(null);
  const closeRef = useRef(null);
  const feature = features.find((item) => item.id === activeId);
  const nextFeature = feature ? features[(features.indexOf(feature) + 1) % features.length] : null;

  useEffect(() => {
    if (!activeId) return;
    const dialog = dialogRef.current;
    const priorOverflow = document.body.style.overflow;
    if (dialog && !dialog.open) dialog.showModal();
    document.body.style.overflow = "hidden";
    if (dialog) dialog.scrollTop = 0;
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = priorOverflow;
      if (dialog?.open) dialog.close();
    };
  }, [activeId]);

  function openFeature(id, event) {
    if (event) openerRef.current = event.currentTarget;
    setActiveId(id);
  }

  function closeFeature() {
    setActiveId(null);
    openerRef.current?.focus();
  }

  function handleBackdrop(event) {
    if (event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeFeature();
  }

  return (
    <div className={`filmjang-business${activeId ? " modal-open" : ""}`}>
      <header className="landing-header"><div className="wrap">
        <a className="brand" href="/for-business"><span className="mark" aria-hidden="true">F</span>필름장이</a>
        <nav className="nav" aria-label="주요 메뉴"><a className="link" href="#features">기능 살펴보기</a><a className="small-cta" href={START_URL}>시작하기 ↗</a></nav>
      </div></header>
      <main>
        <section className="hero" aria-labelledby="landing-title">
          <img className="hero-art" src="/images/landing/filbanjang-hero.webp" alt="스마트폰으로 일정을 보여주는 필반장과 필름 롤이 놓인 작업대" width="1536" height="1024" fetchPriority="high" />
          <div className="wrap"><span className="eyebrow">인테리어필름 현장을 위한 앱</span><h1 id="landing-title">반장님의 하루를,<br />조금 더 가볍게.</h1><p>현장부터 자재, 정산까지 필름장이 하나로.<br />시공에 집중할 수 있도록, 관리는 간편하게.</p><a className="cta" href={START_URL}>필름장이 시작하기 <span aria-hidden="true">→</span></a><span className="hint">반장님도 시공자님도, 역할을 선택해 시작하세요.</span></div>
        </section>
        <section className="feature-section wrap" id="features" aria-labelledby="features-title">
          <div className="section-head"><span className="eyebrow">필요한 기능을 눌러보세요</span><h2 id="features-title">현장 일은 든든하게,<br />관리는 간편하게.</h2><p>카드를 누르면 사용 방법과 기능 예시를 볼 수 있어요.</p></div>
          <div className="features">{features.map((item) => <button type="button" className="feature" key={item.id} onClick={(event) => openFeature(item.id, event)} aria-haspopup="dialog" aria-controls="feature-dialog"><span className="icon"><Icon name={item.icon} /></span><h3>{item.name}</h3><p>{item.short}</p><span className="more">자세히 보기 ↗</span></button>)}</div>
        </section>
        <section className="wrap" aria-labelledby="network-title"><div className="network"><div><span className="tag">사람과 현장을 잇다</span><h2 id="network-title">함께할 시공자도,<br />일할 현장도.</h2><p>프로필을 작성하고 필름장이 구인·구직을 살펴보세요.</p></div><button type="button" className="outline" onClick={(event) => openFeature("jobs", event)} aria-haspopup="dialog" aria-controls="feature-dialog">구인·구직 알아보기 ↗</button></div></section>
        <section className="closing wrap"><span className="eyebrow">시작은 현장 하나부터</span><h2>다음 현장부터 함께하세요.</h2><p>흩어진 업무를 정리하는 새로운 습관.</p><a className="cta" href={START_URL}>필름장이 시작하기 →</a></section>
      </main>
      <footer><div className="wrap"><p>필름장이 · 인테리어필름 현장을 위한 앱</p><p>기능 화면과 데이터는 설명용 예시입니다.</p></div></footer>
      <div className="dock"><a className="cta" href={START_URL}>필름장이 시작하기 →</a></div>
      <dialog className="modal" id="feature-dialog" ref={dialogRef} aria-labelledby="detail-title" onCancel={(event) => { event.preventDefault(); closeFeature(); }} onClick={handleBackdrop}>
        {feature && <><div className="modal-bar"><span className="modal-label">필름장이 / {feature.name}</span><button type="button" className="close" ref={closeRef} aria-label="기능 설명 닫기" onClick={closeFeature}>×</button></div><div className="modal-body"><h2 id="detail-title">{feature.title}</h2><p className="intro">{feature.intro}</p><div className="detail-layout"><div className="demo"><div className="demo-top"><span>{feature.demo}</span><small>기능 설명용 예시</small></div>{feature.rows.map(([label, value]) => <div className="demo-row" key={label}><span>{label}</span><span className="pill">{value}</span></div>)}</div><ol className="detail-steps">{feature.steps.map(([title, text]) => <li key={title}><strong>{title}</strong>{text}</li>)}</ol></div><div className="note">{feature.note}</div><div className="detail-actions"><a className="cta" href={`${START_URL}&feature=${feature.id}`}>앱에서 시작하기 →</a><button type="button" className="back-features" onClick={closeFeature}>다른 기능 살펴보기</button></div><button type="button" className="next-feature" onClick={() => openFeature(nextFeature.id)}>다음 기능 · {nextFeature.name} →</button></div></>}
      </dialog>
    </div>
  );
}
