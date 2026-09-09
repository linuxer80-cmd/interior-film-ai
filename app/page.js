export default function Home() {
  return (
    <main>
      <h1>기분좋은공간 AI 견적</h1>
      <p>인테리어필름 시공 사진을 올리면 AI가 예상 견적을 분석합니다.</p>

      <h2>시공 사진 등록</h2>
      <input type="file" accept="image/*" multiple />

      <p>사진을 등록하면 유사한 과거 시공 사례와 실제 시공비를 기반으로 견적을 계산합니다.</p>
    </main>
  );
}
