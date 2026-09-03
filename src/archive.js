import fs from "node:fs/promises";
import path from "node:path";
import { safeSegment } from "./model.js";

const CONTENT_EXTENSIONS = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
  ["image/gif", ".gif"],
  ["video/mp4", ".mp4"]
]);

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function formatDate(value) {
  if (!value) return "unknown-date";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "unknown-date";
  return parsed.toISOString().slice(0, 10);
}

function quoteBlock(text) {
  if (!text) return "> *(本文を画面から取得できませんでした)*";
  return text.split(/\r?\n/).map((line) => `> ${line}`).join("\n");
}

function renderPost(post, localMedia = []) {
  const lines = [
    `### @${post.authorHandle}`,
    "",
    `- URL: ${post.url}`,
    `- 投稿日時: ${post.createdAt ?? "不明"}`,
    "",
    quoteBlock(post.text)
  ];
  if (localMedia.length) {
    lines.push("", ...localMedia.map((media) => `![media](./${media.replaceAll("\\", "/")})`));
  }
  return lines.join("\n");
}

export function renderMarkdown(record) {
  const titleText = record.root.text.split(/\r?\n/)[0].slice(0, 70) || "本文なし";
  const lines = [
    "---",
    `x_post_id: \"${record.root.id}\"`,
    `author: \"${record.root.authorHandle}\"`,
    `source: \"${record.root.url}\"`,
    `archived_at: \"${record.archivedAt}\"`,
    "---",
    "",
    `# ${titleText}`,
    "",
    "## ブックマークした投稿",
    "",
    renderPost(record.root, record.localMedia?.[record.root.id])
  ];

  if (record.authorThread.length) {
    lines.push("", "## 投稿者本人の返信ツリー", "");
    for (const [index, post] of record.authorThread.entries()) {
      lines.push(`${index + 1}. ${post.createdAt ?? "日時不明"}`, "", renderPost(post, record.localMedia?.[post.id]), "");
    }
  } else {
    lines.push("", "## 投稿者本人の返信ツリー", "", "取得時点で画面上に返信は見つかりませんでした。");
  }

  if (record.xArticles?.length) {
    lines.push("", "## X記事", "");
    for (const article of record.xArticles) {
      lines.push(`### ${article.title || article.url}`, "", `- URL: ${article.url}`, "", article.text || "本文を取得できませんでした。", "");
    }
  }
  return `${lines.join("\n").trim()}\n`;
}

export async function readState(archiveDir) {
  const statePath = path.join(archiveDir, ".state.json");
  try {
    const parsed = JSON.parse(await fs.readFile(statePath, "utf8"));
    return { archivedIds: Array.isArray(parsed.archivedIds) ? parsed.archivedIds : [] };
  } catch (error) {
    if (error.code === "ENOENT") return { archivedIds: [] };
    throw new Error(`Could not read ${statePath}: ${error.message}`);
  }
}

export async function writeState(archiveDir, state) {
  await fs.mkdir(archiveDir, { recursive: true });
  const statePath = path.join(archiveDir, ".state.json");
  const next = { ...state, updatedAt: new Date().toISOString() };
  await fs.writeFile(statePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
}

async function downloadMedia(request, url, destinationBase) {
  let response;
  try {
    response = await request.get(url, { timeout: 30_000 });
  } catch (error) {
    return { error: `download failed: ${error.message}`, sourceUrl: url };
  }
  if (!response.ok()) return { error: `HTTP ${response.status()}`, sourceUrl: url };
  const type = (response.headers()["content-type"] || "").split(";", 1)[0];
  const extension = CONTENT_EXTENSIONS.get(type) || path.extname(new URL(url).pathname) || ".bin";
  const destination = `${destinationBase}${extension}`;
  if (!(await exists(destination))) await fs.writeFile(destination, await response.body());
  return { path: destination, sourceUrl: url };
}

export async function saveArchive(record, archiveDir, request) {
  const itemDir = path.join(archiveDir, `${formatDate(record.root.createdAt)}-${safeSegment(record.root.id)}`);
  const mediaDir = path.join(itemDir, "media");
  await fs.mkdir(mediaDir, { recursive: true });
  record.localMedia = {};
  record.mediaErrors = [];

  const posts = [record.root, ...record.authorThread];
  for (const post of posts) {
    record.localMedia[post.id] = [];
    for (const [index, url] of post.mediaUrls.entries()) {
      const result = await downloadMedia(request, url, path.join(mediaDir, `${safeSegment(post.id)}-${index + 1}`));
      if (result.path) record.localMedia[post.id].push(path.relative(itemDir, result.path));
      else record.mediaErrors.push({ postId: post.id, ...result });
    }
  }

  await fs.writeFile(path.join(itemDir, "post.json"), `${JSON.stringify(record, null, 2)}\n`, "utf8");
  await fs.writeFile(path.join(itemDir, "README.md"), renderMarkdown(record), "utf8");
  return itemDir;
}

