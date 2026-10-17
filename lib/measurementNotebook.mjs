export const id = () => crypto.randomUUID();
export const newSize = () => ({ id: id(), label: '', width: '', height: '', quantity: 1, done: false });
export const newPart = () => ({ id: id(), name: '', brand: '', code: '', fire: '', grain: true, memo: '', photos: [], sizes: [newSize()] });
export const newRoom = (name = '') => ({ id: id(), name, parts: [newPart()] });
export const newNotebook = () => ({ id: id(), title: '', address: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), rooms: [newRoom('방1')] });
export function filmName(part) {
  return [part.brand.trim(), part.code.trim().toUpperCase(), part.fire === 'fire' ? '방염' : part.fire === 'non_fire' ? '비방염' : ''].filter(Boolean).join(' · ');
}
export function notebookDraft(book) {
  const sections = [], grains = new Map();
  for (const room of book.rooms) for (const part of room.parts) {
    const pending = part.sizes.filter(s => !s.done);
    if (!pending.length) continue;
    if (!part.brand.trim() || !part.code.trim() || !['fire','non_fire'].includes(part.fire)) throw Error(`${room.name} / ${part.name || '부위'}의 브랜드·제품번호·방염 여부를 입력해주세요.`);
    const color = filmName(part);
    grains.set(color, (grains.get(color) || false) || part.grain);
    const sizes = pending.map(s => {
      const width = Number(s.width), height = Number(s.height), quantity = Number(s.quantity);
      if (![width,height,quantity].every(Number.isFinite) || width <= 0 || height <= 0 || !Number.isInteger(quantity) || quantity < 1 || quantity > 1000) throw Error(`${room.name} / ${part.name || '부위'}의 치수와 수량을 확인해주세요.`);
      return { id: id(), width, height, quantity };
    });
    sections.push({ id: id(), location: room.name, part: part.name, colors: [{ id: id(), color, sizes }] });
  }
  if (!sections.length) throw Error('재단할 항목이 없습니다. 완료 체크를 확인해주세요.');
  if (sections.length > 500 || grains.size > 100) throw Error('재단할 항목이 너무 많습니다. 수첩을 나누어주세요.');
  return { version: 1, sections, rolls: [...grains].map(([color, grainDirection]) => ({ id: id(), color, grainDirection, lengthM: '' })), rollMode: 'waste', result: null, progress: {} };
}
export function validateBackup(value) {
  if (value?.format !== 'film-notebook-v1' || !value.book || typeof value.book.title !== 'string') throw Error('실측수첩 백업 파일이 아닙니다.');
  const b = value.book;
  const text = (v, n) => typeof v === 'string' && v.length <= n;
  if (!text(b.title,120) || !text(b.address,300) || !Array.isArray(b.rooms) || !b.rooms.length || b.rooms.length > 100) throw Error('현장 정보 또는 장소 수를 확인해주세요.');
  let count = 0;
  for (const r of b.rooms) {
    if (!text(r.name,80) || !Array.isArray(r.parts) || r.parts.length > 200) throw Error('장소 정보가 올바르지 않습니다.');
    for (const p of r.parts) {
      if (![p.name,p.brand,p.code].every(v=>text(v,120)) || !text(p.memo,3000) || !['','fire','non_fire'].includes(p.fire) || typeof p.grain !== 'boolean' || !Array.isArray(p.sizes) || p.sizes.length > 300 || !Array.isArray(p.photos) || p.photos.length > 12) throw Error('부위 정보가 올바르지 않습니다.');
      for (const s of p.sizes) {
        if (!text(s.label,100) || ![s.width,s.height,s.quantity].every(v=>(typeof v === 'string' && v.length <= 12) || (typeof v === 'number' && Number.isFinite(v))) || typeof s.done !== 'boolean') throw Error('치수 정보가 올바르지 않습니다.');
      }
      for (const phto of p.photos) if (!text(phto.data,1800000) || !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(phto.data)) throw Error('사진 형식을 확인해주세요.');
      count += p.sizes.length;
    }
  }
  if (count > 3000) throw Error('치수 기록이 너무 많습니다.');
  // A backup is imported as a new notebook; never overwrite an existing ID.
  return { ...newNotebook(), title: b.title, address: b.address, rooms: b.rooms.map(r=>({ id:id(), name:r.name, parts:r.parts.map(p=>({ ...p, id:id(), photos:p.photos.map(q=>({id:id(),data:q.data})), sizes:p.sizes.map(s=>({...s,id:id()})) })) })) };
}
