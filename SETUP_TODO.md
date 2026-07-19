# Manual Setup TODO Checklist

Use this checklist when you are back at your workstation to finish the project setup outside the codebase.

## Local environment

- [ ] Install Node.js 20 LTS or newer.
- [ ] Run `npm install` after cloning or pulling the repository.
- [ ] Copy `.env.example` to `.env.local` in the project root.
- [ ] Add a strong `AUTH_SECRET` value to `.env.local` for signing login cookies.
- [ ] Add `MONGODB_URI` to `.env.local` with your MongoDB connection string.
- [ ] Add `GROQ_API_KEY` if you want the formatter and humanizer to use Groq first.
- [ ] Add `GEMINI_API_KEY` if you want Gemini as the AI fallback provider.
- [ ] Run `npm run dev` and open `http://localhost:3000`.
- [ ] Register a test user from the login page before testing protected tools.

## Database setup

- [ ] Create a MongoDB Atlas cluster or local MongoDB database.
- [ ] Create a database user with read/write access for this app.
- [ ] Whitelist your local IP address in MongoDB Atlas if using Atlas.
- [ ] Confirm `MONGODB_URI` includes the correct username, password, host, and database name.
- [ ] Generate one paper from the Research Formatter page and confirm it appears in the `papers` collection.
- [ ] Run one similarity scan and confirm it appears in the `plagiarismscans` collection.
- [ ] Confirm registered accounts appear in the `users` collection.

## Similarity checker setup

- [ ] Leave `PLAGIARISM_PROVIDER=mock` for local testing without external services.
- [ ] If enabling Copyleaks later, set `PLAGIARISM_PROVIDER=copyleaks`.
- [ ] Add `COPYLEAKS_EMAIL`, `COPYLEAKS_API_KEY`, `COPYLEAKS_WEBHOOK_BASE_URL`, and `COPYLEAKS_WEBHOOK_SECRET` before enabling Copyleaks.
- [ ] Deploy the app before testing Copyleaks webhooks because webhooks require a public URL.

## Deployment setup

- [ ] Add all production environment variables in your hosting provider dashboard.
- [ ] Use the same `AUTH_SECRET` across all production instances.
- [ ] Configure `MONGODB_URI` with production database credentials, not local credentials.
- [ ] Run `npm run lint` before deployment.
- [ ] Run `npm run build` before deployment.
- [ ] After deployment, create a new user and test login, research formatting, history, and similarity scanning.

## Optional polish

- [ ] Replace placeholder app logo/assets in `public/` if you have final branding.
- [ ] Decide whether to keep system fonts or add a self-hosted local font file.
- [ ] Review the generated paper prompts and tune section requirements for your exact academic format.
- [ ] Connect a real plagiarism provider only after the mock checker flow is fully tested.
