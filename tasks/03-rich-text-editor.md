# Rich text editing with inline collaborator cursors

Replace the plain text area with a Tiptap editor backed by the existing Yjs document and y-websocket room for each document.

## Requirements

- Support collaborative rich-text editing without replacing the current room or persistence model.
- Add a compact formatting toolbar for bold, italic, headings, and lists.
- Render each connected collaborator's caret, name, color, and text selection inside the editor, using the existing Awareness provider and profile.
- Preserve and migrate text stored by the existing `Y.Text` model so existing documents remain readable after the editor change.
- Keep the editor usable in English and Hebrew, including the selected language's text direction.
- Keep all Hebrew interface strings in the language config.
