# Artifact Lens

Browse GitHub Actions artifacts as media: choose a repository, select an artifact-bearing branch, inspect workflow runs, and preview screenshots, video, audio, and PDFs directly in the browser.

## Vercel deployment

The repository is connected directly to Vercel, so deployments are handled by Vercel's native Git integration.

- Pushes to `main` create production deployments.
- Other branches and pull requests create preview deployments according to the Vercel project settings.
- No GitHub Actions deployment workflow or `VERCEL_TOKEN` repository secret is required.

### Required Vercel environment variables

Configure these in the `artifact-lens` Vercel project for Production and Preview as needed:

- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `SESSION_SECRET`

The production GitHub OAuth callback should be configured for the production Vercel domain, for example:

`https://artifact-lens-brantjes-team.vercel.app/api/auth/callback`

Preview deployments use different hostnames, so GitHub OAuth on previews requires a callback strategy that supports those preview URLs or a separate OAuth configuration.

## Local development

```bash
npm install
npx vercel dev
```
