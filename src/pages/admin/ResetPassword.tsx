import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { adminService } from '../../services/adminService'

export default function ResetPassword() {
  const [password, setPassword] = useState(''), [confirmation, setConfirmation] = useState(''), [message, setMessage] = useState('')
  const nav = useNavigate()
  const update = useMutation({
    mutationFn: () => {
      if (password.length < 8) throw new Error('Use a password with at least 8 characters.')
      if (password !== confirmation) throw new Error('Passwords do not match.')
      return adminService.updatePassword(password)
    },
    onSuccess: () => setMessage('Password updated. You can now sign in.'),
  })
  const c = 'mt-1 w-full rounded border border-line bg-surface px-3 py-2'
  return <form onSubmit={e => { e.preventDefault(); update.mutate() }} className="mx-auto max-w-sm px-4 py-20">
    <h1 className="text-3xl font-bold">Set a new password</h1>
    <label className="mt-6 block font-semibold">New password<input className={c} type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} autoComplete="new-password"/></label>
    <label className="mt-4 block font-semibold">Confirm new password<input className={c} type="password" value={confirmation} onChange={e => setConfirmation(e.target.value)} required minLength={8} autoComplete="new-password"/></label>
    {update.isError && <p role="alert" className="mt-3 text-red-600 dark:text-red-400">{update.error.message}</p>}
    {message ? <p role="status" className="mt-4 text-muted">{message} <button type="button" className="underline" onClick={() => nav('/admin/login')}>Go to sign in</button></p>
      : <button disabled={update.isPending} className="mt-6 cursor-pointer rounded bg-accent px-6 py-2 font-semibold text-white dark:text-[#12131c]">{update.isPending ? 'Updating…' : 'Update password'}</button>}
  </form>
}
