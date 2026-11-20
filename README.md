# NEXUS AI

**Your All-in-One AI Workspace** — a mobile-first workspace designed to bring AI conversations and developer workflows together.

> Current status: Foundation + first AI Hub interface. Projects, GitHub Lab, automations, accounts, and hosted deployment are planned follow-up phases.

## What's included

- Responsive workspace shell with AI Hub, Projects, GitHub Lab, Automations, and Settings navigation.
- Local Projects workspace: create, search, pause/resume, and delete project cards.
- English and Arabic interface toggle, including RTL layout.
- Local conversation history in the current browser (up to 30 saved conversations).
- Server-side OpenAI-compatible chat endpoint.
- Provider configuration through environment variables; API keys stay on the server.
- Basic request validation, provider error handling, and request timeout.
- Initial Supabase SQL migration for profiles, projects, conversations, and messages with per-user Row Level Security.
- Separate `nexus-ai-foundation` branch so the default `main` branch remains untouched.

## Requirements

- Node.js 20.9 or newer
- npm
- An API key for an OpenAI-compatible provider, or a reachable local OpenAI-compatible endpoint such as Ollama.

## Run locally

1. Clone the repository and switch to the foundation branch:

   ```bash
   git clone https://github.com/nsjzj/nexus-ai.git
   cd nexus-ai
   git checkout nexus-ai-foundation
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Create your local environment file:

   ```bash
   cp .env.example .env.local
   ```

4. Edit `.env.local` and add your provider settings:

   ```env
   AI_BASE_URL=https://api.openai.com/v1
   AI_API_KEY=your_key_here
   AI_MODEL=gpt-4o-mini
   ```

   Never commit `.env.local` or expose provider keys in client-side code.

5. Start the development server:

   ```bash
   npm run dev
   ```

   Open http://localhost:3000.

## Provider configuration

The chat route uses the OpenAI-compatible `POST /chat/completions` format.

- OpenAI-compatible hosted provider: set `AI_BASE_URL`, `AI_API_KEY`, and `AI_MODEL`.
- Ollama: use a reachable Ollama endpoint, for example `http://localhost:11434/v1`, set `AI_API_KEY=ollama` if required by the local endpoint, and choose a model installed locally.
- The browser calls only the NEXUS server route. The provider secret is not sent to the browser.

Some hosted AI providers charge for API usage. NEXUS AI itself does not currently add a subscription or charge.

## Supabase Auth setup

The settings screen includes email/password sign-up and sign-in through Supabase Auth. The SSR browser/server clients, session-refresh middleware, and OAuth/email callback route are included. To enable this feature:

1. Create a Supabase project.
2. Apply `supabase/migrations/0001_initial_schema.sql` using the SQL Editor or Supabase CLI.
3. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to `.env.local` and your hosting environment.
4. In Supabase Auth, configure the site URL and redirect URL to include `http://localhost:3000/auth/callback` for local development and your deployed origin plus `/auth/callback` for production.
5. Restart the app and open Settings to create an account or sign in.

Only the public anon/publishable key belongs in `NEXT_PUBLIC_*`. Never put a Supabase service-role key in browser-visible environment variables. The account panel authenticates users, but project and chat data are not yet synced to the cloud; the UI continues to store them locally.

## Cloud database preparation

A starter Supabase migration is available at `supabase/migrations/0001_initial_schema.sql`. It creates user profiles, projects, conversations, and messages, enables Row Level Security, and scopes records to the signed-in user. This is a schema foundation only: it has **not** been applied to a Supabase project, and the app is not yet connected to Supabase Auth or cloud storage. Do not treat cloud sync or account support as implemented yet.

To use it later, create a Supabase project, review the SQL, and apply the migration with the Supabase CLI or SQL Editor. Keep the Supabase service-role key server-only; never expose it in browser code.

## Quality checks

```bash
npm run typecheck
npm run lint
npm run build
```

The checks above are documented commands; run them in a Node.js environment before treating a build as production-ready.

## Roadmap

1. **Foundation (current):** responsive app shell, language toggle, AI Hub UI, server-side provider adapter.
2. **AI Hub:** provider/model management, streaming responses, conversation search and export.
3. **Project Memory (in progress):** cloud sync, project notes and files, per-project instructions, and context retrieval.
4. **GitHub Lab:** repository browser, code review, test execution, branch-based patches, and pull requests.
5. **Automation:** multi-step workflows, approvals for sensitive actions, activity history, and rollback.
6. **Deployment & security:** hosted deployment, authentication, per-user data isolation, rate limits, and audit logging.

## Safety and privacy notes

- Keep API keys in server environment variables only.
- Do not add secrets, personal access tokens, or private credentials to Git.
- The current conversation history is stored in the browser's local storage on that device. It is not yet synced between devices or protected by user accounts.
- Project cards currently use this browser's local storage. Cloud sync, project files, GitHub operations, and automation are not yet implemented.
- Review AI-generated output before using it in important systems.

## License

MIT. See [LICENSE](./LICENSE).
