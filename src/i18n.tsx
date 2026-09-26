import React from 'react'

export type Language = 'en' | 'he'

export const languageConfig = {
  en: {
    direction: 'ltr',
    brand: 'Merhav',
    appTitle: 'Merhav — collaborative workspace',
    untitled: 'Untitled document',
    guestName: 'Guest',
    documents: 'Documents',
    breadcrumb: 'My documents',
    saved: 'Saved to cloud',
    connecting: 'Connecting…',
    disconnected: 'Offline',
    download: 'Download document',
    copied: 'Link copied',
    share: 'Share',
    workspace: 'Workspace',
    sharedWithMe: 'Shared with me',
    allDocuments: 'All',
    myDocuments: 'My documents',
    sharedDocumentOwner: 'Shared by {owner}',
    account: 'Account',
    username: 'Username',
    password: 'Password',
    accountRequirements: 'Use 3–24 letters, numbers, or underscores for your username and at least 10 characters for your password.',
    legacyDocuments: 'Older documents',
    claimLegacyDocument: 'Claim as mine',
    confirmClaimLegacyDocument: 'Claim “{title}” as your document? Only claim documents you created. Other people with its old link may still have access.',
    signIn: 'Sign in',
    signUp: 'Create account',
    createAccount: 'Create your account',
    switchToSignUp: 'Need an account? Create one',
    switchToSignIn: 'Already have an account? Sign in',
    authLoading: 'Checking your account…',
    signOut: 'Sign out',
    authError: 'We could not complete that request. Check your details and try again.',
    serverRestartRequired: 'The account service did not respond correctly. Restart the collaboration server with “npm run dev:all”, then try again.',
    close: 'Dismiss message',
    searchDocuments: 'Search documents',
    searchDocumentsPlaceholder: 'Search by title',
    noMatchingDocuments: 'No matching documents',
    noDocumentSelected: 'Choose a document or create a new one.',
    createFirstDocument: 'Create a document',
    reorderDocument: 'Reorder document',
    moveDocumentUp: 'Move document up',
    moveDocumentDown: 'Move document down',
    updatedNow: 'Updated just now',
    newDocument: 'New document',
    deleteDocument: 'Delete document permanently',
    leaveSharedDocument: 'Remove shared document from my list',
    confirmDeleteSharedDocument: 'This document is shared with {count} people. Permanently deleting it will remove it and its shared access for everyone. Continue?',
    confirmDeleteDocument: 'Permanently delete this document and its saved data?',
    shareWithUser: 'Share with username',
    sharePrompt: 'Enter the username of the person to share this document with:',
    documentShared: 'Document shared',
    ownerOnlyDelete: 'Only the owner can delete this document.',
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
    formattingToolbar: 'Text formatting',
    bold: 'Bold',
    italic: 'Italic',
    headingOne: 'Heading 1',
    headingTwo: 'Heading 2',
    bulletList: 'Bulleted list',
    orderedList: 'Numbered list',
    blockquote: 'Quote',
    undo: 'Undo',
    redo: 'Redo',
    editorLoading: 'Loading document…',
    drawHint: 'Draw freely on the board',
    clearBoard: 'Clear board',
    colorLabel: 'Color {color}',
    characterCount: 'characters',
    sharedInRealTime: 'Shared in real time',
    copyPrompt: 'Copy this document link:',
    selectLanguage: 'Display language',
    english: 'English',
    hebrew: 'Hebrew',
    areas: 'Areas', createArea: 'Create area', areaNamePrompt: 'Enter an area name:', areaMembers: 'Members', inviteToArea: 'Invite by username', inviteAreaPrompt: 'Enter the username to invite:', leaveArea: 'Leave area', removeAreaMember: 'Remove member', areaDocuments: 'Area documents', allAreas: 'All documents', noArea: 'Personal documents', areaAccess: 'Area: {name}', acceptInvitation: 'Accept', invitations: 'Invitations', invitedBy: 'Invited by {owner}', areaOwnerOnlyDelete: 'Only the area owner can permanently delete this document.',
    confirm: 'Confirm', cancel: 'Cancel', ok: 'OK',
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
    allDocuments: 'הכול',
    myDocuments: 'המסמכים שלי',
    sharedDocumentOwner: 'שותף על ידי {owner}',
    account: 'חשבון',
    username: 'שם משתמש',
    password: 'סיסמה',
    accountRequirements: 'שם המשתמש צריך להכיל 3–24 אותיות באנגלית, ספרות או קווים תחתונים. הסיסמה צריכה להכיל לפחות 10 תווים.',
    legacyDocuments: 'מסמכים ישנים',
    claimLegacyDocument: 'שיוך לחשבון שלי',
    confirmClaimLegacyDocument: 'לשייך את „{title}” למסמכים שלכם? שייכו רק מסמכים שיצרתם. לאנשים אחרים עם הקישור הישן עדיין עשויה להיות גישה.',
    signIn: 'כניסה',
    signUp: 'יצירת חשבון',
    createAccount: 'יצירת חשבון חדש',
    switchToSignUp: 'אין לכם חשבון? צרו חשבון',
    switchToSignIn: 'כבר יש לכם חשבון? התחברו',
    authLoading: 'בודק את החשבון…',
    signOut: 'יציאה',
    authError: 'לא ניתן להשלים את הפעולה. בדקו את הפרטים ונסו שוב.',
    serverRestartRequired: 'שירות החשבונות לא הגיב כראוי. הפעילו מחדש עם “npm run dev:all” ונסו שוב.',
    close: 'סגירת ההודעה',
    searchDocuments: 'חיפוש מסמכים',
    searchDocumentsPlaceholder: 'חיפוש לפי כותרת',
    noMatchingDocuments: 'לא נמצאו מסמכים מתאימים',
    noDocumentSelected: 'בחרו מסמך או צרו מסמך חדש.',
    createFirstDocument: 'יצירת מסמך',
    reorderDocument: 'שינוי סדר המסמך',
    moveDocumentUp: 'העברת המסמך למעלה',
    moveDocumentDown: 'העברת המסמך למטה',
    updatedNow: 'עודכן עכשיו',
    newDocument: 'מסמך חדש',
    deleteDocument: 'מחיקה לצמיתות',
    leaveSharedDocument: 'הסרת המסמך המשותף מהרשימה שלי',
    confirmDeleteSharedDocument: 'המסמך משותף עם {count} אנשים. מחיקה לצמיתות תסיר אותו ואת הגישה אליו עבור כולם. להמשיך?',
    confirmDeleteDocument: 'למחוק לצמיתות את המסמך ואת הנתונים השמורים שלו?',
    shareWithUser: 'שיתוף עם שם משתמש',
    sharePrompt: 'הזינו את שם המשתמש של האדם שאיתו תרצו לשתף את המסמך:',
    documentShared: 'המסמך שותף',
    ownerOnlyDelete: 'רק הבעלים יכולים למחוק את המסמך.',
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
    formattingToolbar: 'עיצוב הטקסט',
    bold: 'מודגש',
    italic: 'נטוי',
    headingOne: 'כותרת 1',
    headingTwo: 'כותרת 2',
    bulletList: 'רשימת תבליטים',
    orderedList: 'רשימה ממוספרת',
    blockquote: 'ציטוט',
    undo: 'ביטול הפעולה האחרונה',
    redo: 'ביצוע הפעולה מחדש',
    editorLoading: 'המסמך נטען…',
    drawHint: 'ציירו בחופשיות על הלוח',
    clearBoard: 'ניקוי הלוח',
    colorLabel: 'צבע {color}',
    characterCount: 'תווים',
    sharedInRealTime: 'מסמך משותף בזמן אמת',
    copyPrompt: 'העתיקו את הקישור למסמך:',
    selectLanguage: 'שפת תצוגה',
    english: 'אנגלית',
    hebrew: 'עברית',
    areas: 'אזורים', createArea: 'יצירת אזור', areaNamePrompt: 'הזינו שם לאזור:', areaMembers: 'חברים', inviteToArea: 'הזמנה לפי שם משתמש', inviteAreaPrompt: 'הזינו שם משתמש להזמנה:', leaveArea: 'יציאה מהאזור', removeAreaMember: 'הסרת חבר', areaDocuments: 'מסמכי האזור', allAreas: 'כל המסמכים', noArea: 'מסמכים אישיים', areaAccess: 'אזור: {name}', acceptInvitation: 'אישור', invitations: 'הזמנות', invitedBy: 'הוזמנתם על ידי {owner}', areaOwnerOnlyDelete: 'רק בעל האזור יכול למחוק את המסמך לצמיתות.',
    confirm: 'אישור', cancel: 'ביטול', ok: 'סגירה',
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
