"use client";

import { usePathname } from "next/navigation";

export default function PhotoTheme({ children }) {
  const path = usePathname() || "/";
  const position = /attendance/.test(path) ? "50% 0%"
    : /workers/.test(path) ? "0% 0%"
    : /material-order/.test(path) ? "0% 100%"
    : /cutting|\/film|materials/.test(path) ? "50% 100%"
    : /billing|\/pay|profit|plans/.test(path) ? "100% 50%"
    : /photos|structure/.test(path) ? "100% 100%"
    : /report|today|logs|estimate/.test(path) ? "50% 50%"
    : /leads|contact|notifications/.test(path) ? "0% 50%"
    : "100% 0%";
  return (
    <div className="film-photo-theme" style={{ display: "contents", "--photo-position": position }}>
      {children}
    </div>
  );
}
