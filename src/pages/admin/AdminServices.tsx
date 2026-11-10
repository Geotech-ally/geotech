import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { adminService, type AdminService } from '../../services/adminService'

const f = 'mt-1 w-full rounded border border-line bg-surface px-3 py-2'
const pricingTypes = ['starting_from', 'fixed', 'hourly', 'custom_quote'] as const

type FormState = {
  id?: string
  name: string
  slug: string
  short_description: string
  description: string
  category: string
  starting_price: string
  pricing_type: typeof pricingTypes[number]
  currency: string
  estimated_duration: string
  featuresText: string
  is_featured: boolean
  is_active: boolean
  display_order: string
  icon: string
  image_url: string
}

const emptyForm = (): FormState => ({
  name: '', slug: '', short_description: '', description: '', category: 'development',
  starting_price: '', pricing_type: 'custom_quote', currency: 'KES', estimated_duration: '',
  featuresText: '', is_featured: false, is_active: false, display_order: '0', icon: '', image_url: '',
})

function toForm(s: AdminService): FormState {
  return {
    id: s.id,
    name: s.name ?? '',
    slug: s.slug ?? '',
    short_description: s.short_description ?? '',
    description: s.description ?? '',
    category: s.category ?? 'development',
    starting_price: s.starting_price == null ? '' : String(s.starting_price),
    pricing_type: (s.pricing_type as FormState['pricing_type']) ?? 'custom_quote',
    currency: s.currency ?? 'KES',
    estimated_duration: s.estimated_duration ?? '',
    featuresText: (s.features ?? []).join('\n'),
    is_featured: !!s.is_featured,
    is_active: !!s.is_active,
    display_order: String(s.display_order ?? 0),
    icon: s.icon ?? '',
    image_url: s.image_url ?? '',
  }
}

function slugify(v: string) {
  return v.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
}

function validate(form: FormState) {
  const errors: Record<string, string> = {}
  if (!form.name.trim()) errors.name = 'Service name is required.'
  if (!form.slug.trim() || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.slug.trim())) errors.slug = 'Enter a valid URL slug (lowercase letters, numbers, hyphens).'
  if (!form.short_description.trim()) errors.short_description = 'Short description is required.'
  if (!form.description.trim()) errors.description = 'Full description is required.'
  if (!form.category.trim()) errors.category = 'Category is required.'
  if (form.starting_price.trim()) {
    const n = Number(form.starting_price)
    if (!Number.isFinite(n) || n < 0) errors.starting_price = 'Enter a non-negative price.'
  }
  if (form.pricing_type !== 'custom_quote' && !form.starting_price.trim()) errors.starting_price = 'Price is required unless pricing type is custom quote.'
  if (!Number.isFinite(Number(form.display_order))) errors.display_order = 'Display order must be a number.'
  return errors
}

