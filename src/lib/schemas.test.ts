import { expect, it } from 'vitest'
import { inquirySchema } from './schemas'
const ok = { name:'Ann Wanjiku', email:'ann@example.com', project_description:'We need an online booking system for our clinic.' }
it('accepts valid input', () => expect(inquirySchema.safeParse(ok).success).toBe(true))
it('rejects bad email', () => expect(inquirySchema.safeParse({...ok,email:'x'}).success).toBe(false))
it('rejects filled honeypot', () => expect(inquirySchema.safeParse({...ok,website:'spam'}).success).toBe(false))
