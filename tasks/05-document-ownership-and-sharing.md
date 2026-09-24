# Document ownership, sharing, and deletion

Add authenticated accounts and server-backed document ownership so users can distinguish their own documents from documents shared with them. Do not treat a browser-local guest profile as an identity or use it to authorize access.

## Requirements

- Let users create an account, sign in, and sign out with a stable identity.
- Record a document owner and explicit recipient access on the server.
- Let an owner share a document with another account. Shared documents must appear in the recipient's list.
- Replace the recent-documents grouping with an **All** filter and ownership filters for **My documents** and **Shared with me**. The displayed list must match the current selection; existing search and custom order continue to work within it.
- Let a recipient remove a shared document from their own list without deleting it for anyone else.
- Let an owner permanently delete a document. If it is shared, require confirmation and explain that deletion removes it for all recipients.
- Permanently delete the Yjs room and its persisted updates, revoke all access, and prevent stale clients from recreating access.
- Do not assign legacy browser-local documents to an account without clear user intent. Let a user explicitly claim a remembered legacy document as their own.
- Localize user-facing text in English and Hebrew and apply the selected language direction.

## Acceptance criteria

- A signed-in user sees owned documents under **My documents** and explicitly shared documents under **Shared with me**.
- **All** shows both groups; changing filters does not alter ownership or access.
- A recipient can leave a shared document without affecting its owner or other recipients.
- An owner can delete an unshared document directly; deleting a shared document requires explicit confirmation.
- After deletion, other users lose access and persisted room data is removed.
- The server rejects read, edit, share, and delete actions that the signed-in user is not allowed to perform.
- A remembered legacy document is not assigned automatically; its owner must explicitly claim it before it appears in the account's document list.
