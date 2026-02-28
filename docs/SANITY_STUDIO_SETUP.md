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

**Local build/preview (this repo):** To run `npm run build:local` or `npm run preview`, set Sanity env vars. Copy `.env.example` to `.env` in the project root and set `SANITY_PROJECT_ID` and `SANITY_DATASET` (get them from [sanity.io/manage](https://sanity.io/manage)). The publish script loads `.env` automatically. Stock quotes on recommendation pages use Yahoo Finance via a CORS proxy (no API key).

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

## 4. Adding a new schema (document type) from local

When you want a new content type (e.g. a new kind of document), do it locally then deploy the Studio.

### Step 1: Run Studio locally

```bash
cd studio-stock-recommendations
npm run dev
```

Open **http://localhost:3333** and leave it running while you edit.

### Step 2: Create the schema file

In `studio-stock-recommendations/schemaTypes/`, add a new file (e.g. `myNewType.ts`):

```ts
import { defineField, defineType } from 'sanity'

export const myNewType = defineType({
  name: 'myNewType',        // internal ID (e.g. used in GROQ)
  title: 'My New Type',     // label in Studio
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      type: 'string',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'slug',
      type: 'slug',
      options: { source: 'title' },
    }),
    // add more fields as needed
  ],
})
```

### Step 3: Register the schema

In `studio-stock-recommendations/schemaTypes/index.ts` (or wherever your schema list lives), import and add the new type to the array:

```ts
import { myNewType } from './myNewType'

export const schemaTypes = [
  // ... existing types (article, stockRecommendation, etc.)
  myNewType,
]
```

If the project uses `sanity.config.ts` with a `schema` that lists types, add `myNewType` there instead.

### Step 4: Check in Studio

Save the files. The Studio in the browser should reload and show the new type in the desk (e.g. “My New Type”). Create a document to confirm.

### Step 5: Deploy the Studio

So the hosted Studio has the new type too:

```bash
cd studio-stock-recommendations
npx sanity deploy
```

After deploy, **https://longtermpicksusa.sanity.studio** will show the new schema.

### Step 6: (Optional) Use the new type in the site

If you want the new type to appear on the static site (e.g. a new listing and detail pages), you need to update the **publish pipeline** in this repo:

- **`scripts/publish.js`** – Add support for the new type: extend the Sanity query to fetch its fields, add a `manifestEntry` branch, add a builder (e.g. `buildMyNewTypeHtml`) and template, and include it in the manifest and in full-rebuild logic.
- **`templates/`** – Add an EJS template for the new type’s detail page and any listing row/card.
- **`.github/workflows/publish.yml`** – If the workflow passes `documentType`, allow the new type (e.g. `myNewType`) and ensure the webhook sends it when documents of that type are published.

So: **schema in Studio = content model in Sanity**. **Pipeline + templates = how that content becomes HTML on the site.** Add the schema first, then wire the pipeline when you want it on the site.

---

## 5. Editing an existing schema from local

To change an existing document type (e.g. add a field to **article** or **stockRecommendation**), edit the schema locally and then deploy.

### Step 1: Run Studio locally

```bash
cd studio-stock-recommendations
npm run dev
```

Open **http://localhost:3333** so you can see changes as you edit.

### Step 2: Edit the schema file

Open the right file in `studio-stock-recommendations/schemaTypes/`:

- **Article** → `article.ts`
- **Stock recommendation** → `stockRecommendation.ts`

Change what you need: add or remove fields, change `title`/`name`, add `validation`, adjust `options`, etc. For example, to add a new field to articles:

```ts
defineField({
  name: 'subtitle',
  type: 'string',
  title: 'Subtitle',
}),
```

Save the file. The Studio in the browser will hot-reload and show the updated form.

### Step 3: Check in Studio

Open an existing document of that type (or create one) and confirm the new or changed fields behave as expected. Fix any validation or TypeScript errors.

### Step 4: Deploy the Studio

So the hosted Studio gets the updated schema:

```bash
cd studio-stock-recommendations
npx sanity deploy
```

After deploy, **https://longtermpicksusa.sanity.studio** will use the new schema. Existing documents keep their data; new/changed fields may be empty until editors fill them.

### Step 5: (Optional) Use new fields on the site

If you added or changed fields that should appear on the static site, update the **publish pipeline** in this repo:

- **`scripts/publish.js`** – Extend the Sanity query to request the new fields, and update `manifestEntry` / the HTML builders (e.g. `buildArticleHtml`, `buildStockRecommendationHtml`) or templates to use them.
- **`templates/`** – Update the relevant EJS template to output the new field (e.g. subtitle, new meta line).

Existing content will be re-fetched on the next publish; the new fields will appear once they’re present in the API response.

---

## 6. Summary

| Goal | What to do |
|------|------------|
| Create the studio (once) | Run the `npm create sanity@latest ...` command above. |
| Edit content every day | Deploy with `npx sanity deploy`, then use **https://longtermpicksusa.sanity.studio/** in the browser. |
| **Add a new schema** | Run `npm run dev` locally, add a file in `schemaTypes/`, register it (e.g. in `schemaTypes/index.ts`), then `npx sanity deploy`. See **§4** above. |
| **Edit an existing schema** | Run `npm run dev` locally, edit the type’s file in `schemaTypes/` (e.g. `article.ts`, `stockRecommendation.ts`), then `npx sanity deploy`. See **§5** above. |
| Change schema or Studio code | Run `npm run dev` locally, edit, then run `npx sanity deploy` again. |

When you publish content from the hosted Studio, the GitHub Actions pipeline (once configured) will generate static pages and push to the repo; GitHub Pages will serve the site.

---

## Troubleshooting

- **Unsupported engine / ERR_REQUIRE_ESM:** Upgrade Node to 22.12+ (or use a supported 20.x LTS). Check with `node -v`.
- **Port 3333 in use:** Set `PORT=3334 npm run dev` (or another port).
- **Project not found:** Confirm project ID `zobf7okj` and dataset `production` in [sanity.io/manage](https://sanity.io/manage).
