import { inquirySchema, type InquiryInput } from '../lib/schemas'
import { api } from '../lib/api'
export const inquiriesService = {
  /** Returns the private conversation token, or null if the honeypot was filled. */
  async submit(input: InquiryInput): Promise<string | null> {
    if (input.website) return null
    const { website: _hp, ...v } = inquirySchema.parse(input)
    return (await api<{ token: string }>('submit_inquiry', v)).token
  },
}
