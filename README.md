# Merhav — Real-time Collaborative Editor

A browser-based collaborative text editor and whiteboard. Multiple users can edit the same document, see who is online and share changes in real time.

## Technology

- **TypeScript** provides static types and catches errors during the production build.
- **React** renders the user interface and manages local UI state.
- **Yjs** stores shared document data as a `Y.Text` (text content), `Y.Map` (title), and `Y.Array` (whiteboard strokes). Its CRDT data model merges concurrent edits.
- **y-websocket** synchronizes Yjs updates between connected browsers and carries ephemeral user presence through Yjs Awareness.
- **LevelDB**, through the y-websocket server's persistence adapter, stores document updates on disk so the document can be restored after a server restart.
- **Vite** provides the development server and production bundler. In development, it proxies WebSocket requests from `/yjs` to the collaboration server.
- **Lucide React** provides interface icons.

## Localization

The app supports English (`en`) and Hebrew (`he`). `LanguageProvider` exposes the current language, translation config, direction, and language setter through React context. The language selection is stored in browser `localStorage`. The selected language controls the interface strings and document direction (`ltr` or `rtl`). Translations live in `src/i18n.tsx`; keep user-facing Hebrew text in that config rather than in components or other source files.

## How collaboration works

The browser creates a Yjs document and connects it to the collaboration server with `WebsocketProvider`. Each document has a generated ID, which is used as its Yjs room name and stored in the `doc` query parameter. Sharing the URL opens that same document for other users. The sidebar lets users create documents and switch between documents they have opened in that browser. Browser back and forward navigation also switches documents.

The document list and guest profile are stored in the browser's `localStorage`. Removing a document from the sidebar only removes its entry from that browser's list; it does not delete the room or its persisted data from the server. A shared link gives another browser access to the document, but does not sync the document list between users. Awareness broadcasts transient presence data such as the guest name, color, and text cursor position. Presence is not persisted with document content.

## Run locally

Install Node.js and npm, then run:

```bash
npm install
npm run dev:all
```

Open the Vite URL printed in the terminal. `dev:all` starts Vite and the y-websocket server on port `1234`. To collaborate, open the same URL in another browser or share it with users who can reach the host machine.

You can also start each server separately:

```bash
npm run server
npm run dev
```

Persistence data is stored under `.data/`, which is ignored by Git. Back up this directory to retain documents. Removing it deletes the locally persisted data.

## Useful commands

```bash
npm run build    # Type-check and create a production build in dist/
npm run preview  # Serve the production build locally
```

## Suggested next steps

1. **Add accounts and permissions.** Authenticate WebSocket connections and enforce per-document read and write access. The current server accepts unauthenticated connections.
2. **Adopt a rich text editor and inline cursors.** Integrate an editor with Yjs support, such as Tiptap or ProseMirror, to support formatting and render collaborators' selections and cursors in the text.
3. **Sync document discovery and metadata.** Store the document list, ownership, and update times in a database so users can find documents across browsers without relying on shared URLs.
4. **Prepare production hosting and backups.** Deploy a reachable WebSocket server, configure a reverse proxy for WebSocket traffic under `/yjs`, provide persistent storage for `.data/`, and add HTTPS, backups, and monitoring.
5. **Add automated coverage.** Test concurrent Yjs edits, language and direction switching, UI behavior, and recovery after a server restart.
