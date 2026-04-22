# Security Policy

## Supported Versions

Anchored Spec is pre-1.0. Only the latest minor release line receives security fixes.

| Version | Supported          |
| ------- | ------------------ |
| 0.4.x   | :white_check_mark: |
| < 0.4   | :x:                |

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Use GitHub's private vulnerability reporting:

1. Go to <https://github.com/idvexchange/anchored-spec/security/advisories/new>
2. Fill in the advisory with as much detail as you can: affected versions, reproduction steps, expected vs observed behavior, and any suggested fix.

Alternatively, email the maintainers via the address listed on the [GitHub organisation profile](https://github.com/idvexchange).

## What to Expect

- We aim to acknowledge new reports within **3 business days**.
- We will keep you updated as we triage, reproduce, and develop a fix.
- Once a fix is ready, we will coordinate a release and a public advisory crediting you (unless you prefer to remain anonymous).
- Fixes are normally shipped in the next patch release on the supported minor line.

## Scope

In scope:

- The published `anchored-spec` npm package and its CLI.
- The JSON schemas and TypeScript types it exports.
- The example harness scripts under `scripts/` in this repository.

Out of scope:

- Vulnerabilities in third-party dependencies — please report those upstream and reference the upstream advisory in your report to us.
- Configuration mistakes in adopting repositories (e.g. policies that disable validation).
- Issues that require a malicious local actor with full filesystem access.

Thank you for helping keep Anchored Spec and its users safe.
