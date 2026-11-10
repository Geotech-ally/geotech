export interface SitemapRoute {
  path: string
  changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never'
  priority?: number
  lastmod?: string
}

export const CORE_PUBLIC_ROUTES: SitemapRoute[] = [
  { path: '/', changefreq: 'weekly', priority: 1.0 },
  { path: '/services', changefreq: 'weekly', priority: 0.9 },
  { path: '/services/website-development', changefreq: 'monthly', priority: 0.8 },
  { path: '/services/web-application-development', changefreq: 'monthly', priority: 0.8 },
  { path: '/services/security-audit', changefreq: 'monthly', priority: 0.8 },
  { path: '/projects', changefreq: 'weekly', priority: 0.8 },
  { path: '/insights', changefreq: 'weekly', priority: 0.8 },
  { path: '/about', changefreq: 'monthly', priority: 0.8 },
  { path: '/contact', changefreq: 'monthly', priority: 0.7 },
  { path: '/start', changefreq: 'monthly', priority: 0.7 },
]

export const DISALLOWED_ROUTEPATHS = ['/admin', '/admin/', '/c/', '/c']

export function isPathIndexable(path: string): boolean {
  const normalized = path.startsWith('/') ? path : `/${path}`
  if (normalized.startsWith('/admin') || normalized.startsWith('/c/')) {
    return false
  }
  return true
}

export function generateSitemapXml(
  baseUrl = 'https://geotech.example.com',
  extraRoutes: SitemapRoute[] = []
): string {
  const cleanBase = baseUrl.replace(/\/+$/, '')
  const combined = [...CORE_PUBLIC_ROUTES, ...extraRoutes].filter((r) => isPathIndexable(r.path))
  
  // Deduplicate by path
  const seen = new Set<string>()
  const uniqueRoutes: SitemapRoute[] = []
  for (const route of combined) {
    const norm = route.path.startsWith('/') ? route.path : `/${route.path}`
    if (!seen.has(norm)) {
      seen.add(norm)
      uniqueRoutes.push({ ...route, path: norm })
    }
  }

  const entries = uniqueRoutes
    .map((r) => {
      const loc = `${cleanBase}${r.path}`
      const lastmod = r.lastmod ? `\n    <lastmod>${r.lastmod}</lastmod>` : ''
      const changefreq = r.changefreq ? `\n    <changefreq>${r.changefreq}</changefreq>` : ''
      const priority = r.priority !== undefined ? `\n    <priority>${r.priority.toFixed(1)}</priority>` : ''
      return `  <url>\n    <loc>${loc}</loc>${lastmod}${changefreq}${priority}\n  </url>`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`
}
