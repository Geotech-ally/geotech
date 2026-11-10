import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

declare const process: { cwd: () => string }
import {
  DEFAULT_DESCRIPTION,
  DEFAULT_OG_IMAGE,
  DEFAULT_TITLE,
  OG_IMAGE_HEIGHT,
  OG_IMAGE_WIDTH,
  ROUTE_METADATA,
  SITE_NAME,
  TWITTER_CARD,
  getAbsoluteImageUrl,
  getAbsoluteUrl,
  getArticleSchema,
  getBreadcrumbSchema,
  getOrganizationSchema,
  getProfessionalServiceSchema,
  getServiceSchema,
  getWebSiteSchema,
} from '../lib/seoConfig'
import { CORE_PUBLIC_ROUTES, generateSitemapXml, isPathIndexable } from '../lib/sitemap'

describe('SEO: robots.txt accessibility and directives', () => {
  const robotsPath = path.resolve(process.cwd(), 'public/robots.txt')

  it('robots.txt exists in public directory', () => {
    expect(fs.existsSync(robotsPath)).toBe(true)
  })

  it('allows crawling of public pages while blocking private application routes', () => {
    const content = fs.readFileSync(robotsPath, 'utf-8')

    expect(content).toContain('User-agent: *')
    expect(content).toContain('Allow: /')
    expect(content).toContain('Allow: /services')
    expect(content).toContain('Allow: /projects')
    expect(content).toContain('Allow: /insights')
    expect(content).toContain('Allow: /about')
    expect(content).toContain('Allow: /contact')
    expect(content).toContain('Allow: /start')

    // Admin dashboard exclusion
    expect(content).toContain('Disallow: /admin')
    expect(content).toContain('Disallow: /admin/')

    // Client private conversation token portal exclusion
    expect(content).toContain('Disallow: /c/')

    // Sitemap declaration
    expect(content).toMatch(/Sitemap:\s+https?:\/\/.+\/sitemap\.xml/)
  })
})

