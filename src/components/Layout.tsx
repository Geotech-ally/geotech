import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { Moon, Sun, MessageCircle } from 'lucide-react'
const links = [['/', 'Home'], ['/services', 'Services'], ['/projects', 'Projects'], ['/insights', 'Insights'], ['/about', 'About'], ['/contact', 'Contact']] as const
const wa = import.meta.env.VITE_WHATSAPP_NUMBER as string | undefined
export default function Layout() {
  const [dark, setDark] = useState(() => localStorage.getItem('theme') === 'dark')
  useEffect(() => { document.documentElement.classList.toggle('dark', dark); localStorage.setItem('theme', dark ? 'dark' : 'light') }, [dark])
  return (<>
    <header className="sticky top-0 z-10 border-b border-line bg-bg/95 backdrop-blur">
      <nav aria-label="Main" className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link to="/" className="font-display text-xl font-bold">Geotech</Link>
        <ul className="flex flex-1 gap-5">{links.map(([to, l]) => <li key={to}><NavLink to={to} end={to==='/'} className={({isActive}) => isActive ? 'font-semibold text-accent' : 'text-muted hover:text-ink'}>{l}</NavLink></li>)}</ul>
        <button onClick={() => setDark(d => !d)} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'} className="cursor-pointer rounded p-2 hover:bg-band">{dark ? <Sun size={18}/> : <Moon size={18}/>}</button>
        <Link to="/start" className="rounded bg-accent px-4 py-2 font-semibold text-white dark:text-[#12131c]">Start a Project</Link>
      </nav>
    </header>
    <main><Outlet/></main>
    <footer className="bg-footer text-[#e6dcf5]">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-3">
        <div><p className="font-display text-xl font-bold text-white">Geotech</p><p className="mt-2 max-w-xs text-sm text-[#cbbde3]">Full-stack development and cybersecurity for businesses that need software they can trust.</p></div>
        <nav aria-label="Footer"><ul className="space-y-2 text-sm">{links.map(([to,l]) => <li key={to}><Link className="underline-offset-4 hover:text-white hover:underline" to={to}>{l}</Link></li>)}<li><Link className="hover:underline" to="/start">Start a Project</Link></li></ul></nav>
        <div className="text-sm">{wa && <a className="inline-flex items-center gap-2 hover:underline" href={`https://wa.me/${wa}`}><MessageCircle size={16}/>Chat on WhatsApp</a>}</div>
      </div>
      <p className="border-t border-white/15 py-4 text-center text-xs text-[#cbbde3]">© {new Date().getFullYear()} Geotech. All rights reserved.</p>
    </footer></>)
}
