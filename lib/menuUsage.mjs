export const menuKey = menu => menu.id || menu.href;
export function readMenuUsage(storage, key, menus) {
  try {
    const value = JSON.parse(storage.getItem(key) || '{}');
    return Object.fromEntries(menus.map(menu => {
      const id = menuKey(menu), count = value?.[id];
      return [id, Number.isSafeInteger(count) && count > 0 ? Math.min(count, 1000000) : 0];
    }));
  } catch { return {}; }
}
export function sortMenus(menus, usage) {
  return menus.map((menu, index) => ({menu, index})).sort((a,b) =>
    (usage[menuKey(b.menu)] || 0) - (usage[menuKey(a.menu)] || 0) || a.index - b.index
  ).map(entry => entry.menu);
}
