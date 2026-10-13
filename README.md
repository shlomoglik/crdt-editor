# Merhav — Real-time Collaborative Editor

A browser-based collaborative text editor and whiteboard. Multiple users can edit the same document, see who is online and share changes in real time.

## Technology

- **TypeScript** provides static types and catches errors during the production build.
- **React** renders the user interface and manages local UI state.
- **Tiptap and ProseMirror** provide the rich-text editor, formatting toolbar, and inline collaborator carets and selections.
- **Yjs** stores shared document data as a `Y.XmlFragment` (rich-text content), `Y.Map` (title), and `Y.Array` (whiteboard strokes). Its CRDT data model merges concurrent edits.
- **y-websocket** synchronizes Yjs updates between connected browsers and carries ephemeral user presence through Yjs Awareness.
- **LevelDB**, through the y-websocket server's persistence adapter, stores document updates on disk so the document can be restored after a server restart.
- **Node.js HTTP and WebSocket server** handles accounts, sessions, document ownership, sharing, permissions, and permanent deletion. Passwords are stored as `scrypt` hashes and session cookies are `HttpOnly`.
- **Vite** provides the development server and production bundler. In development, it proxies WebSocket requests from `/yjs` to the collaboration server.
- **Lucide React** provides interface icons.

## Localization

The app supports English (`en`), Hebrew (`he`), French (`fr`), and German (`de`), selectable on both the sign-in screen and in the workspace. Hebrew uses right-to-left layout; the other languages use left-to-right layout. `LanguageProvider` exposes the current language, translation config, direction, and language setter through React context. The language selection is stored in browser `localStorage`. The selected language controls the interface strings and document direction (`ltr` or `rtl`). Translations live in `src/i18n.tsx`; keep all translated interface text in that config rather than in components or other source files.

## How collaboration works

Users create an account or sign in before accessing documents. The server stores account and document metadata in `.data/merhav.json`; passwords are hashed with Node's `scrypt`, and authenticated sessions use an `HttpOnly`, `SameSite=Strict` cookie. Each document has a generated ID, which is used as its Yjs room name and stored in the `doc` query parameter. Owners share a document with another account by username. The recipient can open the shared link after signing in. HTTP operations and WebSocket upgrades check access against server-side ownership and recipient permissions.

The sidebar filters **All**, **My documents**, and **Shared with me** using server-owned metadata. Search and custom ordering are stored in `localStorage` per account and browser. New documents and newly shared documents appear at the top of the local order. Old browser-local documents appear in an **Older documents** section and are not assigned automatically; explicitly claim only documents you own. Recipients can remove a shared document from their own list; owners can permanently delete a document. Permanent deletion closes active room connections, removes the Yjs LevelDB data, and revokes access. Deleting a document shared with others requires confirmation. Awareness broadcasts transient presence data such as the account name, color, text caret, and selection. Presence is not persisted with document content.

## Version history

Use the history button in the top bar to browse versions, save a named version,
name an existing version, restore it, or create a new personal document from it.
Choose **Compare** on a version to see its changes against the current document,
including edits that have not yet become a saved version. The comparison selector
also shows changes from the previous saved version to the selected version.
The viewer uses jsdiff for text additions and removals, shows formatting changes,
and highlights added and removed whiteboard strokes. Refresh fetches the latest
live content without creating a snapshot.
Use **Previous version** and **Next version** inside the comparison dialog to
browse history without closing it. The comparison choice stays selected as you
navigate; the oldest version compares with the current document since it has no
preceding snapshot.
The server captures the title, rich text (including formatting), legacy text, and
whiteboard after 20 seconds without content changes, on disconnect, and when
switching between the document and whiteboard. Unchanged automatic snapshots are
deduplicated. Workspace areas, sharing, and list order are outside history.

Restoring replaces visible content in the live Yjs room and synchronizes it to
collaborators. The current content is saved first so the restore can be reversed
through history. Copies get a new ID and belong to the account that creates them;
they do not inherit sharing or area membership. Versions live alongside document
metadata in `.data/merhav.json` and survive server restarts. All history endpoints
require current document access. Deleting a document also deletes its history.

Run the history checks with `npm test`.

## Run locally

Install Node.js and npm, then run:

```bash
npm install
npm run dev:all
```

Open the Vite URL printed in the terminal. `dev:all` starts Vite and the application server on port `1234`. Create an account in each browser. To collaborate, the owner enters the recipient's username in the Share prompt and sends them the copied document URL.

You can also start each server separately:

```bash
npm run server
npm run dev
```

Account, access, and document metadata are stored in `.data/merhav.json`; Yjs updates are stored in the LevelDB files under `.data/`. The directory is ignored by Git. Back up this directory to retain accounts and documents. Removing it deletes the local application data.

## Useful commands

```bash
npm run build    # Type-check and create a production build in dist/
npm run preview  # Serve the production build locally
```

## Suggested next steps

1. **Harden account management.** Add rate limiting, password reset, account recovery, and a database with transactional metadata updates.
2. **Prepare production hosting and backups.** Deploy a reachable WebSocket server, configure a reverse proxy for WebSocket traffic under `/yjs`, provide persistent storage for `.data/`, and add HTTPS, backups, and monitoring.
3. **Add automated coverage.** Test access control, document sharing and deletion, concurrent Yjs edits, language and direction switching, UI behavior, and recovery after a server restart.
