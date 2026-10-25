"use client";

import { useRef, useState } from "react";
import styles from "./ShowcasePhotos.module.css";

export default function ShowcasePhotos({ before = [], after = [], title }) {
  const dialog = useRef(null);
  const [selected, setSelected] = useState(null);
  return <div className={styles.gallery}>
    <div className={styles.columns}>
      {[["시공 전", before], ["시공 후", after]].filter(([, photos]) => photos.length).map(([label, photos]) =>
        <div className={styles.column} key={label}>
          {photos.map((url, index) => <button className={styles.photo} key={`${url}-${index}`} type="button" aria-label={`${title} ${label} ${index + 1} 크게 보기`} onClick={event => {
            event.preventDefault();
            event.stopPropagation();
            setSelected({ url, label });
            dialog.current.showModal();
          }}>
            <img src={url} alt={`${title} ${label} ${index + 1}`} loading="lazy" />
            <span className={styles.label}>{label}</span>
          </button>)}
        </div>
      )}
    </div>
    <dialog ref={dialog} className={styles.dialog} aria-label={`${title} 사진 크게 보기`} onClick={event => {
      event.stopPropagation();
      if (event.target === event.currentTarget) dialog.current.close();
    }}>
      <button className={styles.close} type="button" onClick={() => dialog.current.close()} autoFocus>닫기 ×</button>
      {selected && <><p>{title} · {selected.label}</p><img src={selected.url} alt={`${title} ${selected.label}`} /></>}
    </dialog>
  </div>;
}
