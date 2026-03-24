import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import "dotenv/config";

const argv = parseArgs(process.argv.slice(2));

const API_BASE = (argv.api || process.env.BULK_API_BASE || "http://localhost:4000").replace(/\/$/, "");
const assetsRoot = path.resolve(argv.assetsRoot || "../sanskrit-assets");
const metadataPath = path.resolve(
  argv.metadata || path.join(assetsRoot, "metadata", "seedFlashcard.txt"),
);
const dryRun = Boolean(argv["dry-run"]);
const skipExisting = argv["skip-existing"] !== false;

const DIFFICULTY_TO_FOLDER = {
  easy: "FlashCardEasy",
  medium: "FlashCardMedium",
  hard: "FlashCardHard",
};

async function main() {
  console.log(`[bulk-upload] API base: ${API_BASE}`);
  console.log(`[bulk-upload] Assets root: ${assetsRoot}`);
  console.log(`[bulk-upload] Metadata file: ${metadataPath}`);
  console.log(`[bulk-upload] Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`[bulk-upload] Skip existing: ${skipExisting}`);

  const words = await loadWordsFromMetadata(metadataPath);
  if (!words.length) {
    throw new Error("No words found in metadata file");
  }

  const existingIds = skipExisting ? await fetchExistingIds(API_BASE) : new Set();

  const summary = {
    total: words.length,
    skippedExisting: 0,
    uploaded: 0,
    failed: 0,
    missingImage: 0,
    missingAudio: 0,
  };

  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];
    const label = `${i + 1}/${words.length}`;

    const difficulty = String(word.difficulty || "").trim().toLowerCase();
    const difficultyFolder = DIFFICULTY_TO_FOLDER[difficulty];

    if (!difficultyFolder) {
      summary.failed += 1;
      console.error(`[${label}] Invalid difficulty for ${word.word || "<unknown>"}: ${word.difficulty}`);
      continue;
    }

    const assetId = buildSlug(word.assetId || word.transliteration || word.word || word.translation);

    if (skipExisting && existingIds.has(assetId)) {
      summary.skippedExisting += 1;
      console.log(`[${label}] Skip existing ${assetId}`);
      continue;
    }

    const imagePath = await resolveImagePath({
      assetsRoot,
      difficultyFolder,
      imageSrc: word.imageSrc,
      translation: word.translation,
      transliteration: word.transliteration,
      word: word.word,
    });

    if (!imagePath) {
      summary.failed += 1;
      summary.missingImage += 1;
      console.error(`[${label}] Missing image for ${assetId}`);
      continue;
    }

    const audioPath = await resolveAudioPath({
      assetsRoot,
      difficultyFolder,
      imagePath,
      audioSrc: word.audioSrc,
    });

    if (!audioPath) {
      summary.missingAudio += 1;
      console.warn(`[${label}] No audio found for ${assetId}; uploading without audio`);
    }

    if (dryRun) {
      console.log(
        `[${label}] DRY RUN ${assetId} -> image=${relativeFromCwd(imagePath)} audio=${audioPath ? relativeFromCwd(audioPath) : "none"}`,
      );
      summary.uploaded += 1;
      continue;
    }

    try {
      await uploadAsset({
        apiBase: API_BASE,
        word,
        assetId,
        imagePath,
        audioPath,
      });

      existingIds.add(assetId);
      summary.uploaded += 1;
      console.log(`[${label}] Uploaded ${assetId}`);
    } catch (error) {
      summary.failed += 1;
      console.error(`[${label}] Failed ${assetId}: ${error.message}`);
    }
  }

  console.log("\n[bulk-upload] Summary");
  console.log(JSON.stringify(summary, null, 2));

  if (summary.failed > 0) {
    process.exitCode = 1;
  }
}

async function uploadAsset({ apiBase, word, assetId, imagePath, audioPath }) {
  const form = new FormData();
  form.append("assetId", assetId);
  form.append("word", String(word.word || "").trim());
  form.append("transliteration", String(word.transliteration || "").trim());
  form.append("translation", String(word.translation || "").trim());
  form.append("difficulty", String(word.difficulty || "").trim().toLowerCase());

  const otherNames = Array.isArray(word.otherNames)
    ? word.otherNames.filter(Boolean).join(",")
    : String(word.otherNames || "").trim();

  if (otherNames) {
    form.append("otherNames", otherNames);
  }

  const imageBuffer = await fs.readFile(imagePath);
  form.append(
    "imageFile",
    new Blob([imageBuffer]),
    path.basename(imagePath),
  );

  if (audioPath) {
    const audioBuffer = await fs.readFile(audioPath);
    form.append(
      "audioFile",
      new Blob([audioBuffer]),
      path.basename(audioPath),
    );
  }

  const response = await fetch(`${apiBase}/api/assets`, {
    method: "POST",
    body: form,
  });

  const payload = await safeJson(response);
  if (!response.ok) {
    const details = payload?.details || payload?.message || `HTTP ${response.status}`;
    throw new Error(details);
  }

  return payload;
}

async function fetchExistingIds(apiBase) {
  try {
    const response = await fetch(`${apiBase}/api/assets`);
    if (!response.ok) {
      const body = await safeJson(response);
      throw new Error(body?.message || `HTTP ${response.status}`);
    }

    const payload = await response.json();
    const ids = new Set();

    for (const asset of payload.assets || []) {
      if (asset?.id) ids.add(String(asset.id));
    }

    console.log(`[bulk-upload] Existing assets on server: ${ids.size}`);
    return ids;
  } catch (error) {
    console.warn(
      `[bulk-upload] Could not fetch existing assets (${error.message}). Proceeding without skip list.`,
    );
    return new Set();
  }
}

async function loadWordsFromMetadata(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  const match = raw.match(/const\s+words\s*=\s*(\[[\s\S]*?\]);/m);

  if (!match?.[1]) {
    throw new Error("Could not parse words array from metadata file");
  }

  let words;
  try {
    words = vm.runInNewContext(match[1]);
  } catch (error) {
    throw new Error(`Failed to evaluate metadata array: ${error.message}`);
  }

  if (!Array.isArray(words)) {
    throw new Error("Parsed metadata is not an array");
  }

  return words;
}

async function resolveImagePath({ assetsRoot, difficultyFolder, imageSrc, translation, transliteration, word }) {
  const folderPath = path.join(assetsRoot, difficultyFolder);

  const candidates = [];
  const normalizedImageSrc = normalizeMetadataPath(imageSrc);
  if (normalizedImageSrc) {
    candidates.push(path.join(assetsRoot, normalizedImageSrc));
    candidates.push(path.join(folderPath, path.basename(normalizedImageSrc)));
  }

  const baseCandidates = [translation, transliteration, word]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .map((value) => value.toLowerCase())
    .map((value) => value.replace(/[^a-z0-9]+/g, ""));

  for (const base of baseCandidates) {
    candidates.push(path.join(folderPath, `${base}.png`));
    candidates.push(path.join(folderPath, `${base}.jpg`));
    candidates.push(path.join(folderPath, `${base}.jpeg`));
    candidates.push(path.join(folderPath, `${base}.webp`));
  }

  for (const candidate of candidates) {
    const resolved = await resolvePathCaseInsensitive(candidate);
    if (resolved) return resolved;
  }

  return null;
}

async function resolveAudioPath({ assetsRoot, difficultyFolder, imagePath, audioSrc }) {
  const audioDir = path.join(assetsRoot, difficultyFolder, "audio");

  const normalizedAudioSrc = normalizeMetadataPath(audioSrc);
  if (normalizedAudioSrc) {
    const explicit = await resolvePathCaseInsensitive(path.join(assetsRoot, normalizedAudioSrc));
    if (explicit) return explicit;
  }

  const imageBase = path.parse(imagePath).name;
  const audioCandidates = [
    path.join(audioDir, `${imageBase}.mp3`),
    path.join(audioDir, `${imageBase}.wav`),
    path.join(audioDir, `${imageBase}.m4a`),
    path.join(audioDir, `${imageBase}.ogg`),
  ];

  for (const candidate of audioCandidates) {
    const resolved = await resolvePathCaseInsensitive(candidate);
    if (resolved) return resolved;
  }

  return null;
}

function normalizeMetadataPath(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  return raw
    .replace(/^\/+/, "")
    .replace(/^\.\//, "")
    .replace(/^FlashCardEasyy\//i, "FlashCardEasy/");
}

async function resolvePathCaseInsensitive(targetPath) {
  const normalized = path.normalize(targetPath);

  if (await exists(normalized)) {
    return normalized;
  }

  const dir = path.dirname(normalized);
  const name = path.basename(normalized).toLowerCase();

  let entries;
  try {
    entries = await fs.readdir(dir);
  } catch {
    return null;
  }

  const matched = entries.find((entry) => entry.toLowerCase() === name);
  if (!matched) return null;

  const candidate = path.join(dir, matched);
  return (await exists(candidate)) ? candidate : null;
}

async function exists(filePath) {
  try {
    await fs.access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function buildSlug(baseValue) {
  const fallback = Math.random().toString(36).slice(2, 10);
  return (baseValue || fallback)
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || fallback;
}

function parseArgs(args) {
  const out = {};

  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];

    if (!token.startsWith("--")) continue;

    const key = token.slice(2);
    const next = args[i + 1];

    if (next && !next.startsWith("--")) {
      out[key] = next;
      i += 1;
      continue;
    }

    out[key] = true;
  }

  if (out["no-skip-existing"]) {
    out["skip-existing"] = false;
  }

  return out;
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function relativeFromCwd(filePath) {
  return path.relative(process.cwd(), filePath).replace(/\\/g, "/");
}

main().catch((error) => {
  console.error(`[bulk-upload] Fatal: ${error.message}`);
  process.exit(1);
});
