export const metadata = {
  title: "필름장이 | 인테리어필름 시공업체 관리 앱",
  description:
    "현장 일정, 시공자 배정, 자재와 비용, 매출 관리를 한곳에서. 인테리어필름 시공업체를 위한 필름장이.",
};

const START_URL = "/start?source=instagram_landing";

const features = [
  {
    number: "01",
    label: "현장 일정",
    title: "현장마다 흩어진 정보를 한곳에",
    description:
      "현장 정보와 시공 날짜를 정리하고, 진행 중인 작업을 확인하세요.",
  },
  {
    number: "02",
    label: "시공자 관리",
    title: "누가 언제 일하는지 확인",
    description:
      "현장별 시공자를 배정하고, 출퇴근 기록과 완료보고를 확인하세요.",
  },
  {
    number: "03",
    label: "매출·비용",
    title: "매출과 남는 금액을 함께",
    description:
      "계약금액, 인건비, 자재비와 경비를 정리해 현장별 예상 수익을 확인하세요.",
  },
  {
    number: "04",
    label: "필름 재단",
    title: "현장 자재로 재단 계획까지",
    description:
      "보유 롤과 필요한 사이즈를 입력하고, 재단 배치와 작업 구간을 확인하세요.",
  },
];

const styles = `
  .filmjang-landing {
    --ink: #172b23;
    --paper: #f7f5ee;
    --gold: #c5a765;
    background: var(--paper);
    color: var(--ink);
    font-family: Arial, "Noto Sans KR", sans-serif;
    line-height: 1.6;
    min-height: 100vh;
    padding-bottom: calc(110px + env(safe-area-inset-bottom, 0px));
    overflow-x: clip;
  }

  .filmjang-landing * {
    box-sizing: border-box;
  }

  .filmjang-landing a {
    color: inherit;
    text-decoration: none;
  }

  .filmjang-landing .wrap {
    max-width: 1080px;
    margin: 0 auto;
    padding: 0 24px;
  }

  .filmjang-landing .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 24px 0;
    font-size: 14px;
  }

  .filmjang-landing .brand {
    display: inline-flex;
    align-items: center;
    font-size: 22px;
    font-weight: 900;
    letter-spacing: -1px;
    flex-shrink: 0;
  }

  .filmjang-landing .mark {
    display: inline-grid;
    place-items: center;
    background: var(--ink);
    color: var(--gold);
    width: 36px;
    height: 36px;
    border-radius: 12px;
    margin-right: 9px;
  }

  .filmjang-landing .existing-link {
    color: #637269;
    font-size: 13px;
  }

  .filmjang-landing .hero {
    padding: 64px 0 72px;
    display: grid;
    grid-template-columns: 1.15fr 1fr;
    gap: 48px;
    align-items: center;
  }

  .filmjang-landing .eyebrow {
    font-size: 13px;
    font-weight: 700;
    color: #627369;
    letter-spacing: 0.5px;
  }

  .filmjang-landing h1 {
    font-size: clamp(36px, 5vw, 58px);
    line-height: 1.2;
    letter-spacing: -2.5px;
    margin: 20px 0;
    word-break: keep-all;
  }

  .filmjang-landing .lead {
    font-size: 18px;
    color: #57645d;
    max-width: 440px;
    word-break: keep-all;
  }

  .filmjang-landing .button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--ink);
    color: #ffffff;
    padding: 17px 24px;
    border-radius: 15px;
    font-weight: 800;
    margin-top: 20px;
    text-align: center;
    transition: background 0.15s ease;
  }

  .filmjang-landing .button:hover {
    background: #294737;
  }

  .filmjang-landing .hint {
    font-size: 12px;
    color: #69766e;
    margin-top: 12px;
  }

  .filmjang-landing .demo {
    background: #ffffff;
    border: 1px solid #e2e5dc;
    border-radius: 26px;
    padding: 28px;
    box-shadow: 0 24px 60px #172b2310;
    transform: rotate(2deg);
  }

  .filmjang-landing .demo-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    font-weight: 800;
  }

  .filmjang-landing .sample {
    font-size: 11px;
    font-weight: 400;
    color: #67766d;
    background: #f0f3eb;
    border-radius: 8px;
    padding: 4px 8px;
  }

  .filmjang-landing .demo-row {
    padding: 17px 0;
    border-bottom: 1px solid #edf0e8;
  }

  .filmjang-landing .demo-row strong {
    display: block;
    font-size: 16px;
  }

  .filmjang-landing .demo-row span {
    font-size: 13px;
    color: #718078;
  }

  .filmjang-landing .status {
    display: inline-block;
    font-size: 12px;
    background: #eef3e8;
    border-radius: 8px;
    padding: 6px 10px;
    margin-top: 15px;
  }

  .filmjang-landing section {
    padding: 54px 0;
  }

  .filmjang-landing h2 {
    font-size: 30px;
    line-height: 1.3;
    letter-spacing: -1px;
    margin: 12px 0 16px;
    word-break: keep-all;
  }

  .filmjang-landing .intro {
    color: #66726b;
    word-break: keep-all;
  }

  .filmjang-landing .feature-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 18px;
    margin-top: 28px;
  }

  .filmjang-landing .feature-card {
    background: #ffffff;
    border: 1px solid #e5e6dd;
    border-radius: 22px;
    padding: 28px;
  }

  .filmjang-landing .number {
    color: #9c8550;
    font-weight: 800;
    font-size: 13px;
  }

  .filmjang-landing .feature-label {
    font-size: 13px;
    margin-left: 12px;
    color: #69766e;
  }

  .filmjang-landing h3 {
    font-size: 21px;
    margin: 17px 0 10px;
    letter-spacing: -0.6px;
    word-break: keep-all;
  }

  .filmjang-landing .feature-card p {
    color: #69766e;
    font-size: 15px;
    margin: 0;
    word-break: keep-all;
  }

  .filmjang-landing .steps {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 20px;
    margin-top: 28px;
  }

  .filmjang-landing .step {
    border-top: 2px solid #d2d9cc;
    padding: 18px 0;
  }

  .filmjang-landing .step p {
    color: #69766e;
    font-size: 14px;
    word-break: keep-all;
  }

  .filmjang-landing .closing {
    text-align: center;
    background: var(--ink);
    color: #ffffff;
    border-radius: 26px;
    padding: 40px 24px;
  }

  .filmjang-landing .closing p {
    color: #ced6ce;
    word-break: keep-all;
  }

  .filmjang-landing .closing .button {
    background: #e6d3a4;
    color: var(--ink);
  }

  .filmjang-landing .closing .button:hover {
    background: #f0dfba;
  }

  .filmjang-landing details {
    padding: 20px 0;
    border-bottom: 1px solid #dfe3d8;
  }

  .filmjang-landing summary {
    font-weight: 700;
    cursor: pointer;
    word-break: keep-all;
  }

  .filmjang-landing details p {
    font-size: 14px;
    color: #69766e;
    word-break: keep-all;
  }

  .filmjang-landing footer {
    font-size: 12px;
    color: #788279;
    padding-top: 40px;
  }

  .filmjang-landing .sticky {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: #f7f5eef2;
    border-top: 1px solid #e0e3d9;
    padding: 12px 20px;
    padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px));
    z-index: 50;
    backdrop-filter: blur(10px);
  }

  .filmjang-landing .sticky-inner {
    max-width: 1080px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  .filmjang-landing .sticky .button {
    margin: 0;
    padding: 12px 20px;
    font-size: 14px;
    flex-shrink: 0;
  }

  .filmjang-landing a:focus-visible,
  .filmjang-landing summary:focus-visible {
    outline: 3px solid #c5a765;
    outline-offset: 4px;
  }

  @media (max-width: 700px) {
    .filmjang-landing .wrap {
      padding: 0 22px;
    }

    .filmjang-landing .header {
      padding: 18px 0;
    }

    .filmjang-landing .existing-link {
      font-size: 12px;
    }

    .filmjang-landing .hero {
      grid-template-columns: 1fr;
      padding: 32px 0 38px;
      gap: 32px;
    }

    .filmjang-landing h1 {
      font-size: clamp(32px, 8.8vw, 39px);
      letter-spacing: -1.8px;
    }

    .filmjang-landing .lead {
      font-size: 16px;
    }

    .filmjang-landing .hero .button {
      display: flex;
      width: 100%;
    }

    .filmjang-landing .demo {
      transform: none;
      padding: 23px;
    }

    .filmjang-landing section {
      padding: 36px 0;
    }

    .filmjang-landing h2 {
      font-size: 27px;
    }

    .filmjang-landing .feature-grid {
      grid-template-columns: 1fr;
      gap: 12px;
    }

    .filmjang-landing .feature-card {
      padding: 23px;
    }

    .filmjang-landing .steps {
      grid-template-columns: 1fr;
      gap: 6px;
    }

    .filmjang-landing .step h3 {
      margin: 8px 0;
    }

    .filmjang-landing .sticky-inner > span {
      font-size: 12px;
      max-width: 130px;
    }

    .filmjang-landing .closing {
      padding: 30px 20px;
    }
  }

  @media (max-width: 360px) {
    .filmjang-landing .sticky {
      padding-left: 12px;
      padding-right: 12px;
    }

    .filmjang-landing .sticky-inner {
      gap: 8px;
    }

    .filmjang-landing .sticky .button {
      padding: 12px 14px;
      font-size: 13px;
    }
  }
`;

