export type DocumentRecord = {
  id: string
  title: string
  updatedAt: number
  order: number
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
    const documents = value.filter((entry): entry is Omit<DocumentRecord, 'order'> & { order?: number } =>
      typeof entry?.id === 'string' && isDocumentId(entry.id) &&
      typeof entry.title === 'string' && typeof entry.updatedAt === 'number'
    )
    if (documents.every(document => typeof document.order === 'number' && Number.isFinite(document.order))) {
      return (documents as DocumentRecord[]).sort((a, b) => a.order - b.order)
    }
    const migrated = documents
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((document, order) => ({ ...document, order }))
    writeDocuments(migrated)
    return migrated
  } catch {
    return []
  }
}

export function writeDocuments(documents: DocumentRecord[]) {
  localStorage.setItem(storageKey, JSON.stringify(documents))
}
