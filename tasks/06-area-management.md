# Area management

Let users organize shared documents into areas. An area is a collection created and owned by one account; area membership grants access to the documents in that area.

## Requirements

- Let a signed-in user create an area. The account that creates it is its owner.
- Let the owner invite existing accounts by username, view the area's members, and remove members. Use the app's existing username-based sharing pattern for invitations.
- Let an area member leave an area. Ownership transfer is out of scope.
- Let area members create documents in an area and move documents they own into an area.
- Let area members view and edit documents in the area. Only the area owner can delete area documents; deletion follows the permanent-deletion behavior in the document ownership and sharing task.
- Moving a document into an area must preserve its existing direct shares. Area membership grants access through the area; removing or leaving the area revokes that area-based access, while any direct document share remains active independently.
- Enforce area membership and document permissions on the server; client-side visibility alone must not grant access.
- Localize user-facing text in English and Hebrew and apply the selected language direction.

## Acceptance criteria

- An area owner can invite an existing account by username, see current members, and remove a member. A user can accept an invitation and become a member.
- An invited member can access the area and its documents; a non-member cannot access them through area membership.
- An area member can create a document in the area and can move a document they own into it.
- Area members can edit area documents, but only the area owner can delete them.
- Removing a member or having them leave revokes access granted by the area. A direct share to that user continues to grant access after they leave or are removed.
- Moving a document into an area does not revoke or otherwise change its existing direct shares.
- The server rejects area or document actions from users without the required membership or ownership permission.
