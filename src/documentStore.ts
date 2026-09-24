export type DocumentRecord = {
  id: string
  title: string
  updatedAt: number
  order: number
  ownerId: string
  ownerUsername: string
  access: 'owner' | 'shared'
  sharedWithCount: number
}

export type LegacyDocumentRecord = Pick<DocumentRecord, 'id' | 'title' | 'updatedAt'>

const documentIdPattern = /^[a-zA-Z0-9_-]{1,100}$/
const legacyStorageKey = 'merhav-documents'

function storageKey(userId: string) {
  return `merhav-documents-${userId}`
}

export function createDocumentId() {
  return crypto.randomUUID()
}

export function isDocumentId(value: string | null): value is string {
  return value !== null && documentIdPattern.test(value)
}

export function readDocuments(userId: string): DocumentRecord[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey(userId)) ?? '[]')
    if (!Array.isArray(value)) return []
    const documents = value.filter((entry): entry is Omit<DocumentRecord, 'order'> & { order?: number } =>
      typeof entry?.id === 'string' && isDocumentId(entry.id) &&
      typeof entry.title === 'string' && typeof entry.updatedAt === 'number' &&
      typeof entry.ownerId === 'string' && typeof entry.ownerUsername === 'string' &&
      (entry.access === 'owner' || entry.access === 'shared') && typeof entry.sharedWithCount === 'number'
    )
    if (documents.every(document => typeof document.order === 'number' && Number.isFinite(document.order))) {
      return (documents as DocumentRecord[]).sort((a, b) => a.order - b.order)
    }
    const migrated = documents
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((document, order) => ({ ...document, order }))
    writeDocuments(userId, migrated)
    return migrated
  } catch {
    return []
  }
}

export function readLegacyDocuments(): LegacyDocumentRecord[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(legacyStorageKey) ?? '[]')
    if (!Array.isArray(value)) return []
    return value.filter((entry): entry is LegacyDocumentRecord =>
      typeof entry?.id === 'string' && isDocumentId(entry.id) &&
      typeof entry.title === 'string' && typeof entry.updatedAt === 'number'
    )
  } catch {
    return []
  }
}

export function removeLegacyDocument(id: string) {
  localStorage.setItem(legacyStorageKey, JSON.stringify(readLegacyDocuments().filter(document => document.id !== id)))
}

export function writeDocuments(userId: string, documents: DocumentRecord[]) {
  localStorage.setItem(storageKey(userId), JSON.stringify(documents))
}
