import { expect, it } from 'vitest'
import { inquirySchema } from './schemas'
const ok = { name:'Example User', email:'person@example.test', project_description:'We need a sample booking system for a fictional clinic.' }
it('accepts valid input', () => expect(inquirySchema.safeParse(ok).success).toBe(true))
it('rejects bad email', () => expect(inquirySchema.safeParse({...ok,email:'x'}).success).toBe(false))
it('rejects filled honeypot', () => expect(inquirySchema.safeParse({...ok,website:'spam'}).success).toBe(false))
