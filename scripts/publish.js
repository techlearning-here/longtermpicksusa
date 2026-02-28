/**
 * Publish pipeline: fetch one document from Sanity, update manifest, generate static HTML, push to GitHub (gh-pages).
 * Run with env: SANITY_PROJECT_ID, SANITY_DATASET, GITHUB_TOKEN, GITHUB_REPOSITORY.
 * Optional: DOCUMENT_ID + DOCUMENT_TYPE to publish a single document; if omitted, rebuilds all pages from current manifest.
 * Local preview: set OUTPUT_DIR=dist (and optionally BASE_PATH='') to write to disk instead of GitHub; GITHUB_* not required.
 * Loads .env from project root if present (e.g. SANITY_PROJECT_ID, SANITY_DATASET).
 */

require('dotenv').config()

const {createClient} = require('@sanity/client')
const {toHTML} = require('@portabletext/to-html')
const path = require('path')
const fs = require('fs')
const ejs = require('ejs')

const BRANCH = 'gh-pages'
const SITE_TITLE = 'Long Term Picks USA'
const TEMPLATES_DIR = path.join(__dirname, '..', 'templates')
const OUTPUT_DIR = process.env.OUTPUT_DIR || null

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

function getEnvOptional(name) {
  return process.env[name] || ''
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

/**
 * Render an EJS template from the templates directory.
 * @param {string} name - Template filename (e.g. 'article.ejs')
 * @param {object} data - Data passed to the template
 * @returns {string} Rendered HTML
 */
function renderTemplate(name, data) {
  const filePath = path.join(TEMPLATES_DIR, name)
  const templateStr = fs.readFileSync(filePath, 'utf8')
  return ejs.render(templateStr, data, {filename: filePath})
}

function buildArticleHtml(doc, siteTitle, basePath) {
  const title = doc.title || 'Untitled'
  const bodyHtml = portableTextToHtml(doc.body)
  const excerpt = escapeHtml(doc.excerpt || '')
  const published = doc.publishedAt ? new Date(doc.publishedAt).toISOString() : ''
  const base = basePath || ''
  return renderTemplate('article.ejs', {
    siteTitle,
    basePath: base,
    title,
    excerpt,
    published: published || false,
    bodyHtml
  })
}

function buildStockRecommendationHtml(doc, siteTitle, basePath) {
  const title = doc.companyName || doc.ticker || 'Untitled'
  const ticker = doc.ticker || ''
  const reasonsHtml = portableTextToHtml(doc.reasons)
  const recommendationType = doc.recommendationType || ''
  const targetPrice = doc.targetPrice != null ? doc.targetPrice : ''
  const timeHorizon = doc.timeHorizon || ''
  const published = doc.publishedAt ? new Date(doc.publishedAt).toISOString() : ''
  const base = basePath || ''
  const symbolForChart = ticker ? 'NASDAQ:' + ticker.toUpperCase() : ''
  const tradingViewChartConfig =
    symbolForChart
      ? JSON.stringify({
          autosize: false,
          width: '100%',
          height: 520,
          symbol: symbolForChart,
          interval: 'D',
          timezone: 'America/New_York',
          theme: 'light',
          style: '1',
          locale: 'en',
          allow_symbol_change: false,
          calendar: false,
          support_host: 'https://www.tradingview.com'
        })
      : ''
  return renderTemplate('recommendation.ejs', {
    siteTitle,
    basePath: base,
    title,
    ticker,
    recommendationType,
    targetPrice: String(targetPrice),
    timeHorizon,
    published: published || false,
    reasonsHtml,
    tradingViewChartConfig
  })
}

function buildListingHtml(manifest, type, siteTitle, basePath) {
  const items = type === 'article' ? (manifest.articles || []) : (manifest.recommendations || [])
  const sorted = [...items].sort(
    (a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0)
  )
  const listBase =
    (basePath || '') + (type === 'article' ? '/articles' : '/recommendations')
  const pageTitle = type === 'article' ? 'Articles' : 'Stock Recommendations'
  return renderTemplate('listing.ejs', {
    siteTitle,
    basePath: basePath || '',
    pageTitle,
    listBase,
    items: sorted.map((item) => ({slug: item.slug, title: item.title}))
  })
}

function formatRecommendationDate(isoDate) {
  if (!isoDate) return '—'
  const d = new Date(isoDate)
  return d.toLocaleDateString('en-US', {year: 'numeric', month: 'short', day: 'numeric'})
}

function buildIndexHtml(manifest, siteTitle, basePath) {
  const rawRecs = (manifest.recommendations || [])
    .sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0))
    .slice(0, 10)
  const b = basePath || ''

  const recommendations = rawRecs.map((r) => {
    const recType = (r.recommendationType || '').toLowerCase()
    const isBuy = recType === 'buy'
    const badgeClass = isBuy ? 'badge-buy' : recType === 'sell' ? 'badge-sell' : 'badge-neutral'
    const targetStr =
      r.targetPrice != null && r.targetPrice !== ''
        ? `$${Number(r.targetPrice).toLocaleString()}`
        : '—'
    return {
      ticker: r.ticker || '—',
      title: r.title || '—',
      recommendationType: r.recommendationType || '—',
      dateStr: formatRecommendationDate(r.publishedAt),
      targetStr,
      timeHorizon: r.timeHorizon || '—',
      badgeClass,
      detailUrl: `${b}/recommendations/${r.slug}.html`
    }
  })

  return renderTemplate('index.ejs', {
    siteTitle,
    basePath: b,
    recommendations
  })
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

