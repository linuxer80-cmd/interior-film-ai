import styles from "./CompanyHomepageContent.module.css";
import {
  phoneHref,
  safeHttpUrl,
} from "../../lib/showcaseValidation.mjs";

const serviceCopy = {
  "문·문틀":
    "방문·문틀과 현관문의 시공 범위, 개수, 모서리와 기존 마감 상태를 확인합니다. 전체 모습과 손상 부위 사진을 준비해주세요.",

  "싱크대":
    "상부장·하부장 문짝과 노출 측면의 시공 범위를 확인합니다. 전체 시공과 일부 시공을 구분하고 기름때·들뜸·습기 손상 여부를 상담합니다.",

  "붙박이장·신발장":
    "문짝 개수, 측면 포함 여부와 손잡이 형태를 확인합니다. 가구 전체와 모서리 사진을 바탕으로 작업할 면과 필름을 상담합니다.",

  "샤시·몰딩":
    "창틀·몰딩의 구조와 연결 부위, 실리콘 주변 상태를 확인합니다. 기존 표면과 현장 조건에 따라 시공 가능 여부와 작업 범위를 안내합니다.",
};

export default function CompanyHomepageContent({ homepage }) {
  const profile = homepage?.profile;

  if (!profile) {
    return null;
  }

  const cases = homepage.cases || [];
  const name =
    profile.business_name || homepage.company.company_name;
  const telephone = phoneHref(profile.public_phone);

  const links = [
    ["시공 블로그", profile.blog_url],
    ["네이버 플레이스", profile.place_url],
  ]
    .map(([label, value]) => [label, safeHttpUrl(value)])
    .filter(([, value]) => value);

  return (
    <div className={styles.content}>
      {cases.length > 0 && (
        <section aria-labelledby="public-case-title">
          <h2 id="public-case-title">실제 시공 사례</h2>
          <p>작업 사진과 시공 내용을 확인해보세요.</p>

          <div className={styles.cases}>
            {cases.map((item) => (
              <details className={styles.case} key={item.id}>
                <summary>
                  <img
                    src={item.after[0]}
                    alt={`${item.title} 완료 사진`}
                    loading="lazy"
                  />

                  <strong>{item.title}</strong>

                  <small>
                    {[item.category, item.region]
                      .filter(Boolean)
                      .join(" · ")}
                  </small>

                  <span>작업 내용 보기 +</span>
                </summary>

                <div className={styles.caseBody}>
                  <p>{item.description}</p>

                  {item.film && (
                    <p>사용 필름: {item.film}</p>
                  )}

                  {item.before.length > 0 && (
                    <>
                      <h3>시공 전</h3>

                      <div className={styles.photos}>
                        {item.before.map((url, i) => (
                          <img
                            key={url}
                            src={url}
                            alt={`${item.title} 시공 전 ${i + 1}`}
                            loading="lazy"
                          />
                        ))}
                      </div>
                    </>
                  )}

                  <h3>시공 후</h3>

                  <div className={styles.photos}>
                    {item.after.map((url, i) => (
                      <img
                        key={url}
                        src={url}
                        alt={`${item.title} 시공 후 ${i + 1}`}
                        loading="lazy"
                      />
                    ))}
                  </div>
                </div>
              </details>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2>{name}의 시공 서비스</h2>

        {profile.introduction && (
          <p className={styles.intro}>
            {profile.introduction}
          </p>
        )}

        {profile.regions && (
          <p>
            <strong>상담 지역</strong> · {profile.regions}
          </p>
        )}

        <div className={styles.services}>
          {(profile.services || [])
            .filter((item) => serviceCopy[item])
            .map((item) => (
              <article key={item}>
                <h3>{item}</h3>
                <p>{serviceCopy[item]}</p>
              </article>
            ))}
        </div>
      </section>

      <section>
        <h2>사진 상담부터 시공까지</h2>

        <ol className={styles.steps}>
          <li>
            <strong>사진 확인</strong>
            <p>
              전체 모습과 필요한 부위 사진을 올려
              예상 견적을 확인합니다.
            </p>
          </li>

          <li>
            <strong>범위·필름 상담</strong>
            <p>
              시공할 면, 수량, 선택 필름과
              기존 표면 상태를 확인합니다.
            </p>
          </li>

          <li>
            <strong>견적·일정 협의</strong>
            <p>
              사진으로 확인하기 어려운 조건은
              추가 상담과 필요한 현장 확인으로 살펴봅니다.
            </p>
          </li>

          <li>
            <strong>시공과 마감 확인</strong>
            <p>
              협의한 범위에 따라 바탕면 준비,
              필름 시공과 마감 확인을 진행합니다.
            </p>
          </li>
        </ol>
      </section>

      <section>
        <h2>자주 묻는 질문</h2>

        <details className={styles.faq}>
          <summary>사진 견적이 최종 금액인가요?</summary>
          <p>
            예상 금액입니다. 실제 크기와 수량, 선택 필름,
            바탕면 보수와 현장 조건에 따라 달라질 수 있습니다.
            최종 금액은 상담 후 협의합니다.
          </p>
        </details>

        <details className={styles.faq}>
          <summary>어떤 사진을 준비하면 되나요?</summary>
          <p>
            부위 전체가 보이는 사진과 모서리·손상 부위의
            가까운 사진을 함께 준비해주세요.
            시공 수량과 원하는 작업 범위도 알려주시면 도움이 됩니다.
          </p>
        </details>

        <details className={styles.faq}>
          <summary>일부 부위만 시공할 수 있나요?</summary>
          <p>
            원하는 부위와 범위를 기준으로 상담합니다.
            기존 표면 상태와 작업 조건을 확인한 뒤
            가능 여부를 안내합니다.
          </p>
        </details>
      </section>

      <footer className={styles.footer}>
        <h2>{name}</h2>
        <p>인테리어필름 시공</p>

        <dl>
          {[
            ["대표", profile.representative_name],
            ["사업자등록번호", profile.business_number],
            ["사업장 주소", profile.business_address],
            ["상담 전화", profile.public_phone],
            ["이메일", profile.public_email],
          ]
            .filter(([, value]) => value)
            .map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
        </dl>

        {telephone && (
          <a className={styles.phone} href={telephone}>
            전화 상담
          </a>
        )}

        <div className={styles.links}>
          {links.map(([label, url]) => (
            <a
              key={label}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {label} ↗
            </a>
          ))}
        </div>
      </footer>
    </div>
  );
                              }
