import Link from "next/link";

/**
 * Shared return-to-home button for worker/admin subpages.
 * Keep the destination explicit to avoid accidentally switching roles.
 */
export default function HomeReturnButton({role="worker",label,style={}}) {
  const admin=role==="admin";
  return (
    <Link href={admin?"/admin":"/worker"}
      aria-label={label|| (admin?"관리자 홈으로":"시공자 홈으로")}
      style={{
        display:"inline-flex",alignItems:"center",justifyContent:"center",
        gap:8,minHeight:48,padding:"10px 18px",borderRadius:14,
        border:"1px solid #e2e8f0",background:"#fff",
        boxShadow:"0 1px 2px rgba(15,23,42,.04)",
        textDecoration:"none",color:"#163153",fontSize:15,fontWeight:800,
        boxSizing:"border-box",...style
      }}>
      <span aria-hidden="true">⌂</span>
      {label || (admin?"관리자 홈으로":"시공자 홈으로")}
      <span aria-hidden="true">→</span>
    </Link>
  );
}
