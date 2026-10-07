import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { adminService, type AdminService } from '../../services/adminService'
const f = 'rounded border border-line bg-surface px-2 py-1'
function Row({ s }: { s: AdminService }) {
  const qc = useQueryClient(), [price, setPrice] = useState(s.starting_price?.toString() ?? ''), [type, setType] = useState(s.pricing_type), [active, setActive] = useState(s.is_active), [feat, setFeat] = useState(s.is_featured)
  const m = useMutation({ mutationFn: () => adminService.updateService(s.id, { starting_price: price === '' ? null : Number(price), pricing_type: type, is_active: active, is_featured: feat }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['services'] }) } })
  return (<tr className="border-t border-line"><th scope="row" className="p-2 text-left">{s.name}</th>
    <td className="p-2"><input aria-label={`Price for ${s.name}`} type="number" min={0} className={`${f} w-28`} value={price} onChange={e => setPrice(e.target.value)}/></td>
    <td className="p-2"><select aria-label={`Pricing type for ${s.name}`} className={f} value={type} onChange={e => setType(e.target.value)}>{['starting_from', 'fixed', 'hourly', 'custom_quote'].map(t => <option key={t}>{t}</option>)}</select></td>
    <td className="p-2"><input aria-label={`${s.name} active`} type="checkbox" checked={active} onChange={e => setActive(e.target.checked)}/></td>
    <td className="p-2"><input aria-label={`${s.name} featured`} type="checkbox" checked={feat} onChange={e => setFeat(e.target.checked)}/></td>
    <td className="p-2"><button onClick={() => m.mutate()} disabled={m.isPending} className="cursor-pointer underline">{m.isPending ? 'Saving…' : 'Save'}</button>{m.isSuccess && <span role="status" className="ml-2 text-sm">Saved</span>}{m.isError && <span role="alert" className="ml-2 text-sm">Failed</span>}</td></tr>)
}
export default function AdminServices() {
  const q = useQuery({ queryKey: ['admin-services'], queryFn: adminService.services })
  return (<div className="mt-6"><h1 className="text-3xl font-bold">Services & pricing</h1>
    {q.isPending && <p role="status" className="mt-4">Loading…</p>}{q.isError && <p role="alert" className="mt-4">Couldn't load services.</p>}
    {q.data && <div className="mt-4 overflow-x-auto rounded border border-line bg-surface"><table className="w-full"><thead><tr className="text-left"><th className="p-2">Service</th><th className="p-2">Price (KES)</th><th className="p-2">Type</th><th className="p-2">Active</th><th className="p-2">Featured</th><th className="p-2"/></tr></thead><tbody>{q.data.map(s => <Row key={s.id} s={s}/>)}</tbody></table></div>}</div>)
}