/**
 * Create a storage adapter: either GitHub (repo + token) or local filesystem (outDir).
 * @returns {{ getFile: (path: string) => Promise<{content: string, sha: string|null}|null>, putFile: (path: string, content: string, sha?: string|null) => Promise<void>, isLocal: boolean }}
 */
function createStorage(outDir, repo, token) {
  if (outDir) {
    const dir = path.resolve(outDir)
    return {
      isLocal: true,
      async getFile(filePath) {
        const full = path.join(dir, filePath)
        try {
          const content = fs.readFileSync(full, 'utf8')
          return {content, sha: null}
        } catch (e) {
          if (e.code === 'ENOENT') return null
          throw e
        }
      },
      async putFile(filePath, content) {
        const full = path.join(dir, filePath)
        fs.mkdirSync(path.dirname(full), {recursive: true})
        fs.writeFileSync(full, content, 'utf8')
      }
    }
  }
  return {
    isLocal: false,
    async getFile(filePath) {
      return githubGetFile(repo, filePath, token)
    },
    async putFile(filePath, content, sha = null) {
      return githubPutFile(repo, filePath, content, token, sha)
    }
  }
}

const SANITY_DOC_FIELDS =
  '_id, _type, title, slug, body, excerpt, featuredImage, category, publishedAt, ticker, companyName, recommendationType, targetPrice, timeHorizon, reasons, image'

/**
 * Fetch all published articles and stock recommendations from Sanity (for local build when no manifest exists).
 */
async function fetchAllFromSanity(projectId, dataset) {
  const client = createClient({
    projectId,
    dataset,
    useCdn: true,
    apiVersion: '2024-01-01'
  })
  const [articles, recommendations] = await Promise.all([
    client.fetch(`*[_type == "article"]{ ${SANITY_DOC_FIELDS} }`),
    client.fetch(`*[_type == "stockRecommendation"]{ ${SANITY_DOC_FIELDS} }`)
  ])
  return {articles: articles || [], recommendations: recommendations || []}
}

