// Keep automatic status checks, but never make a readable list wait for them.
// This loader belongs to one mounted screen; it does not cache customer data.
export function createProgressiveSiteList() {
  let generation = 0;
  const syncing = new Map();
  return {
    invalidate() { generation += 1; },
    load({ companyId, read, sync, onData, onError, onSyncError, onLoading }) {
      const version = ++generation;
      const current = () => version === generation;
      onLoading(true);
      if (!syncing.has(companyId)) {
        const pending = Promise.resolve().then(() => sync(companyId))
          .then(result => ({ result }), error => ({ error }));
        syncing.set(companyId, pending);
        void pending.then(() => {
          if (syncing.get(companyId) === pending) syncing.delete(companyId);
        });
      }
      const status = syncing.get(companyId);
      const first = Promise.resolve().then(() => read(companyId));
      const ready = first.then(data => { if (current()) onData(data); })
        .catch(error => { if (current()) onError(error); })
        .finally(() => { if (current()) onLoading(false); });
      const synced = Promise.all([ready, status]).then(async ([, outcome]) => {
        if (!current()) return;
        if (outcome.error) { onSyncError(outcome.error); return; }
        if (!(outcome.result?.changed > 0)) return;
        try {
          const data = await read(companyId);
          if (current()) onData(data);
        } catch (error) {
          // Retain the first list when refreshing the changed statuses fails.
          if (current()) onSyncError(error);
        }
      });
      return { ready, synced };
    },
  };
}
