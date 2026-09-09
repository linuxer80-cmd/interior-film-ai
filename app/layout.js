import "./globals.css";
export const metadata = {
  title: "기분좋은공간 AI 견적",
  description: "인테리어필름 AI 견적 시스템",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
