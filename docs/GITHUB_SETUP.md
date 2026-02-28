# GitHub Setup – LongTermPicksUSA

Wire up the repo, GitHub Pages, and the Sanity webhook so that when you publish in the Studio, the static site updates automatically.

---

## 1. Create the GitHub repository

1. Go to [github.com/new](https://github.com/new).
2. **Repository name:** e.g. `longtermpicksusa` (or `longtermstocks`).
3. **Visibility:** Public (required for GitHub Pages free tier).
4. Do **not** add a README, .gitignore, or license (you already have local files).
5. Click **Create repository**.

---

## 2. Push your local project to GitHub

From your machine, in the **project root** (`longtermstocks`):

```bash
cd /Users/vinod.krishnankuttychandrika/work/myproject/ai_experiments/longtermstocks

# If this folder is not yet a git repo:
git init

# Add the GitHub repo as remote (replace YOUR_USERNAME and YOUR_REPO with your GitHub username and repo name)
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git

# Add and commit
git add .
git commit -m "Initial commit: Sanity Studio, pipeline, docs"

# Push (creates main branch)
git push -u origin main
```

If the folder is already a git repo (e.g. only `studio-stock-recommendations` was in git), run from the **parent** `longtermstocks` directory so the root has the `.github`, `scripts`, and `docs` you added. Then add the root as the repo and push.

---

## 3. Create the `gh-pages` branch (required before first publish)

The publish pipeline pushes to the `gh-pages` branch. That branch must exist before the first run.

**Option A – From GitHub website**

1. Open your repo on GitHub.
2. Click the branch dropdown (e.g. “main”), type `gh-pages`, click **Create branch: gh-pages**.
3. You’re now on `gh-pages` with no files. Add an initial file so the branch has a commit:
   - Click **Add file** → **Create new file**.
   - Name: `manifest.json`.
   - Content:
     ```json
     {"articles":[],"recommendations":[],"updatedAt":""}
     ```
   - Click **Commit new file**.

**Option B – From command line**

```bash
git checkout --orphan gh-pages
git rm -rf . 2>/dev/null || true
echo '{"articles":[],"recommendations":[],"updatedAt":""}' > manifest.json
git add manifest.json
git commit -m "Initialize gh-pages"
git push -u origin gh-pages
git checkout main
```

---

## 4. Enable GitHub Pages

1. In your repo: **Settings** → **Pages**.
2. **Source:** Deploy from a branch.
3. **Branch:** `gh-pages` / **Folder:** `/ (root)**.
4. Save. The site will be at `https://YOUR_USERNAME.github.io/YOUR_REPO/`.

---

## 5. Add repository secrets

The workflow needs your Sanity project, dataset, and a **GitHub token with write access** (the default `GITHUB_TOKEN` often cannot write when the workflow is triggered by `repository_dispatch`).

1. Repo → **Settings** → **Secrets and variables** → **Actions**.
2. **New repository secret** for each:

| Name               | Value              | Notes                          |
|--------------------|--------------------|--------------------------------|
| `SANITY_PROJECT_ID`| `zobf7okj`         | Your Sanity project ID         |
| `SANITY_DATASET`   | `production`       | Your dataset name              |
| `GH_PAT`           | *(see below)*      | GitHub token to push to repo   |

**Create `GH_PAT`:**

1. GitHub → **Settings** (your profile) → **Developer settings** → **Personal access tokens** → **Tokens (classic)** or **Fine-grained tokens**.
2. **Classic:** Create a token with scope **`repo`** (full control of private repositories). **Fine-grained:** Create a token for this repository with permission **Contents: Read and write**.
3. Copy the token and add it as repo secret **`GH_PAT`** (Actions → Secrets).

The publish workflow uses `GH_PAT` to push files to the `gh-pages` branch.

---

## 6. Configure the Sanity webhook (trigger pipeline on publish)

### Where to find Webhooks in Sanity

1. Go to [sanity.io/manage](https://sanity.io/manage) and **select your project** (e.g. project ID `zobf7okj`).
2. In the **left sidebar**, open **API** (or **Project API** / **Developer**).
3. Under **API**, look for **Webhooks** (or **Hooks**). If you don’t see it, try **Integrations** or the project **Settings** (gear) and then **API** → **Webhooks**.

If Webhooks still doesn’t appear, use the **CLI option** at the end of this section.

### Create the webhook (in the dashboard)

1. Go to [sanity.io/manage](https://sanity.io/manage) → your project → **API** → **Webhooks**.
2. **Create webhook**:
   - **Name:** e.g. `GitHub Publish`.
   - **URL:**  
     `https://api.github.com/repos/YOUR_USERNAME/YOUR_REPO/dispatches`  
     (replace `YOUR_USERNAME` and `YOUR_REPO` with your GitHub repo).
   - **Trigger:** **Create**, **Update**, **Delete** (or only Create + Update if you prefer).
   - **Filter:**  
     `_type in ["article", "stockRecommendation"]`  
     so only those document types trigger the pipeline.
   - **Projection** (this is the **request body** GitHub receives): paste the GROQ below. It shapes the payload into the format GitHub `repository_dispatch` expects (`event_type` + `client_payload`).
   - **HTTP method:** POST.
   - **API version:** leave default.

3. **Advanced settings** (HTTP method, headers, API version, Drafts, Versions, Secret):
   - **HTTP method:** **POST**.
   - **HTTP headers:** Add two rows: **Name** `Authorization`, **Value** `Bearer YOUR_GITHUB_PAT`; **Name** `Accept`, **Value** `application/vnd.github.v3+json`. Use a GitHub [Personal Access Token](https://github.com/settings/tokens) with scope `repo`.
   - **API version:** Leave default (e.g. v2021-03-25).
   - **Drafts:** Leave **OFF** — do not check “Trigger webhook when drafts are modified”. You want the webhook only when a document is **published**.
   - **Versions:** Leave **OFF** — do not check “Trigger webhook when versions are modified”.
   - **Secret:** Leave empty (optional).

4. **Body (Projection):** In the webhook form, the **Projection** field defines the JSON body sent to GitHub. Paste this **GROQ projection** so the payload matches `repository_dispatch`:

   ```groq
   {
     "event_type": "sanity-publish",
     "client_payload": {
       "documentId": _id,
       "type": _type
     }
   }
   ```

   - `_id` and `_type` are the triggered document’s id and type (article or stockRecommendation).
   - Our workflow reads `github.event.client_payload.documentId` and `github.event.client_payload.type`; the projection above provides those keys.

5. Save the webhook.

### Alternative: Create webhook via Sanity CLI

If **Webhooks** does not appear under API, create the webhook from the studio folder:

```bash
cd studio-stock-recommendations
npx sanity hook create
```

Use URL = `https://api.github.com/repos/YOUR_USERNAME/YOUR_REPO/dispatches`, trigger = create/update, filter = `_type in ["article", "stockRecommendation"]`, HTTP method = POST. Add **Authorization** and **Accept** headers when prompted (or in the dashboard after creation). Set the request body in the dashboard if the CLI doesn’t support it.

After this, when you **publish** an article or stock recommendation in [LongTermPicksUSA Studio](https://longtermpicksusa.sanity.studio/), Sanity will POST to GitHub, the **Publish to GitHub Pages** workflow will run, and the static site on `gh-pages` will update.

---

## 7. Troubleshooting: 403 "Resource not accessible by integration"

If the publish workflow fails with **403** on `GitHub PUT ...`:

1. **Use a new run, not Re-run**  
   **Re-run** uses the workflow from the **original run’s commit**. If that commit still had `GITHUB_TOKEN`, the re-run keeps using it and gets 403.  
   - **Fix:** Trigger a **new** run: either **publish again from Sanity** (same or another document) or use **Run workflow** (see below). Do not rely on Re-run until the run was created from a commit that already uses `GH_PAT`.

2. **Confirm the `GH_PAT` secret**  
   Repo → **Settings** → **Secrets and variables** → **Actions**. Ensure **`GH_PAT`** exists and is a Personal Access Token (classic) with **`repo`** scope (or a fine-grained token with **Contents: Read and write** for this repo).

3. **Run workflow manually (latest code)**  
   The workflow supports **workflow_dispatch**, so you can start a run from the Actions tab with the latest workflow from `main`:  
   - **Actions** → **Publish to GitHub Pages** → **Run workflow** → choose branch **main** → fill **Document ID** (e.g. `91837bc7-d54e-4313-8eea-3ecf006f7ba8`) and **Document type** (e.g. `stockRecommendation`) → **Run workflow**.  
   That run uses the workflow file from `main` (including `GH_PAT`), so you can verify the token without publishing from Sanity again.

---

## 8. Summary

| Step | What you did |
|------|----------------|
| 1 | Created a new GitHub repo. |
| 2 | Pushed the project (root with `.github`, `scripts`, `docs`, `studio-stock-recommendations`) to `main`. |
| 3 | Created `gh-pages` branch with initial `manifest.json`. |
| 4 | Enabled GitHub Pages from `gh-pages`. |
| 5 | Set `SANITY_PROJECT_ID`, `SANITY_DATASET`, and `GH_PAT` in repo secrets. |
| 6 | Added a Sanity webhook that calls GitHub `repository_dispatch` with `documentId` and `type`. |

**Test:** Publish an article or recommendation in the Studio; check the **Actions** tab for the “Publish to GitHub Pages” workflow run; then open `https://YOUR_USERNAME.github.io/YOUR_REPO/`. Or use **Actions** → **Publish to GitHub Pages** → **Run workflow** to run with the latest workflow and test `GH_PAT`.
