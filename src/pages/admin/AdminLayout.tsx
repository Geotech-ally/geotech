import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, Navigate, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { adminService } from '../../services/adminService'
import { supabase } from '../../lib/supabase'
export default function AdminLayout() {
  const q = useQuery({ queryKey: ['is-admin'], queryFn: adminService.isAdmin, retry: false }), qc = useQueryClient(), nav = useNavigate()
  const [signOutError, setSignOutError] = useState('')
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      window.setTimeout(() => { void qc.invalidateQueries({ queryKey: ['is-admin'] }) }, 0)
    })
    return () => subscription.unsubscribe()
  }, [qc])
  if (q.isPending) return <p role="status" className="p-10">Checking access…</p>
  if (q.isError || !q.data) return <Navigate to="/admin/login" replace/>
  return (<div className="mx-auto max-w-6xl px-4 py-6">
    <nav aria-label="Admin" className="flex flex-wrap items-center gap-5 border-b border-line pb-3">
      <Link to="/" className="font-display font-bold">Geotech admin</Link>
      {[['/admin', 'Inquiries'], ['/admin/services', 'Services & pricing'], ['/admin/content/projects', 'Projects'], ['/admin/content/testimonials', 'Testimonials'], ['/admin/content/blog_posts', 'Blog']].map(([to, l]) => <NavLink key={to} to={to} end className={({ isActive }) => isActive ? 'font-semibold text-accent' : 'text-muted'}>{l}</NavLink>)}
      <button className="ml-auto cursor-pointer underline" onClick={async () => {
        setSignOutError('')
        try { await adminService.signOut(); qc.clear(); nav('/admin/login') }
        catch { setSignOutError('Could not sign out. Please try again.') }
      }}>Sign out</button></nav>
    {signOutError && <p role="alert" className="mt-3 text-red-600 dark:text-red-400">{signOutError}</p>}
    <Outlet/></div>)
}
