import React from 'react'

export type Language = 'en' | 'he'

export const languageConfig = {
  en: {
    direction: 'ltr',
    brand: 'Merhav',
    appTitle: 'Merhav — collaborative workspace',
    untitled: 'Untitled document',
    guestName: 'Guest',
    documents: 'My documents',
    breadcrumb: 'My documents',
    saved: 'Saved to cloud',
    connecting: 'Connecting…',
    disconnected: 'Offline',
    download: 'Download document',
    copied: 'Link copied',
    share: 'Share',
    workspace: 'Workspace',
    sharedWithMe: 'Shared with me',
    recentDocuments: 'Recent documents',
    updatedNow: 'Updated just now',
    newDocument: 'New document',
    removeDocument: 'Remove from my list',
    help: 'Need help?',
    guide: 'Quick guide to Merhav',
    freePlan: 'Free plan',
    documentTab: 'Document',
    boardTab: 'Whiteboard',
    here: 'here',
    textDocument: 'Text document',
    autosaved: 'All changes are saved automatically',
    waitingForConnection: 'Waiting for connection…',
    documentTitle: 'Document title',
    boardTitle: 'Board title',
    placeholder: 'Start writing… your changes appear for everyone in real time.',
    contentLabel: 'Document content',
    starterTitle: 'Every idea starts with one word.',
    starterSubtitle: 'Write, think, create — together.',
    startWriting: 'Start writing',
    drawHint: 'Draw freely on the board',
    clearBoard: 'Clear board',
    colorLabel: 'Color {color}',
    characterCount: 'characters',
    sharedInRealTime: 'Shared in real time',
    editingNow: 'Editing now',
    line: 'Line {line}',
    copyPrompt: 'Copy this document link:',
    selectLanguage: 'Display language',
    english: 'English',
    hebrew: 'Hebrew',
  },
  he: {
    direction: 'rtl',
    brand: 'מרחב',
    appTitle: 'מרחב — עריכה משותפת',
    untitled: 'מסמך ללא שם',
    guestName: 'אורח',
    documents: 'המסמכים שלי',
    breadcrumb: 'המסמכים שלי',
    saved: 'נשמר בענן',
    connecting: 'מתחבר…',
    disconnected: 'לא מחובר',
    download: 'הורדת המסמך',
    copied: 'הקישור הועתק',
    share: 'שיתוף',
    workspace: 'סביבת עבודה',
    sharedWithMe: 'שותפו איתי',
    recentDocuments: 'המסמכים האחרונים',
    updatedNow: 'עודכן עכשיו',
    newDocument: 'מסמך חדש',
    removeDocument: 'הסרה מהרשימה שלי',
    help: 'צריכים עזרה?',
    guide: 'מדריך קצר למרחב',
    freePlan: 'התוכנית החינמית',
    documentTab: 'מסמך',
    boardTab: 'לוח לבן',
    here: 'כאן',
    textDocument: 'מסמך טקסט',
    autosaved: 'כל השינויים נשמרים אוטומטית',
    waitingForConnection: 'ממתין לחיבור…',
    documentTitle: 'כותרת המסמך',
    boardTitle: 'כותרת הלוח',
    placeholder: 'התחילו לכתוב כאן… כל שינוי מופיע אצל כולם בזמן אמת.',
    contentLabel: 'תוכן המסמך',
    starterTitle: 'כל רעיון מתחיל במילה אחת.',
    starterSubtitle: 'כתבו, חשבו, צרו — ביחד.',
    startWriting: 'התחילו לכתוב',
    drawHint: 'ציירו בחופשיות על הלוח',
    clearBoard: 'ניקוי הלוח',
    colorLabel: 'צבע {color}',
    characterCount: 'תווים',
    sharedInRealTime: 'מסמך משותף בזמן אמת',
    editingNow: 'עורכים עכשיו',
    line: 'שורה {line}',
    copyPrompt: 'העתיקו את הקישור למסמך:',
    selectLanguage: 'שפת תצוגה',
    english: 'אנגלית',
    hebrew: 'עברית',
  },
} as const

type TranslationKey = Exclude<keyof typeof languageConfig.en, 'direction'>
type TranslationConfig = Record<TranslationKey, string> & { direction: 'ltr' | 'rtl' }

type LanguageContextValue = {
  language: Language
  direction: 'ltr' | 'rtl'
  t: TranslationConfig
  setLanguage: (language: Language) => void
}

const LanguageContext = React.createContext<LanguageContextValue | null>(null)
const storageKey = 'merhav-language'

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setSelectedLanguage] = React.useState<Language>(() => {
    const stored = localStorage.getItem(storageKey)
    return stored === 'he' || stored === 'en' ? stored : 'en'
  })
  const t = languageConfig[language] as TranslationConfig

  const setLanguage = (next: Language) => {
    localStorage.setItem(storageKey, next)
    setSelectedLanguage(next)
  }

  React.useEffect(() => {
    document.documentElement.lang = language
    document.documentElement.dir = t.direction
    document.title = t.appTitle
  }, [language, t.direction, t.appTitle])

  return <LanguageContext.Provider value={{ language, direction: t.direction, t, setLanguage }}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  const value = React.useContext(LanguageContext)
  if (!value) throw new Error('useLanguage must be used inside LanguageProvider')
  return value
}
