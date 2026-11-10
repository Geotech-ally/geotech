export interface PageMeta {
  title: string
  description: string
  canonicalPath: string
  ogType?: 'website' | 'article'
  ogImage?: string
  ogImageAlt?: string
  noindex?: boolean
  keywords?: string[]
}

export const SITE_NAME = 'Geotech'
export const DEFAULT_TITLE = 'Geotech — Secure web software for businesses'
export const DEFAULT_DESCRIPTION =
  'Full-stack development and cybersecurity services with clear pricing. We build web applications, APIs, and audit systems before attackers find vulnerabilities.'
export const DEFAULT_OG_IMAGE = '/og-image.png'
export const OG_IMAGE_WIDTH = '1200'
export const OG_IMAGE_HEIGHT = '630'
export const OG_IMAGE_ALT = 'Geotech — Secure Web Applications & Cybersecurity Services'
export const TWITTER_CARD = 'summary_large_image'
export const DEFAULT_LOCALE = 'en_US'
export const THEME_COLOR = '#12131c'

export function getBaseUrl(): string {
  const envUrl = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SITE_URL) as string | undefined
  if (envUrl && typeof envUrl === 'string' && envUrl.trim().length > 0) {
    return envUrl.trim().replace(/\/+$/, '')
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace(/\/+$/, '')
  }
  return 'https://geotech.example.com'
}

export function getAbsoluteUrl(path: string): string {
  const base = getBaseUrl()
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  return `${base}${cleanPath}`
}

export function getAbsoluteImageUrl(imagePath?: string): string {
  if (!imagePath) return getAbsoluteUrl(DEFAULT_OG_IMAGE)
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    return imagePath
  }
  return getAbsoluteUrl(imagePath)
}

export const ROUTE_METADATA: Record<string, PageMeta> = {
  home: {
    title: 'Geotech — Secure web software for businesses',
    description:
      'I build web applications, APIs, and databases for businesses, and audit them for security before attackers do. Transparent pricing up front.',
    canonicalPath: '/',
    ogType: 'website',
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: 'Geotech Secure Software Development & Cybersecurity',
    keywords: [
      'full-stack development',
      'cybersecurity audit',
      'web applications',
      'secure API development',
      'penetration testing',
      'Kenya software engineer',
    ],
  },
  services: {
    title: 'Services & Transparent Pricing — Geotech',
    description:
      'Clear, fixed and starting pricing for web development, full-stack applications, and cybersecurity auditing. Explore packages and deliverables.',
    canonicalPath: '/services',
    ogType: 'website',
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: 'Geotech Development and Security Services Catalogue',
    keywords: ['web development pricing', 'custom software quotes', 'security audit cost', 'API engineering'],
  },
  projects: {
    title: 'Projects & Case Studies — Geotech',
    description:
      'Case studies and software solutions engineered for performance, resilience, and strict data security. Review past work and results.',
    canonicalPath: '/projects',
    ogType: 'website',
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: 'Geotech Client Projects and Case Studies',
    keywords: ['software case studies', 'web engineering portfolio', 'application architecture', 'cybersecurity portfolio'],
  },
  insights: {
    title: 'Insights & Technical Security Articles — Geotech',
    description:
      'Articles, best practices, and analysis on secure web architecture, API defense, rate limiting, and software resilience.',
    canonicalPath: '/insights',
    ogType: 'website',
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: 'Geotech Technical Insights and Security Articles',
    keywords: ['web security insights', 'software engineering blog', 'appsec best practices', 'secure code design'],
  },
  about: {
    title: 'About Geotech — Secure Software Development',
    description:
      'Learn about Geotech (Nexyvon Technologies): background, core values, technical capabilities, and commitment to building resilient software.',
    canonicalPath: '/about',
    ogType: 'website',
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: 'About Geotech Leadership and Mission',
    keywords: ['about Geotech', 'Nexyvon Technologies', 'software engineer Kenya', 'cybersecurity consultant'],
  },
  contact: {
    title: 'Contact Us — Geotech',
    description:
      'Get in touch for project requests, technical security consultations, or general inquiries. Direct communication with no lost emails.',
    canonicalPath: '/contact',
    ogType: 'website',
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: 'Contact Geotech Engineering',
    keywords: ['contact developer', 'request software quote', 'cybersecurity consultation'],
  },
  start: {
    title: 'Start a Project — Geotech',
    description:
      'Submit your project details for full-stack development or a cybersecurity audit. Receive an initial review within two business days.',
    canonicalPath: '/start',
    ogType: 'website',
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: 'Start a Project with Geotech',
    keywords: ['hire web developer', 'start software project', 'request security audit'],
  },
}

