## v0.4.1 — automated release dry run

First release shipped via the new `.github/workflows/release.yml` pipeline (tag-driven publish with **npm provenance** via OIDC).

### Changed

- 📋 `package.json` metadata refreshed for npm discoverability — new description, on-message keywords, `bugs` field, normalised `repository.url`.
- 🛡 README gains `npm downloads` and `Types` badges.

### Added

- 🔐 `SECURITY.md` — private vulnerability reporting via GitHub Security Advisories.
- 🤖 `.github/dependabot.yml` — weekly grouped dependency updates.
- 🚀 `.github/workflows/release.yml` — tag-driven publish with provenance and a paired GitHub Release.

### For consumers

No code or API changes. Safe drop-in upgrade from 0.4.0:

```bash
pnpm add -D anchored-spec@0.4.1
```

Full changelog: [`CHANGELOG.md`](https://github.com/idvexchange/anchored-spec/blob/main/CHANGELOG.md)
