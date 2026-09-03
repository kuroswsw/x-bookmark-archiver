import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/config.js";

test("VPS polling defaults to 60 seconds", () => {
  const previous = process.env.XBA_POLL_INTERVAL_SECONDS;
  delete process.env.XBA_POLL_INTERVAL_SECONDS;
  try {
    assert.equal(loadConfig({ rootDir: process.cwd() }).pollIntervalSeconds, 60);
  } finally {
    if (previous === undefined) delete process.env.XBA_POLL_INTERVAL_SECONDS;
    else process.env.XBA_POLL_INTERVAL_SECONDS = previous;
  }
});

test("polling faster than 30 seconds is rejected", () => {
  const previous = process.env.XBA_POLL_INTERVAL_SECONDS;
  process.env.XBA_POLL_INTERVAL_SECONDS = "29";
  try {
    assert.throws(() => loadConfig({ rootDir: process.cwd() }), /greater than or equal to 30/);
  } finally {
    if (previous === undefined) delete process.env.XBA_POLL_INTERVAL_SECONDS;
    else process.env.XBA_POLL_INTERVAL_SECONDS = previous;
  }
});

