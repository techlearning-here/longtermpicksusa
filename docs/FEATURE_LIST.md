# Long Term Picks USA – Feature List

**Site name:** [Long Term Picks USA](https://longtermpicksusa.com) (domain available). A USA-focused finance and long-term stock recommendations website (in the spirit of Motley Fool). This document captures the agreed product and technical features.

**Current architecture:** **Sanity** (CMS + Studio + assets) → on publish, **Sanity webhook** triggers a **GitHub Actions** workflow → workflow fetches one document, updates **manifest** in repo, generates static HTML, pushes only changed files via **GitHub API** → **GitHub Pages** serves the site from that repo branch. No Vercel; no server to host.

For a **diagrammatic view of components and flows**, see [ARCHITECTURE.md](./ARCHITECTURE.md).  
To **create and run Sanity Studio** locally, see [SANITY_STUDIO_SETUP.md](./SANITY_STUDIO_SETUP.md).  
To **wire up GitHub** (repo, Pages, webhook), see [GITHUB_SETUP.md](./GITHUB_SETUP.md).

---

## 1. Product Overview

- **Audience:** US users interested in long-term investing and finance.
- **Content:** Finance/investment articles and long-term stock recommendations.
- **Admin:** Submit and manage articles and stock recommendations; content appears on the public site after publish.

---

## 2. User-Facing Features

### 2.1 Public Website

| Feature | Description |
|--------|--------------|
| **Homepage** | Featured content, latest articles, latest stock recommendations. |
| **Articles** | Listing of finance/investment articles; filter by category/date. |
| **Article detail** | Full article page with title, body, metadata, and SEO-friendly URL. |
| **Stock recommendations** | Listing of long-term stock picks. |
| **Recommendation detail** | Dedicated page per recommendation with: full write-up, reasons for the recommendation, and **live stock chart** (data from third-party API). |
| **SEO & sharing** | Meta tags, Open Graph, clean URLs, optional RSS. |
| **Static delivery** | Public pages served as static HTML by **GitHub Pages**; no CMS or server hit on read. |

### 2.2 Stock Recommendation Detail (Specifics)

- Full narrative and bullet-point reasons for the recommendation.
- **Live chart** for the ticker (e.g. Yahoo Finance, Alpha Vantage, or similar).
- Ticker, company name, recommendation type (e.g. Buy/Hold), target price, time horizon.
- Chart loaded client-side or via a small cached API; no heavy DB reads for chart data.

### 2.3 Optional / Future (Planned, Not MVP)

- Newsletter signup and digest emails.
- User accounts (watchlist, saved articles, alerts).
- Comments/discussion with moderation.
- Author/analyst profiles and past performance summary.
- Premium membership and paywalled content.
- Performance tracking of past recommendations (e.g. “X of N picks are up”).
- Screener/filters (sector, market cap, time horizon).
- Alerts when a recommendation is updated or price crosses a level.

---

## 3. Admin Features

### 3.1 Authentication

- Admin uses **Sanity Studio** (hosted by Sanity) for content management; login is via Sanity (no separate auth to host).
- Optional: role-based access in Sanity (e.g. editor vs admin) and 2FA later.

### 3.2 Article Management

- Create, edit, and delete articles.
- Fields: title, slug, body (rich text), excerpt, featured image, category, publish date.
- **Content format:** Body (and recommendation reasons) are stored in **Sanity** (portable text or HTML per schema); the generated static page is HTML. See §4.7.
- **Draft vs Published**; optional scheduling.
- On **Publish**: content is in Sanity; the **Sanity webhook** triggers the **GitHub Actions** workflow that runs the static page generation pipeline (see §4.3).

### 3.3 Stock Recommendation Management

- Create, edit, and delete recommendations.
- Fields: ticker, company name, recommendation type, target price, time horizon, key reasons (structured or rich text), optional image.
- Draft vs Published.
- On **Publish**: same **GitHub Actions** pipeline as articles (incremental generate + push to repo; GitHub Pages serves the branch).

### 3.4 Media / Storage

- Upload images for articles and recommendations via **Sanity Studio**; Sanity hosts assets (no separate storage service).
- Assets are referenced in content; Sanity serves image URLs.

---

## 4. Technical Architecture

### 4.1 Stack

| Layer | Choice |
|-------|--------|
| **CMS (content + admin + media)** | **Sanity** (hosted). Content, Sanity Studio, and assets are on Sanity; no server to host. |
| **Publish pipeline** | **GitHub Actions**. Workflow triggered on publish (e.g. by Sanity webhook via `repository_dispatch`); runs generator, pushes only changed files via GitHub API. |
| **Static site hosting** | **GitHub Pages**. Serves the generated static site from the repo (e.g. `gh-pages` or `output` branch). No Vercel. |
| **Generated static site** | Stored in the same Git repo (e.g. `gh-pages` or dedicated repo); GitHub Pages serves from that branch. |

### 4.2 Data Model (Source of Truth)

- **Sanity** is the single source of truth for:
  - **Articles:** document type with slug, title, body (portable text or HTML), excerpt, category, publishedAt, etc.
  - **Stock recommendations:** document type with slug, ticker, companyName, type, targetPrice, timeHorizon, reasons (portable text or HTML), publishedAt, etc.
  - **Assets:** images/files uploaded in Sanity Studio.
- **Generated static pages** are derived from Sanity; they are not the source of truth. Redeployments regenerate from Sanity (or from manifest + incremental updates) so **published static pages are not lost**.

### 4.3 Static Page Generation (On Publish)

- **Goal:** After publish, generate only the new/changed static pages and push only those files. Do **not** read all articles from Sanity or regenerate the entire site on every publish.
- **Trigger:** Sanity webhook on document publish calls a GitHub endpoint (e.g. `repository_dispatch`) to trigger a **GitHub Actions** workflow, passing **document id** (and slug). The workflow runs the pipeline.

**Flow:**

1. **Read only the new item** from Sanity API (single document by id).
2. **Manifest (listing pages):** Use **Option B – Manifest file in repo**.
   - A `manifest.json` (or similar) in the output repo holds metadata for all published articles/recommendations (slug, title, excerpt, publishedAt, etc.) — no full body.
   - On publish: append/update the new item’s metadata in the manifest.
   - Listing pages (`articles/index.html`, `recommendations/index.html`, `index.html`) are generated from the manifest only — **no read of all article bodies** from Sanity.
3. **Generate only:**
   - The new article/recommendation static page (e.g. `articles/{slug}.html`, `recommendations/{slug}.html`).
   - Updated listing pages (from manifest).
   - Updated manifest file.
4. **Push only changed files** to GitHub using **Option 2 – GitHub API**:
   - No clone/pull of the repo.
   - `PUT /repos/{owner}/{repo}/contents/{path}` for create/update (with `sha` for updates).
   - `DELETE .../contents/{path}` for unpublish/delete.
   - Only call the API for: new page, `manifest.json`, and listing pages that changed.

### 4.4 Serving the Public Site

- **GitHub Pages** is configured to serve from the repo (or branch) that contains the generated static files (e.g. `gh-pages` or `output` branch). See [ARCHITECTURE.md §6](./ARCHITECTURE.md#6-file-layout-in-output-repo) for file layout.
- When the **GitHub Actions** workflow pushes to that branch, the content is already in the repo; GitHub Pages serves it (no separate deploy step).
- **Redeployments** do not lose content: the pipeline only pushes changed files and the branch always has the full set of pages; Sanity (and manifest) remain the source of truth.

### 4.5 Permanent Store (Git + GitHub Pages)

- **Generated static pages** are stored in a **Git repo** (e.g. `gh-pages` branch or a dedicated `username.github.io` repo).
- GitHub Pages serves that branch; no third-party host (e.g. Vercel) is required.
- Optional: also push the same output to object storage (e.g. S3) for redundancy; the agreed primary store is **Git**, served by **GitHub Pages**.

### 4.6 Live Charts on Recommendation Pages

- Recommendation detail page is static (reasons, narrative, metadata).
- **Chart:** Loaded in the browser; data from a third-party API (e.g. Yahoo Finance, Alpha Vantage) or a small cached API. No heavy DB usage for chart data; ticker is stored in the static page and used for the chart request.

### 4.7 Content Format (Stored vs Published)

- **Generated static page (what users get):** Always **HTML**. Each published URL is an HTML file (e.g. `articles/my-article.html`); the full page, including the article/recommendation body, is HTML.
- **Stored in Sanity:** Content is stored in Sanity documents. Rich text can be **portable text** (Sanity’s default block content) or a custom **HTML** string field; at publish we **convert portable text → HTML** (or use HTML as-is) and **sanitise** before injecting into the static page template.
- **Sanitisation:** Whenever content is injected into the generated page, it must be sanitised (allowlist of tags/attributes) to prevent XSS and broken layout.

---

## 5. Feature Summary Tables

### 5.1 Content & Publish

| Feature | Detail |
|--------|--------|
| Articles | Create, edit, publish; full body, excerpt, category, images. |
| Stock recommendations | Create, edit, publish; ticker, reasons, live chart on detail page. |
| On publish | Only new item read from Sanity API; only that item’s page + listing pages generated; only changed files pushed via GitHub API. |
| Listing pages | Built from manifest file in repo (Option B); no read of all article bodies from Sanity. |
| Unpublish/delete | Remove file via GitHub API; update manifest; regenerate listing pages. |

### 5.2 Technical Choices

| Decision | Choice |
|----------|--------|
| DB & auth | Sanity (content + Sanity Studio + assets; no separate DB or auth to host). |
| Hosting | GitHub Pages (static site from repo branch). |
| Pipeline | GitHub Actions (triggered by Sanity webhook via repository_dispatch). |
| Static output store | Git repo (branch or dedicated repo). |
| Push only changed files | GitHub API (Contents API: PUT/DELETE per path). |
| Listing data source | Manifest file in repo (metadata only). |
| Chart data | Third-party or small API; not full DB reads. |
| Development approach | Test Driven Development (TDD). See §6. |

### 5.3 Non-Functional

| Area | Notes |
|------|--------|
| **CMS load** | Sanity is only hit at publish time (and when editing in Studio); end users do not hit Sanity. |
| **Redeploy safety** | No loss of published static pages; Sanity (and manifest) are source of truth; only changed files pushed. |
| **USA focus** | Content and compliance aimed at US users. Hosting is **GitHub Pages** (no separate region selection). |
| **Legal** | Disclaimers (“not advice”), Terms, Privacy; consider regulatory aspects if offering specific buy/sell advice or paid services. |

---

## 6. Test Driven Development (TDD)

The project will use **Test Driven Development**: write failing tests first, then implement the minimum code to pass, then refactor.

### 6.1 Principles

- **Red → Green → Refactor:** Write a failing test (Red), make it pass with minimal code (Green), then improve design without breaking tests (Refactor).
- **Tests define behaviour:** Tests are the specification; implementation follows. Features in this document should have corresponding tests before or as code is written.
- **Prefer unit tests for logic:** Business rules, manifest updates, payload shaping, and validation should be unit-tested and driven by tests first.
- **Integration tests for boundaries:** Sanity client usage, GitHub API calls, and GitHub Actions publish workflow should be covered by integration tests (with mocks or test doubles where appropriate).
- **E2E for critical flows:** At least one E2E path for “admin publishes article → static page appears” (or equivalent) to validate the full pipeline; can be added after core units/integration are in place.

### 6.2 In Scope for TDD

| Area | What to test first (examples) |
|------|------------------------------|
| **Manifest** | Append/update/remove entry; ordering by `published_at`; listing page HTML generation from manifest. |
| **Publish pipeline** | Given document id, fetch single item from Sanity API (mocked); generate one article page + updated manifest + listing pages; no full dataset read. |
| **GitHub API** | Create/update/delete file with correct path, message, and (when updating) `sha`; only changed paths are sent. |
| **Validation** | Article/recommendation required fields, slug format, ticker format. |
| **Auth** | Sanity Studio login; pipeline trigger (`repository_dispatch`) uses GitHub token (mocked in tests). |
| **Static output** | Generated HTML contains expected title, slug, and safe-escaped content; listing page includes new item. |

### 6.3 Out of Scope (or Minimal)

- **UI look-and-feel** (e.g. pixel-perfect layout): optional visual or snapshot tests; not required for TDD.
- **Third-party chart API:** mock in tests; no TDD obligation for the external service itself.
- **Sanity/GitHub internals:** treat as infrastructure; test our usage, not their code.

### 6.4 Tooling

- Choose a test runner and assertion library (e.g. Jest, Vitest, or Node built-in) and use it consistently for unit and integration tests.
- E2E: Playwright, Cypress, or similar; at least one pipeline E2E as above.
- Tests must run in CI (e.g. on every push/PR); document commands in README (e.g. `npm test`, `npm run test:e2e`).

---

## 7. Document History

- **v1** – Initial feature list from planning: product scope, admin, static generation, incremental publish, manifest (Option B), GitHub API (Option 2), Vercel + Supabase + Git.
- **v2** – Added §6 Test Driven Development (TDD): principles, in-scope areas, out-of-scope, tooling.
- **v3** – CMS switched from Supabase to **Sanity** (hosted): content, Sanity Studio, and assets on Sanity; trigger via Sanity webhook; portable text or HTML stored; no server to host.
- **v4** – Removed Vercel: **GitHub Actions** run the publish pipeline (triggered by Sanity webhook via `repository_dispatch`); **GitHub Pages** serves the static site from the repo branch.
- **v5** – Feature list aligned with current architecture: added architecture summary at top; explicit GitHub Actions + GitHub Pages throughout; static delivery and hosting clarified; TDD auth scope updated; link to ARCHITECTURE for file layout.

---

*This document is the single feature list for the **Long Term Picks USA** project. Implementation should follow this scope, technical choices, and TDD approach.*
