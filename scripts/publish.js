/**
 * Publish pipeline: fetch one document from Sanity, update manifest, generate static HTML, push to GitHub (gh-pages).
 * Run with env: SANITY_PROJECT_ID, SANITY_DATASET, GITHUB_TOKEN, DOCUMENT_ID, DOCUMENT_TYPE, GITHUB_REPOSITORY.
 */

const {createClient} = require('@sanity/client')
const {toHTML} = require('@portabletext/to-html')

const BRANCH = 'gh-pages'
const SITE_TITLE = 'LongTermPicksUSA'

/** Base path for GitHub Project Pages (e.g. /longtermpicksusa). Empty for user/org site (username.github.io). */
function getBasePath(repo) {
  const parts = repo.split('/')
  const reponame = parts[1] || ''
  if (reponame === '' || reponame.endsWith('.github.io')) return ''
  return '/' + reponame
}

function getEnv(name) {
  const v = process.env[name]
  if (!v) throw new Error(`Missing env: ${name}`)
  return v
}

function escapeHtml(s) {
  if (s == null || s === '') return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

async function fetchSanityDocument(projectId, dataset, documentId) {
  const client = createClient({projectId, dataset, useCdn: true, apiVersion: '2024-01-01'})
  const id = documentId.replace(/^drafts\./, '')
  const query = `*[_id == $id || _id == "drafts." + $id][0]{ _id, _type, title, slug, body, excerpt, featuredImage, category, publishedAt, ticker, companyName, recommendationType, targetPrice, timeHorizon, reasons, image }`
  const doc = await client.fetch(query, {id})
  if (!doc) throw new Error(`Document not found: ${documentId}`)
  return doc
}

function portableTextToHtml(blocks) {
  if (!blocks || !Array.isArray(blocks) || blocks.length === 0) return ''
  try {
    return toHTML(blocks, {components: {}})
  } catch {
    return blocks.map((b) => (b.children ? b.children.map((c) => c.text).join('') : '')).join('')
  }
}

function getSlug(doc) {
  const s = doc.slug
  return (s && (typeof s === 'string' ? s : s.current)) || doc.ticker || doc._id?.replace(/^drafts\./, '') || 'untitled'
}

function buildArticleHtml(doc, siteTitle, basePath) {
  const slug = getSlug(doc)
  const title = doc.title || 'Untitled'
  const bodyHtml = portableTextToHtml(doc.body)
  const excerpt = escapeHtml(doc.excerpt || '')
  const published = doc.publishedAt ? new Date(doc.publishedAt).toISOString() : ''
  const base = basePath || ''
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} | ${escapeHtml(siteTitle)}</title>
  <meta name="description" content="${excerpt}">
  ${published ? `<meta name="date" content="${published}">` : ''}
</head>
<body>
  <nav><a href="${base}/">Home</a> | <a href="${base}/articles/">Articles</a> | <a href="${base}/recommendations/">Recommendations</a></nav>
  <article>
    <header><h1>${escapeHtml(title)}</h1></header>
    <div class="content">${bodyHtml}</div>
  </article>
</body>
</html>`
}

function buildStockRecommendationHtml(doc, siteTitle, basePath) {
  const slug = getSlug(doc)
  const title = doc.companyName || doc.ticker || 'Untitled'
  const ticker = doc.ticker || ''
  const reasonsHtml = portableTextToHtml(doc.reasons)
  const recommendationType = doc.recommendationType || ''
  const targetPrice = doc.targetPrice != null ? doc.targetPrice : ''
  const timeHorizon = escapeHtml(doc.timeHorizon || '')
  const published = doc.publishedAt ? new Date(doc.publishedAt).toISOString() : ''
  const base = basePath || ''
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} (${escapeHtml(ticker)}) | ${escapeHtml(siteTitle)}</title>
  ${published ? `<meta name="date" content="${published}">` : ''}
</head>
<body>
  <nav><a href="${base}/">Home</a> | <a href="${base}/articles/">Articles</a> | <a href="${base}/recommendations/">Recommendations</a></nav>
  <article>
    <header><h1>${escapeHtml(title)} (${escapeHtml(ticker)})</h1></header>
    <p><strong>Recommendation:</strong> ${escapeHtml(recommendationType)}</p>
    ${targetPrice !== '' ? `<p><strong>Target price:</strong> $${escapeHtml(String(targetPrice))}</p>` : ''}
    ${timeHorizon ? `<p><strong>Time horizon:</strong> ${timeHorizon}</p>` : ''}
    <div class="reasons">${reasonsHtml}</div>
    <p><em>Chart for ${escapeHtml(ticker)} can be loaded here via a third-party API.</em></p>
  </article>
</body>
</html>`
}

