import { useQuery } from '@tanstack/react-query'
import { contentService } from '../services/contentService'
export default function About() {
  const t = useQuery({ queryKey: ['testimonials'], queryFn: contentService.testimonials })
  return (<div className="mx-auto max-w-3xl px-4 py-14"><title>About — Geotech</title><h1 className="text-4xl font-bold">About</h1>
    <p className="mt-4 text-lg">I'm a full-stack developer and cybersecurity specialist. I build business software and test it the way an attacker would. Edit this text in <code>src/pages/About.tsx</code>.</p>
    <section className="mt-10"><h2 className="text-2xl font-bold">What clients say</h2>
      {t.isPending && <p role="status" className="mt-4 text-muted">Loading testimonials…</p>}
      {t.isError && <p role="alert" className="mt-4 text-red-600 dark:text-red-400">Testimonials couldn’t be loaded. Please refresh to try again.</p>}
      {t.data?.length === 0 && !t.isError && <p className="mt-4 text-muted">Client testimonials will appear here.</p>}
      {t.data?.map(x => <blockquote key={x.id} className="mt-4 border-l-4 border-accent pl-4"><p>{x.quote}</p><footer className="mt-1 text-sm text-muted">{x.author}{x.role && `, ${x.role}`}</footer></blockquote>)}</section></div>)
}
