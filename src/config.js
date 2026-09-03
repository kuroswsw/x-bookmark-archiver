import path from "node:path";

function integer(name, fallback, minimum = 1) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < minimum) {
    throw new Error(`${name} must be an integer greater than or equal to ${minimum}.`);
  }
  return value;
}

function boolean(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  if (["1", "true", "yes", "on"].includes(raw.toLowerCase())) return true;
  if (["0", "false", "no", "off"].includes(raw.toLowerCase())) return false;
  throw new Error(`${name} must be true or false.`);
}

export function loadConfig(overrides = {}) {
  const rootDir = path.resolve(overrides.rootDir ?? process.cwd());
  return {
    rootDir,
    archiveDir: path.resolve(rootDir, process.env.XBA_ARCHIVE_DIR ?? "archive"),
    profileDir: path.resolve(rootDir, process.env.XBA_PROFILE_DIR ?? ".browser-profile"),
    headless: overrides.headless ?? boolean("XBA_HEADLESS", true),
    bookmarkLimit: integer("XBA_BOOKMARK_LIMIT", 50),
    bookmarkScrolls: integer("XBA_BOOKMARK_SCROLLS", 8),
    threadScrolls: integer("XBA_THREAD_SCROLLS", 10),
    scrollDelayMs: integer("XBA_SCROLL_DELAY_MS", 1200, 100),
    setupTimeoutMs: integer("XBA_SETUP_TIMEOUT_MS", 600_000, 30_000),
    bookmarksUrl: "https://x.com/i/bookmarks"
  };
}
