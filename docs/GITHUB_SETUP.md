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

The workflow needs your Sanity project and dataset (and uses `GITHUB_TOKEN` automatically).

1. Repo → **Settings** → **Secrets and variables** → **Actions**.
2. **New repository secret** for each:

| Name               | Value              | Notes                          |
|--------------------|--------------------|--------------------------------|
| `SANITY_PROJECT_ID`| `zobf7okj`         | Your Sanity project ID         |
| `SANITY_DATASET`   | `production`       | Your dataset name              |

---

## 6. Configure the Sanity webhook (trigger pipeline on publish)

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
   - **Projection:** (optional)  
     `{ _id, _type, "slug": slug.current }`  
     to send minimal payload.
   - **HTTP method:** POST.
   - **API version:** leave default.

3. **Headers** (required so GitHub accepts the request):
   - **Authorization:** `Bearer YOUR_GITHUB_PAT`  
     Use a [Personal Access Token](https://github.com/settings/tokens) with scope `repo`. Create a fine-grained token with “Contents” read/write and “Metadata” read if you prefer.
   - **Accept:** `application/vnd.github.v3+json`

4. **Body** (custom payload for `repository_dispatch`):
   ```json
   {
     "event_type": "sanity-publish",
     "client_payload": {
       "documentId": "{_id}",
       "type": "{_type}"
     }
   }
   ```
   Use the exact placeholders `{_id}` and `{_type}` so Sanity substitutes the document id and type.

5. Save the webhook.

After this, when you **publish** an article or stock recommendation in [LongTermPicksUSA Studio](https://longtermpicksusa.sanity.studio/), Sanity will POST to GitHub, the **Publish to GitHub Pages** workflow will run, and the static site on `gh-pages` (and thus GitHub Pages) will update.

---

## 7. Summary

| Step | What you did |
|------|----------------|
| 1 | Created a new GitHub repo. |
| 2 | Pushed the project (root with `.github`, `scripts`, `docs`, `studio-stock-recommendations`) to `main`. |
| 3 | Created `gh-pages` branch with initial `manifest.json`. |
| 4 | Enabled GitHub Pages from `gh-pages`. |
| 5 | Set `SANITY_PROJECT_ID` and `SANITY_DATASET` in repo secrets. |
| 6 | Added a Sanity webhook that calls GitHub `repository_dispatch` with `documentId` and `type`. |

**Test:** Publish an article or recommendation in the Studio; check the **Actions** tab for the “Publish to GitHub Pages” workflow run; then open `https://YOUR_USERNAME.github.io/YOUR_REPO/`.
