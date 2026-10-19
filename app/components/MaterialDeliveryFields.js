"use client";
import { deliveryMethods } from '../../lib/materialPilot.mjs';
import styles from './MaterialDeliveryFields.module.css';
export default function MaterialDeliveryFields({ value, onChange, disabled = false }) {
  const method = value.method || 'parcel';
  const set = (key, val) => onChange({ ...value, [key]: val });
  return <fieldset className={styles.fields} disabled={disabled}>
    <legend>받는 방법</legend>
    <div className={styles.grid}>
      <label className={styles.field}>수령 방법
        <select className={styles.control} value={method} onChange={e => set('method', e.target.value)}>
          {Object.entries(deliveryMethods).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </label>
      <label className={styles.field}>{method === 'pickup' ? '수령인 이름' : '받는 사람'}
        <input className={styles.control} autoComplete="name" value={value.recipient_name || ''} maxLength={80} onChange={e => set('recipient_name', e.target.value)} />
      </label>
      <label className={styles.field}>연락처
        <input className={styles.control} type="tel" inputMode="tel" autoComplete="tel" placeholder="010-0000-0000" value={value.recipient_phone || ''} maxLength={25} onChange={e => set('recipient_phone', e.target.value)} />
      </label>
      {method !== 'pickup' && <>
        <label className={styles.field}>{method === 'nearby' ? '희망 수령 지역·주소' : '받을 주소 / 화물 도착 영업소'}
          <input className={styles.control} autoComplete="address-line1" value={value.address_line1 || ''} maxLength={300} onChange={e => set('address_line1', e.target.value)} />
        </label>
        <label className={styles.field}>상세 주소
          <input className={styles.control} autoComplete="address-line2" value={value.address_line2 || ''} maxLength={200} onChange={e => set('address_line2', e.target.value)} />
        </label>
      </>}
      {method === 'pickup' && <p className={styles.help}>배송지 입력은 필요하지 않습니다. 대리점이 준비 완료 후 수령 장소와 시간을 안내합니다.</p>}
      {method === 'nearby' && <p className={styles.help}>희망 지역을 입력해주세요. 공급 대리점이 물건 준비를 확인한 뒤 실제 수령처를 안내합니다.</p>}
      {['quick', 'freight'].includes(method) && <label className={styles.consent}>
        <input type="checkbox" checked={!!value.feeAccepted} onChange={e => set('feeAccepted', e.target.checked)} />
        <span>퀵·화물 운임은 자재대금과 별도로 본인이 부담합니다.</span>
      </label>}
    </div>
  </fieldset>;
}
