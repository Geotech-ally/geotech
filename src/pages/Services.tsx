import { useQuery } from '@tanstack/react-query'
import { servicesService } from '../services/servicesService'
import ServiceCard from '../components/ServiceCard'
import Async from '../components/Async'
export default function Services() {
  const q = useQuery({ queryKey: ['services'], queryFn: servicesService.list })
  return (<div className="mx-auto max-w-6xl px-4 py-14"><title>Services and pricing — Geotech</title>
    <h1 className="text-4xl font-bold">Services and pricing</h1>
    <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3"><Async q={q} empty="No services are published yet.">{d => d.map(s => <ServiceCard key={s.id} s={s}/>)}</Async></div></div>)
}
