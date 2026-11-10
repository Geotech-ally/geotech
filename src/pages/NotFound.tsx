import { Link } from 'react-router-dom'
import SEO from '../components/SEO'

export default function NotFound() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-20 text-center">
      <SEO title="Page Not Found — Geotech" noindex />
      <p className="font-display text-6xl font-bold text-accent">404</p>
      <h1 className="mt-4 text-3xl font-bold sm:text-4xl">Page not found</h1>
      <p className="mt-3 text-lg text-muted">
        The page you are looking for doesn’t exist, has been moved, or is temporarily unavailable.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-4">
        <Link to="/" className="rounded bg-accent px-6 py-3 font-semibold text-white dark:text-[#12131c]">
          Back to Homepage
        </Link>
        <Link to="/services" className="rounded border border-line px-6 py-3 font-semibold">
          Browse Services
        </Link>
      </div>
    </div>
  )
}
