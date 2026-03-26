import express from "express";
import cors from "cors";
import multer from "multer";
import { Octokit } from "@octokit/rest";
import crypto from "node:crypto";
import path from "node:path";
import "dotenv/config";

const requiredEnv = ["GITHUB_TOKEN", "GITHUB_OWNER", "GITHUB_REPO"];
const missing = requiredEnv.filter((name) => !process.env[name]);
if (missing.length) {
  throw new Error(
    `Missing required environment variables: ${missing.join(", ")}`,
  );
}

const {
  GITHUB_TOKEN,
  GITHUB_OWNER,
  GITHUB_REPO,
  GITHUB_BRANCH = "main",
  MANIFEST_PATH = "data/images.json",
  IMAGE_DIR = "images",
  AUDIO_DIR = "audio",
  PORT = 4000,
  ALLOWED_ORIGINS = "http://localhost:5173",
} = process.env;

const MAX_FILE_SIZE = Number(process.env.MAX_FILE_SIZE_BYTES) || 15 * 1024 * 1024;

const octokit = new Octokit({ auth: GITHUB_TOKEN });

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
});

const app = express();
const VALID_DIFFICULTIES = new Set(["easy", "medium", "hard"]);

const originList = ALLOWED_ORIGINS.split(",").map((item) => item.trim());
app.use(
  cors({
    origin: originList,
  }),
);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/assets", async (req, res) => {
  try {
    const manifest = await fetchManifest();

    const difficultyFilter = (req.query.difficulty || "").toString().toLowerCase();
    const q = (req.query.q || "").toString().trim().toLowerCase();
    const hasAudio = (req.query.hasAudio || "").toString().toLowerCase();

    let assets = manifest.entries.filter(
      (entry) => entry?.id && entry?.word && entry?.transliteration && entry?.translation,
    );

    if (difficultyFilter) {
      assets = assets.filter(
        (entry) => (entry.difficulty || "").toLowerCase() === difficultyFilter,
      );
    }

    if (hasAudio === "true") {
      assets = assets.filter((entry) => Boolean(entry.audioSrc));
    } else if (hasAudio === "false") {
      assets = assets.filter((entry) => !entry.audioSrc);
    }

    if (q) {
      assets = assets.filter((entry) => {
        const haystack = [
          entry.word,
          entry.transliteration,
          entry.translation,
          ...(Array.isArray(entry.otherNames) ? entry.otherNames : []),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      });
    }

    assets.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));

    return res.json({ assets, total: assets.length });
  } catch (error) {
    console.error("[assets:list] failed", error);
    return res.status(error.status || 500).json({
      message: "Failed to fetch assets",
      details: error.message || "Unknown error",
    });
  }
});

