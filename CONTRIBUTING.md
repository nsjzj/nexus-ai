# Contributing to NEXUS AI

Thanks for considering a contribution. NEXUS AI is an open-source project and welcomes bug reports, documentation improvements, accessibility fixes, translations, and carefully scoped code changes.

## Before you start

- Check existing issues and pull requests to avoid duplicate work.
- For larger changes, open an issue first to discuss the approach.
- Never include API keys, passwords, access tokens, private user data, or production credentials in an issue, commit, screenshot, or pull request.
- Do not test against accounts or data you do not own or have explicit permission to use.

## Local setup

1. Fork the repository and clone your fork.
2. Install Node.js 20.9+ and npm.
3. Run `npm install`.
4. Copy `.env.example` to `.env.local` and configure only the services you intend to test.
5. Apply the Supabase migrations in numerical order when testing cloud features.
6. Run `npm run dev`.

See [README.md](./README.md) for the complete environment and Supabase setup.

## Making changes

- Keep pull requests focused and explain the user problem they solve.
- Preserve Arabic/English support, right-to-left layout, and mobile usability.
- Keep provider secrets and privileged Supabase credentials on the server.
- Preserve Row Level Security and verify account ownership for database operations.
- Treat external repository content and AI output as untrusted input.
- Do not execute untrusted source code or add background jobs without explicit safeguards, limits, and operational documentation.
- Add or update documentation when behavior, configuration, or security assumptions change.

## Before opening a pull request

Run:

```bash
npm install
npm run typecheck
npm run lint
npm run build
```

Include:
- What changed and why.
- How you tested it, including any checks you could not run.
- Screenshots or a short recording for visible UI changes, with private data removed.
- Any migration or environment-variable changes.

A green CI run is required before a change is considered ready to merge. Maintainers may request changes or additional testing.

## Security issues

Do not report security vulnerabilities in public issues. Follow the private reporting instructions in [SECURITY.md](./SECURITY.md).
