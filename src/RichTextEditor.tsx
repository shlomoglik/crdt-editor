import React from 'react'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Collaboration from '@tiptap/extension-collaboration'
import CollaborationCaret from '@tiptap/extension-collaboration-caret'
import Placeholder from '@tiptap/extension-placeholder'
import { Bold, Heading1, Heading2, Italic, List, ListOrdered, Quote, Redo2, Undo2 } from 'lucide-react'
import type { WebsocketProvider } from 'y-websocket'
import type * as Y from 'yjs'
import { useLanguage } from './i18n'

type Props = {
  document: Y.Doc
  provider: WebsocketProvider
  guestName: string
  color: string
  placeholder: string
  onTextChange: (text: string) => void
}

export function RichTextEditor({ document, provider, guestName, color, placeholder, onTextChange }: Props) {
  const { direction, t } = useLanguage()
  const labels = React.useRef({ placeholder, contentLabel: t.contentLabel, direction })
  labels.current = { placeholder, contentLabel: t.contentLabel, direction }

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ undoRedo: false }),
      Collaboration.configure({ document, field: 'richContent' }),
      CollaborationCaret.configure({ provider, user: { name: guestName, color } }),
      Placeholder.configure({ placeholder: () => labels.current.placeholder }),
    ],
    editorProps: {
      attributes: {
        class: 'rich-editor-content',
        dir: direction,
        'aria-label': t.contentLabel,
      },
    },
    onUpdate: ({ editor: currentEditor }) => onTextChange(currentEditor.getText()),
  }, [document, provider])

  const toolbarState = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => ({
      bold: currentEditor?.isActive('bold') ?? false,
      italic: currentEditor?.isActive('italic') ?? false,
      headingOne: currentEditor?.isActive('heading', { level: 1 }) ?? false,
      headingTwo: currentEditor?.isActive('heading', { level: 2 }) ?? false,
      bulletList: currentEditor?.isActive('bulletList') ?? false,
      orderedList: currentEditor?.isActive('orderedList') ?? false,
      blockquote: currentEditor?.isActive('blockquote') ?? false,
      canUndo: currentEditor?.can().undo() ?? false,
      canRedo: currentEditor?.can().redo() ?? false,
    }),
  })

  React.useEffect(() => {
    if (!editor) return
    editor.commands.updateUser({ name: guestName, color })
  }, [editor, guestName, color])

  React.useEffect(() => {
    if (!editor) return
    editor.setOptions({
      editorProps: {
        attributes: {
          class: 'rich-editor-content',
          dir: direction,
          'aria-label': t.contentLabel,
        },
      },
    })
    editor.view.dispatch(editor.state.tr)
  }, [editor, direction, t.contentLabel, placeholder])

  React.useEffect(() => {
    if (editor) onTextChange(editor.getText())
  }, [editor, onTextChange])

  if (!editor) return <div className="rich-editor-loading" aria-live="polite">{t.editorLoading}</div>

  return <div className="rich-editor">
    <div className="format-toolbar" role="toolbar" aria-label={t.formattingToolbar} dir={direction}>
      <ToolbarButton label={t.bold} active={toolbarState?.bold} onClick={() => editor.chain().focus().toggleBold().run()}><Bold size={16} /></ToolbarButton>
      <ToolbarButton label={t.italic} active={toolbarState?.italic} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic size={16} /></ToolbarButton>
      <span className="toolbar-divider" />
      <ToolbarButton label={t.headingOne} active={toolbarState?.headingOne} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}><Heading1 size={16} /></ToolbarButton>
      <ToolbarButton label={t.headingTwo} active={toolbarState?.headingTwo} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 size={16} /></ToolbarButton>
      <span className="toolbar-divider" />
      <ToolbarButton label={t.bulletList} active={toolbarState?.bulletList} onClick={() => editor.chain().focus().toggleBulletList().run()}><List size={16} /></ToolbarButton>
      <ToolbarButton label={t.orderedList} active={toolbarState?.orderedList} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered size={16} /></ToolbarButton>
      <ToolbarButton label={t.blockquote} active={toolbarState?.blockquote} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote size={16} /></ToolbarButton>
      <span className="toolbar-divider" />
      <ToolbarButton label={t.undo} disabled={!toolbarState?.canUndo} onClick={() => editor.chain().focus().undo().run()}><Undo2 size={16} /></ToolbarButton>
      <ToolbarButton label={t.redo} disabled={!toolbarState?.canRedo} onClick={() => editor.chain().focus().redo().run()}><Redo2 size={16} /></ToolbarButton>
    </div>
    <EditorContent editor={editor} className="rich-editor-view" />
  </div>
}

function ToolbarButton({ label, active = false, disabled = false, onClick, children }: {
  label: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return <button type="button" className={`format-button ${active ? 'active' : ''}`} aria-label={label} aria-pressed={active} title={label} disabled={disabled} onMouseDown={event => event.preventDefault()} onClick={onClick}>{children}</button>
}
