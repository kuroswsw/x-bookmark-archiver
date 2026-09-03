const STATUS_PATH = /^\/?([^/?#]+)\/status\/(\d+)/i;

export function parseStatusUrl(input, base = "https://x.com") {
  if (!input) return null;
  let url;
  try {
    url = new URL(input, base);
  } catch {
    return null;
  }
  if (!["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(url.hostname)) {
    return null;
  }
  const match = url.pathname.match(STATUS_PATH);
  if (!match) return null;
  return {
    authorHandle: match[1],
    id: match[2],
    url: `https://x.com/${match[1]}/status/${match[2]}`
  };
}

export function normalizePost(snapshot) {
  const status = parseStatusUrl(snapshot.url);
  if (!status) return null;
  return {
    id: status.id,
    url: status.url,
    authorHandle: snapshot.authorHandle || status.authorHandle,
    authorName: snapshot.authorName || null,
    createdAt: snapshot.createdAt || null,
    text: (snapshot.text || "").trim(),
    mediaUrls: [...new Set(snapshot.mediaUrls || [])],
    articleLinks: [...new Set(snapshot.articleLinks || [])],
    discoveryIndex: Number.isInteger(snapshot.discoveryIndex) ? snapshot.discoveryIndex : 0
  };
}

export function buildAuthorThread(root, candidates) {
  const rootTime = root.createdAt ? Date.parse(root.createdAt) : null;
  return candidates
    .filter((post) => post && post.id !== root.id)
    .filter((post) => post.authorHandle.toLowerCase() === root.authorHandle.toLowerCase())
    .filter((post) => {
      if (!rootTime || !post.createdAt) return post.discoveryIndex > root.discoveryIndex;
      return Date.parse(post.createdAt) >= rootTime;
    })
    .sort((a, b) => {
      if (a.createdAt && b.createdAt) return Date.parse(a.createdAt) - Date.parse(b.createdAt);
      return a.discoveryIndex - b.discoveryIndex;
    });
}

export function safeSegment(value) {
  return String(value)
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "-")
    .replace(/[. ]+$/g, "")
    .slice(0, 100) || "item";
}

