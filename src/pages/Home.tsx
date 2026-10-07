import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { servicesService } from '../services/servicesService'
import ServiceCard from '../components/ServiceCard'
import Async from '../components/Async'
const steps = ['Discovery','Planning','Development','Testing','Deployment','Support']
export default function Home() {
  const q = useQuery({ queryKey: ['services'], queryFn: servicesService.list, staleTime: 5*60_000 })
  return (<>
    <section className="mx-auto max-w-6xl px-4 py-20">
      <h1 className="max-w-3xl text-4xl font-bold sm:text-6xl">Software that holds up when someone tries to break it.</h1>
      <p className="mt-6 max-w-xl text-lg text-muted">I build web applications, APIs and databases for businesses, and audit them for security before attackers do. Prices are listed up front.</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link to="/start" className="rounded bg-accent px-6 py-3 font-semibold text-white dark:text-[#12131c]">Start a Project</Link>
        <Link to="/services" className="rounded border border-line px-6 py-3 font-semibold">See services and pricing</Link>
      </div>
    </section>
    <section className="bg-band py-16"><div className="mx-auto max-w-6xl px-4">
      <h2 className="text-3xl font-bold">Services</h2>
      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3"><Async q={q} empty="No services are published yet.">{d => d.filter(s=>s.is_featured).slice(0,6).map(s => <ServiceCard key={s.id} s={s}/>)}</Async></div>
    </div></section>
    <section className="mx-auto max-w-6xl px-4 py-16">
      <h2 className="text-3xl font-bold">How a project runs</h2>
      <ol className="mt-8 grid gap-4 sm:grid-cols-3 lg:grid-cols-6">{steps.map((s,i) => <li key={s} className="border-t-2 border-accent pt-3"><span className="text-sm text-muted">Step {i+1}</span><p className="font-display font-bold">{s}</p></li>)}</ol>
    </section>
    <section className="bg-band py-16 text-center"><h2 className="text-3xl font-bold">Have a project in mind?</h2>
      <Link to="/start" className="mt-6 inline-block rounded bg-accent px-6 py-3 font-semibold text-white dark:text-[#12131c]">Tell me about it</Link></section>
  </>)
}
