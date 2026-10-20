const reply = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Authorization' } });
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const take = result => { if (result.error) throw result.error; return result.data || []; };
export function warehouseGroups(rolls, search = '') {
  const query = search.trim().toLocaleLowerCase().replace(/\s+/g, '');
  const found = rolls.filter(r => !query || [r.brand, r.product_code, r.label, r.location, r.remaining].filter(v => v != null).join(' ').toLocaleLowerCase().replace(/\s+/g, '').includes(query));
  const groups = new Map();
  for (const roll of found) {
    const key = JSON.stringify([roll.brand || '', roll.product_code || ''].map(v => v.trim().toUpperCase()));
    if (!groups.has(key)) groups.set(key, { key, brand: roll.brand, code: roll.product_code, rollCount: 0, metres: 0, rolls: [] });
    const group = groups.get(key);
    group.rollCount++;
    group.metres += Number(roll.remaining);
    if (group.rolls.length < 100) group.rolls.push({ id: roll.id, label: roll.label, location: roll.location, remaining: roll.remaining });
  }
  return [...groups.values()].map(group => ({ ...group, metres: Number(group.metres.toFixed(3)), limitedRolls: group.rollCount > group.rolls.length })).sort((a,b) => `${a.brand} ${a.code}`.localeCompare(`${b.brand} ${b.code}`, 'ko'));
}
export async function warehouseGet(request, authenticate) {
  try {
    const auth = await authenticate(request, false);
    if (auth.error) return reply({ error: auth.error }, auth.status);
    const { db, user } = auth;
    const params = new URL(request.url).searchParams;
    const companyId = params.get('companyId');
    const search = (params.get('q') || '').trim();
    const page = Number(params.get('page') || 0);
    if ((companyId && !idPattern.test(companyId)) || search.length > 100 || !Number.isSafeInteger(page) || page < 0 || page > 1000) return reply({ error: '업체와 검색 조건을 확인해주세요.' }, 400);
    const profile = await db.from('profiles').select('is_active').eq('id', user.id).maybeSingle();
    if (profile.error) throw profile.error;
    if (profile.data?.is_active === false) return reply({ error: '비활성 계정입니다.' }, 403);
    const memberships = take(await db.from('workers').select('company_id').eq('user_id', user.id).eq('is_active', true).limit(201));
    if (memberships.length > 200) throw Error('membership_limit');
    const ids = [...new Set(memberships.map(w => w.company_id))];
    const companies = ids.length ? take(await db.from('companies').select('id,company_name').in('id', ids).eq('is_active', true).order('company_name')) : [];
    if (!companies.length) return reply({ error: '활성 시공자로 연결된 업체가 없습니다. 관리자에게 업체 연결을 확인해주세요.' }, 403);
    const selected = companyId ? companies.find(c => c.id === companyId) : companies.length === 1 ? companies[0] : null;
    if (companyId && !selected) return reply({ error: '본인이 연결된 활성 업체의 창고만 조회할 수 있습니다.' }, 403);
    if (!selected) return reply({ companies, selectedCompany: null, state: 'choose_company', groups: [], total: 0 });
    const setting = await db.from('company_inventory_preferences').select('enabled').eq('company_id', selected.id).maybeSingle();
    if (setting.error) throw setting.error;
    if (!setting.data?.enabled) return reply({ companies, selectedCompany: selected, state: 'unavailable', groups: [], total: 0, message: '이 업체는 앱 재고관리를 사용하지 않아 창고 수량을 확인할 수 없습니다.' });
    // Every read remains company-scoped. Select a safe whitelist: no purchase costs,
    // supplier prices, customer details, or other sites' material assignments.
    const rolls = [];
    let complete = false;
    for (let offset = 0; offset < 20000; offset += 500) {
      const batch = take(await db.from('film_stock_rolls').select('id,brand,product_code,label,location,remaining')
        .eq('company_id', selected.id).eq('status', 'available').gt('remaining', 0).order('id').range(offset, offset + 499));
      if (batch.some(roll => !Number.isFinite(Number(roll.remaining)) || Number(roll.remaining) <= 0)) throw Error('invalid_stock_quantity');
      rolls.push(...batch);
      if (batch.length < 500) { complete = true; break; }
    }
    if (!complete) return reply({ error: '창고 자료가 너무 많아 전체 조회를 완료하지 못했습니다. 관리자에게 확인해주세요.' }, 503);
    const groups = warehouseGroups(rolls, search);
    return reply({ companies, selectedCompany: selected, state: 'available', groups: groups.slice(page * 30, (page + 1) * 30), total: groups.length, page, hasMore: groups.length > (page + 1) * 30, rollCount: groups.reduce((n,g) => n + g.rollCount, 0), metres: Number(groups.reduce((n,g) => n + g.metres, 0).toFixed(3)) });
  } catch (error) {
    console.error('Worker warehouse read failed', error.code || 'query_failed');
    return reply({ error: '창고 재고를 불러오지 못했습니다. 재고가 없는 상태와는 다릅니다. 다시 확인해주세요.' }, 503);
  }
}
