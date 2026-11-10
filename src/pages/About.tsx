import { useQuery } from '@tanstack/react-query'
import { contentService } from '../services/contentService'
import { toSafeParagraphs } from '../lib/safeText'

function Section({ title, items, paragraphs }: { title: string; items?: string[]; paragraphs?: string[] }) {
  const hasItems = (items ?? []).filter(Boolean).length > 0
  const hasParagraphs = (paragraphs ?? []).filter(Boolean).length > 0
  if (!hasItems && !hasParagraphs) return null
  return (
    <section className="mt-10">
      <h2 className="text-2xl font-bold">{title}</h2>
      {hasParagraphs && paragraphs!.map((p, i) => <p key={i} className="mt-3 text-lg leading-relaxed">{p}</p>)}
      {hasItems && (
        <ul className="mt-3 list-disc space-y-1 pl-5">
          {items!.filter(Boolean).map((v, i) => <li key={`${v}-${i}`}>{v}</li>)}
        </ul>
      )}
    </section>
  )
}

export default function About() {
  const t = useQuery({ queryKey: ['testimonials'], queryFn: contentService.testimonials })
  const p = useQuery({ queryKey: ['company-profile'], queryFn: contentService.companyProfile })

  const profile = p.data
  const companyName = profile?.company_name || 'Nexyvon Technologies'
  const intro = toSafeParagraphs(profile?.introduction)
  const background = toSafeParagraphs(profile?.background)
  const mission = toSafeParagraphs(profile?.mission)
  const vision = toSafeParagraphs(profile?.vision)
  const contactEntries = Object.entries(profile?.contact ?? {}).filter(([, v]) => typeof v === 'string' && v.trim().length > 0)

  return (
    <div className="mx-auto max-w-3xl px-4 py-14">
      <title>About — {companyName}</title>
      <h1 className="text-4xl font-bold">About {companyName}</h1>

      {p.isPending && <p role="status" className="mt-4 text-muted">Loading company profile…</p>}
      {p.isError && <p role="alert" className="mt-4 text-red-600 dark:text-red-400">Company profile could not be loaded right now. Please try again later.</p>}

      {!p.isPending && !profile && !p.isError && (
        <p className="mt-4 text-lg">Company information is being prepared. Please check back soon.</p>
      )}

      {profile?.hero_image_url && (
        <img src={profile.hero_image_url} alt={`${companyName}`} className="mt-6 w-full rounded-lg border border-line object-cover" loading="lazy" />
      )}

      {intro.length > 0 ? intro.map((para, i) => <p key={i} className="mt-4 text-lg leading-relaxed">{para}</p>) : (!p.isPending && profile && <p className="mt-4 text-lg">Company introduction will be available soon.</p>)}

      <Section title="Background" paragraphs={background} />
      <Section title="Mission" paragraphs={mission} />
      <Section title="Vision" paragraphs={vision} />
      <Section title="Core values" items={profile?.core_values} />
      <Section title="Objectives" items={profile?.objectives} />
      <Section title="Capabilities" items={profile?.capabilities} />

      {(profile?.team?.length ?? 0) > 0 && (
        <section className="mt-10">
          <h2 className="text-2xl font-bold">Team & leadership</h2>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2">
            {profile!.team.map((member, i) => (
              <li key={`${member.name}-${i}`} className="rounded-lg border border-line bg-surface p-4">
                {member.image_url && <img src={member.image_url} alt={member.name} className="mb-3 h-20 w-20 rounded-full object-cover" loading="lazy" />}
                <p className="font-semibold">{member.name}</p>
                {member.role && <p className="text-sm text-muted">{member.role}</p>}
                {member.bio && toSafeParagraphs(member.bio).map((bp, j) => <p key={j} className="mt-2 text-sm">{bp}</p>)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {contactEntries.length > 0 && (
        <section className="mt-10">
          <h2 className="text-2xl font-bold">Contact information</h2>
          <dl className="mt-3 grid gap-2 sm:grid-cols-2">
            {contactEntries.map(([k, v]) => (
              <div key={k}><dt className="text-sm font-semibold capitalize text-muted">{k.replace(/_/g, ' ')}</dt><dd>{String(v)}</dd></div>
            ))}
          </dl>
        </section>
      )}

      {(profile?.supporting_images?.length ?? 0) > 0 && (
        <section className="mt-10">
          <h2 className="text-2xl font-bold">Gallery</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {profile!.supporting_images.map((url, i) => <img key={`${url}-${i}`} src={url} alt={`${companyName} supporting image ${i + 1}`} className="w-full rounded border border-line object-cover" loading="lazy" />)}
          </div>
        </section>
      )}

      <section className="mt-10">
        <h2 className="text-2xl font-bold">What clients say</h2>
        {t.isPending && <p role="status" className="mt-4 text-muted">Loading testimonials…</p>}
        {t.isError && <p role="alert" className="mt-4 text-red-600 dark:text-red-400">Testimonials couldn’t be loaded. Please refresh to try again.</p>}
        {t.data?.length === 0 && !t.isError && <p className="mt-4 text-muted">Client testimonials will appear here.</p>}
        {t.data?.map((x) => (
          <blockquote key={x.id} className="mt-4 border-l-4 border-accent pl-4">
            <p>{x.quote}</p>
            <footer className="mt-1 text-sm text-muted">{x.author}{x.role && `, ${x.role}`}</footer>
          </blockquote>
        ))}
      </section>
    </div>
  )
}
TS
