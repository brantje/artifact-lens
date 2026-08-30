# Artifact Lens

Browse GitHub Actions artifacts as media: choose a repository, select an artifact-bearing branch, inspect workflow runs, and preview screenshots, video, audio, and PDFs directly in the browser.

## Vercel deployment

Deployments are handled by `.github/workflows/vercel.yml`.

- Push to `main` -> production deployment
- Push to any other branch -> preview deployment
- Manual run -> preview or production based on the selected branch

### Required GitHub Actions secret

Create one repository secret:

- `VERCEL_TOKEN` - a Vercel personal/team access token with permission to deploy to the `brantjes-team` scope.

The workflow creates the `artifact-lens` Vercel project if needed and links the checkout automatically, so `VERCEL_PROJECT_ID` and `VERCEL_ORG_ID` are not required as GitHub secrets.

### Required Vercel environment variables

Configure these in the `artifact-lens` Vercel project for Production and Preview:

- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `SESSION_SECRET`

The GitHub OAuth callback should be:

`https://artifact-lens-brantjes-team.vercel.app/api/auth/callback`

For preview deployments, OAuth callbacks need a stable callback origin or a separate OAuth app/configuration if you intend to log in on preview URLs.

## Local development

```bash
npm install
npx vercel dev
```
