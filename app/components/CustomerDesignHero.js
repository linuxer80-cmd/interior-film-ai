import {getCustomerDesign, designVars} from '../../lib/customerPageDesigns.mjs';
import styles from './CustomerDesignHero.module.css';
export default function CustomerDesignHero({designId,name,introduction,region,image,logo}) {
 const design=getCustomerDesign(designId);
 return <div className={styles.hero} data-layout={design.layout} style={designVars(design.id)}>
   <div className={styles.copy}>
    {logo && <img className={styles.logo} src={logo} alt={`${name} 로고`} />}
    <small>{region || '인테리어필름 전문 시공'}</small>
    <h2>{name || '우리 업체'}</h2>
    <p>{introduction || '공간에 새로운 표정을 더합니다.'}</p>
   </div>
   {image ? <img className={styles.photo} src={image} alt={`${name || '업체'} 시공 사례`} /> : <div className={styles.empty}>우리 업체의 시공 사진을 채워보세요</div>}
 </div>;
}
