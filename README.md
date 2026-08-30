# Artifact Lens

Browse GitHub Actions artifacts as media: choose a repository, select an artifact-bearing branch, inspect workflow runs, and preview screenshots, video, audio, and PDFs directly in the browser. Files that are not previewable can still be downloaded individually.

Artifact Lens can also create anonymous share links. A signed-in user chooses Artifact, Run, Branch, or Repository scope and an optional expiry. Opening the generated `/s/...` URL sets a restricted HttpOnly share session and redirects to the normal `/repo/...` route. Anonymous viewers use a short-lived GitHub App installation token on the server; GitHub credentials are never sent to the browser, and API responses are limited to the shared scope.

Repository admins can additionally enable **Public artifact URLs** for an individual repository. When enabled, the existing canonical artifact route, for example `/repo/owner/repo/branch/main/run/123/artifact/456`, can be opened without signing in. Public access is restricted to the artifact identified by that exact canonical route; repository, branch, and run indexes are not made generally public.

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
- `GITHUB_APP_ID` — numeric GitHub App ID, used to mint installation tokens for anonymous share links and public artifact URLs
- `GITHUB_APP_PRIVATE_KEY` — GitHub App private key PEM. Multiline PEM or `\n`-escaped newlines are supported.
- `SESSION_SECRET` — encrypts signed-in sessions and, unless `SHARE_SECRET` is set, share links
- `SHARE_SECRET` — optional dedicated secret for share-link encryption; changing it invalidates all existing share links
- `GITHUB_REDIRECT_URI` — optional fixed OAuth callback URL

Public artifact URLs also need a small persistent settings store. The recommended setup is an Upstash Redis database connected to the Vercel project. Artifact Lens accepts either environment-variable pair:

- `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`
- `KV_REST_API_URL` + `KV_REST_API_TOKEN` (used by some Vercel/Upstash integrations)

If Redis is not configured, the existing application and `/s/...` share links continue to work; the Public artifact URLs repository toggle is shown as unavailable.

The GitHub App repository permissions should remain read-only:

- Metadata: Read-only
- Actions: Read-only

No webhook permissions are required. Enabling Public artifact URLs does not require write access to the target repository.

## Public artifact URLs

Open a repository in Artifact Lens and use the **Public artifact URLs** repository setting. Only users with GitHub repository admin permission can change it.

When enabled:

- Existing canonical artifact URLs can be pasted directly into chat, pull requests, CI output, or issue comments.
- Anonymous viewers can preview and download files from the artifact at that exact route.
- The route is verified against GitHub so the branch, workflow run, and artifact ID must match.
- Repository, branch, and run indexes remain protected rather than becoming anonymously browsable.
- Existing `/s/...` links continue to work unchanged.

For private repositories, enabling this setting intentionally makes GitHub Actions artifact contents reachable without GitHub authentication to anyone who has a valid canonical artifact URL. The UI shows an explicit warning before enabling it.

Disabling the setting makes canonical artifact URLs require authentication or an existing `/s/...` share capability again. The Redis setting is checked on anonymous requests so disabling it does not require rotating `SHARE_SECRET`.

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

To exercise Public artifact URLs locally, also provide an Upstash Redis REST URL and token in the local Vercel environment.
