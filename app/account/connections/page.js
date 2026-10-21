import Link from "next/link";

const card = {display:"block",padding:20,marginTop:14,border:"1px solid #dbe2d8",borderRadius:16,background:"#fff",color:"#263d32",textDecoration:"none"};
export default function AccountConnections() {
  return <main style={{maxWidth:480,margin:"32px auto",padding:24}}>
    <h1>계정 연결</h1>
    <p style={{color:"#64748b",lineHeight:1.7}}>현재 사용하는 계정에 구글·카카오를 연결하면 같은 현장과 정보를 그대로 이용할 수 있습니다.</p>
    <Link href="/account/google" style={card}><strong>구글 계정 연결 →</strong><p style={{marginBottom:0,color:"#64748b"}}>구글 연결 상태 확인 및 연결하기</p></Link>
    <Link href="/account/kakao" style={card}><strong>카카오 계정 연결 →</strong><p style={{marginBottom:0,color:"#64748b"}}>카카오 연결 상태 확인 및 연결하기</p></Link>
    <p style={{marginTop:24}}><Link href="/admin" data-ui-link="action">관리자 홈</Link> · <Link href="/worker/account" data-ui-link="action">시공자 개인설정</Link></p>
  </main>;
}
