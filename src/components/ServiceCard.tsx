import { Link } from 'react-router-dom'
import { formatPrice, type Service } from '../lib/money'
export default function ServiceCard({ s }: { s: Service }) {
  return (<article className="flex flex-col rounded-lg border border-line bg-surface p-6">
    <h3 className="text-xl font-bold">{s.name}</h3>
    <p className="mt-2 text-muted">{s.short_description}</p>
    <ul className="mt-4 space-y-1 text-sm">{s.features.slice(0,3).map(f => <li key={f}>– {f}</li>)}</ul>
    <p className="mt-auto pt-6 font-semibold text-accent">{formatPrice(s)}</p>
    <Link to={`/services/${s.slug}`} className="mt-3 font-semibold underline underline-offset-4">View {s.name}</Link>
  </article>)
}
