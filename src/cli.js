#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { loadConfig } from "./config.js";
import { readState, saveArchive, writeState } from "./archive.js";
import { captureBookmark, openXContext, scanBookmarks, verifyProfile } from "./x-browser.js";

async function runArchive(config) {
  const state = await readState(config.archiveDir);
  const archived = new Set(state.archivedIds);
  const context = await openXContext(config);
  let saved = 0;
  try {
    const bookmarks = await scanBookmarks(context, config);
    const pending = bookmarks.filter((bookmark) => !archived.has(bookmark.id));
    process.stdout.write(`${bookmarks.length}件を確認、${pending.length}件が未保存です。\n`);
    for (const bookmark of pending) {
      process.stdout.write(`保存中: ${bookmark.url}\n`);
      try {
        const record = await captureBookmark(context, bookmark, config);
        const itemDir = await saveArchive(record, config.archiveDir, context.request);
        archived.add(bookmark.id);
        await writeState(config.archiveDir, { archivedIds: [...archived] });
        saved += 1;
        process.stdout.write(`保存しました: ${itemDir}\n`);
      } catch (error) {
        process.stderr.write(`保存失敗 ${bookmark.id}: ${error.message}\n`);
      }
    }
  } finally {
    await context.close();
  }
  process.stdout.write(`完了: ${saved}件を新規保存しました。\n`);
}

async function doctor(config) {
  const checks = [
    ["Node.js", process.version],
    ["作業フォルダ", config.rootDir],
    ["保存先", config.archiveDir],
    ["ブラウザプロフィール", config.profileDir],
    ["プロフィール作成済み", await fs.access(config.profileDir).then(() => "はい").catch(() => "いいえ")]
  ];
  for (const [name, value] of checks) process.stdout.write(`${name}: ${value}\n`);
  const envFile = path.join(config.rootDir, ".env");
  process.stdout.write(`.env: ${await fs.access(envFile).then(() => "あり").catch(() => "なし（既定値を使用）")}\n`);
}

async function main() {
  try {
    process.loadEnvFile(path.resolve(process.cwd(), ".env"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const command = process.argv[2] || "run";
  const config = loadConfig();
  if (command === "setup") return verifyProfile(config);
  if (command === "run") return runArchive(config);
  if (command === "doctor") return doctor(config);
  throw new Error(`Unknown command: ${command}. Use setup, run, or doctor.`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
