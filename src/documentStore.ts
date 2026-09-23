export type DocumentRecord = {
  id: string
  title: string
  updatedAt: number
}

const storageKey = 'merhav-documents'
const documentIdPattern = /^[a-zA-Z0-9_-]{1,100}$/

export function createDocumentId() {
  return crypto.randomUUID()
}

export function isDocumentId(value: string | null): value is string {
  return value !== null && documentIdPattern.test(value)
}

export function readDocuments(): DocumentRecord[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]')
    if (!Array.isArray(value)) return []
    return value.filter((entry): entry is DocumentRecord =>
      typeof entry?.id === 'string' && isDocumentId(entry.id) &&
      typeof entry.title === 'string' && typeof entry.updatedAt === 'number'
    )
  } catch {
    return []
  }
}

export function writeDocuments(documents: DocumentRecord[]) {
  localStorage.setItem(storageKey, JSON.stringify(documents))
}
