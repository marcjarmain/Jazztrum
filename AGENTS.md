# Jazztrum development and publishing

Jazztrum is a client-only React/TypeScript/Vite guitar rhythm app. The owner wants to request upgrades remotely and have completed upgrades published without accessing a desktop or manually pushing Git.

## Setup and verification

- Work from the Jazztrum repository root (mounted at `/workspace/Jazztrum` in the cloud environment).
- Run `npm ci` when dependencies are missing or the lockfile changes.
- Run `npm test` and `npm run build` before publishing changes.
- Start a development preview with `npm run dev -- --host 0.0.0.0` and open `/Jazztrum/`.
- Check relevant browser interactions. Microphone access requires HTTPS or localhost; real microphone and iPad audio behavior need device verification.
- Keep Vite's `/Jazztrum/` base path for GitHub Pages. Files in `public/` are publicly served. Never put secrets there or in client code.

## Completing requested live upgrades

- When a user requests an upgrade to the live app, complete implementation, verification, and publication within the authorized scope. Do not stop at local edits or tell the owner to push from their desktop.
- Commit only the requested changes. Publish through the authenticated GitHub connection or normal Git credentials available to the cloud task. If using a pull request, get the requested change onto `main` through the authorized review/merge flow.
- `.github/workflows/deploy.yml` automatically runs tests, builds, and publishes GitHub Pages on every push to `main`. A separate desktop deployment is unnecessary.
- Verify the resulting GitHub Actions run and check https://marcjarmain.github.io/Jazztrum/ before reporting an upgrade as live. If access, merge approval, tests, or deployment blocks completion, report the exact blocker.
- Preserve concurrent work. Never force-push or bypass branch protections. Analysis-only requests do not authorize publication.

The source repository and the published webapp are public. Hosting is GitHub Pages; there is no application backend or required app secret.
