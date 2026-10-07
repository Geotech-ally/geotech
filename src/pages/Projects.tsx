import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { contentService } from '../services/contentService'
import Async from '../components/Async'
export default function Projects() {
  const q = useQuery({ queryKey: ['projects'], queryFn: contentService.projects })
  return (<div className="mx-auto max-w-6xl px-4 py-14"><title>Projects — Geotech</title><h1 className="text-4xl font-bold">Projects</h1>
    <div className="mt-8 grid gap-6 md:grid-cols-2"><Async q={q} empty="Case studies are coming soon.">{d => d.map(p => (
      <article key={p.id} className="rounded-lg border border-line bg-surface p-6"><h2 className="text-2xl font-bold">{p.title}</h2><p className="mt-2 text-muted">{p.summary}</p>
        {([['Problem', p.problem], ['Solution', p.solution], ['Result', p.result]] as const).map(([k, v]) => v && <p key={k} className="mt-3"><strong>{k}: </strong>{v}</p>)}
        <p className="mt-4 text-sm text-muted">{p.technologies.join(', ')}</p></article>))}</Async></div>
    <Link to="/start" className="mt-10 inline-block rounded bg-accent px-6 py-3 font-semibold text-white dark:text-[#12131c]">Start a Project</Link></div>)
}
