const clean = value => String(value || '').normalize('NFKC').toLowerCase().replace(/\s|[.,()-]/g, '');
export function registrationStatus(confirmed, dates = []) {
  return confirmed && dates.length ? 'scheduled' : 'consulting';
}
export function similarRegistrationSites(sites, form) {
  const phone = String(form.customer_phone || '').replace(/\D/g, '');
  const address = clean(form.address), name = clean(form.site_name);
  return sites.filter(site => {
    const otherAddress = clean(site.address), otherName = clean(site.site_name);
    return (phone.length >= 8 && phone === String(site.customer_phone || '').replace(/\D/g, '')) ||
      (address.length >= 5 && otherAddress && (address.includes(otherAddress) || otherAddress.includes(address))) ||
      (name.length >= 4 && otherName && (name.includes(otherName) || otherName.includes(name)));
  });
}
export function registrationConsultation(form) {
  return [form.consultation_text, form.work_description, form.memo,
    ...(form.consultation_quote_seed?.items || []).map(row => [row.part, row.name, row.detail, row.description].filter(Boolean).join(' · '))]
    .map(text => String(text || '').trim()).filter((text,index,all) => text && all.indexOf(text) === index).join('\n');
}
