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

## Run multiple collaboration servers locally

Start one storage coordinator, two collaboration replicas, and two Vite frontends:

```bash
CLUSTER_SECRET=local-development-secret npm run dev:scale
```

On Windows, set `CLUSTER_SECRET` in your shell before running `npm run dev:scale`.
The secret must match on the coordinator and every replica. The existing
`npm run dev:all` single-server setup continues to work without a secret.

| Process | Port | Responsibility |
| --- | --- | --- |
| Coordinator (`server.cjs`) | 1234 | Accounts, sessions, permissions, history, durable document storage, replication |
| Replica A (`replica.cjs`) | 1235 | Local Yjs rooms and WebSocket clients |
| Replica B (`replica.cjs`) | 1236 | Local Yjs rooms and WebSocket clients |
| Vite A | 5173 | Browser requests proxied to replica A |
| Vite B | 5174 | Browser requests proxied to replica B |

Each replica keeps its own live Yjs document and broadcasts edits to its local
clients. One authenticated upstream WebSocket per active room synchronizes CRDT
updates and awareness with the coordinator, which distributes them to other
replicas. Incoming updates retain the originating account ID for automatic
version attribution. Browser BroadcastChannel sharing is disabled on replication
connections; cross-instance synchronization happens over the network.

Only the coordinator opens `.data/` and its LevelDB database. Replicas forward
HTTP API requests and cookies to it, and check current document access before
accepting a browser WebSocket. Accounts, ownership, sharing, areas, snapshots,
restore, branching, and deletion continue to use the existing API. A separate
control connection carries logout, permission-change, and deletion notifications;
replicas also periodically recheck access. Internal coordinator endpoints require
`CLUSTER_SECRET` and are not forwarded by replicas.

Sessions are persisted as hashed tokens with a 30-day expiry in
`.data/sessions.json`, so existing cookies work across instances and coordinator
restarts. Presence and cursors remain ephemeral. When the last local client leaves,
its replica releases the upstream room and the coordinator captures pending history.

To check the setup manually:

1. Open `http://localhost:5173` in one browser profile and
   `http://localhost:5174` in another profile or private window. Cookies are shared
   across ports in the same profile, so use separate profiles for separate accounts.
2. Create an account in each, create a document in the first, and share it with
   the second account. Open the document on port 5174, retaining the document ID
   from the shared link while changing the link's port.
3. Edit simultaneously, apply formatting, change the title, draw on the board,
   and move cursors. Both views should converge and show each other's presence.
4. Disconnect and reconnect a browser, or restart a replica. Pending browser
   CRDT edits merge when it reconnects. Save a version and restore it from the
   other frontend to check that history changes also synchronize.
5. Leave a shared document or log out through one frontend; affected sockets on
   the other replica should close. Deleting a document closes all its connections.

For individual processes or restart testing, use separate terminals:

```bash
CLUSTER_SECRET=local-development-secret npm run server
CLUSTER_SECRET=local-development-secret npm run server:replica:a
CLUSTER_SECRET=local-development-secret npm run server:replica:b
npm run dev:replica:a
npm run dev:replica:b
```

For additional replicas, set `HOST`, `PORT`, `COORDINATOR_URL`, and
`CLUSTER_SECRET` and run `node replica.cjs`. Point Vite at that replica using
`VITE_BACKEND_URL=http://127.0.0.1:<port> npm run dev`. Routing API and WebSocket
traffic to different replicas also works; sticky sessions are not required.

If the coordinator connection drops, replicas close clients, discard cached
rooms, and reconnect. Browsers reconnect automatically, authenticate again, and
load persisted state before merging their local Yjs changes. API calls return
503 while the coordinator is unavailable. As in the original server, a live
synchronized update is not a disk-flush acknowledgment; unflushed updates after
an abrupt failure can be recovered from surviving browser documents on reconnect.

This topology scales client connections and room broadcasting. The coordinator
remains a single storage and authorization dependency and handles every document
update, so this implementation does not provide highly available storage or
unlimited write throughput. Keep the coordinator's internal endpoints on a
trusted network, use a private deployment secret, and use TLS when crossing hosts.

Run `npm test` for automated coverage. The scaling test launches a coordinator
and two replicas on temporary ports with an isolated persistence directory and
verifies concurrent edits, rich text, titles, whiteboard updates, cursor presence,
disconnection cleanup, offline edits, version restore and attribution, shared
sessions, worker and coordinator restarts, unauthorized connections, remote
revocation/logout, permanent deletion, and empty state when a deleted ID is reclaimed.
