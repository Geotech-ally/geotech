import { Link } from 'react-router-dom'
export default function Contact() {
  return (<div className="mx-auto max-w-2xl px-4 py-14"><title>Contact — Geotech</title><h1 className="text-4xl font-bold">Contact</h1>
    <p className="mt-4 text-lg text-muted">Questions and project requests both go through one form, so nothing gets lost in an inbox.</p>
    <Link to="/start" className="mt-6 inline-block rounded bg-accent px-6 py-3 font-semibold text-white dark:text-[#12131c]">Send a message or start a project</Link></div>)
}
