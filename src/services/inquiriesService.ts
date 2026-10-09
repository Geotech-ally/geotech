import { inquirySchema, type InquiryInput } from '../lib/schemas'
import { ApiError, api } from '../lib/api'
import { z } from 'zod'
const responseSchema = z.object({ token: z.string().uuid() })
export const inquiriesService = {
  /** Returns the validated private conversation token after an atomic submission. */
  async submit(input: InquiryInput): Promise<string> {
    const parsed = inquirySchema.safeParse(input)
    if (!parsed.success) throw new ApiError('Please check the form fields and try again.')
    if (parsed.data.website) throw new ApiError('We could not submit this inquiry. Please check the form and try again.')
    const { website: _honeypot, ...payload } = parsed.data
    const result = await api<unknown>('submit_inquiry', payload)
    const response = responseSchema.safeParse(result)
    if (!response.success) throw new ApiError('Your inquiry response was incomplete. Please try submitting again.')
    return response.data.token
  },
}
