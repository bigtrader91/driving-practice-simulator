# Cloudflare Pages Deployment Design

## Goal

Publish the completed static driving simulator at `https://driving.pysyntax.com` from an exact, verified `origin/main` commit without changing application behavior or the dirty canonical checkout.

## Chosen approach

Use a one-time direct Cloudflare Pages deployment of the pre-built Vite `dist/` directory. The Pages project is named `driving-practice-simulator`, its production branch is `main`, and the custom hostname is `driving.pysyntax.com`.

Direct deployment is preferred for the first release because it adds no GitHub workflow, repository secret, or Cloudflare Git integration. Cloudflare does not allow a Direct Upload Pages project to switch to Git integration later. If repeated manual releases create measurable operating cost, automation must continue to upload with Wrangler from CI, or a separately named Git-integrated project must be designed and cut over explicitly.

## Scope

- Create a clean isolated worktree at the current `origin/main` commit.
- Install locked dependencies, run the full test suite and production build, and deploy only the resulting `dist/` directory.
- Create the Cloudflare Pages project if it does not already exist; otherwise verify that the existing project belongs to this repository before reuse.
- Attach `driving.pysyntax.com` and create only the required proxied CNAME when no conflicting DNS record exists.
- Verify the Pages URL and custom hostname with live HTTP, TLS, asset, browser, and persistence checks.

## Out of scope

- Application code or visual changes.
- GitHub Actions or Cloudflare Git-based automatic deployment.
- GA4, GTM, Google Search Console, sitemap work, or other analytics and SEO changes.
- Changes to unrelated Cloudflare projects, zones, or DNS records.
- Cleanup of the canonical checkout or unrelated worktrees.

## Source and artifact contract

The release source is one immutable 40-character commit that must equal the current `origin/main`. The isolated release worktree must be clean before the build. `npm ci`, `npm test -- --run`, `npx tsc --noEmit`, and `npm run build` must succeed. The deployed artifact is exactly the generated `dist/` directory from that verified worktree.

The deployment record must retain the source commit and the Cloudflare deployment URL. A successful build or upload alone does not prove the public release.

## Cloudflare resource contract

Wrangler OAuth authentication may create and deploy the Pages project and attach the custom hostname. DNS inspection and the single DNS write use the operator's authenticated Cloudflare dashboard session. Do not discover credentials from unrelated applications. If dashboard access is unavailable, stop and request one explicitly identified, least-privilege `pysyntax.com` DNS Edit credential through an approved secret-input mechanism without placing it in arguments, repository files, or logs.

Before mutation, inspect the Pages project name, custom hostname attachment, and the exact DNS name. An existing compatible resource is reused idempotently. An existing incompatible project or DNS record is a visible stop condition; it is never overwritten or deleted automatically.

Only the `driving` record in the `pysyntax.com` zone is in scope. The expected record is a proxied CNAME from `driving.pysyntax.com` to the exact `subdomain` returned by the Pages project API; never derive the target from the requested project name.

## Release flow

1. Resolve and record the current `origin/main` commit.
2. Verify the isolated worktree, dependencies, tests, typecheck, and production build.
3. Verify Cloudflare identity and inspect existing Pages and DNS resources.
4. Create or reuse the Pages project, record its returned `subdomain`, then deploy `dist/` for branch `main` with the exact source commit and newly added deployment ID recorded.
5. Attach the custom hostname and create the expected CNAME only when needed.
6. Wait for DNS and certificate propagation, then perform public readback checks.

## Failure and rollback behavior

Authentication failure, build failure, project ownership ambiguity, a conflicting DNS record, failed upload, invalid TLS, missing assets, browser errors, or failed persistence behavior stops the release and is reported explicitly.

If a new deployment is unhealthy while an earlier healthy Pages deployment exists, rollback means promoting or redeploying the last known-good deployment. DNS is not deleted as an automatic rollback step. If this is the first deployment and public validation fails, preserve the diagnostic deployment state and stop for a separate recovery decision rather than guessing or changing unrelated resources.

## Verification contract

- `npm test -- --run`, `npx tsc --noEmit`, and `npm run build` succeed from the exact release worktree.
- Exactly one deployment ID is added after the preflight snapshot, and its Cloudflare record identifies the expected source commit, production branch, and successful status.
- Both the generated `*.pages.dev` URL and `https://driving.pysyntax.com/` return HTTP 200 with successful TLS validation.
- Vehicle GLB and required static assets return successful responses from the custom hostname.
- Chromium checks at desktop and mobile viewports render the game canvas with zero page or console errors.
- A training session can be started, persisted in local storage, and offered for resume after reload on the custom hostname.
- Final readback confirms the custom hostname and validation are `active`, the public response, deployment commit, exact DNS target, and unchanged canonical checkout.

## Delivery boundary

The initial release is complete only after all public verification checks pass. Repository commit, push, pull request, and merge are unnecessary unless implementation discovers a required repository change; any such change becomes a separate reviewed scope.
