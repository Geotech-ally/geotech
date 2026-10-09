import { z } from 'zod'
export const inquirySchema = z.object({
  name: z.string().trim().min(2,'Enter your full name').max(120, 'Your name must be 120 characters or fewer'),
  email: z.string().trim().email('Enter a valid email address').max(254, 'Your email must be 254 characters or fewer'),
  phone: z.string().trim().max(200).optional(),
  whatsapp: z.string().trim().max(200).optional(),
  company_name: z.string().trim().max(200).optional(),
  service_id: z.string().uuid().optional().or(z.literal('')),
  project_description: z.string().trim().min(20,'Describe your project in at least 20 characters').max(5000, 'Your description must be 5000 characters or fewer'),
  budget_range: z.string().trim().max(200).optional(),
  timeline: z.string().trim().max(200).optional(),
  referral_source: z.string().trim().max(200).optional(),
  website: z.string().max(0).optional(),
})
export type InquiryInput = z.infer<typeof inquirySchema>
