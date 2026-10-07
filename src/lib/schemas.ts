import { z } from 'zod'
export const inquirySchema = z.object({
  name: z.string().trim().min(2,'Enter your full name'),
  email: z.string().trim().email('Enter a valid email address'),
  phone: z.string().trim().optional(),
  whatsapp: z.string().trim().optional(),
  company_name: z.string().trim().optional(),
  service_id: z.string().uuid().optional().or(z.literal('')),
  project_description: z.string().trim().min(20,'Describe your project in at least 20 characters'),
  budget_range: z.string().optional(),
  timeline: z.string().optional(),
  referral_source: z.string().optional(),
  website: z.string().max(0).optional(),
})
export type InquiryInput = z.infer<typeof inquirySchema>
