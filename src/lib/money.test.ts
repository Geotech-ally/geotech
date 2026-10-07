import { expect, it } from 'vitest'
import { formatPrice } from './money'
it('formats KES starting price', () => expect(formatPrice({starting_price:35000,pricing_type:'starting_from',currency:'KES'})).toBe('Starting from KSh 35,000'))
it('falls back to custom quote', () => expect(formatPrice({starting_price:null,pricing_type:'fixed',currency:'KES'})).toBe('Custom quote'))
