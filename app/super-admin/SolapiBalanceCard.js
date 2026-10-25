"use client";
export default function SolapiBalanceCard(){
 return <section className="solapi-card" aria-label="솔라피 충전">
  <h2>솔라피 충전</h2>
  <a className="charge" href="https://console.solapi.com/balance" target="_blank" rel="noopener noreferrer">솔라피 충전 페이지 열기 ↗</a>
  <style jsx>{`.solapi-card{box-sizing:border-box;padding:20px;margin:18px 0;background:#f3f8f4;border:1px solid #cbdccd;border-radius:16px;color:#263c31}h2{font-size:18px;margin:0 0 12px}.charge{box-sizing:border-box;min-height:44px;padding:10px 14px;border:1px solid #c1d1c5;border-radius:9px;font:inherit;font-size:14px;display:inline-flex;align-items:center;background:#285340;color:white;text-decoration:none;font-weight:700}.charge:focus-visible{outline:3px solid #6088b4;outline-offset:3px}@media(max-width:420px){.charge{display:flex;justify-content:center;width:100%}}`}</style>
 </section>;
}