function buildListingHtml(manifest, type, siteTitle, basePath) {
  const items = type === 'article' ? (manifest.articles || []) : (manifest.recommendations || [])
  const base = (basePath || '') + (type === 'article' ? '/articles' : '/recommendations')
  const title = type === 'article' ? 'Articles' : 'Stock Recommendations'
  const list = items
    .sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0))
    .map(
      (item) =>
        `    <li><a href="${base}/${escapeHtml(item.slug)}.html">${escapeHtml(item.title)}</a></li>`
    )
    .join('\n')
  const b = basePath || ''
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} | ${escapeHtml(siteTitle)}</title>
</head>
<body>
  <h1>${escapeHtml(siteTitle)}</h1>
  <nav><a href="${b}/">Home</a> | <a href="${b}/articles/">Articles</a> | <a href="${b}/recommendations/">Recommendations</a></nav>
  <h2>${title}</h2>
  <ul>
${list}
  </ul>
</body>
</html>`
}

function formatRecommendationDate(isoDate) {
  if (!isoDate) return '—'
  const d = new Date(isoDate)
  return d.toLocaleDateString('en-US', {year: 'numeric', month: 'short', day: 'numeric'})
}

function buildIndexHtml(manifest, siteTitle, basePath) {
  const recommendations = (manifest.recommendations || [])
    .sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0))
    .slice(0, 10)
  const b = basePath || ''

  const rows = recommendations.length
    ? recommendations
        .map(
          (r) => {
            const recType = (r.recommendationType || '').toLowerCase()
            const isBuy = recType === 'buy'
            const badgeClass = isBuy ? 'badge-buy' : recType === 'sell' ? 'badge-sell' : 'badge-neutral'
            const targetStr =
              r.targetPrice != null && r.targetPrice !== '' ? `$${Number(r.targetPrice).toLocaleString()}` : '—'
            const dateStr = formatRecommendationDate(r.publishedAt)
            const detailUrl = `${b}/recommendations/${escapeHtml(r.slug)}.html`
            return `    <tr>
      <td class="col-ticker"><a href="${detailUrl}" class="link-ticker">${escapeHtml(r.ticker || '—')}</a></td>
      <td class="col-company">${escapeHtml(r.title || '—')}</td>
      <td class="col-rec"><span class="badge ${badgeClass}">${escapeHtml(r.recommendationType || '—')}</span></td>
      <td class="col-date">${escapeHtml(dateStr)}</td>
      <td class="col-target">${escapeHtml(targetStr)}</td>
      <td class="col-horizon">${escapeHtml(r.timeHorizon || '—')}</td>
      <td class="col-action"><a href="${detailUrl}" class="link-view">View</a></td>
    </tr>`
          }
        )
        .join('\n')
    : `    <tr><td colspan="7" class="empty-state">No recommendations yet.</td></tr>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(siteTitle)}</title>
  <style>
    :root { --bg: #f8f9fa; --card: #fff; --text: #1a1a1a; --muted: #5c5c5c; --accent: #0d6efd; --buy: #198754; --sell: #dc3545; --border: #dee2e6; }
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; margin: 0; background: var(--bg); color: var(--text); line-height: 1.5; }
    .site-header { background: var(--card); border-bottom: 1px solid var(--border); padding: 1rem 1.5rem; }
    .site-title { font-size: 1.5rem; font-weight: 700; margin: 0 0 0.25rem 0; }
    .site-tagline { font-size: 0.9rem; color: var(--muted); margin: 0; }
    nav { margin-top: 0.75rem; }
    nav a { color: var(--accent); text-decoration: none; margin-right: 1rem; }
    nav a:hover { text-decoration: underline; }
    .main { max-width: 960px; margin: 0 auto; padding: 1.5rem; }
    .section-title { font-size: 1.25rem; font-weight: 600; margin: 0 0 1rem 0; }
    .table-wrap { background: var(--card); border-radius: 8px; border: 1px solid var(--border); overflow: hidden; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 0.75rem 1rem; text-align: left; border-bottom: 1px solid var(--border); }
    th { font-weight: 600; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.02em; color: var(--muted); background: var(--bg); }
    tr:last-child td { border-bottom: 0; }
    .col-ticker { font-weight: 600; }
    .link-ticker { color: var(--text); text-decoration: none; }
    .link-ticker:hover { color: var(--accent); text-decoration: underline; }
    .badge { display: inline-block; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.8rem; font-weight: 600; }
    .badge-buy { background: #d1e7dd; color: var(--buy); }
    .badge-sell { background: #f8d7da; color: var(--sell); }
    .badge-neutral { background: var(--bg); color: var(--muted); }
    .link-view { color: var(--accent); text-decoration: none; font-weight: 500; }
    .link-view:hover { text-decoration: underline; }
    .empty-state { color: var(--muted); font-style: italic; text-align: center; }
    .footer-links { margin-top: 1.5rem; font-size: 0.9rem; }
    .footer-links a { color: var(--accent); text-decoration: none; margin-right: 1rem; }
    @media (max-width: 640px) {
      th:nth-child(5), th:nth-child(6), .col-target, .col-horizon { display: none; }
      th, td { padding: 0.5rem; font-size: 0.9rem; }
    }
  </style>
</head>
<body>
  <header class="site-header">
    <h1 class="site-title">${escapeHtml(siteTitle)}</h1>
    <p class="site-tagline">Long-term stock picks and insights for US investors.</p>
    <nav><a href="${b}/">Home</a><a href="${b}/articles/">Articles</a><a href="${b}/recommendations/">All recommendations</a></nav>
  </header>
  <main class="main">
    <h2 class="section-title">Recent stock recommendations</h2>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Ticker</th>
            <th>Company</th>
            <th>Recommendation</th>
            <th>Date</th>
            <th>Target price</th>
            <th>Time horizon</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
${rows}
        </tbody>
      </table>
    </div>
    <p class="footer-links"><a href="${b}/recommendations/">View all recommendations</a><a href="${b}/articles/">Articles</a></p>
  </main>
</body>
</html>`
}

function manifestEntry(doc, type) {
  const slug = getSlug(doc)
  if (type === 'article') {
    return {id: doc._id, slug, title: doc.title || 'Untitled', excerpt: doc.excerpt || '', publishedAt: doc.publishedAt || ''}
  }
  return {
    id: doc._id,
    slug,
    title: doc.companyName || doc.ticker || 'Untitled',
    ticker: doc.ticker || '',
    recommendationType: doc.recommendationType || '',
    targetPrice: doc.targetPrice != null ? doc.targetPrice : null,
    timeHorizon: doc.timeHorizon || '',
    excerpt: '',
    publishedAt: doc.publishedAt || ''
  }
}

async function githubGetFile(repo, path, token) {
  const [owner, reponame] = repo.split('/')
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${reponame}/contents/${path}?ref=${BRANCH}`,
    {headers: {Accept: 'application/vnd.github.v3+json', Authorization: `Bearer ${token}`}}
  )
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`GitHub GET ${path}: ${res.status} ${await res.text()}`)
  const j = await res.json()
  return {content: Buffer.from(j.content, 'base64').toString('utf8'), sha: j.sha}
}

