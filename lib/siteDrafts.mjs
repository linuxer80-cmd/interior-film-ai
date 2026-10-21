export function createSiteDrafts() {
  const readers = new Map();
  return {
    register(id, read) {
      if (read) readers.set(id, read);
      else readers.delete(id);
    },
    snapshot(ids) {
      return [...readers.entries()]
        .filter(([id]) => !ids || ids.includes(id))
        .map(([id, read]) => ({ id, ...read() }));
    },
    discard(entries) {
      // A save must finish before its draft can be discarded.
      if (entries.some(entry => readers.get(entry.id)?.().pending)) return false;
      for (const entry of entries) readers.get(entry.id)?.().discard?.();
      return true;
    },
  };
}

export function assignmentSignature(value) {
  return JSON.stringify(Object.keys(value).sort().map(date => [date,
    value[date]?.leaderId || '', [...new Set(value[date]?.memberIds || [])].sort()]));
}
