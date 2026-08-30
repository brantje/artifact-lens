# Artifact Lens

Browse GitHub Actions artifacts as media: choose a repository, select an artifact-bearing branch, inspect workflow runs, and preview screenshots, video, audio, and PDFs directly in the browser.

## GitHub App authentication

Artifact Lens uses a GitHub App instead of a classic OAuth App. This avoids the broad `repo` OAuth scope and restricts access to repositories where the app is installed.

Create a GitHub App under **GitHub Developer settings → GitHub Apps** with:

- Repository permission **Metadata: Read-only**
- Repository permission **Actions: Read-only**
- No write permissions
- No webhook events are required by Artifact Lens
- User-to-server token expiration enabled (recommended)

Set the GitHub App callback URL to:

`https://artifact-lens-brantjes-team.vercel.app/api/auth/callback`

The app must be installed on the repositories Artifact Lens should be allowed to browse. Users only see repositories that are both accessible to them and included in one of the app installations.

### Required Vercel environment variables

Configure these in the `artifact-lens` Vercel project for Production (and Preview if you configure preview callback URLs):

- `GITHUB_CLIENT_ID` — the **GitHub App** client ID
- `GITHUB_CLIENT_SECRET` — a client secret generated for that same GitHub App
- `GITHUB_APP_SLUG` — the GitHub App slug, used for the install/add-repositories button
- `SESSION_SECRET` — a long random value used to encrypt the HttpOnly session cookie
- `GITHUB_REDIRECT_URI` — optional explicit callback URL; otherwise the request host is used

If you previously configured credentials from a classic OAuth App, replace them. Artifact Lens intentionally rejects classic `gho_` OAuth tokens and only accepts GitHub App user tokens (`ghu_`).

GitHub App user tokens are refreshed automatically when expiring user-to-server tokens are enabled. The refresh token is stored only inside the encrypted HttpOnly session cookie.

## Vercel deployment

The repository is connected directly to Vercel, so deployments are handled by Vercel's native Git integration.

- Pushes to `main` create production deployments.
- Other branches and pull requests create preview deployments according to the Vercel project settings.
- No GitHub Actions deployment workflow or `VERCEL_TOKEN` repository secret is required.

## Local development

```bash
npm install
npx vercel dev
```
