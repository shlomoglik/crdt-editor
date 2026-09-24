export type Account = { id: string; username: string }

export type SharedDocument = {
  id: string
  title: string
  updatedAt: number
  ownerId: string
  ownerUsername: string
  access: 'owner' | 'shared'
  sharedWithCount: number
  order?: number
}

export class ApiServerUnavailableError extends Error {}
export class ApiOriginMismatchError extends Error {}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...init.headers },
  })
  if (!response.headers.get('content-type')?.includes('application/json')) throw new ApiServerUnavailableError()
  const value = await response.json() as T & { error?: string }
  if (response.status === 403 && value.error === 'Cross-origin requests are not allowed.') throw new ApiOriginMismatchError()
  if (!response.ok) throw new Error(value.error ?? 'The request could not be completed.')
  return value
}

export const api = {
  session: () => request<{ user: Account | null }>('/api/session'),
  authenticate: (path: '/api/register' | '/api/login', username: string, password: string) =>
    request<{ user: Account }>(path, { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => request<{ ok: true }>('/api/logout', { method: 'POST' }),
  listDocuments: () => request<{ documents: SharedDocument[] }>('/api/documents'),
  createDocument: (title: string) => request<{ document: SharedDocument }>('/api/documents', { method: 'POST', body: JSON.stringify({ title }) }),
  claimLegacyDocument: (id: string, title: string) => request<{ document: SharedDocument }>(`/api/documents/${encodeURIComponent(id)}/claim`, { method: 'POST', body: JSON.stringify({ title }) }),
  renameDocument: (id: string, title: string) => request<{ ok: true }>(`/api/documents/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ title }) }),
  shareDocument: (id: string, username: string) => request<{ document: { id: string; username: string } }>(`/api/documents/${encodeURIComponent(id)}/share`, { method: 'POST', body: JSON.stringify({ username }) }),
  leaveDocument: (id: string) => request<{ ok: true }>(`/api/documents/${encodeURIComponent(id)}/leave`, { method: 'DELETE' }),
  deleteDocument: (id: string) => request<{ ok: true }>(`/api/documents/${encodeURIComponent(id)}`, { method: 'DELETE' }),
}
