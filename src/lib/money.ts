export type PricingType = 'starting_from' | 'fixed' | 'hourly' | 'custom_quote'
export interface Service { id:string; name:string; slug:string; short_description:string; description:string; category:string; starting_price:number|null; pricing_type:PricingType; currency:string; estimated_duration:string|null; features:string[]; is_featured:boolean }
export function formatPrice(s: Pick<Service,'starting_price'|'pricing_type'|'currency'>): string {
  if (s.pricing_type === 'custom_quote' || s.starting_price == null) return 'Custom quote'
  const amt = new Intl.NumberFormat('en-KE',{maximumFractionDigits:0}).format(s.starting_price)
  const cur = s.currency === 'KES' ? 'KSh' : s.currency
  return { starting_from:`Starting from ${cur} ${amt}`, fixed:`${cur} ${amt}`, hourly:`${cur} ${amt}/hour` }[s.pricing_type]
}