async function githubPutFile(repo, path, content, token, sha = null) {
  const [owner, reponame] = repo.split('/')
  const body = {message: `Publish: ${path}`, content: Buffer.from(content, 'utf8').toString('base64'), branch: BRANCH}
  if (sha) body.sha = sha
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${reponame}/contents/${path}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/vnd.github.v3+json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(body)
    }
  )
  if (!res.ok) throw new Error(`GitHub PUT ${path}: ${res.status} ${await res.text()}`)
}

async function main() {
  const projectId = getEnv('SANITY_PROJECT_ID')
  const dataset = getEnv('SANITY_DATASET')
  const token = getEnv('GITHUB_TOKEN')
  const documentId = getEnv('DOCUMENT_ID')
  const documentType = getEnv('DOCUMENT_TYPE')
  const repo = process.env.GITHUB_REPOSITORY || getEnv('GITHUB_REPOSITORY')

  if (documentType !== 'article' && documentType !== 'stockRecommendation') {
    throw new Error(`Invalid DOCUMENT_TYPE: ${documentType}`)
  }

  const doc = await fetchSanityDocument(projectId, dataset, documentId)
  const slug = getSlug(doc)
  const basePath = getBasePath(repo)

  let manifest = {articles: [], recommendations: [], updatedAt: new Date().toISOString()}
  const manifestFile = await githubGetFile(repo, 'manifest.json', token)
  if (manifestFile) {
    manifest = JSON.parse(manifestFile.content)
    if (!manifest.articles) manifest.articles = []
    if (!manifest.recommendations) manifest.recommendations = []
  } else {
    console.log('No manifest.json on gh-pages yet. Will create it. Ensure gh-pages branch exists.')
  }

  const entry = manifestEntry(doc, documentType)
  const list = documentType === 'article' ? manifest.articles : manifest.recommendations
  const idx = list.findIndex((e) => e.id === entry.id || e.slug === entry.slug)
  if (idx >= 0) list[idx] = entry
  else list.push(entry)
  manifest.updatedAt = new Date().toISOString()

  const detailPath =
    documentType === 'article' ? `articles/${slug}.html` : `recommendations/${slug}.html`
  const detailHtml =
    documentType === 'article'
      ? buildArticleHtml(doc, SITE_TITLE, basePath)
      : buildStockRecommendationHtml(doc, SITE_TITLE, basePath)

  const existingDetail = await githubGetFile(repo, detailPath, token)
  const detailSha = existingDetail?.sha ?? null
  if (existingDetail && !detailSha) {
    throw new Error(
      `GitHub GET ${detailPath} returned content but no sha; cannot update file.`
    )
  }
  await githubPutFile(repo, detailPath, detailHtml, token, detailSha)

  const manifestSha = manifestFile ? manifestFile.sha : null
  await githubPutFile(repo, 'manifest.json', JSON.stringify(manifest, null, 2), token, manifestSha)

  const articlesIndex = await githubGetFile(repo, 'articles/index.html', token)
  await githubPutFile(
    repo,
    'articles/index.html',
    buildListingHtml(manifest, 'article', SITE_TITLE, basePath),
    token,
    articlesIndex?.sha
  )

  const recsIndex = await githubGetFile(repo, 'recommendations/index.html', token)
  await githubPutFile(
    repo,
    'recommendations/index.html',
    buildListingHtml(manifest, 'stockRecommendation', SITE_TITLE, basePath),
    token,
    recsIndex?.sha
  )

  const indexFile = await githubGetFile(repo, 'index.html', token)
  await githubPutFile(repo, 'index.html', buildIndexHtml(manifest, SITE_TITLE, basePath), token, indexFile?.sha)

  console.log(`Published ${documentType} ${slug} to gh-pages`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
