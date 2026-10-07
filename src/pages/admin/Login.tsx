import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { adminService } from '../../services/adminService'
export default function Login() {
  const [email, setEmail] = useState(''), [pw, setPw] = useState(''), nav = useNavigate(), qc = useQueryClient()
  const m = useMutation({ mutationFn: () => adminService.signIn(email, pw), onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['is-admin'] }); nav('/admin') } })
  const c = 'mt-1 w-full rounded border border-line bg-surface px-3 py-2'
  return (<form onSubmit={e => { e.preventDefault(); m.mutate() }} className="mx-auto max-w-sm px-4 py-20"><h1 className="text-3xl font-bold">Admin sign in</h1>
    <label className="mt-6 block font-semibold">Email<input className={c} type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="username"/></label>
    <label className="mt-4 block font-semibold">Password<input className={c} type="password" value={pw} onChange={e => setPw(e.target.value)} required autoComplete="current-password"/></label>
    {m.isError && <p role="alert" className="mt-3 text-red-600 dark:text-red-400">{m.error.message}</p>}
    <button disabled={m.isPending} className="mt-6 cursor-pointer rounded bg-accent px-6 py-2 font-semibold text-white dark:text-[#12131c]">{m.isPending ? 'Signing in…' : 'Sign in'}</button></form>)
}
