import fs from "node:fs/promises";
import path from "node:path";
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
    const mediaUrls = await body.locator("img").evaluateAll((images) => images
      .map((image) => image.currentSrc || image.src)
      .filter((source) => /pbs\.twimg\.com\/media\//i.test(source)));
    return { url, title: title?.trim() || null, text: text.trim(), mediaUrls: [...new Set(mediaUrls)] };
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
    process.stdout.write("\nXへログインしてください。ログイン完了は自動的に検出されます。\n");
    const deadline = Date.now() + config.setupTimeoutMs;
    while (Date.now() < deadline) {
      const isLoginPage = /\/login|\/i\/flow\/login/i.test(page.url());
      const authenticatedMarker = page.locator('[data-testid="SideNav_AccountSwitcher_Button"], a[href="/home"]');
      if (!isLoginPage && (await authenticatedMarker.count()) > 0) break;
      await page.waitForTimeout(1_000);
    }
    if (/\/login|\/i\/flow\/login/i.test(page.url())) {
      throw new Error("制限時間内にXのログインを確認できませんでした。もう一度 `pnpm run setup` を実行してください。");
    }
    if (!/\/i\/bookmarks/i.test(page.url())) {
      await page.goto(config.bookmarksUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
    }
    await assertLoggedIn(page);
    await page.locator("main").first().waitFor({ state: "visible", timeout: 30_000 });
    const statusLinks = page.locator('article[data-testid="tweet"] a[href*="/status/"]');
    const parsed = (await statusLinks.count()) > 0
      ? parseStatusUrl(await statusLinks.first().getAttribute("href"))
      : null;
    await fs.writeFile(path.join(config.profileDir, ".authenticated"), `${new Date().toISOString()}\n`, "utf8");
    process.stdout.write(`ログイン状態を保存しました。${parsed ? `確認できた投稿ID: ${parsed.id}` : "ブックマークは現在0件です。"}\n`);
  } finally {
    await context.close();
  }
}
