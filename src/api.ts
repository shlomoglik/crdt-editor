export type Account = { id: string; username: string }

export type SharedDocument = {
  id: string
  title: string
  updatedAt: number
  ownerId: string
  ownerUsername: string
  access: 'owner' | 'shared' | 'area'
  sharedWithCount: number
  order?: number
  areaId?: string | null
  areaName?: string | null
  areaOwnerId?: string | null
}

export type Area = { id: string; name: string; ownerId: string; ownerUsername: string; members: { id: string; username: string }[]; isOwner: boolean }
export type AreaInvitation = { id: string; name: string; ownerUsername: string }
export type DocumentVersion = { id: string; createdAt: number; name: string | null; title: string; reason: string; authorId: string | null }
export type VersionContent = { title: string; text: string; structure: string; board: { color: string; points: { x: number; y: number }[] }[] }

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
  versionContent: (id: string, versionId: string) => request<{ content: VersionContent }>(`/api/documents/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionId)}`),
  listVersions: (id: string) => request<{ versions: DocumentVersion[] }>(`/api/documents/${encodeURIComponent(id)}/versions`),
  saveVersion: (id: string, name?: string) => request<{ version: DocumentVersion }>(`/api/documents/${encodeURIComponent(id)}/versions`, { method: 'POST', body: JSON.stringify({ name }), keepalive: true }),
  nameVersion: (id: string, versionId: string, name: string) => request<{ version: DocumentVersion }>(`/api/documents/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionId)}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
  restoreVersion: (id: string, versionId: string) => request<{ ok: true }>(`/api/documents/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionId)}/restore`, { method: 'POST' }),
  branchVersion: (id: string, versionId: string, title: string) => request<{ document: SharedDocument }>(`/api/documents/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionId)}/branch`, { method: 'POST', body: JSON.stringify({ title }) }),
  session: () => request<{ user: Account | null }>('/api/session'),
  authenticate: (path: '/api/register' | '/api/login', username: string, password: string) =>
    request<{ user: Account }>(path, { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => request<{ ok: true }>('/api/logout', { method: 'POST' }),
  listDocuments: () => request<{ documents: SharedDocument[] }>('/api/documents'),
  createDocument: (title: string, areaId?: string | null) => request<{ document: SharedDocument }>('/api/documents', { method: 'POST', body: JSON.stringify({ title, areaId }) }),
  claimLegacyDocument: (id: string, title: string) => request<{ document: SharedDocument }>(`/api/documents/${encodeURIComponent(id)}/claim`, { method: 'POST', body: JSON.stringify({ title }) }),
  renameDocument: (id: string, title: string) => request<{ ok: true }>(`/api/documents/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ title }) }),
  shareDocument: (id: string, username: string) => request<{ document: { id: string; username: string } }>(`/api/documents/${encodeURIComponent(id)}/share`, { method: 'POST', body: JSON.stringify({ username }) }),
  leaveDocument: (id: string) => request<{ ok: true }>(`/api/documents/${encodeURIComponent(id)}/leave`, { method: 'DELETE' }),
  deleteDocument: (id: string) => request<{ ok: true }>(`/api/documents/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  moveDocumentToArea: (id: string, areaId: string | null) => request<{ ok: true }>(`/api/documents/${encodeURIComponent(id)}/area`, { method: 'PATCH', body: JSON.stringify({ areaId }) }),
  listAreas: () => request<{ areas: Area[]; invitations: AreaInvitation[] }>('/api/areas'),
  createArea: (name: string) => request<{ area: Area }>('/api/areas', { method: 'POST', body: JSON.stringify({ name }) }),
  inviteToArea: (id: string, username: string) => request<{ ok: true }>(`/api/areas/${encodeURIComponent(id)}/invite`, { method: 'POST', body: JSON.stringify({ username }) }),
  removeAreaMember: (id: string, userId: string) => request<{ ok: true }>(`/api/areas/${encodeURIComponent(id)}/members`, { method: 'DELETE', body: JSON.stringify({ userId }) }),
  leaveArea: (id: string) => request<{ ok: true }>(`/api/areas/${encodeURIComponent(id)}/leave`, { method: 'DELETE' }),
  acceptAreaInvitation: (id: string) => request<{ area: Area }>(`/api/areas/${encodeURIComponent(id)}/accept`, { method: 'POST' }),
}
