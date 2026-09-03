import test from "node:test";
import assert from "node:assert/strict";
import { buildAuthorThread, normalizePost, parseStatusUrl, safeSegment } from "../src/model.js";

test("parseStatusUrl canonicalizes X and Twitter status URLs", () => {
  assert.deepEqual(parseStatusUrl("https://twitter.com/alice/status/12345/photo/1"), {
    authorHandle: "alice",
    id: "12345",
    url: "https://x.com/alice/status/12345"
  });
  assert.equal(parseStatusUrl("https://example.com/alice/status/12345"), null);
});

test("normalizePost removes duplicate media and trims text", () => {
  const post = normalizePost({
    url: "/alice/status/12345",
    text: " hello \n",
    mediaUrls: ["https://pbs/a.jpg", "https://pbs/a.jpg"]
  });
  assert.equal(post.text, "hello");
  assert.deepEqual(post.mediaUrls, ["https://pbs/a.jpg"]);
});

test("buildAuthorThread keeps only the root author and chronological replies", () => {
  const root = { id: "1", authorHandle: "Alice", createdAt: "2026-01-01T00:00:00Z", discoveryIndex: 1 };
  const result = buildAuthorThread(root, [
    { id: "4", authorHandle: "alice", createdAt: "2026-01-01T00:03:00Z", discoveryIndex: 4 },
    { id: "2", authorHandle: "bob", createdAt: "2026-01-01T00:01:00Z", discoveryIndex: 2 },
    { id: "3", authorHandle: "ALICE", createdAt: "2026-01-01T00:02:00Z", discoveryIndex: 3 },
    { id: "0", authorHandle: "alice", createdAt: "2025-12-31T23:59:00Z", discoveryIndex: 0 }
  ]);
  assert.deepEqual(result.map((post) => post.id), ["3", "4"]);
});

test("safeSegment removes Windows-reserved filename characters", () => {
  assert.equal(safeSegment('a<b>:c"d/e\\f|g?h*'), "a-b--c-d-e-f-g-h-");
});

