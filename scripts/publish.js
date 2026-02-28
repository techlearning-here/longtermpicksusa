/**
 * Publish pipeline: fetch one document from Sanity, update manifest, generate static HTML, push to GitHub (gh-pages).
 * Run with env: SANITY_PROJECT_ID, SANITY_DATASET, GITHUB_TOKEN, DOCUMENT_ID, DOCUMENT_TYPE, GITHUB_REPOSITORY.
 */

const {createClient} = require('@sanity/client')
const {toHTML} = require('@portabletext/to-html')

const BRANCH = 'gh-pages'
const SITE_TITLE = 'LongTermPicksUSA'

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

function buildArticleHtml(doc, siteTitle) {
  const slug = getSlug(doc)
  const title = doc.title || 'Untitled'
  const bodyHtml = portableTextToHtml(doc.body)
  const excerpt = escapeHtml(doc.excerpt || '')
  const published = doc.publishedAt ? new Date(doc.publishedAt).toISOString() : ''
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
  <article>
    <header><h1>${escapeHtml(title)}</h1></header>
    <div class="content">${bodyHtml}</div>
  </article>
</body>
</html>`
}

function buildStockRecommendationHtml(doc, siteTitle) {
  const slug = getSlug(doc)
  const title = doc.companyName || doc.ticker || 'Untitled'
  const ticker = doc.ticker || ''
  const reasonsHtml = portableTextToHtml(doc.reasons)
  const recommendationType = doc.recommendationType || ''
  const targetPrice = doc.targetPrice != null ? doc.targetPrice : ''
  const timeHorizon = escapeHtml(doc.timeHorizon || '')
  const published = doc.publishedAt ? new Date(doc.publishedAt).toISOString() : ''
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} (${escapeHtml(ticker)}) | ${escapeHtml(siteTitle)}</title>
  ${published ? `<meta name="date" content="${published}">` : ''}
</head>
<body>
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

function buildListingHtml(manifest, type, siteTitle) {
  const items = type === 'article' ? (manifest.articles || []) : (manifest.recommendations || [])
  const base = type === 'article' ? '/articles' : '/recommendations'
  const title = type === 'article' ? 'Articles' : 'Stock Recommendations'
  const list = items
    .sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0))
    .map(
      (item) =>
        `    <li><a href="${base}/${escapeHtml(item.slug)}.html">${escapeHtml(item.title)}</a></li>`
    )
    .join('\n')
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} | ${escapeHtml(siteTitle)}</title>
</head>
<body>
  <h1>${escapeHtml(siteTitle)}</h1>
  <nav><a href="/">Home</a> | <a href="/articles/">Articles</a> | <a href="/recommendations/">Recommendations</a></nav>
  <h2>${title}</h2>
  <ul>
${list}
  </ul>
</body>
</html>`
}

function buildIndexHtml(manifest, siteTitle) {
  const articles = (manifest.articles || []).slice(0, 10)
  const recommendations = (manifest.recommendations || []).slice(0, 10)
  const articleList = articles
    .map((a) => `    <li><a href="/articles/${escapeHtml(a.slug)}.html">${escapeHtml(a.title)}</a></li>`)
    .join('\n')
  const recList = recommendations
    .map((r) => `    <li><a href="/recommendations/${escapeHtml(r.slug)}.html">${escapeHtml(r.title)} (${escapeHtml(r.ticker || '')})</a></li>`)
    .join('\n')
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(siteTitle)}</title>
</head>
<body>
  <h1>${escapeHtml(siteTitle)}</h1>
  <p>Long-term stock picks and finance articles for US investors.</p>
  <nav><a href="/articles/">Articles</a> | <a href="/recommendations/">Recommendations</a></nav>
  <h2>Latest articles</h2>
  <ul>
${articleList || '    <li>No articles yet.</li>'}
  </ul>
  <h2>Latest stock recommendations</h2>
  <ul>
${recList || '    <li>No recommendations yet.</li>'}
  </ul>
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
      ? buildArticleHtml(doc, SITE_TITLE)
      : buildStockRecommendationHtml(doc, SITE_TITLE)

  await githubPutFile(repo, detailPath, detailHtml, token)

  const manifestSha = manifestFile ? manifestFile.sha : null
  await githubPutFile(repo, 'manifest.json', JSON.stringify(manifest, null, 2), token, manifestSha)

  const articlesIndex = await githubGetFile(repo, 'articles/index.html', token)
  await githubPutFile(
    repo,
    'articles/index.html',
    buildListingHtml(manifest, 'article', SITE_TITLE),
    token,
    articlesIndex?.sha
  )

  const recsIndex = await githubGetFile(repo, 'recommendations/index.html', token)
  await githubPutFile(
    repo,
    'recommendations/index.html',
    buildListingHtml(manifest, 'stockRecommendation', SITE_TITLE),
    token,
    recsIndex?.sha
  )

  const indexFile = await githubGetFile(repo, 'index.html', token)
  await githubPutFile(repo, 'index.html', buildIndexHtml(manifest, SITE_TITLE), token, indexFile?.sha)

  console.log(`Published ${documentType} ${slug} to gh-pages`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
