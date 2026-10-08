import "./globals.css";
import PhotoTheme from "./components/ui/PhotoTheme";

export const metadata = {
  title: "기분좋은공간 AI 견적",
  description: "인테리어필름 AI 견적 시스템",

  verification: {
    google: "여기에_구글_인증값",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body><PhotoTheme>{children}</PhotoTheme></body>
    </html>
  );
}
