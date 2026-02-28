# Long-Term Stocks – Component & Architecture Diagrams

**Site name:** LongTermPicksUSA.

Diagrammatic view of the system components and flows. Diagrams use [Mermaid](https://mermaid.js.org/) and render on GitHub and in many Markdown viewers.

---

## 1. High-Level Components

```mermaid
flowchart TB
    subgraph humans["People"]
        Admin["Admin / Editor"]
        User["End User"]
    end

    subgraph sanity["Sanity (hosted)"]
        Studio["Sanity Studio\n(admin UI)"]
        API["Sanity API\n(content + assets)"]
        Studio --> API
    end

    subgraph pipeline["Publish Pipeline (GitHub Actions)"]
        Webhook["repository_dispatch\n(Sanity webhook)"]
        Generator["Static Generator\n(one page + manifest + listings)"]
        GitHubAPI["GitHub API client\n(PUT/DELETE files)"]
        Webhook --> Generator --> GitHubAPI
    end

    subgraph git["GitHub"]
        Repo["Output repo / branch\n(static HTML + manifest.json)"]
        Pages["GitHub Pages\n(serves static site)"]
    end

    subgraph external["External"]
        ChartAPI["Chart / quote API\n(e.g. Yahoo, Alpha Vantage)"]
    end

    Admin -->|"edit & publish"| Studio
    Studio -->|"on publish"| Webhook
    Generator -->|"fetch one document"| API
    Generator -->|"read manifest"| Repo
    GitHubAPI -->|"push changed files"| Repo
    Repo --> Pages
    User -->|"request page"| Pages
    Pages -->|"optional: chart data"| ChartAPI
```

**Summary:** Admin uses Sanity Studio; on publish a webhook triggers a **GitHub Actions** workflow, which fetches one document from Sanity, updates the manifest, generates static files, and pushes only changed files to the repo; **GitHub Pages** serves the site from that branch; end users hit GitHub Pages only (Sanity not hit on read).

---

## 2. Publish Flow (Sequence)

When admin publishes one article or recommendation:

```mermaid
sequenceDiagram
    participant Admin
    participant Studio as Sanity Studio
    participant Sanity as Sanity API
    participant Webhook as Sanity webhook
    participant Actions as GitHub Actions
    participant GitHub as GitHub API
    participant Repo as Output repo
    participant Pages as GitHub Pages

    Admin->>Studio: Publish document
    Studio->>Sanity: Document saved (published)
    Studio->>Webhook: Webhook fired
    Webhook->>Actions: repository_dispatch (document id, slug)
    Actions->>GitHub: GET manifest.json (get SHA)
    GitHub-->>Actions: manifest content + SHA
    Actions->>Sanity: GET document by id (single doc only)
    Sanity-->>Actions: document (full content)
    Note over Actions: Append to manifest,<br/>generate 1 HTML page + listing pages
    Actions->>GitHub: PUT articles/{slug}.html (new)
    Actions->>GitHub: PUT manifest.json (updated, with SHA)
    Actions->>GitHub: PUT articles/index.html (updated, with SHA)
    Actions->>GitHub: PUT index.html (if needed, with SHA)
    GitHub->>Repo: Commit & push
    Note over Repo,Pages: GitHub Pages serves from branch
    Pages->>Pages: Serve updated static files
```

**Summary:** Single document is read from Sanity; GitHub Actions pushes only new/changed files to the repo; GitHub Pages serves the branch; no full-site regenerate.

---

## 3. End-User Request Flow

When a visitor opens the site (no CMS hit):

```mermaid
sequenceDiagram
    participant User
    participant Pages as GitHub Pages
    participant ChartAPI as Chart / quote API

    User->>Pages: GET /articles/my-article
    Pages-->>User: Static HTML
    Note over User,Pages: No call to Sanity

    User->>Pages: GET /recommendations/aapl
    Pages-->>User: Static HTML
    User->>ChartAPI: (optional) Chart data for AAPL
    ChartAPI-->>User: Price / chart data
```

**Summary:** Pages are static; GitHub Pages serves them. Sanity is not in the request path. Charts can be loaded client-side from a third-party API.

---

## 4. Component Breakdown

```mermaid
flowchart LR
    subgraph cms["CMS"]
        A1[Sanity Studio]
        A2[Sanity API]
        A3[Assets]
    end

    subgraph app["Pipeline (GitHub Actions)"]
        B1[Webhook → repository_dispatch]
        B2[Manifest updater]
        B3[HTML generator]
        B4[GitHub API client]
    end

    subgraph store["Storage & Serving"]
        C1[GitHub repo\ngh-pages / output branch]
        C2[manifest.json]
        D1[GitHub Pages]
        D2[Static HTML]
    end

    A1 --> A2
    B1 --> B2
    B2 --> B3
    B3 --> B4
    B4 --> C1
    C1 --> D1
    D1 --> D2
    A2 -.->|"only at publish"| B1
```

| Component | Responsibility |
|-----------|----------------|
| **Sanity Studio** | Admin UI; create/edit/publish articles & recommendations; upload assets. |
| **Sanity API** | Source of truth for content and asset URLs; called only by pipeline (and Studio). |
| **Webhook → repository_dispatch** | Sanity webhook triggers GitHub Actions workflow (e.g. via GitHub API `repository_dispatch`); passes document id/slug. |
| **Manifest updater** | Reads/updates `manifest.json` (append or update one entry); no full content read from Sanity for listings. |
| **HTML generator** | Builds one article/recommendation page + listing pages from manifest; sanitises HTML. |
| **GitHub API client** | PUT/DELETE only changed paths; uses SHA for updates. |
| **GitHub repo (output)** | Holds static HTML files and manifest; branch served by GitHub Pages. |
| **GitHub Pages** | Serves static site from the configured branch; no separate deploy. |

---

## 5. Data Flow (Manifest & Static Output)

```mermaid
flowchart TD
    Sanity["Sanity\n(one document)"]
    Manifest["manifest.json\n(slugs, titles, excerpts, dates)"]
    Listings["articles/index.html\nindex.html"]
    Page["articles/{slug}.html\nor recommendations/{slug}.html"]

    Sanity -->|"1. Fetch single doc"| Pipeline
    Repo["Output repo"] -->|"2. Read current"| Manifest
    Pipeline["Pipeline"] -->|"3. Append/update entry"| Manifest
    Manifest -->|"4. Generate from list"| Listings
    Sanity -->|"5. Full content"| Page
    Pipeline -->|"6. Write"| Repo
    Manifest --> Repo
    Listings --> Repo
    Page --> Repo
```

**Summary:** Pipeline fetches one document from Sanity and current manifest from repo; updates manifest; generates one detail page (from Sanity) and listing pages (from manifest); writes only changed files to the repo.

---

## 6. File Layout in Output Repo

```
output branch (or site-output repo)
├── index.html
├── manifest.json
├── articles/
│   ├── index.html
│   ├── article-slug-1.html
│   └── article-slug-2.html
└── recommendations/
    ├── index.html
    ├── aapl.html
    └── msft.html
```

---

*Diagrams align with the feature list (Sanity, GitHub Actions, incremental publish, manifest in repo, GitHub API, GitHub Pages).*