describe('SEO: XML Sitemap validity and route coverage', () => {
  const sitemapPath = path.resolve(process.cwd(), 'public/sitemap.xml')

  it('sitemap.xml exists and is valid XML', () => {
    expect(fs.existsSync(sitemapPath)).toBe(true)
    const xml = fs.readFileSync(sitemapPath, 'utf-8')

    expect(xml.trim().startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
    expect(xml.trim().endsWith('</urlset>'))
  })

  it('contains all eligible public routes with appropriate priority', () => {
    const xml = fs.readFileSync(sitemapPath, 'utf-8')

    const expectedPaths = [
      'https://geotech.example.com/',
      'https://geotech.example.com/services',
      'https://geotech.example.com/services/website-development',
      'https://geotech.example.com/services/web-application-development',
      'https://geotech.example.com/services/security-audit',
      'https://geotech.example.com/projects',
      'https://geotech.example.com/insights',
      'https://geotech.example.com/about',
      'https://geotech.example.com/contact',
      'https://geotech.example.com/start',
    ]

    for (const p of expectedPaths) {
      expect(xml).toContain(`<loc>${p}</loc>`)
    }
  })

  it('strictly excludes private admin and client portal routes', () => {
    const xml = fs.readFileSync(sitemapPath, 'utf-8')

    // Neither admin routes nor client private token URLs should appear in <loc>
    expect(xml).not.toMatch(/<loc>https?:\/\/[^<]*\/admin[^<]*<\/loc>/i)
    expect(xml).not.toMatch(/<loc>https?:\/\/[^<]*\/c(?:\/.*)?<\/loc>/i)
  })

  it('sitemap generator dynamically supports custom domains and enforces exclusion', () => {
    const generated = generateSitemapXml('https://custom-domain.test', [
      { path: '/custom-public', priority: 0.5 },
      { path: '/admin/secret', priority: 0.1 },
      { path: '/c/private-token', priority: 0.1 },
    ])

    expect(generated).toContain('https://custom-domain.test/custom-public')
    expect(generated).not.toContain('/admin/secret')
    expect(generated).not.toContain('/c/private-token')
  })

  it('isPathIndexable returns false for any admin or client route', () => {
    expect(isPathIndexable('/')).toBe(true)
    expect(isPathIndexable('/services')).toBe(true)
    expect(isPathIndexable('/about')).toBe(true)
    expect(isPathIndexable('/admin')).toBe(false)
    expect(isPathIndexable('/admin/login')).toBe(false)
    expect(isPathIndexable('/admin/conversations')).toBe(false)
    expect(isPathIndexable('/c/token123')).toBe(false)
  })
})

describe('SEO: Public page metadata configurations', () => {
  it('Homepage metadata is tailored, non-generic, and compelling', () => {
    const home = ROUTE_METADATA.home
    expect(home.title).toContain('Geotech')
    expect(home.title).toContain('Secure web software')
    expect(home.description.length).toBeGreaterThan(50)
    expect(home.description.length).toBeLessThanOrEqual(160)
    expect(home.canonicalPath).toBe('/')
    expect(home.keywords?.length).toBeGreaterThan(3)
  })

  it('About page metadata reflects company identity and mission', () => {
    const about = ROUTE_METADATA.about
    expect(about.title).toContain('About Geotech')
    expect(about.description).toContain('Nexyvon Technologies')
    expect(about.description.length).toBeGreaterThan(50)
    expect(about.canonicalPath).toBe('/about')
  })

  it('Services page metadata highlights offerings and transparent pricing', () => {
    const services = ROUTE_METADATA.services
    expect(services.title).toContain('Services & Transparent Pricing')
    expect(services.description.toLowerCase()).toContain('pricing')
    expect(services.canonicalPath).toBe('/services')
  })

  it('Projects page metadata highlights case studies and security engineering', () => {
    const projects = ROUTE_METADATA.projects
    expect(projects.title).toContain('Projects & Case Studies')
    expect(projects.description).toContain('security')
    expect(projects.canonicalPath).toBe('/projects')
  })

  it('Contact page metadata directs inquiries effectively', () => {
    const contact = ROUTE_METADATA.contact
    expect(contact.title).toContain('Contact Us')
    expect(contact.canonicalPath).toBe('/contact')
  })

  it('Start page metadata facilitates project initiation', () => {
    const start = ROUTE_METADATA.start
    expect(start.title).toContain('Start a Project')
    expect(start.canonicalPath).toBe('/start')
  })
})

describe('SEO: Structured data (Schema.org) accuracy', () => {
  it('builds a compliant Organization schema', () => {
    const org = getOrganizationSchema()
    expect(org['@context']).toBe('https://schema.org')
    expect(org['@type']).toBe('Organization')
    expect(org.name).toBe('Geotech')
    expect(org.alternateName).toBe('Nexyvon Technologies')
    expect(org.url).toBe('https://geotech.example.com')
    expect(org.logo).toContain('favicon-512x512.png')
    expect(org.contactPoint.contactType).toBe('customer service')
  })

  it('builds a compliant ProfessionalService schema with real service offers', () => {
    const service = getProfessionalServiceSchema()
    expect(service['@context']).toBe('https://schema.org')
    expect(service['@type']).toBe('ProfessionalService')
    expect(service.name).toBe('Geotech')
    expect(service.priceRange).toContain('KSh')
    expect(service.hasOfferCatalog.itemListElement).toHaveLength(3)

    const offers = service.hasOfferCatalog.itemListElement
    expect(offers[0].itemOffered.name).toBe('Website Development')
    expect(offers[0].price).toBe('35000')
    expect(offers[1].itemOffered.name).toBe('Web Application Development')
    expect(offers[1].price).toBe('150000')
    expect(offers[2].itemOffered.name).toBe('Security Audit')
  })

  it('builds a compliant WebSite schema', () => {
    const website = getWebSiteSchema()
    expect(website['@context']).toBe('https://schema.org')
    expect(website['@type']).toBe('WebSite')
    expect(website.name).toBe('Geotech')
  })

  it('builds compliant BreadcrumbList schema with 1-based index', () => {
    const crumbs = getBreadcrumbSchema([
      { name: 'Home', path: '/' },
      { name: 'Services', path: '/services' },
      { name: 'Website Development', path: '/services/website-development' },
    ])
    expect(crumbs['@type']).toBe('BreadcrumbList')
    expect(crumbs.itemListElement).toHaveLength(3)
    expect(crumbs.itemListElement[0].position).toBe(1)
    expect(crumbs.itemListElement[1].position).toBe(2)
    expect(crumbs.itemListElement[2].position).toBe(3)
    expect(crumbs.itemListElement[2].item).toBe('https://geotech.example.com/services/website-development')
  })

  it('builds individual Service schema with optional pricing', () => {
    const s1 = getServiceSchema({
      name: 'Custom Portal',
      slug: 'custom-portal',
      short_description: 'Fast portal',
      starting_price: 50000,
    })
    expect(s1['@type']).toBe('Service')
    expect(s1.name).toBe('Custom Portal')
    expect(s1.offers).toBeDefined()

    const s2 = getServiceSchema({
      name: 'Audit',
      slug: 'audit',
      short_description: 'Audit service',
      starting_price: null,
    })
    expect(s2.offers).toBeUndefined()
  })

  it('builds compliant Article schema for blog posts', () => {
    const article = getArticleSchema({
      title: 'OWASP Top 10 for Modern Web Apps',
      slug: 'owasp-top-10',
      excerpt: 'How to protect modern applications.',
      published_at: '2026-05-01T12:00:00Z',
    })
    expect(article['@type']).toBe('Article')
    expect(article.headline).toBe('OWASP Top 10 for Modern Web Apps')
    expect(article.datePublished).toBe('2026-05-01T12:00:00Z')
  })
})

describe('SEO: Open Graph, Twitter/X, and social sharing asset specifications', () => {
  it('specifies the correct OG image dimensions (1200x630)', () => {
    expect(OG_IMAGE_WIDTH).toBe('1200')
    expect(OG_IMAGE_HEIGHT).toBe('630')
    expect(TWITTER_CARD).toBe('summary_large_image')
  })

  it('resolves absolute URLs for social sharing images', () => {
    expect(getAbsoluteImageUrl('/og-image.png')).toBe('https://geotech.example.com/og-image.png')
    expect(getAbsoluteImageUrl('https://external.cdn/image.jpg')).toBe('https://external.cdn/image.jpg')
  })

  it('public directory contains required social-sharing and identity image files', () => {
    const files = [
      'public/og-image.png',
      'public/og-image.jpg',
      'public/favicon.ico',
      'public/favicon.svg',
      'public/favicon-16x16.png',
      'public/favicon-32x32.png',
      'public/apple-touch-icon.png',
      'public/android-chrome-192x192.png',
      'public/android-chrome-512x512.png',
      'public/site.webmanifest',
    ]
    for (const f of files) {
      expect(fs.existsSync(path.resolve(process.cwd(), f)), `File ${f} must exist`).toBe(true)
    }
  })

  it('site.webmanifest contains valid application identity metadata', () => {
    const manifestPath = path.resolve(process.cwd(), 'public/site.webmanifest')
    const json = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
    expect(json.name).toBe('Geotech — Secure web software for businesses')
    expect(json.short_name).toBe('Geotech')
    expect(json.theme_color).toBe('#12131c')
    expect(json.icons.length).toBeGreaterThanOrEqual(4)
  })
})

describe('SEO: Production deployment configurations (Netlify & Vercel)', () => {
  it('netlify.toml injects X-Robots-Tag: noindex on admin and client portals', () => {
    const content = fs.readFileSync(path.resolve(process.cwd(), 'netlify.toml'), 'utf-8')
    expect(content).toContain('for = "/admin/*"')
    expect(content).toContain('for = "/c/*"')
    expect(content).toContain('X-Robots-Tag = "noindex, nofollow, noarchive"')
    expect(content).toContain('for = "/robots.txt"')
    expect(content).toContain('for = "/sitemap.xml"')
  })

  it('vercel.json injects X-Robots-Tag: noindex on admin and client portals', () => {
    const content = fs.readFileSync(path.resolve(process.cwd(), 'vercel.json'), 'utf-8')
    const json = JSON.parse(content)

    const adminHeader = json.headers.find((h: any) => h.source === '/admin/(.*)')
    expect(adminHeader).toBeDefined()
    expect(adminHeader.headers[0].key).toBe('X-Robots-Tag')
    expect(adminHeader.headers[0].value).toContain('noindex')

    const clientHeader = json.headers.find((h: any) => h.source === '/c/(.*)')
    expect(clientHeader).toBeDefined()
    expect(clientHeader.headers[0].key).toBe('X-Robots-Tag')
    expect(clientHeader.headers[0].value).toContain('noindex')
  })
})

describe('SEO: Prerendered HTML snapshots (Static Site Generation verification)', () => {
  const distDir = path.resolve(process.cwd(), 'dist')

  it('prerendered dist/services/index.html contains route-specific title, canonical, and OG tags', () => {
    const servicesHtml = fs.readFileSync(path.join(distDir, 'services/index.html'), 'utf-8')
    expect(servicesHtml).toContain('<title>Services & Transparent Pricing — Geotech</title>')
    expect(servicesHtml).toContain('<link rel="canonical" href="https://geotech.example.com/services" />')
    expect(servicesHtml).toContain('<meta property="og:title" content="Services & Transparent Pricing — Geotech" />')
    expect(servicesHtml).toContain('<meta property="og:url" content="https://geotech.example.com/services" />')
    expect(servicesHtml).toContain('BreadcrumbList')
  })

  it('prerendered dist/about/index.html contains route-specific about metadata and AboutPage schema', () => {
    const aboutHtml = fs.readFileSync(path.join(distDir, 'about/index.html'), 'utf-8')
    expect(aboutHtml).toContain('<title>About Geotech — Secure Software Development</title>')
    expect(aboutHtml).toContain('<link rel="canonical" href="https://geotech.example.com/about" />')
    expect(aboutHtml).toContain('AboutPage')
  })

  it('prerendered dist/contact/index.html contains ContactPage schema and route metadata', () => {
    const contactHtml = fs.readFileSync(path.join(distDir, 'contact/index.html'), 'utf-8')
    expect(contactHtml).toContain('<title>Contact Us — Geotech</title>')
    expect(contactHtml).toContain('<link rel="canonical" href="https://geotech.example.com/contact" />')
    expect(contactHtml).toContain('ContactPage')
  })

  it('prerendered dist/projects/index.html contains projects title and canonical', () => {
    const projectsHtml = fs.readFileSync(path.join(distDir, 'projects/index.html'), 'utf-8')
    expect(projectsHtml).toContain('<title>Projects & Case Studies — Geotech</title>')
    expect(projectsHtml).toContain('<link rel="canonical" href="https://geotech.example.com/projects" />')
  })

  it('prerendered service details pages contain Service schema and dedicated prices', () => {
    const webDevHtml = fs.readFileSync(path.join(distDir, 'services/website-development/index.html'), 'utf-8')
    expect(webDevHtml).toContain('<title>Website Development — Geotech</title>')
    expect(webDevHtml).toContain('35000')

    const secAuditHtml = fs.readFileSync(path.join(distDir, 'services/security-audit/index.html'), 'utf-8')
    expect(secAuditHtml).toContain('<title>Security Audit — Geotech</title>')
  })

  it('guarantees private admin and client portal folders are never prerendered to static HTML', () => {
    expect(fs.existsSync(path.join(distDir, 'admin'))).toBe(false)
    expect(fs.existsSync(path.join(distDir, 'c'))).toBe(false)
  })
})
