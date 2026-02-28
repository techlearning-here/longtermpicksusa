# Sanity Studio Setup

Steps to create Sanity Studio and how to use it **without running it locally** after the first deploy.

**Project ID:** `zobf7okj`  
**Dataset:** `production`

---

## Do I have to run Studio locally?

**No.** Running locally is only for:

1. **First-time setup** – Create the studio (schema + app) with the CLI.
2. **Development** – Changing document types or Studio code.

For **day-to-day editing** (adding articles, recommendations), you **deploy** the studio once to Sanity’s hosting. After that you open a URL in your browser (e.g. `https://yourname.sanity.studio`) and log in – no local run needed.

**Sanity’s website:** [sanity.io/manage](https://sanity.io/manage) is the **project dashboard** (settings, API keys, users). The **content editor** (Studio) is the app you create and then deploy; Sanity hosts it at `*.sanity.studio` after you run `sanity deploy`.

---

## Prerequisites

- **Node.js:** Sanity CLI expects `>=20.19 <22` or `>=22.12`. If you see engine/ESM errors, upgrade Node (e.g. to 22.12+).
- npm (or pnpm/yarn).

---

## 1. Create the Studio (first time only)

From the **project root** (`longtermstocks`):

```bash
npm create sanity@latest -- --project zobf7okj --dataset production --template clean --typescript --output-path studio-stock-recommendations
```

This creates the folder `studio-stock-recommendations` with a TypeScript Sanity Studio wired to your project and dataset.

---

## 2. Run Studio locally (optional – for development)

```bash
cd studio-stock-recommendations
npm run dev
```

Studio runs at **http://localhost:3333**. Use this when you’re changing the schema or Studio code. Log in with the same identity you used when creating the Sanity project (Google, GitHub, or email).

---

## 3. Deploy Studio so you can use it in the browser (no local run)

From inside `studio-stock-recommendations`:

```bash
cd studio-stock-recommendations
npx sanity deploy
```

On first deploy you’ll be asked for a **hostname** (e.g. `longtermstocks`). Sanity will host the studio at:

**https://&lt;hostname&gt;.sanity.studio**

Open that URL in your browser, log in, and edit content. You don’t need to run `npm run dev` again unless you’re changing the schema or Studio code.

**Live Studio (this project):** [https://longtermpicksusa.sanity.studio/](https://longtermpicksusa.sanity.studio/)

(Optional: set `studioHost` in `sanity.cli.ts` so you don’t get prompted for the hostname on later deploys.)

---

## 4. Summary

| Goal | What to do |
|------|------------|
| Create the studio (once) | Run the `npm create sanity@latest ...` command above. |
| Edit content every day | Deploy with `npx sanity deploy`, then use **https://longtermpicksusa.sanity.studio/** in the browser. |
| Change schema or Studio code | Run `npm run dev` locally, edit, then run `npx sanity deploy` again. |

When you publish content from the hosted Studio, the GitHub Actions pipeline (once configured) will generate static pages and push to the repo; GitHub Pages will serve the site.

---

## Troubleshooting

- **Unsupported engine / ERR_REQUIRE_ESM:** Upgrade Node to 22.12+ (or use a supported 20.x LTS). Check with `node -v`.
- **Port 3333 in use:** Set `PORT=3334 npm run dev` (or another port).
- **Project not found:** Confirm project ID `zobf7okj` and dataset `production` in [sanity.io/manage](https://sanity.io/manage).