app.post(
  "/api/assets",
  upload.fields([
    { name: "imageFile", maxCount: 1 },
    { name: "audioFile", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const imageFile = req.files?.imageFile?.[0];
      if (!imageFile) {
        return res.status(400).json({ message: "Image file is required" });
      }

      const validation = validateAssetPayload(req.body);
      if (!validation.ok) {
        return res.status(400).json({
          message: "Invalid asset payload",
          errors: validation.errors,
        });
      }

      const { assetId, word, transliteration, translation, difficulty, otherNames } =
        validation.values;

      const slug = buildSlug(assetId || transliteration || word);
      const imageExt = path.extname(imageFile.originalname) || ".png";
      const imagePath = `${IMAGE_DIR}/${slug}${imageExt}`;

      const audioFile = req.files?.audioFile?.[0];
      const audioExt = audioFile ? path.extname(audioFile.originalname) || ".mp3" : null;
      const audioPath = audioFile ? `${AUDIO_DIR}/${slug}${audioExt}` : null;

      const manifest = await fetchManifest();
      if (manifest.entries.some((entry) => entry.id === slug)) {
        return res.status(409).json({ message: `Asset with id ${slug} already exists` });
      }

      const commitMessageBase = `Add asset ${slug}`;

      const imageUrl = await uploadBinary(
        imagePath,
        imageFile.buffer,
        `${commitMessageBase} image`,
      );

      let audioUrl = "";
      if (audioFile && audioPath) {
        audioUrl = await uploadBinary(
          audioPath,
          audioFile.buffer,
          `${commitMessageBase} audio`,
        );
      }

      const timestamp = new Date().toISOString();
      const record = {
        id: slug,
        word,
        transliteration,
        translation,
        difficulty,
        imageSrc: imageUrl,
        audioSrc: audioUrl,
        otherNames: splitCsv(otherNames),
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      manifest.entries.push(record);
      await saveManifest(manifest.entries, manifest.sha, commitMessageBase);

      return res.status(201).json({ asset: record });
    } catch (error) {
      console.error("[upload] failed", error);
      const status = error.status || 500;
      return res.status(status).json({
        message: "Failed to upload asset",
        details: error.message || "Unknown error",
      });
    }
  },
);

app.patch(
  "/api/assets/:assetId",
  upload.fields([
    { name: "imageFile", maxCount: 1 },
    { name: "audioFile", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const assetId = (req.params.assetId || "").toString().trim();
      if (!assetId) {
        return res.status(400).json({ message: "assetId is required" });
      }

      const manifest = await fetchManifest();
      const index = manifest.entries.findIndex((entry) => entry.id === assetId);
      if (index === -1) {
        return res.status(404).json({ message: `Asset ${assetId} not found` });
      }

      const existing = manifest.entries[index];
      const hasField = (name) => Object.prototype.hasOwnProperty.call(req.body || {}, name);

      const nextWord = hasField("word")
        ? (req.body.word || "").toString().trim()
        : (existing.word || "").toString().trim();
      const nextTransliteration = hasField("transliteration")
        ? (req.body.transliteration || "").toString().trim()
        : (existing.transliteration || "").toString().trim();
      const nextTranslation = hasField("translation")
        ? (req.body.translation || "").toString().trim()
        : (existing.translation || "").toString().trim();
      const nextDifficulty = hasField("difficulty")
        ? (req.body.difficulty || "").toString().trim().toLowerCase()
        : (existing.difficulty || "").toString().trim().toLowerCase();

      const validationErrors = validateAssetValues({
        word: nextWord,
        transliteration: nextTransliteration,
        translation: nextTranslation,
        difficulty: nextDifficulty,
      });

      if (validationErrors.length) {
        return res.status(400).json({
          message: "Invalid asset payload",
          errors: validationErrors,
        });
      }

      const imageFile = req.files?.imageFile?.[0];
      const audioFile = req.files?.audioFile?.[0];
      const removeAudio = (req.body.removeAudio || "").toString().toLowerCase() === "true";

      let nextImageSrc = (existing.imageSrc || existing.imageUrl || "").toString();
      let nextAudioSrc = (existing.audioSrc || existing.audioUrl || "").toString();

      const oldImagePath = getRepoPathFromAssetUrl(nextImageSrc);
      const oldAudioPath = getRepoPathFromAssetUrl(nextAudioSrc);

      if (imageFile) {
        const imageExt = path.extname(imageFile.originalname) || ".png";
        const newImagePath = `${IMAGE_DIR}/${assetId}${imageExt}`;
        nextImageSrc = await uploadBinary(
          newImagePath,
          imageFile.buffer,
          `Update asset ${assetId} image`,
        );

        if (oldImagePath && oldImagePath !== newImagePath) {
          await deleteRepoFileIfExists(oldImagePath, `Delete old asset ${assetId} image`);
        }
      }

      if (audioFile) {
        const audioExt = path.extname(audioFile.originalname) || ".mp3";
        const newAudioPath = `${AUDIO_DIR}/${assetId}${audioExt}`;
        nextAudioSrc = await uploadBinary(
          newAudioPath,
          audioFile.buffer,
          `Update asset ${assetId} audio`,
        );

        if (oldAudioPath && oldAudioPath !== newAudioPath) {
          await deleteRepoFileIfExists(oldAudioPath, `Delete old asset ${assetId} audio`);
        }
      } else if (removeAudio && oldAudioPath) {
        await deleteRepoFileIfExists(oldAudioPath, `Delete asset ${assetId} audio`);
        nextAudioSrc = "";
      }

      const nextOtherNames = hasField("otherNames")
        ? splitCsv(req.body.otherNames)
        : Array.isArray(existing.otherNames)
          ? existing.otherNames
          : [];

      const updated = {
        id: existing.id,
        word: nextWord,
        transliteration: nextTransliteration,
        translation: nextTranslation,
        difficulty: nextDifficulty,
        imageSrc: nextImageSrc,
        audioSrc: nextAudioSrc,
        otherNames: nextOtherNames,
        createdAt: existing.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      manifest.entries[index] = updated;
      await saveManifest(manifest.entries, manifest.sha, `Update asset ${assetId}`);

      return res.json({ asset: updated });
    } catch (error) {
      console.error("[assets:update] failed", error);
      return res.status(error.status || 500).json({
        message: "Failed to update asset",
        details: error.message || "Unknown error",
      });
    }
  },
);

app.delete("/api/assets/:assetId", async (req, res) => {
  try {
    const assetId = (req.params.assetId || "").toString().trim();
    if (!assetId) {
      return res.status(400).json({ message: "assetId is required" });
    }

    const manifest = await fetchManifest();
    const index = manifest.entries.findIndex((entry) => entry.id === assetId);
    if (index === -1) {
      return res.status(404).json({ message: `Asset ${assetId} not found` });
    }

    const entry = manifest.entries[index];
    const imagePath = getRepoPathFromAssetUrl(entry.imageSrc || entry.imageUrl);
    const audioPath = getRepoPathFromAssetUrl(entry.audioSrc || entry.audioUrl);

    await deleteRepoFileIfExists(imagePath, `Delete asset ${assetId} image`);
    await deleteRepoFileIfExists(audioPath, `Delete asset ${assetId} audio`);

    manifest.entries.splice(index, 1);
    await saveManifest(manifest.entries, manifest.sha, `Delete asset ${assetId}`);

    return res.json({ deletedId: assetId });
  } catch (error) {
    console.error("[assets:delete] failed", error);
    return res.status(error.status || 500).json({
      message: "Failed to delete asset",
      details: error.message || "Unknown error",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Asset API listening on port ${PORT}`);
});

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

function splitCsv(value) {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildCdnUrl(relativePath) {
  const normalized = relativePath.replace(/^\/+/, "");
  return `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/${normalized}`;
}

function validateAssetPayload(payload) {
  const values = {
    assetId: (payload.assetId || "").toString().trim(),
    word: (payload.word || "").toString().trim(),
    transliteration: (payload.transliteration || "").toString().trim(),
    translation: (payload.translation || "").toString().trim(),
    difficulty: (payload.difficulty || "").toString().trim().toLowerCase(),
    otherNames: (payload.otherNames || "").toString().trim(),
  };

  const errors = validateAssetValues(values);

  return {
    ok: errors.length === 0,
    errors,
    values,
  };
}

function validateAssetValues(values) {
  const errors = [];

  if (!values.word) errors.push("word is required");
  if (!values.transliteration) errors.push("transliteration is required");
  if (!values.translation) errors.push("translation is required");
  if (!values.difficulty) {
    errors.push("difficulty is required");
  } else if (!VALID_DIFFICULTIES.has(values.difficulty)) {
    errors.push("difficulty must be one of: easy, medium, hard");
  }

  return errors;
}

function getRepoPathFromAssetUrl(value) {
  if (!value) return "";
  const raw = value.toString().trim();
  if (!raw) return "";

  if (!/^https?:\/\//i.test(raw)) {
    return raw.replace(/^\/+/, "");
  }

  try {
    const url = new URL(raw);
    const pathname = decodeURIComponent(url.pathname || "");

    if (url.hostname === "raw.githubusercontent.com") {
      const parts = pathname.split("/").filter(Boolean);
      if (parts.length >= 4) {
        return parts.slice(3).join("/");
      }
    }

    if (url.hostname === "cdn.jsdelivr.net") {
      const match = pathname.match(/^\/gh\/[^/]+\/[^@/]+(?:@[^/]+)?\/(.+)$/);
      if (match?.[1]) {
        return match[1];
      }
    }
  } catch {
    return "";
  }

  return "";
}

async function deleteRepoFileIfExists(targetPath, message) {
  if (!targetPath) return;
  try {
    const { data } = await octokit.repos.getContent({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      path: targetPath,
      ref: GITHUB_BRANCH,
    });

    if (!data || Array.isArray(data) || !data.sha) return;

    await octokit.repos.deleteFile({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      path: targetPath,
      message,
      sha: data.sha,
      branch: GITHUB_BRANCH,
    });
  } catch (error) {
    if (error.status === 404) return;
    throw error;
  }
}

async function uploadBinary(targetPath, buffer, message) {
  const content = buffer.toString("base64");
  await octokit.repos.createOrUpdateFileContents({
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
    path: targetPath,
    message,
    content,
    branch: GITHUB_BRANCH,
  });
  return buildCdnUrl(targetPath);
}

async function fetchManifest() {
  try {
    const { data } = await octokit.repos.getContent({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      path: MANIFEST_PATH,
      ref: GITHUB_BRANCH,
    });
    const content = Buffer.from(data.content, "base64").toString("utf-8");
    return { entries: JSON.parse(content), sha: data.sha };
  } catch (error) {
    if (error.status === 404) {
      return { entries: [], sha: null };
    }
    throw error;
  }
}

async function saveManifest(entries, sha, message) {
  const content = Buffer.from(JSON.stringify(entries, null, 2), "utf-8").toString(
    "base64",
  );
  await octokit.repos.createOrUpdateFileContents({
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
    path: MANIFEST_PATH,
    message: `${message} metadata`,
    content,
    branch: GITHUB_BRANCH,
    sha: sha || undefined,
  });
}