// Structured Data (Schema.org) Builders
export function getOrganizationSchema() {
  const base = getBaseUrl()
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${base}/#organization`,
    name: 'Geotech',
    alternateName: 'Nexyvon Technologies',
    url: base,
    logo: `${base}/favicon-512x512.png`,
    description: DEFAULT_DESCRIPTION,
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer service',
      url: `${base}/contact`,
    },
  }
}

export function getProfessionalServiceSchema() {
  const base = getBaseUrl()
  return {
    '@context': 'https://schema.org',
    '@type': 'ProfessionalService',
    '@id': `${base}/#professional-service`,
    name: 'Geotech',
    alternateName: 'Nexyvon Technologies',
    url: base,
    image: `${base}/og-image.png`,
    priceRange: 'KSh 35,000 – KSh 500,000+',
    description:
      'Full-stack web application development and professional cybersecurity assessment services.',
    currenciesAccepted: 'KES, USD',
    paymentAccepted: 'Bank Transfer, Mobile Money',
    serviceArea: {
      '@type': 'Country',
      name: 'Kenya',
    },
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: 'Development and Security Services',
      itemListElement: [
        {
          '@type': 'Offer',
          itemOffered: {
            '@type': 'Service',
            name: 'Website Development',
            description: 'A responsive, SEO-ready website built to convert visitors into customers.',
            url: `${base}/services/website-development`,
          },
          price: '35000',
          priceCurrency: 'KES',
        },
        {
          '@type': 'Offer',
          itemOffered: {
            '@type': 'Service',
            name: 'Web Application Development',
            description: 'Custom web apps with accounts, dashboards and APIs.',
            url: `${base}/services/web-application-development`,
          },
          price: '150000',
          priceCurrency: 'KES',
        },
        {
          '@type': 'Offer',
          itemOffered: {
            '@type': 'Service',
            name: 'Security Audit',
            description: 'A scoped review of your application or infrastructure with a prioritised fix list.',
            url: `${base}/services/security-audit`,
          },
          priceSpecification: {
            '@type': 'PriceSpecification',
            priceCurrency: 'KES',
            description: 'Custom Quote',
          },
        },
      ],
    },
  }
}

export function getWebSiteSchema() {
  const base = getBaseUrl()
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${base}/#website`,
    url: base,
    name: 'Geotech',
    description: DEFAULT_DESCRIPTION,
    publisher: {
      '@id': `${base}/#organization`,
    },
  }
}

export function getBreadcrumbSchema(items: { name: string; path: string }[]) {
  const base = getBaseUrl()
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.path.startsWith('http') ? item.path : `${base}${item.path.startsWith('/') ? item.path : `/${item.path}`}`,
    })),
  }
}

export function getServiceSchema(service: {
  name: string
  slug: string
  short_description?: string
  description?: string
  starting_price?: number | null
  pricing_type?: string
  features?: string[]
}) {
  const base = getBaseUrl()
  const url = `${base}/services/${service.slug}`
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: service.name,
    description: service.description || service.short_description || `${service.name} by Geotech`,
    url,
    provider: {
      '@id': `${base}/#organization`,
    },
  }
  if (service.starting_price) {
    schema.offers = {
      '@type': 'Offer',
      price: service.starting_price.toString(),
      priceCurrency: 'KES',
      url,
    }
  }
  return schema
}

export function getArticleSchema(post: {
  title: string
  slug: string
  excerpt?: string | null
  published_at?: string | null
}) {
  const base = getBaseUrl()
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.excerpt || post.title,
    url: `${base}/insights/${post.slug}`,
    datePublished: post.published_at || new Date().toISOString(),
    publisher: {
      '@id': `${base}/#organization`,
    },
    author: {
      '@type': 'Organization',
      name: 'Geotech',
    },
  }
}
