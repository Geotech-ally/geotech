import { useEffect } from 'react'
import {
  DEFAULT_DESCRIPTION,
  DEFAULT_LOCALE,
  DEFAULT_OG_IMAGE,
  DEFAULT_TITLE,
  OG_IMAGE_ALT,
  OG_IMAGE_HEIGHT,
  OG_IMAGE_WIDTH,
  SITE_NAME,
  TWITTER_CARD,
  getAbsoluteImageUrl,
  getAbsoluteUrl,
  getBreadcrumbSchema,
} from '../lib/seoConfig'

export interface SEOProps {
  title?: string
  description?: string
  canonical?: string
  ogType?: 'website' | 'article'
  ogImage?: string
  ogImageAlt?: string
  noindex?: boolean
  keywords?: string[]
  schema?: object | object[]
  breadcrumbs?: { name: string; path: string }[]
}

function setMetaTag(selector: string, attr: 'name' | 'property', key: string, content: string | null | undefined) {
  if (typeof document === 'undefined') return
  let el = document.head.querySelector<HTMLMetaElement>(selector)
  if (!content) {
    if (el) el.remove()
    return
  }
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function setCanonical(href: string | null | undefined) {
  if (typeof document === 'undefined') return
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (!href) {
    if (el) el.remove()
    return
  }
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', 'canonical')
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
}

function setJsonLd(id: string, data: object | object[] | null | undefined) {
  if (typeof document === 'undefined') return
  let script = document.head.querySelector<HTMLScriptElement>(`script#${id}`)
  if (!data) {
    if (script) script.remove()
    return
  }
  if (!script) {
    script = document.createElement('script')
    script.setAttribute('type', 'application/ld+json')
    script.setAttribute('id', id)
    document.head.appendChild(script)
  }
  script.textContent = JSON.stringify(data)
}

export default function SEO({
  title,
  description = DEFAULT_DESCRIPTION,
  canonical,
  ogType = 'website',
  ogImage = DEFAULT_OG_IMAGE,
  ogImageAlt = OG_IMAGE_ALT,
  noindex = false,
  keywords,
  schema,
  breadcrumbs,
}: SEOProps) {
  useEffect(() => {
    if (typeof document === 'undefined') return

    // 1. Page Title
    const finalTitle = title ? (title.includes(SITE_NAME) ? title : `${title} — ${SITE_NAME}`) : DEFAULT_TITLE
    document.title = finalTitle

    // 2. Meta Description
    setMetaTag('meta[name="description"]', 'name', 'description', description)

    // 3. Keywords
    if (keywords && keywords.length > 0) {
      setMetaTag('meta[name="keywords"]', 'name', 'keywords', keywords.join(', '))
    } else {
      setMetaTag('meta[name="keywords"]', 'name', 'keywords', null)
    }

    // 4. Robots Directives
    if (noindex) {
      setMetaTag('meta[name="robots"]', 'name', 'robots', 'noindex, nofollow, noarchive')
      setMetaTag('meta[name="googlebot"]', 'name', 'googlebot', 'noindex, nofollow, noarchive')
      setCanonical(null)
    } else {
      setMetaTag(
        'meta[name="robots"]',
        'name',
        'robots',
        'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'
      )
      setMetaTag('meta[name="googlebot"]', 'name', 'googlebot', 'index, follow')
      
      // 5. Canonical URL
      const finalCanonical = canonical ? getAbsoluteUrl(canonical) : (typeof window !== 'undefined' ? window.location.href.split('?')[0].split('#')[0] : getAbsoluteUrl('/'))
      setCanonical(finalCanonical)
    }

    // 6. Open Graph Tags
    const absImageUrl = getAbsoluteImageUrl(ogImage)
    const pageUrl = canonical ? getAbsoluteUrl(canonical) : (typeof window !== 'undefined' ? window.location.href : getAbsoluteUrl('/'))

    setMetaTag('meta[property="og:site_name"]', 'property', 'og:site_name', SITE_NAME)
    setMetaTag('meta[property="og:type"]', 'property', 'og:type', ogType)
    setMetaTag('meta[property="og:title"]', 'property', 'og:title', finalTitle)
    setMetaTag('meta[property="og:description"]', 'property', 'og:description', description)
    setMetaTag('meta[property="og:url"]', 'property', 'og:url', noindex ? null : pageUrl)
    setMetaTag('meta[property="og:image"]', 'property', 'og:image', absImageUrl)
    setMetaTag('meta[property="og:image:secure_url"]', 'property', 'og:image:secure_url', absImageUrl)
    setMetaTag('meta[property="og:image:width"]', 'property', 'og:image:width', OG_IMAGE_WIDTH)
    setMetaTag('meta[property="og:image:height"]', 'property', 'og:image:height', OG_IMAGE_HEIGHT)
    setMetaTag('meta[property="og:image:alt"]', 'property', 'og:image:alt', ogImageAlt)
    setMetaTag('meta[property="og:locale"]', 'property', 'og:locale', DEFAULT_LOCALE)

    // 7. Twitter / X Card Tags
    setMetaTag('meta[name="twitter:card"]', 'name', 'twitter:card', TWITTER_CARD)
    setMetaTag('meta[name="twitter:title"]', 'name', 'twitter:title', finalTitle)
    setMetaTag('meta[name="twitter:description"]', 'name', 'twitter:description', description)
    setMetaTag('meta[name="twitter:image"]', 'name', 'twitter:image', absImageUrl)
    setMetaTag('meta[name="twitter:image:alt"]', 'name', 'twitter:image:alt', ogImageAlt)

    // 8. Structured Data JSON-LD
    if (!noindex && schema) {
      setJsonLd('seo-schema', schema)
    } else {
      setJsonLd('seo-schema', null)
    }

    // 9. Breadcrumbs JSON-LD
    if (!noindex && breadcrumbs && breadcrumbs.length > 0) {
      setJsonLd('seo-breadcrumbs', getBreadcrumbSchema(breadcrumbs))
    } else {
      setJsonLd('seo-breadcrumbs', null)
    }

    // Cleanup function when leaving the page
    return () => {
      // If we were on a noindex page, clean up noindex so the next page can set its policy
      if (noindex) {
        setMetaTag(
          'meta[name="robots"]',
          'name',
          'robots',
          'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'
        )
        setMetaTag('meta[name="googlebot"]', 'name', 'googlebot', 'index, follow')
      }
    }
  }, [
    title,
    description,
    canonical,
    ogType,
    ogImage,
    ogImageAlt,
    noindex,
    keywords,
    schema,
    breadcrumbs,
  ])

  return null
}
