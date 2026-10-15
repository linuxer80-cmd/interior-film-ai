export function orderFlameLabel(value) {
  if (['flame_retardant','fire','방염'].includes(value)) return '방염';
  if (['non_flame_retardant','non_fire','비방염'].includes(value)) return '비방염';
  return '방염 구분 미등록';
}

export async function loadOrderVariants(db, productId) {
  const saleQuery = () => db.from('film_products').select('*')
    .eq('is_order_available',true).eq('stock_status','in_stock')
    .not('dealer_price_per_m','is',null).gt('dealer_price_per_m',0);
  const {data:base,error} = await saleQuery().eq('id',productId).maybeSingle();
  if(error) throw error;
  if(!base) return [];
  const codes=[...new Set([base.product_code,base.legacy_non_fire_code].filter(Boolean))];
  const [direct,reverse]=await Promise.all([
    saleQuery().eq('brand',base.brand).in('product_code',codes),
    saleQuery().eq('brand',base.brand).eq('legacy_non_fire_code',base.product_code),
  ]);
  if(direct.error) throw direct.error;
  if(reverse.error) throw reverse.error;
  return [...new Map([base,...(direct.data||[]),...(reverse.data||[])].map(row=>[row.id,row])).values()];
}