export default function BusinessLanding() {
  return (
    <main className="filmjang-landing">
      <style>{styles}</style>

      <div className="wrap">
        <header className="header">
          <a className="brand" href="/for-business">
            <span className="mark" aria-hidden="true">
              F
            </span>
            필름장이
          </a>

          <a className="existing-link" href="/start">
            기존 사용자 시작 →
          </a>
        </header>

        <div className="hero">
          <div>
            <div className="eyebrow">
              인테리어필름 시공업체를 위한 관리 앱
            </div>

            <h1>
              시공은 현장에서,
              <br />
              관리는 필름장이에서.
            </h1>

            <p className="lead">
              현장 일정부터 시공자 배정, 매출과 비용까지.
              <br />
              흩어진 업무를 한곳에서 정리하세요.
            </p>

            <a className="button" href={START_URL}>
              우리 업체 관리 시작하기 →
            </a>

            <p className="hint">
              다음 화면에서 ‘관리자로 시작하기’를 선택하세요.
            </p>
          </div>

          <div
            className="demo"
            aria-label="현장관리 기능을 설명하는 예시 카드"
          >
            <div className="demo-head">
              <span>오늘의 현장</span>
              <span className="sample">기능 설명용 예시</span>
            </div>

            <div className="demo-row">
              <strong>가상현장 A · 문·문틀</strong>
              <span>시공 일정과 담당자 확인</span>
            </div>

            <div className="demo-row">
              <strong>가상현장 B · 싱크대</strong>
              <span>자재 정보와 완료보고 확인</span>
            </div>

            <div className="demo-row">
              <strong>현장별 매출·비용</strong>
              <span>인건비 · 자재비 · 경비 · 예상 수익</span>
            </div>

            <span className="status">
              일정부터 정산까지, 한곳에서
            </span>
          </div>
        </div>

        <section aria-labelledby="features-title">
          <div className="eyebrow">바쁜 현장에 필요한 기능</div>

          <h2 id="features-title">
            찾아보는 시간은 줄이고,
            <br />
            확인해야 할 일은 또렷하게.
          </h2>

          <p className="intro">
            메모와 대화방에 흩어져 있던 업무를 현장별로 정리합니다.
          </p>

          <div className="feature-grid">
            {features.map((feature) => (
              <article
                className="feature-card"
                key={feature.number}
              >
                <span className="number">{feature.number}</span>

                <span className="feature-label">
                  {feature.label}
                </span>

                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="steps-title">
          <div className="eyebrow">시작은 현장 하나부터</div>

          <h2 id="steps-title">
            복잡하게 시작할 필요 없어요.
          </h2>

          <div className="steps">
            <div className="step">
              <span className="number">01</span>
              <h3>관리자로 시작</h3>
              <p>
                역할 선택 화면에서 관리자 이용을 선택합니다.
              </p>
            </div>

            <div className="step">
              <span className="number">02</span>
              <h3>현장 정보 정리</h3>
              <p>
                현장과 일정, 담당 시공자를 등록합니다.
              </p>
            </div>

            <div className="step">
              <span className="number">03</span>
              <h3>작업부터 정산까지</h3>
              <p>
                진행 상황과 기록을 확인하고 비용을 정리합니다.
              </p>
            </div>
          </div>
        </section>

        <section aria-labelledby="start-title">
          <div className="closing">
            <h2 id="start-title">
              다음 현장부터,
              <br />
              조금 더 정리된 하루.
            </h2>

            <p>
              우리 업체의 현장 관리, 필름장이로 시작하세요.
            </p>

            <a className="button" href={START_URL}>
              관리자로 시작하러 가기 →
            </a>
          </div>
        </section>

        <section aria-labelledby="faq-title">
          <h2 id="faq-title">시작 전 궁금한 점</h2>

          <details>
            <summary>어떤 업체를 위한 앱인가요?</summary>
            <p>
              현장 일정, 시공자와 자재, 매출 및 비용을 함께
              관리하려는 인테리어필름 시공업체를 위한 앱입니다.
            </p>
          </details>

          <details>
            <summary>
              시공자도 함께 사용할 수 있나요?
            </summary>
            <p>
              관리자는 현장을 관리하고, 시공자는 자신의
              시공 일정과 출퇴근 기록, 완료보고 등을 확인하는
              방식으로 이용합니다.
            </p>
          </details>

          <details>
            <summary>예상 수익은 무엇인가요?</summary>
            <p>
              입력한 계약금액과 인건비, 자재비, 경비를 바탕으로
              확인하는 값입니다. 누락된 비용이나 제외 설정에
              따라 실제 수익과 달라질 수 있습니다.
            </p>
          </details>

          <details>
            <summary>
              요금과 이용 범위는 어디에서 확인하나요?
            </summary>
            <p>
              관리자 시작 후 앱의 요금제 안내에서 현재 금액과
              제공 기능을 확인하고, 결제 전에 이용 조건을
              검토하세요.
            </p>
          </details>
        </section>

        <footer>
          필름장이 · 인테리어필름 시공업체를 위한 현장 관리
          <br />
          이 페이지의 현장 카드는 기능 설명용 예시이며
          실제 고객 정보가 아닙니다.
        </footer>
      </div>

      <div className="sticky">
        <div className="sticky-inner">
          <span>
            우리 업체의 관리를
            <br />
            한곳에서 시작하세요.
          </span>

          <a className="button" href={START_URL}>
            업체 관리 시작 →
          </a>
        </div>
      </div>
    </main>
  );
              }
