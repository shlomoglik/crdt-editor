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

The app supports English (`en`) and Hebrew (`he`). `LanguageProvider` exposes the current language, translation config, direction, and language setter through React context. The language selection is stored in browser `localStorage`. The selected language controls the interface strings and document direction (`ltr` or `rtl`). Translations live in `src/i18n.tsx`; keep user-facing Hebrew text in that config rather than in components or other source files.

## How collaboration works

Users create an account or sign in before accessing documents. The server stores account and document metadata in `.data/merhav.json`; passwords are hashed with Node's `scrypt`, and authenticated sessions use an `HttpOnly`, `SameSite=Strict` cookie. Each document has a generated ID, which is used as its Yjs room name and stored in the `doc` query parameter. Owners share a document with another account by username. The recipient can open the shared link after signing in. HTTP operations and WebSocket upgrades check access against server-side ownership and recipient permissions.

The sidebar filters **All**, **My documents**, and **Shared with me** using server-owned metadata. Search and custom ordering are stored in `localStorage` per account and browser. New documents and newly shared documents appear at the top of the local order. Old browser-local documents appear in an **Older documents** section and are not assigned automatically; explicitly claim only documents you own. Recipients can remove a shared document from their own list; owners can permanently delete a document. Permanent deletion closes active room connections, removes the Yjs LevelDB data, and revokes access. Deleting a document shared with others requires confirmation. Awareness broadcasts transient presence data such as the account name, color, text caret, and selection. Presence is not persisted with document content.

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
