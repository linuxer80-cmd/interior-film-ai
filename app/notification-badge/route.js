import { ImageResponse } from 'next/og';
export const dynamic = 'force-static';
export function GET() {
  return new ImageResponse(
    <div style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:76,fontWeight:700}}>F</div>,
    {width:96,height:96},
  );
}
