# Releasing Causync

Causync remains a prerelease package. Publish every `0.x` candidate with the npm `next` dist-tag; do not publish it as `latest` and do not publish `1.0.0` until the exit criteria in `ROADMAP.md` are met.

## Bootstrap the npm package once

The package must exist on npm before a trusted publisher can be attached to it. A maintainer performs this one-time bootstrap from a clean, CI-green `main` checkout:

1. Run `npm login` locally. Never create or commit an automation token.
2. Confirm `npm whoami` is the intended initial owner and confirm write-protected 2FA in the npm account settings.
3. Confirm `npm config get registry` returns `https://registry.npmjs.org/` and `npm view causync` still returns `E404`.
4. Run `npm ci`, `npm run verify`, and `npm pack --dry-run`.
5. Publish exactly `npm publish --tag next`.
6. Verify `npm view causync@next` and install `causync@next` in a separate minimal TypeScript/React project.

The bootstrap publish is authenticated interactively and does not claim GitHub Actions provenance. All subsequent releases use Trusted Publishing.

## Attach npm Trusted Publishing

In the published package's npm settings, add this GitHub Actions trusted publisher:

- GitHub user or organization: `AHeige`
- Repository: `causync`
- Workflow filename: `release.yml`
- Environment: none
- Allowed action: direct `npm publish`

Do not add `NODE_AUTH_TOKEN` or an npm write token to GitHub. After one successful OIDC release, configure npm publishing access to require 2FA and disallow traditional tokens.

## Publish subsequent prereleases

1. Change `package.json`, `package-lock.json`, and `CHANGELOG.md` together in a pull request.
2. Merge only after the protected Node 20 and Node 24 CI checks pass.
3. Create and publish a GitHub Release whose tag is exactly `v<package version>`.
4. The `release.yml` workflow checks out that tag, rejects a stable version, reruns the full package verification and publishes with `npm publish --tag next` through OIDC.
5. Verify the `next` dist-tag, installed package and provenance on npm.

If the workflow reports `ENEEDAUTH`, verify that the npm trusted publisher fields and the case-sensitive workflow filename match exactly. Do not work around the failure with a long-lived token.
