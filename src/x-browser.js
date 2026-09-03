import { chromium } from "playwright";
import { buildAuthorThread, normalizePost, parseStatusUrl } from "./model.js";

const SHOW_MORE_REPLIES = /show (more )?repl|view (more )?repl|さらに返信|返信をさらに|もっと見る/i;

async function sleep(page, milliseconds) {
  await page.waitForTimeout(milliseconds);
}

async function assertLoggedIn(page) {
  const url = page.url();
  if (/\/login|\/i\/flow\/login/i.test(url)) {
    throw new Error("X is not logged in. Run `pnpm run setup` first.");
  }
}

async function articleSnapshot(locator, discoveryIndex) {
  return locator.evaluate((element, index) => {
    const anchors = [...element.querySelectorAll("a[href]")];
    const statusAnchor = anchors.find((anchor) => /\/[^/]+\/status\/\d+/.test(anchor.getAttribute("href") || ""));
    if (!statusAnchor) return null;
    const href = statusAnchor.href;
    const statusMatch = new URL(href).pathname.match(/^\/([^/]+)\/status\/(\d+)/);
    const textElement = element.querySelector('[data-testid="tweetText"]');
    const timeElement = element.querySelector("time");
    const userName = element.querySelector('[data-testid="User-Name"]');
    const mediaUrls = [...element.querySelectorAll('[data-testid="tweetPhoto"] img, video[poster]')]
      .map((node) => node.currentSrc || node.src || node.getAttribute("poster"))
      .filter(Boolean);
    const articleLinks = anchors
      .map((anchor) => anchor.href)
      .filter((url) => /x\.com\/i\/article\//i.test(url));
    return {
      url: href,
      authorHandle: statusMatch?.[1] || null,
      authorName: userName?.innerText?.split("\n")[0] || null,
      createdAt: timeElement?.getAttribute("datetime") || null,
      text: textElement?.innerText || "",
      mediaUrls,
      articleLinks,
      discoveryIndex: index
    };
  }, discoveryIndex);
}

async function collectVisiblePosts(page, known = new Map(), startIndex = 0) {
  const articles = page.locator('article[data-testid="tweet"]');
  const count = await articles.count();
  let nextIndex = startIndex;
  for (let index = 0; index < count; index += 1) {
    const snapshot = await articleSnapshot(articles.nth(index), nextIndex);
    const post = snapshot && normalizePost(snapshot);
    if (post && !known.has(post.id)) {
      known.set(post.id, post);
      nextIndex += 1;
    }
  }
  return nextIndex;
}

async function clickReplyExpanders(page) {
  const buttons = page.locator('button, [role="button"]');
  const texts = await buttons.allTextContents();
  let clicked = 0;
  for (let index = 0; index < texts.length && clicked < 8; index += 1) {
    if (!SHOW_MORE_REPLIES.test(texts[index])) continue;
    try {
      await buttons.nth(index).click({ timeout: 1_000 });
      clicked += 1;
    } catch {
      // Virtualized elements can disappear while the page settles; the next pass retries visible controls.
    }
  }
  return clicked;
}

async function extractXArticle(context, url, delayMs) {
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await assertLoggedIn(page);
    await sleep(page, delayMs);
    const preferred = page.locator('[data-testid="twitterArticleReadView"]');
    const body = (await preferred.count()) ? preferred.first() : page.locator("main").first();
    const title = await body.locator("h1").first().textContent().catch(() => null);
    const text = await body.innerText({ timeout: 10_000 }).catch(() => "");
    return { url, title: title?.trim() || null, text: text.trim() };
  } finally {
    await page.close();
  }
}

export async function openXContext(config, { headless = config.headless } = {}) {
  return chromium.launchPersistentContext(config.profileDir, {
    headless,
    viewport: { width: 1400, height: 1000 },
    locale: "ja-JP"
  });
}

export async function scanBookmarks(context, config) {
  const page = context.pages()[0] ?? await context.newPage();
  await page.goto(config.bookmarksUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await assertLoggedIn(page);
  await page.locator('article[data-testid="tweet"]').first().waitFor({ state: "visible", timeout: 30_000 });

  const posts = new Map();
  let discoveryIndex = 0;
  for (let scroll = 0; scroll < config.bookmarkScrolls && posts.size < config.bookmarkLimit; scroll += 1) {
    discoveryIndex = await collectVisiblePosts(page, posts, discoveryIndex);
    await page.mouse.wheel(0, 850);
    await sleep(page, config.scrollDelayMs);
  }
  await collectVisiblePosts(page, posts, discoveryIndex);
  return [...posts.values()].slice(0, config.bookmarkLimit);
}

export async function captureBookmark(context, bookmark, config) {
  const page = await context.newPage();
  try {
    await page.goto(bookmark.url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await assertLoggedIn(page);
    await page.locator('article[data-testid="tweet"]').first().waitFor({ state: "visible", timeout: 30_000 });

    const posts = new Map();
    let discoveryIndex = 0;
    for (let scroll = 0; scroll < config.threadScrolls; scroll += 1) {
      discoveryIndex = await collectVisiblePosts(page, posts, discoveryIndex);
      const clicked = await clickReplyExpanders(page);
      if (clicked) await sleep(page, config.scrollDelayMs);
      await page.mouse.wheel(0, 850);
      await sleep(page, config.scrollDelayMs);
    }
    await collectVisiblePosts(page, posts, discoveryIndex);

    const root = posts.get(bookmark.id) || bookmark;
    const authorThread = buildAuthorThread(root, [...posts.values()]);
    const xArticles = [];
    for (const articleUrl of root.articleLinks) {
      xArticles.push(await extractXArticle(context, articleUrl, config.scrollDelayMs));
    }
    return {
      schemaVersion: 1,
      archivedAt: new Date().toISOString(),
      captureMethod: "x-browser-dom",
      root,
      authorThread,
      xArticles
    };
  } finally {
    await page.close();
  }
}

export async function verifyProfile(config) {
  const context = await openXContext(config, { headless: false });
  const page = context.pages()[0] ?? await context.newPage();
  try {
    await page.goto(config.bookmarksUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
    process.stdout.write("\nXへログインしてブックマーク画面を表示し、このターミナルで Enter を押してください。\n");
    await new Promise((resolve) => process.stdin.once("data", resolve));
    await assertLoggedIn(page);
    const statusLinks = page.locator('article[data-testid="tweet"] a[href*="/status/"]');
    if ((await statusLinks.count()) === 0) {
      throw new Error("ブックマーク投稿が画面に見つかりません。ログイン状態とブックマーク画面を確認してください。");
    }
    const parsed = parseStatusUrl(await statusLinks.first().getAttribute("href"));
    process.stdout.write(`ログイン状態を保存しました。確認できた投稿ID: ${parsed?.id ?? "unknown"}\n`);
  } finally {
    await context.close();
  }
}
