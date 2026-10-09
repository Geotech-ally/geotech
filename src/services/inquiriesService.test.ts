import { beforeEach, describe, expect, it, vi } from 'vitest'

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }))
vi.mock('../lib/api', () => ({
  ApiError: class ApiError extends Error {},
  api: (...args: unknown[]) => apiMock(...args),
}))

import { inquiriesService } from './inquiriesService'

const valid = {
  name: 'Example User', email: 'person@example.test', project_description: 'We need a sample booking system for a fictional clinic.',
}

describe('inquiriesService.submit', () => {
  beforeEach(() => apiMock.mockReset())

  it('sends valid input and returns the private conversation token', async () => {
    const token = 'a7b4f7d9-4985-4eb4-b704-0f231b571a8c'
    apiMock.mockResolvedValue({ token })
    await expect(inquiriesService.submit(valid)).resolves.toBe(token)
    expect(apiMock).toHaveBeenCalledWith('submit_inquiry', valid)
  })

  it('rejects invalid input before making a request', async () => {
    await expect(inquiriesService.submit({ ...valid, email: 'bad' })).rejects.toThrow(/check the form/i)
    expect(apiMock).not.toHaveBeenCalled()
  })

  it('rejects a success response without a valid token', async () => {
    apiMock.mockResolvedValue({ token: 'not-a-uuid' })
    await expect(inquiriesService.submit(valid)).rejects.toThrow(/response was incomplete/i)
  })

  it('does not report success when the response omits the token', async () => {
    apiMock.mockResolvedValue({})
    await expect(inquiriesService.submit(valid)).rejects.toThrow(/response was incomplete/i)
  })

  it('rejects a filled honeypot instead of returning a false-success value', async () => {
    await expect(inquiriesService.submit({ ...valid, website: 'spam' })).rejects.toMatchObject({ message: 'Please check the form fields and try again.' })
    expect(apiMock).not.toHaveBeenCalled()
  })
})
