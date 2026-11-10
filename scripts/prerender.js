import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.resolve(__dirname, '../dist')
const distIndexPath = path.join(distDir, 'index.html')

if (!fs.existsSync(distIndexPath)) {
  console.error('dist/index.html does not exist. Run vite build first.')
  process.exit(1)
}

const baseHtml = fs.readFileSync(distIndexPath, 'utf-8')

const BASE_URL = (process.env.VITE_SITE_URL || process.env.PUBLIC_SITE_URL || 'https://geotech.example.com').replace(/\/+$/, '')
const SITE_NAME = 'Geotech'
const DEFAULT_IMAGE = `${BASE_URL}/og-image.png`

const PRERENDER_ROUTES = [
  {
    path: '/',
    title: 'Geotech — Secure web software for businesses',
    description:
      'I build web applications, APIs, and databases for businesses, and audit them for security before attackers do. Transparent pricing up front.',
    schema: {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'Organization',
          '@id': `${BASE_URL}/#organization`,
          name: 'Geotech',
          alternateName: 'Nexyvon Technologies',
          url: BASE_URL,
          logo: `${BASE_URL}/favicon-512x512.png`,
          description: 'Full-stack development and cybersecurity services with clear pricing.',
          contactPoint: {
            '@type': 'ContactPoint',
            contactType: 'customer service',
            url: `${BASE_URL}/contact`,
          },
        },
        {
          '@type': 'ProfessionalService',
          '@id': `${BASE_URL}/#professional-service`,
          name: 'Geotech',
          alternateName: 'Nexyvon Technologies',
          url: BASE_URL,
          image: DEFAULT_IMAGE,
          priceRange: 'KSh 35,000 – KSh 500,000+',
          description: 'Full-stack web application development and professional cybersecurity assessment services.',
        },
      ],
    },
  },
  {
    path: '/services',
    title: 'Services & Transparent Pricing — Geotech',
    description:
      'Clear, fixed and starting pricing for web development, full-stack applications, and cybersecurity auditing. Explore packages and deliverables.',
    schema: {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${BASE_URL}/` },
        { '@type': 'ListItem', position: 2, name: 'Services', item: `${BASE_URL}/services` },
      ],
    },
  },
  {
    path: '/services/website-development',
    title: 'Website Development — Geotech',
    description: 'Fast, secure business websites. A responsive, SEO-ready website built to convert visitors into customers.',
    schema: {
      '@context': 'https://schema.org',
      '@type': 'Service',
      name: 'Website Development',
      description: 'A responsive, SEO-ready website built to convert visitors into customers.',
      url: `${BASE_URL}/services/website-development`,
      provider: { '@id': `${BASE_URL}/#organization` },
      offers: { '@type': 'Offer', price: '35000', priceCurrency: 'KES', url: `${BASE_URL}/services/website-development` },
    },
  },
  {
    path: '/services/web-application-development',
    title: 'Web Application Development — Geotech',
    description: 'Custom web apps with accounts, dashboards and APIs. Full-stack applications designed around your workflow.',
    schema: {
      '@context': 'https://schema.org',
      '@type': 'Service',
      name: 'Web Application Development',
      description: 'Custom web apps with accounts, dashboards and APIs. Full-stack applications designed around your workflow.',
      url: `${BASE_URL}/services/web-application-development`,
      provider: { '@id': `${BASE_URL}/#organization` },
      offers: { '@type': 'Offer', price: '150000', priceCurrency: 'KES', url: `${BASE_URL}/services/web-application-development` },
    },
  },
  {
    path: '/services/security-audit',
    title: 'Security Audit — Geotech',
    description: 'Find vulnerabilities before attackers do. A scoped review of your application or infrastructure with a prioritised fix list.',
    schema: {
      '@context': 'https://schema.org',
      '@type': 'Service',
      name: 'Security Audit',
      description: 'Find vulnerabilities before attackers do. A scoped review of your application or infrastructure with a prioritised fix list.',
      url: `${BASE_URL}/services/security-audit`,
      provider: { '@id': `${BASE_URL}/#organization` },
    },
  },
  {
    path: '/projects',
    title: 'Projects & Case Studies — Geotech',
    description: 'Case studies and software solutions engineered for performance, resilience, and strict data security. Review past work and results.',
  },
  {
    path: '/insights',
    title: 'Insights & Technical Security Articles — Geotech',
    description: 'Articles, best practices, and analysis on secure web architecture, API defense, rate limiting, and software resilience.',
  },
  {
    path: '/about',
    title: 'About Geotech — Secure Software Development',
    description: 'Learn about Geotech (Nexyvon Technologies): background, core values, technical capabilities, and commitment to building resilient software.',
    schema: {
      '@context': 'https://schema.org',
      '@type': 'AboutPage',
      name: 'About Geotech',
      url: `${BASE_URL}/about`,
      mainEntity: { '@id': `${BASE_URL}/#organization` },
    },
  },
  {
    path: '/contact',
    title: 'Contact Us — Geotech',
    description: 'Get in touch for project requests, technical security consultations, or general inquiries. Direct communication with no lost emails.',
    schema: {
      '@context': 'https://schema.org',
      '@type': 'ContactPage',
      name: 'Contact Geotech',
      url: `${BASE_URL}/contact`,
    },
  },
  {
    path: '/start',
    title: 'Start a Project — Geotech',
    description: 'Submit your project details for full-stack development or a cybersecurity audit. Receive an initial review within two business days.',
  },
]

