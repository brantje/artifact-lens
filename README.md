# Artifact Lens

Browse GitHub Actions artifacts as media: choose a repository, select an artifact-bearing branch, inspect workflow runs, and preview screenshots, video, audio, and PDFs directly in the browser. Files that are not previewable can still be downloaded individually.

Artifact Lens can also create anonymous share links. A signed-in user chooses Artifact, Run, Branch, or Repository scope and an optional expiry. Opening the generated `/s/...` URL sets a restricted HttpOnly share session and redirects to the normal `/repo/...` route. Anonymous viewers use a short-lived GitHub App installation token on the server; GitHub credentials are never sent to the browser, and API responses are limited to the shared scope.

## Vercel deployment

The repository is connected directly to Vercel, so deployments are handled by Vercel's native Git integration.

- Pushes to `main` create production deployments.
- Other branches and pull requests create preview deployments according to the Vercel project settings.
- No GitHub Actions deployment workflow or `VERCEL_TOKEN` repository secret is required.
- Node.js 24 is selected through `package.json`.

### Required Vercel environment variables

Configure these in the `artifact-lens` Vercel project for Production and Preview as needed:

- `GITHUB_CLIENT_ID` — GitHub App OAuth client ID
- `GITHUB_CLIENT_SECRET` — GitHub App OAuth client secret
- `GITHUB_APP_SLUG` — GitHub App slug used by the install/configure popup
- `GITHUB_APP_ID` — numeric GitHub App ID, used to mint installation tokens for anonymous share links
- `GITHUB_APP_PRIVATE_KEY` — GitHub App private key PEM. Multiline PEM or `\n`-escaped newlines are supported.
- `SESSION_SECRET` — encrypts signed-in sessions and, unless `SHARE_SECRET` is set, share links
- `SHARE_SECRET` — optional dedicated secret for share-link encryption; changing it invalidates all existing share links
- `GITHUB_REDIRECT_URI` — optional fixed OAuth callback URL

The GitHub App repository permissions should remain read-only:

- Metadata: Read-only
- Actions: Read-only

No webhook permissions are required.

## Anonymous sharing

Share links are stateless encrypted capabilities. They support these scopes:

- Artifact — one artifact only
- Run — all artifacts from one workflow run
- Branch — artifact-bearing runs on one branch
- Repository — the complete Artifact Lens view for one installed repository

Links can expire after 1, 7, or 30 days, or never. Because the current implementation is stateless, individual links cannot yet be revoked without rotating `SHARE_SECRET`; adding persistent share storage would enable per-link revocation and a "Manage shared links" screen.

## Local development

```bash
npm install
npx vercel dev
```