export default function AdminServices() {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['admin-services'], queryFn: adminService.services })
  const [edit, setEdit] = useState<FormState | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [dragId, setDragId] = useState<string | null>(null)

  const rows = useMemo(() => (q.data ?? []).slice().sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0) || String(a.name).localeCompare(String(b.name))), [q.data])

  const save = useMutation({
    mutationFn: (form: FormState) => adminService.saveService({
      id: form.id,
      name: form.name,
      slug: form.slug.trim().toLowerCase(),
      short_description: form.short_description,
      description: form.description,
      category: form.category,
      starting_price: form.starting_price.trim() === '' ? null : Number(form.starting_price),
      pricing_type: form.pricing_type,
      currency: form.currency || 'KES',
      estimated_duration: form.estimated_duration || null,
      features: form.featuresText.split('\n').map((s) => s.trim()).filter(Boolean),
      is_featured: form.is_featured,
      is_active: form.is_active,
      display_order: Number(form.display_order || 0),
      icon: form.icon || null,
      image_url: form.image_url || null,
    }),
    onSuccess: () => {
      setEdit(null)
      qc.invalidateQueries({ queryKey: ['admin-services'] })
      qc.invalidateQueries({ queryKey: ['services'] })
      qc.invalidateQueries({ queryKey: ['service'] })
    },
  })

  const remove = useMutation({
    mutationFn: (id: string) => adminService.deleteService(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-services'] })
      qc.invalidateQueries({ queryKey: ['services'] })
    },
  })

  const reorder = useMutation({
    mutationFn: async (next: AdminService[]) => {
      await Promise.all(next.map((s, idx) => adminService.updateService(String(s.id), { display_order: idx })))
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-services'] })
      qc.invalidateQueries({ queryKey: ['services'] })
    },
  })

  useEffect(() => { setErrors({}) }, [edit?.id])

  const startNew = () => setEdit(emptyForm())
  const startEdit = (s: AdminService) => setEdit(toForm(s))

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!edit) return
    const v = validate(edit)
    setErrors(v)
    if (Object.keys(v).length) return
    save.mutate(edit)
  }

  const move = (id: string, dir: -1 | 1) => {
    const idx = rows.findIndex((r) => r.id === id)
    if (idx < 0) return
    const j = idx + dir
    if (j < 0 || j >= rows.length) return
    const next = rows.slice()
    const [item] = next.splice(idx, 1)
    next.splice(j, 0, item)
    reorder.mutate(next)
  }

  const onDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) return
    const next = rows.slice()
    const from = next.findIndex((r) => r.id === dragId)
    const to = next.findIndex((r) => r.id === targetId)
    if (from < 0 || to < 0) return
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    setDragId(null)
    reorder.mutate(next)
  }

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Service catalogue</h1>
        <button className="cursor-pointer rounded bg-accent px-4 py-2 font-semibold text-white dark:text-[#12131c]" onClick={startNew}>New service</button>
      </div>
      <p className="mt-2 text-sm text-muted">Manage public services without code changes. Inactive services are hidden publicly. Archived/deleted services keep existing inquiry references (service link becomes unset) and can be recreated if needed.</p>

      {q.isPending && <p role="status" className="mt-4">Loading services…</p>}
      {q.isError && <p role="alert" className="mt-4 text-red-600">{q.error instanceof Error ? q.error.message : 'Could not load services.'}</p>}
      {save.isSuccess && <p role="status" className="mt-3 text-green-700 dark:text-green-400">Service saved.</p>}
      {remove.isError && <p role="alert" className="mt-3 text-red-600">{remove.error instanceof Error ? remove.error.message : 'Could not delete service.'}</p>}

      {!q.isPending && !q.isError && rows.length === 0 && <p className="mt-4 text-muted">No services found. Create one to publish it.</p>}

      <div className="mt-4 space-y-3">
        {rows.map((s, i) => (
          <article
            key={s.id}
            className="rounded border border-line bg-surface p-4"
            draggable
            onDragStart={() => setDragId(String(s.id))}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDrop(String(s.id))}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-bold">{s.name}</h2>
                  <span className={`rounded px-2 py-0.5 text-xs font-semibold ${s.is_active ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' : 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200'}`}>{s.is_active ? 'Active' : 'Inactive'}</span>
                  {s.is_featured && <span className="rounded bg-accent/20 px-2 py-0.5 text-xs font-semibold text-accent">Featured</span>}
                  <span className="text-xs text-muted">Order {s.display_order ?? i}</span>
                </div>
                <p className="mt-1 text-sm text-muted">/{s.slug} · {s.category} · {s.pricing_type}{s.starting_price != null ? ` · ${s.starting_price}` : ''} {s.currency || 'KES'}</p>
                <p className="mt-1 text-sm">{s.short_description}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="cursor-pointer rounded border border-line px-2 py-1 text-sm" onClick={() => move(String(s.id), -1)} disabled={i === 0 || reorder.isPending}>↑</button>
                <button className="cursor-pointer rounded border border-line px-2 py-1 text-sm" onClick={() => move(String(s.id), 1)} disabled={i === rows.length - 1 || reorder.isPending}>↓</button>
                <button className="cursor-pointer underline text-sm" onClick={() => startEdit(s)}>Edit</button>
                <button className="cursor-pointer underline text-sm" onClick={() => save.mutate({ ...toForm(s), is_active: !s.is_active } as any)}>{s.is_active ? 'Archive' : 'Activate'}</button>
                <button className="cursor-pointer underline text-sm text-red-700 dark:text-red-400" onClick={() => {
                  if (confirm(`Delete "${s.name}"? Existing inquiries/projects keep their records but may lose this service link. Consider Archiving instead.`)) remove.mutate(String(s.id))
                }}>Delete</button>
              </div>
            </div>
          </article>
        ))}
      </div>

      {edit && (
        <form className="mt-8 grid gap-4 rounded border border-line bg-surface p-5" onSubmit={submit}>
          <h2 className="text-2xl font-bold">{edit.id ? 'Edit service' : 'Create service'}</h2>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="font-semibold">Name<input className={f} value={edit.name} onChange={(e) => {
              const name = e.target.value
              setEdit((v) => v ? { ...v, name, slug: v.id ? v.slug : (v.slug || slugify(name)) } : v)
            }} />{errors.name && <span className="text-sm text-red-600">{errors.name}</span>}</label>
            <label className="font-semibold">Slug<input className={f} value={edit.slug} onChange={(e) => setEdit((v) => v ? { ...v, slug: slugify(e.target.value) } : v)} />{errors.slug && <span className="text-sm text-red-600">{errors.slug}</span>}</label>
            <label className="font-semibold md:col-span-2">Short description<textarea className={f} rows={2} value={edit.short_description} onChange={(e) => setEdit((v) => v ? { ...v, short_description: e.target.value } : v)} />{errors.short_description && <span className="text-sm text-red-600">{errors.short_description}</span>}</label>
            <label className="font-semibold md:col-span-2">Full description<textarea className={f} rows={5} value={edit.description} onChange={(e) => setEdit((v) => v ? { ...v, description: e.target.value } : v)} />{errors.description && <span className="text-sm text-red-600">{errors.description}</span>}</label>
            <label className="font-semibold">Category<input className={f} value={edit.category} onChange={(e) => setEdit((v) => v ? { ...v, category: e.target.value } : v)} />{errors.category && <span className="text-sm text-red-600">{errors.category}</span>}</label>
            <label className="font-semibold">Estimated duration / delivery<input className={f} value={edit.estimated_duration} onChange={(e) => setEdit((v) => v ? { ...v, estimated_duration: e.target.value } : v)} placeholder="e.g. 2–4 weeks" /></label>
            <label className="font-semibold">Pricing type<select className={f} value={edit.pricing_type} onChange={(e) => setEdit((v) => v ? { ...v, pricing_type: e.target.value as FormState['pricing_type'] } : v)}>{pricingTypes.map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
            <label className="font-semibold">Pricing amount<input className={f} type="number" min={0} value={edit.starting_price} onChange={(e) => setEdit((v) => v ? { ...v, starting_price: e.target.value } : v)} placeholder={edit.pricing_type === 'custom_quote' ? 'Leave blank for custom quote' : 'Amount'} />{errors.starting_price && <span className="text-sm text-red-600">{errors.starting_price}</span>}</label>
            <label className="font-semibold">Currency<input className={f} value={edit.currency} onChange={(e) => setEdit((v) => v ? { ...v, currency: e.target.value } : v)} /></label>
            <label className="font-semibold">Display order<input className={f} type="number" value={edit.display_order} onChange={(e) => setEdit((v) => v ? { ...v, display_order: e.target.value } : v)} />{errors.display_order && <span className="text-sm text-red-600">{errors.display_order}</span>}</label>
            <label className="font-semibold">Icon (optional name/url)<input className={f} value={edit.icon} onChange={(e) => setEdit((v) => v ? { ...v, icon: e.target.value } : v)} /></label>
            <label className="font-semibold">Image URL (optional)<input className={f} value={edit.image_url} onChange={(e) => setEdit((v) => v ? { ...v, image_url: e.target.value } : v)} /></label>
            <label className="font-semibold md:col-span-2">Features & deliverables (one per line)<textarea className={f} rows={5} value={edit.featuresText} onChange={(e) => setEdit((v) => v ? { ...v, featuresText: e.target.value } : v)} /></label>
          </div>

          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={edit.is_active} onChange={(e) => setEdit((v) => v ? { ...v, is_active: e.target.checked } : v)} /> Active (visible publicly)</label>
            <label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={edit.is_featured} onChange={(e) => setEdit((v) => v ? { ...v, is_featured: e.target.checked } : v)} /> Featured</label>
          </div>

          {save.isError && <p role="alert" className="text-red-600 dark:text-red-400">{save.error instanceof Error ? save.error.message : 'Could not save service.'}</p>}

          <div className="flex flex-wrap gap-3">
            <button disabled={save.isPending} className="cursor-pointer rounded bg-accent px-5 py-2 font-semibold text-white disabled:opacity-50 dark:text-[#12131c]">{save.isPending ? 'Saving…' : 'Save service'}</button>
            <button type="button" className="cursor-pointer underline" onClick={() => setEdit(null)}>Cancel</button>
          </div>
          <p className="text-xs text-muted">Pricing is administrator-managed. Do not publish invented commercial prices; use custom quote or review placeholder data before activating.</p>
        </form>
      )}
    </div>
  )
}

