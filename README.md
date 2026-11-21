# NEXUS AI

**Your All-in-One AI Workspace** — a mobile-first workspace designed to make AI and developer tools easier to use.

> Project status: active foundation build on Next.js 16.4.6. The AI Hub, device-local chat, optional per-account chat/project sync, Supabase email authentication, and read-only public GitHub Lab are implemented on the default branch. A real Supabase project, AI provider credentials, and deployment configuration are still required. Run the verification commands and dependency audit below against the exact commit you plan to deploy; CI results and dependency advisories can change over time.

## What's included

- Responsive, mobile-first workspace with Arabic/English UI and right-to-left layout.
- AI Hub using an OpenAI-compatible server-side chat endpoint with incremental streaming when supported by the provider.
- Provider secrets stay on the server; the browser only calls the NEXUS API.
- Request validation, body-size limits, provider timeouts, safer errors, and a shared production rate limiter backed by Upstash Redis.
- A response token ceiling to help bound provider latency and usage cost.
- Local conversation history for signed-out users.
- Per-account conversation history sync when Supabase is configured and the user is signed in.
- Projects workspace with create, search, pause/resume, and delete actions.
- Per-project memory notes with create, edit, delete, account-isolated cloud storage, and an explicit action to add saved notes to the AI chat context.
- Per-account cloud project sync, with account-specific browser caches.
- Supabase email/password sign-up, sign-in, sign-out, SSR session helpers, and auth callback route.
- Read-only GitHub Lab for public repository metadata, topics, README preview, and recent commit history.
- Reusable AI workflows with manual execution, saved prompts, and a local run history; background scheduling is not yet connected.
- No external font download on the critical page-load path.

## Requirements

- Node.js 20.9 or newer
- npm
- An API key for an OpenAI-compatible provider, or a reachable local OpenAI-compatible endpoint such as Ollama
- A Supabase project for accounts and cloud sync
- Upstash Redis REST credentials for production shared rate limiting

## Run locally

1. Clone the repository's default branch:

   ```bash
   git clone https://github.com/nsjzj/nexus-ai.git
   cd nexus-ai
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Copy the environment template:

   ```bash
   cp .env.example .env.local
   ```

4. Configure the AI provider and Supabase values in `.env.local`:

   ```env
   AI_BASE_URL=https://api.openai.com/v1
   AI_API_KEY=your_key_here
   AI_MODEL=gpt-4o-mini
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_or_publishable_key
   UPSTASH_REDIS_REST_URL=https://your-database.upstash.io
   UPSTASH_REDIS_REST_TOKEN=your_upstash_token
   ```

   Never commit `.env.local`, expose provider keys in client code, or place a Supabase service-role key in a `NEXT_PUBLIC_*` variable.

5. Apply all three migrations in order: `supabase/migrations/0001_initial_schema.sql`, `supabase/migrations/0002_stable_message_order.sql`, and `supabase/migrations/0003_project_memories.sql`, using the Supabase SQL Editor or Supabase CLI.

6. In Supabase Auth, set the site URL and allowed redirect URLs. Include `http://localhost:3000/auth/callback` for local development and your production origin plus `/auth/callback` after deployment.

7. Start the app:

   ```bash
   npm run dev
   ```

   Open http://localhost:3000.

## AI provider configuration

The server route uses the OpenAI-compatible `POST /chat/completions` format.

- Hosted provider: configure `AI_BASE_URL`, `AI_API_KEY`, and `AI_MODEL`.
- Ollama: use a reachable Ollama endpoint such as `http://localhost:11434/v1`, set the key value required by that endpoint, and select a model installed locally.
- Some hosted providers charge for API usage. NEXUS AI does not currently add a subscription, but provider usage may cost money.

The API requires signed-in Supabase users in production, applies shared per-user limits through Upstash Redis (12 requests/minute and 100/day by default), limits request size and message count, and caps generated output at 1,200 tokens. Local development uses an in-memory best-effort limiter. This is a conservative default, not a guarantee of low latency: response speed depends on the selected model, provider, network, and hosting region.

## Supabase data and account isolation

Apply all three migrations in order: `supabase/migrations/0001_initial_schema.sql`, `supabase/migrations/0002_stable_message_order.sql`, and `supabase/migrations/0003_project_memories.sql`. They create profiles, projects, conversations, ordered messages, and project memory notes with Row Level Security policies tied to the authenticated user.

- Signed-in users load and save conversations, projects, and project memory notes to their own Supabase records.
- Signed-in browser caches are keyed by account.
- Signed-out conversations and projects remain local to the current browser.
- Existing signed-out local history is not automatically copied into an account. This avoids accidentally transferring one person's device history into another account.
- Cloud sync requires the migration to be applied and the Supabase URL/key and Auth redirect settings to be configured.

The production AI endpoint fails closed if Supabase Auth or Upstash credentials are missing. The Supabase Auth and cloud-sync code has not yet been verified against a live project. Do not treat cloud sync as production-proven until a configured test account has been used to verify sign-up, sign-in, sign-out, cross-device retrieval, and data isolation.

## GitHub Lab scope

The current GitHub Lab version reads public repository metadata, topics, the README, and the five most recent commits. It does not access private repositories, clone or execute source code, review entire codebases, create branches, or open pull requests. Those capabilities require a secure GitHub authorization flow and explicit approval before making changes.

## Performance and reliability

The app streams assistant text as it arrives when the provider supports streaming, avoids blocking remote font downloads, and avoids animated chat auto-scroll. The chat route has request limits, a shared production limiter, authentication checks, and a provider timeout. These measures reduce avoidable work, but they do not guarantee a lag-free experience.

Before a public multi-instance launch:
- Configure Upstash Redis REST credentials for the shared production rate limiter.
- Add provider usage budgets and abuse monitoring.
- Verify authentication, RLS, account switching, and cross-user isolation.
- Run the typecheck, lint, and production build successfully.
- Perform real-device and network testing.

## Quality checks

```bash
npm run typecheck
npm run lint
npm run build
```

Run these checks against the exact commit you intend to use. Results depend on the installed dependency tree and current toolchain.

## Roadmap

1. **Foundation:** responsive UI, language support, AI Hub, server-side provider adapter.
2. **AI Hub:** model selection, conversation search/export, usage controls.
3. **Project Memory:** per-project notes and explicit memory-to-chat context injection are implemented; file attachments, per-project AI instructions, and automatic context retrieval remain planned.
4. **GitHub Lab:** secure private-repository connection, source browsing, code review, branch-based patches, and pull requests with user approval.
5. **Automation:** reusable prompt workflows with manual execution and local run history are implemented. Background scheduling, multi-step orchestration, approval checkpoints, and rollback remain planned.
6. **Release readiness:** shared rate limits, cost controls, security review, monitoring, and hosted deployment.

## Safety and privacy

- Chat prompts are sent to the AI provider configured by the deployment to generate responses.
- Signed-in conversation, project, and project-memory data is stored in the configured Supabase project; signed-out data remains in the current browser storage.
- Keep provider and service-role keys on the server only.
- Do not commit secrets, personal access tokens, or private credentials.
- Review AI-generated output before using it in important systems.
- Never execute untrusted repository code automatically.
- Do not deploy as a public multi-user service until authentication, RLS, abuse controls, provider budgets, and operational monitoring are verified.

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening an issue or pull request. Use the bug report template for reproducible problems. For security concerns, follow [SECURITY.md](./SECURITY.md) and do not post vulnerabilities publicly.

## License

NEXUS AI is released under the MIT License. You may use, copy, modify, distribute, and sublicense the project subject to the license terms. See [LICENSE](./LICENSE).
