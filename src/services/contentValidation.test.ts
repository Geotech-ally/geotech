import { describe, expect, it } from 'vitest'
import { validateContentRow } from './contentValidation'

describe('content row validation against the content tables', () => {
  it('applies the project schema defaults for technologies, visibility, and ordering', () => {
    expect(validateContentRow('projects', { title: 'Case study', slug: 'case-study', summary: 'A short summary' })).toMatchObject({
      title: 'Case study', slug: 'case-study', technologies: [], is_published: false, display_order: 0,
    })
  })

  it('requires a unique-key slug value and the non-null fields for each content kind', () => {
    expect(() => validateContentRow('projects', { title: 'Case study', summary: 'Missing slug' })).toThrow(/required fields/i)
    expect(() => validateContentRow('testimonials', { author: 'Example', quote: '' })).toThrow(/required fields/i)
    expect(() => validateContentRow('blog_posts', { title: 'Draft', slug: 'draft', technologies: [] })).toThrow(/required fields/i)
  })

  it('keeps nullable database fields nullable and rejects columns from another table', () => {
    expect(validateContentRow('testimonials', { author: 'Example', quote: 'Fictional quote', role: null }).role).toBeNull()
    expect(() => validateContentRow('testimonials', { author: 'Example', quote: 'Fictional quote', technologies: [] })).toThrow(/required fields/i)
  })

  it('does not allow a published article with an empty body', () => {
    expect(() => validateContentRow('blog_posts', { title: 'Published', slug: 'published', is_published: true })).toThrow(/required fields/i)
    expect(validateContentRow('blog_posts', { title: 'Draft', slug: 'draft' }).body).toBe('')
  })
})
