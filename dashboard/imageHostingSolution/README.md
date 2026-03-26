# Sanskrit Assets Dashboard

React + Vite dashboard for uploading Sanskrit Pictionary flashcards (image, optional audio, and core word metadata) directly into a dedicated public GitHub repository.

## Key Features
- Collect only fields needed by Sanskrit Pictionary game sessions.
- Upload image + optional audio files which are immediately committed to the GitHub assets repository.
- Automatically append/update the JSON manifest with the same object shape consumed by the Pictionary server.

## Prerequisites
1. Personal access token with `repo` scope for the assets repository.
2. Repository (public) that will store:
   - `images/` — image files
   - `audio/` — audio files
   - `data/images.json` — metadata manifest

## Setup

```bash
npm install
cp .env.example .env       # fill in GitHub owner/repo/token
```

## Development Workflow

Run the Vite app and the API server in two terminals:

```bash
npm run dev       # React dashboard @ http://localhost:5173
npm run server    # Upload API @ http://localhost:4000
```

Configure `VITE_API_BASE_URL` if you expose the server elsewhere.

## Environment Variables

See `.env.example` for all options. Required:

| Variable | Description |
| --- | --- |
| `GITHUB_TOKEN` | PAT used for committing files |
| `GITHUB_OWNER` / `GITHUB_REPO` | Target repo info |

Optional knobs include branch, manifest path, upload size, and allowed origins.

Asset URLs are written as `raw.githubusercontent.com` links to avoid CDN cache delays.

## API Behavior

`POST /api/assets`

- Accepts `multipart/form-data` with:
   - `word` (required)
   - `transliteration` (required)
   - `translation` (required)
   - `difficulty` (required)
   - `otherNames` (optional, comma separated)
   - `assetId` (optional slug override)
   - `imageFile` (required)
   - `audioFile` (optional)
- Uploads binaries via the GitHub Contents API.
- Updates `data/images.json` with game-ready fields:
   - `word`, `transliteration`, `translation`, `difficulty`
   - `imageSrc`, `audioSrc`, `otherNames`
   - `id`, `createdAt`, `updatedAt`
- Returns the persisted record.

`GET /api/assets`

- Returns all assets in manifest.
- Supports filters via query params:
   - `q` text search over word/transliteration/translation/otherNames
   - `difficulty` (`easy|medium|hard`)
   - `hasAudio` (`true|false`)

`DELETE /api/assets/:assetId`

- Removes the manifest record.
- Deletes corresponding image/audio files from GitHub (if present).

`PATCH /api/assets/:assetId`

- Updates metadata fields (`word`, `transliteration`, `translation`, `difficulty`, `otherNames`).
- Optional file replacement:
   - `imageFile` replaces the current image.
   - `audioFile` replaces the current audio.
   - `removeAudio=true` removes current audio (when no replacement is provided).
- Server validates final asset shape before writing.
- On replacement, old image/audio files are deleted from GitHub when paths change.

## Manifest Migration

Use this one-time migration script to normalize older records into the current Pictionary schema.

Dry run (no writes):

```bash
npm run migrate:manifest
```

Apply migration to GitHub manifest:

```bash
npm run migrate:manifest:apply
```

Notes:
- Converts legacy keys: `sanskrit` -> `word`, `imageUrl` -> `imageSrc`, `audioUrl` -> `audioSrc`.
- Normalizes relative and jsDelivr URLs to `raw.githubusercontent.com` URLs.
- Drops invalid records missing required fields (`word`, `transliteration`, `translation`).
- Fails safely if duplicate ids are detected after migration.

## Bulk Import From Local Asset Pack

Use this when you already have organized asset folders and a metadata file (for example, `../sanskrit-assets`).

Default assumptions:
- Assets root: `../sanskrit-assets`
- Metadata file: `../sanskrit-assets/metadata/seedFlashcard.txt`
- API endpoint: `http://localhost:4000`

Dry run (no upload, validates matching):

```bash
npm run upload:bulk -- --dry-run
```

Live upload:

```bash
npm run upload:bulk
```

Custom locations:

```bash
npm run upload:bulk -- --assetsRoot ../sanskrit-assets --metadata ../sanskrit-assets/metadata/seedFlashcard.txt --api http://localhost:4000
```

Behavior notes:
- Uploads via `POST /api/assets` so it uses the same path as dashboard submissions.
- Resolves metadata quirks like `FlashCardEasyy/...` and case differences (for example `happiness.png` vs `Happiness.png`).
- Auto-detects audio in `<difficulty-folder>/audio/` when metadata audio path is empty.
- Skips assets that already exist on the server by default.
- Use `--no-skip-existing` to force attempts for all rows.

## Next Steps
- Add authentication (GitHub OAuth or internal auth) for the dashboard UI.
- Add a manifest browser/editor for correcting existing entries.

