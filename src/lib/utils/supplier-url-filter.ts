const NON_SUPPLIER_URL_PATH_PATTERNS = [
  "/blog/",
  "/blogs/",
  "/news/",
  "/press/",
  "/press-release",
  "/article/",
  "/articles/",
  "/guide/",
  "/guides/",
  "/whitepaper",
  "/case-study",
  "/case-studies",
  "/learn/",
  "/help/",
  "/faq/",
  "/wiki/",
  "/research/",
  "/papers/",
  "/post/",
  "/posts/",
  "/store/",
  "/shop/",
  "/product-category/",
  "/product-categories/",
  "/category/",
  "/categories/",
  "/collections/",
  "/itm/",
  "-guide-",
  "-guide.",
  "-guide/",
  "/top-",
  "manufacturers-in-",
  "best-cnc-",
  "best-suppliers-",
] as const

const NON_SUPPLIER_TLD_PATTERNS = [
  ".edu",
  ".edu.",
  ".ac.uk",
  ".ac.",
  ".gov",
  ".gov.uk",
  "researchgate.net",
  "academia.edu",
  "arxiv.org",
  "wikipedia.org",
  "youtube.com",
  "youtu.be",
  "linkedin.com",
  "twitter.com",
  "x.com",
  "facebook.com",
  "instagram.com",
  "reddit.com",
  "medium.com",
  "substack.com",
  "wordpress.com",
  "blogspot.com",
  "amazon.com",
  "amazon.co.uk",
  "ebay.com",
  "ebay.co.uk",
  "aliexpress.com",
  "grelly.",
  "grelly.uk",
  "made-in-china.com",
  "madeinchina.com",
  "globalsources.com",
  "indiamart.com",
  "alibaba.com",
] as const

function isNonSupplierUrl(url: string | null | undefined): boolean {
  if (!url) return false
  const lower = url.toLowerCase()
  for (const tld of NON_SUPPLIER_TLD_PATTERNS) {
    if (lower.includes(tld)) return true
  }
  for (const path of NON_SUPPLIER_URL_PATH_PATTERNS) {
    if (lower.includes(path)) return true
  }
  return false
}

export function filterSupplierUrls(urls: string[]): string[] {
  return urls.filter((url) => !isNonSupplierUrl(url))
}