function renderHead(html, route) {
  let res = html
  const canonicalUrl = `${BASE_URL}${route.path}`

  // Title
  res = res.replace(/<title>.*?<\/title>/i, `<title>${route.title}</title>`)

  // Description
  res = res.replace(
    /<meta\s+name=["']description["']\s+content=["'].*?["']\s*\/?>/i,
    `<meta name="description" content="${route.description}" />`
  )

  // Canonical
  res = res.replace(
    /<link\s+rel=["']canonical["']\s+href=["'].*?["']\s*\/?>/i,
    `<link rel="canonical" href="${canonicalUrl}" />`
  )

  // Open Graph
  res = res.replace(/<meta\s+property=["']og:title["']\s+content=["'].*?["']\s*\/?>/i, `<meta property="og:title" content="${route.title}" />`)
  res = res.replace(/<meta\s+property=["']og:description["']\s+content=["'].*?["']\s*\/?>/i, `<meta property="og:description" content="${route.description}" />`)
  res = res.replace(/<meta\s+property=["']og:url["']\s+content=["'].*?["']\s*\/?>/i, `<meta property="og:url" content="${canonicalUrl}" />`)

  // Twitter
  res = res.replace(/<meta\s+name=["']twitter:title["']\s+content=["'].*?["']\s*\/?>/i, `<meta name="twitter:title" content="${route.title}" />`)
  res = res.replace(/<meta\s+name=["']twitter:description["']\s+content=["'].*?["']\s*\/?>/i, `<meta name="twitter:description" content="${route.description}" />`)

  // Schema
  if (route.schema) {
    const schemaTag = `<script type="application/ld+json">${JSON.stringify(route.schema)}</script>`
    if (res.includes('<script type="application/ld+json">')) {
      res = res.replace(/<script\s+type=["']application\/ld\+json["']>[\s\S]*?<\/script>/i, schemaTag)
    } else {
      res = res.replace('</head>', `  ${schemaTag}\n  </head>`)
    }
  }

  return res
}

for (const route of PRERENDER_ROUTES) {
  const rendered = renderHead(baseHtml, route)
  if (route.path === '/') {
    fs.writeFileSync(distIndexPath, rendered, 'utf-8')
    console.log(`Prerendered root / -> dist/index.html`)
  } else {
    const outDir = path.join(distDir, route.path.replace(/^\//, ''))
    fs.mkdirSync(outDir, { recursive: true })
    const outPath = path.join(outDir, 'index.html')
    fs.writeFileSync(outPath, rendered, 'utf-8')
    console.log(`Prerendered ${route.path} -> ${path.relative(process.cwd(), outPath)}`)
  }
}

console.log('Prerendering completed successfully.')
