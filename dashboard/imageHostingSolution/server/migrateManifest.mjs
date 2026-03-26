import { Octokit } from "@octokit/rest";
import crypto from "node:crypto";
import dotenv from "dotenv";

dotenv.config();

const {
  GITHUB_TOKEN,
  GITHUB_OWNER,
  GITHUB_REPO,
  GITHUB_BRANCH = "main",
  MANIFEST_PATH = "data/images.json",
} = process.env;

if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
  throw new Error("Missing required env: GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO");
}

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const normalizeUrls = !args.has("--keep-urls");

const octokit = new Octokit({ auth: GITHUB_TOKEN });

main().catch((error) => {
  console.error("[migrate] failed:", error.message || error);
  process.exit(1);
});

async function main() {
  const manifest = await fetchManifest();
  const now = new Date().toISOString();

  let changedCount = 0;
  let droppedCount = 0;

  const migrated = manifest.entries
    .map((entry) => {
      const next = migrateEntry(entry, now, normalizeUrls);
      if (!next) {
        droppedCount += 1;
        return null;
      }

      if (!deepEqual(entry, next)) {
        changedCount += 1;
      }

      return next;
    })
    .filter(Boolean);

  const duplicateIds = findDuplicateIds(migrated);
  if (duplicateIds.length > 0) {
    throw new Error(
      `Duplicate ids after migration: ${duplicateIds.join(", ")}. Fix ids before applying.`,
    );
  }

  console.log("[migrate] summary");
  console.log(`- total entries: ${manifest.entries.length}`);
  console.log(`- migrated/changed: ${changedCount}`);
  console.log(`- dropped invalid: ${droppedCount}`);
  console.log(`- normalize urls: ${normalizeUrls}`);
  console.log(`- mode: ${apply ? "apply" : "dry-run"}`);

  if (!apply) {
    console.log("[migrate] dry-run complete. Re-run with --apply to save changes.");
    return;
  }

  await saveManifest(migrated, manifest.sha, "Migrate manifest to pictionary schema");
  console.log("[migrate] manifest updated successfully");
}

function migrateEntry(entry, nowIso, normalizeRawUrls) {
  if (!entry || typeof entry !== "object") return null;

  const word = toCleanString(entry.word ?? entry.sanskrit);
  const transliteration = toCleanString(entry.transliteration);
  const translation = toCleanString(entry.translation);

  if (!word || !transliteration || !translation) {
    return null;
  }

  const difficulty = normalizeDifficulty(entry.difficulty);

  const imageSrcOriginal = toCleanString(entry.imageSrc ?? entry.imageUrl);
  const audioSrcOriginal = toCleanString(entry.audioSrc ?? entry.audioUrl);

  const imageSrc = normalizeRawUrls
    ? normalizeToRawGithubUrl(imageSrcOriginal)
    : imageSrcOriginal;
  const audioSrc = normalizeRawUrls
    ? normalizeToRawGithubUrl(audioSrcOriginal)
    : audioSrcOriginal;

  const id = toCleanString(entry.id) || buildSlug(transliteration || word);

  return {
    id,
    word,
    transliteration,
    translation,
    difficulty,
    imageSrc,
    audioSrc,
    otherNames: normalizeOtherNames(entry.otherNames),
    createdAt: toCleanString(entry.createdAt) || nowIso,
    updatedAt: nowIso,
  };
}

function normalizeDifficulty(value) {
  const text = toCleanString(value).toLowerCase();
  if (text === "easy" || text === "medium" || text === "hard") return text;
  return "easy";
}

function normalizeOtherNames(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((item) => toCleanString(item))
      .filter(Boolean);
  }

  return String(value)
    .split(",")
    .map((item) => toCleanString(item))
    .filter(Boolean);
}

function toCleanString(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function buildSlug(baseValue) {
  const fallback = crypto.randomUUID().slice(0, 8);
  return (baseValue || fallback)
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || fallback;
}

function normalizeToRawGithubUrl(value) {
  const raw = toCleanString(value);
  if (!raw) return "";

  if (!/^https?:\/\//i.test(raw)) {
    const normalizedPath = raw.replace(/^\/+/, "");
    return `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/${normalizedPath}`;
  }

  try {
    const url = new URL(raw);

    if (url.hostname === "raw.githubusercontent.com") {
      return raw;
    }

    if (url.hostname === "cdn.jsdelivr.net") {
      const match = decodeURIComponent(url.pathname).match(
        /^\/gh\/[^/]+\/[^@/]+(?:@[^/]+)?\/(.+)$/,
      );
      if (match?.[1]) {
        return `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/${match[1]}`;
      }
    }

    if (url.hostname === "github.com") {
      const match = decodeURIComponent(url.pathname).match(
        /^\/[^/]+\/[^/]+\/raw\/[^/]+\/(.+)$/,
      );
      if (match?.[1]) {
        return `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/${match[1]}`;
      }
    }
  } catch {
    return raw;
  }

  return raw;
}

function findDuplicateIds(entries) {
  const seen = new Set();
  const dupes = new Set();
  for (const entry of entries) {
    if (!entry?.id) continue;
    if (seen.has(entry.id)) dupes.add(entry.id);
    seen.add(entry.id);
  }
  return Array.from(dupes);
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function fetchManifest() {
  const { data } = await octokit.repos.getContent({
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
    path: MANIFEST_PATH,
    ref: GITHUB_BRANCH,
  });

  if (!data || Array.isArray(data)) {
    throw new Error(`${MANIFEST_PATH} is not a JSON file blob`);
  }

  const content = Buffer.from(data.content, "base64").toString("utf-8");
  return { entries: JSON.parse(content), sha: data.sha };
}

async function saveManifest(entries, sha, message) {
  const content = Buffer.from(JSON.stringify(entries, null, 2), "utf-8").toString(
    "base64",
  );

  await octokit.repos.createOrUpdateFileContents({
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
    path: MANIFEST_PATH,
    message,
    content,
    branch: GITHUB_BRANCH,
    sha,
  });
}