async function main() {
  const projectId = getEnv('SANITY_PROJECT_ID')
  const dataset = getEnv('SANITY_DATASET')
  const isLocal = Boolean(OUTPUT_DIR)

  let basePath
  let storage
  if (isLocal) {
    basePath = process.env.BASE_PATH || ''
    storage = createStorage(OUTPUT_DIR, null, null)
  } else {
    const token = getEnv('GITHUB_TOKEN')
    const repo = process.env.GITHUB_REPOSITORY || getEnv('GITHUB_REPOSITORY')
    basePath = getBasePath(repo)
    storage = createStorage(null, repo, token)
  }

  const documentId = getEnvOptional('DOCUMENT_ID')
  const documentType = getEnvOptional('DOCUMENT_TYPE')
  const isFullRebuild = !documentId || !documentType

  if (isFullRebuild) {
    await fullRebuild(projectId, dataset, storage, basePath, isLocal)
    return
  }

  if (documentType !== 'article' && documentType !== 'stockRecommendation') {
    throw new Error(`Invalid DOCUMENT_TYPE: ${documentType}`)
  }

  const doc = await fetchSanityDocument(projectId, dataset, documentId)
  const slug = getSlug(doc)

  let manifest = {articles: [], recommendations: [], updatedAt: new Date().toISOString()}
  const manifestFile = await storage.getFile('manifest.json')
  if (manifestFile) {
    manifest = JSON.parse(manifestFile.content)
    if (!manifest.articles) manifest.articles = []
    if (!manifest.recommendations) manifest.recommendations = []
  } else {
    if (!isLocal) console.log('No manifest.json on gh-pages yet. Will create it. Ensure gh-pages branch exists.')
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

  const existingDetail = await storage.getFile(detailPath)
  const detailSha = existingDetail?.sha ?? null
  if (existingDetail && !detailSha && !isLocal) {
    throw new Error(
      `GitHub GET ${detailPath} returned content but no sha; cannot update file.`
    )
  }
  await storage.putFile(detailPath, detailHtml, detailSha)

  const manifestSha = manifestFile ? manifestFile.sha : null
  await storage.putFile('manifest.json', JSON.stringify(manifest, null, 2), manifestSha)

  await publishIndexPages(storage, manifest, basePath)

  console.log(
    isLocal ? `Built ${documentType} ${slug} to ${OUTPUT_DIR}` : `Published ${documentType} ${slug} to gh-pages`
  )
}

/**
 * Publish index.html, listing pages, and shared stylesheet.
 */
async function publishIndexPages(storage, manifest, basePath) {
  const cssPath = path.join(TEMPLATES_DIR, 'site.css')
  const cssContent = fs.readFileSync(cssPath, 'utf8')
  const stylesFile = await storage.getFile('styles.css')
  await storage.putFile('styles.css', cssContent, stylesFile?.sha ?? null)

  const articlesIndex = await storage.getFile('articles/index.html')
  await storage.putFile(
    'articles/index.html',
    buildListingHtml(manifest, 'article', SITE_TITLE, basePath),
    articlesIndex?.sha
  )

  const recsIndex = await storage.getFile('recommendations/index.html')
  await storage.putFile(
    'recommendations/index.html',
    buildListingHtml(manifest, 'stockRecommendation', SITE_TITLE, basePath),
    recsIndex?.sha
  )

  const indexFile = await storage.getFile('index.html')
  await storage.putFile('index.html', buildIndexHtml(manifest, SITE_TITLE, basePath), indexFile?.sha)
}

/**
 * Rebuild all pages from current manifest: fetch each document from Sanity, write detail pages, then index and listings.
 * When storage.isLocal and no manifest exists, fetches all articles/recommendations from Sanity to build the site.
 */
async function fullRebuild(projectId, dataset, storage, basePath, isLocal) {
  let manifest = {articles: [], recommendations: [], updatedAt: new Date().toISOString()}
  const manifestFile = await storage.getFile('manifest.json')

  if (manifestFile) {
    manifest = JSON.parse(manifestFile.content)
    if (!manifest.articles) manifest.articles = []
    if (!manifest.recommendations) manifest.recommendations = []
  } else if (isLocal) {
    console.log('No manifest in output dir. Fetching all content from Sanity...')
    const {articles: articleDocs, recommendations: recDocs} = await fetchAllFromSanity(projectId, dataset)
    manifest.articles = articleDocs.map((d) => manifestEntry(d, 'article'))
    manifest.recommendations = recDocs.map((d) => manifestEntry(d, 'stockRecommendation'))
    manifest.updatedAt = new Date().toISOString()

    for (const doc of articleDocs) {
      const slug = getSlug(doc)
      const detailPath = `articles/${slug}.html`
      await storage.putFile(detailPath, buildArticleHtml(doc, SITE_TITLE, basePath))
    }
    for (const doc of recDocs) {
      const slug = getSlug(doc)
      const detailPath = `recommendations/${slug}.html`
      await storage.putFile(detailPath, buildStockRecommendationHtml(doc, SITE_TITLE, basePath))
    }
    await storage.putFile('manifest.json', JSON.stringify(manifest, null, 2))
    await publishIndexPages(storage, manifest, basePath)
    console.log(
      `Local build: ${manifest.articles.length} articles, ${manifest.recommendations.length} recommendations → ${OUTPUT_DIR}`
    )
    return
  } else {
    console.log('No manifest.json on gh-pages yet. Full rebuild will create it.')
  }

  const newArticles = []
  for (const entry of manifest.articles || []) {
    const id = entry.id
    if (!id) continue
    try {
      const doc = await fetchSanityDocument(projectId, dataset, id)
      const slug = getSlug(doc)
      const detailPath = `articles/${slug}.html`
      const detailHtml = buildArticleHtml(doc, SITE_TITLE, basePath)
      const existing = await storage.getFile(detailPath)
      await storage.putFile(detailPath, detailHtml, existing?.sha ?? null)
      newArticles.push(manifestEntry(doc, 'article'))
    } catch (err) {
      console.warn(`Skipping article ${id}: ${err.message}`)
    }
  }

  const newRecommendations = []
  for (const entry of manifest.recommendations || []) {
    const id = entry.id
    if (!id) continue
    try {
      const doc = await fetchSanityDocument(projectId, dataset, id)
      const slug = getSlug(doc)
      const detailPath = `recommendations/${slug}.html`
      const detailHtml = buildStockRecommendationHtml(doc, SITE_TITLE, basePath)
      const existing = await storage.getFile(detailPath)
      await storage.putFile(detailPath, detailHtml, existing?.sha ?? null)
      newRecommendations.push(manifestEntry(doc, 'stockRecommendation'))
    } catch (err) {
      console.warn(`Skipping recommendation ${id}: ${err.message}`)
    }
  }

  manifest = {
    articles: newArticles,
    recommendations: newRecommendations,
    updatedAt: new Date().toISOString()
  }

  await storage.putFile('manifest.json', JSON.stringify(manifest, null, 2), manifestFile?.sha ?? null)
  await publishIndexPages(storage, manifest, basePath)

  console.log(
    isLocal
      ? `Local build: ${newArticles.length} articles, ${newRecommendations.length} recommendations → ${OUTPUT_DIR}`
      : `Full rebuild: ${newArticles.length} articles, ${newRecommendations.length} recommendations published to gh-pages`
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
