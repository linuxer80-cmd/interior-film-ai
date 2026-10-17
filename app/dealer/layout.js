// Dealer shortcuts must not inherit the owner/worker app's /start URL.
export const metadata = {
  title: "필름장이 · 대리점",
  applicationName: "필름장이 대리점",
  manifest: "/dealer-manifest.json",
  appleWebApp: {
    capable: true,
    title: "필름장이 대리점",
    statusBarStyle: "default",
  },
};

export default function DealerLayout({ children }) {
  return children;
}
