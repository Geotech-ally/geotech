import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { ReactNode } from 'react'
import { inquirySchema, type InquiryInput } from '../lib/schemas'
import { inquiriesService } from '../services/inquiriesService'
import { servicesService } from '../services/servicesService'
const budgets = ['Under KSh 50,000','KSh 50,000 – 150,000','KSh 150,000 – 500,000','Above KSh 500,000','Not sure yet']
const timelines = ['As soon as possible','Within 1 month','1–3 months','Flexible']
const input = 'mt-1 w-full rounded border border-line bg-surface px-3 py-2'
function F({ id, label, err, children }: { id: string; label: string; err?: string; children: ReactNode }) {
  return (<div><label htmlFor={id} className="font-semibold">{label}</label>{children}{err && <p id={`${id}-e`} role="alert" className="mt-1 text-sm text-red-600 dark:text-red-400">{err}</p>}</div>)
}
export default function Start() {
  const [params] = useSearchParams()
  const services = useQuery({ queryKey: ['services'], queryFn: servicesService.list })
  const pre = services.data?.find(s => s.slug === params.get('service'))?.id ?? ''
  const { register, handleSubmit, reset, formState: { errors } } = useForm<InquiryInput>({ resolver: zodResolver(inquirySchema), values: { service_id: pre } as InquiryInput })
  const m = useMutation({ mutationFn: inquiriesService.submit, onSuccess: () => reset() })
  if (m.isSuccess) return <div role="status" className="mx-auto max-w-xl px-4 py-20"><h1 className="text-3xl font-bold">Inquiry sent</h1><p className="mt-3 text-muted">Thanks. I'll review your project and reply by email within two working days.</p>{m.data && <p className="mt-4">Follow the conversation, add files and reply here: <Link className="font-semibold underline" to={`/c/${m.data}`}>open your conversation page</Link>. Bookmark it; the link is private to you.</p>}</div>
  return (<div className="mx-auto max-w-2xl px-4 py-14"><title>Start a project — Geotech</title>
    <h1 className="text-4xl font-bold">Start a project</h1>
    <form onSubmit={handleSubmit(v => m.mutate(v))} noValidate className="relative mt-8 grid gap-5">
      <F id="name" label="Full name" err={errors.name?.message}><input id="name" className={input} aria-describedby="name-e" aria-invalid={!!errors.name} {...register('name')}/></F>
      <F id="email" label="Email" err={errors.email?.message}><input id="email" type="email" className={input} aria-describedby="email-e" aria-invalid={!!errors.email} {...register('email')}/></F>
      <div className="grid gap-5 sm:grid-cols-2">
        <F id="phone" label="Phone"><input id="phone" type="tel" className={input} {...register('phone')}/></F>
        <F id="whatsapp" label="WhatsApp number"><input id="whatsapp" type="tel" className={input} {...register('whatsapp')}/></F></div>
      <F id="company_name" label="Company or business"><input id="company_name" className={input} {...register('company_name')}/></F>
      <F id="service_id" label="Service"><select id="service_id" className={input} {...register('service_id')}><option value="">Not sure yet</option>{services.data?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></F>
      <F id="project_description" label="What do you need built?" err={errors.project_description?.message}><textarea id="project_description" rows={5} className={input} aria-describedby="project_description-e" aria-invalid={!!errors.project_description} {...register('project_description')}/></F>
      <div className="grid gap-5 sm:grid-cols-2">
        <F id="budget_range" label="Budget"><select id="budget_range" className={input} {...register('budget_range')}><option value="">Select</option>{budgets.map(b => <option key={b}>{b}</option>)}</select></F>
        <F id="timeline" label="Timeline"><select id="timeline" className={input} {...register('timeline')}><option value="">Select</option>{timelines.map(b => <option key={b}>{b}</option>)}</select></F></div>
      <F id="referral_source" label="How did you hear about me?"><input id="referral_source" className={input} {...register('referral_source')}/></F>
      <div aria-hidden="true" className="absolute -left-[9999px]"><label>Website<input tabIndex={-1} autoComplete="off" {...register('website')}/></label></div>
      {m.isError && <p role="alert" className="text-red-600 dark:text-red-400">{m.error.message}</p>}
      <button disabled={m.isPending} className="cursor-pointer rounded bg-accent px-6 py-3 font-semibold text-white disabled:opacity-60 dark:text-[#12131c]">{m.isPending ? 'Sending…' : 'Send inquiry'}</button>
    </form></div>)
}
