
import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import "./App.css";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

type Asset = {
  id: string;
  word: string;
  transliteration: string;
  translation: string;
  difficulty: "easy" | "medium" | "hard";
  imageSrc: string;
  audioSrc?: string;
  otherNames?: string[];
  updatedAt?: string;
};

type EditFormState = {
  word: string;
  transliteration: string;
  translation: string;
  difficulty: "easy" | "medium" | "hard" | "";
  otherNames: string;
  removeAudio: boolean;
};

const initialFormState = {
  assetId: "",
  word: "",
  transliteration: "",
  translation: "",
  difficulty: "",
  otherNames: "",
};

function App() {
  const [formValues, setFormValues] = useState(initialFormState);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [assetsError, setAssetsError] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [filters, setFilters] = useState({
    q: "",
    difficulty: "",
    hasAudio: "",
  });
  const [status, setStatus] = useState<
    | { state: "idle" }
    | { state: "submitting" }
    | { state: "success"; message: string }
    | { state: "error"; message: string }
  >({ state: "idle" });
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [editForm, setEditForm] = useState<EditFormState | null>(null);
  const [editImageFile, setEditImageFile] = useState<File | null>(null);
  const [editAudioFile, setEditAudioFile] = useState<File | null>(null);
  const [editErrors, setEditErrors] = useState<string[]>([]);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const isSubmitDisabled = useMemo(() => {
    if (!imageFile) return true;
    if (!formValues.word || !formValues.transliteration || !formValues.translation) {
      return true;
    }
    if (!formValues.difficulty) return true;
    return status.state === "submitting";
  }, [formValues, imageFile, status.state]);

  const updateField = (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value } = event.target;
    setFormValues((prev) => ({ ...prev, [name]: value }));
  };

  const updateFilter = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = event.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  const updateEditField = (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    if (!editForm) return;
    const { name, value, type } = event.target as HTMLInputElement;
    if (type === "checkbox") {
      const checked = (event.target as HTMLInputElement).checked;
      setEditForm((prev) => (prev ? { ...prev, [name]: checked } : prev));
      return;
    }
    setEditForm((prev) => (prev ? { ...prev, [name]: value } : prev));
  };

  const openEditModal = (asset: Asset) => {
    setEditingAsset(asset);
    setEditForm({
      word: asset.word || "",
      transliteration: asset.transliteration || "",
      translation: asset.translation || "",
      difficulty: asset.difficulty || "",
      otherNames: Array.isArray(asset.otherNames) ? asset.otherNames.join(", ") : "",
      removeAudio: false,
    });
    setEditImageFile(null);
    setEditAudioFile(null);
    setEditErrors([]);
  };

  const isEditDirty = useMemo(() => {
    if (!editingAsset || !editForm) return false;
    return (
      editForm.word.trim() !== (editingAsset.word || "") ||
      editForm.transliteration.trim() !== (editingAsset.transliteration || "") ||
      editForm.translation.trim() !== (editingAsset.translation || "") ||
      editForm.difficulty !== (editingAsset.difficulty || "") ||
      editForm.otherNames.trim() !==
        (Array.isArray(editingAsset.otherNames) ? editingAsset.otherNames.join(", ") : "") ||
      editForm.removeAudio ||
      Boolean(editImageFile) ||
      Boolean(editAudioFile)
    );
  }, [editingAsset, editForm, editImageFile, editAudioFile]);

  useEffect(() => {
    if (!editingAsset || !isEditDirty) return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [editingAsset, isEditDirty]);

  const closeEditModal = () => {
    if (isSavingEdit) return;
    if (isEditDirty) {
      const confirmed = window.confirm("Discard unsaved changes?");
      if (!confirmed) return;
    }
    setEditingAsset(null);
    setEditForm(null);
    setEditImageFile(null);
    setEditAudioFile(null);
    setEditErrors([]);
  };

  const submitEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingAsset || !editForm) return;

    setIsSavingEdit(true);
    setEditErrors([]);

    const payload = new FormData();
    payload.append("word", editForm.word.trim());
    payload.append("transliteration", editForm.transliteration.trim());
    payload.append("translation", editForm.translation.trim());
    payload.append("difficulty", editForm.difficulty);
    payload.append("otherNames", editForm.otherNames);
    if (editForm.removeAudio) {
      payload.append("removeAudio", "true");
    }
    if (editImageFile) payload.append("imageFile", editImageFile);
    if (editAudioFile) payload.append("audioFile", editAudioFile);

    try {
      const response = await fetch(`${API_BASE}/api/assets/${encodeURIComponent(editingAsset.id)}`, {
        method: "PATCH",
        body: payload,
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const errors = Array.isArray(body?.errors)
          ? body.errors
          : [body?.message || "Failed to update asset"];
        setEditErrors(errors);
        return;
      }

      setStatus({ state: "success", message: `Updated asset ${editingAsset.id}` });
      setEditingAsset(null);
      setEditForm(null);
      setEditImageFile(null);
      setEditAudioFile(null);
      setEditErrors([]);
      await fetchAssets();
    } catch (error) {
      setEditErrors([error instanceof Error ? error.message : "Failed to update asset"]);
    } finally {
      setIsSavingEdit(false);
    }
  };

  const fetchAssets = async () => {
    setAssetsLoading(true);
    setAssetsError("");
    try {
      const params = new URLSearchParams();
      if (filters.q.trim()) params.set("q", filters.q.trim());
      if (filters.difficulty) params.set("difficulty", filters.difficulty);
      if (filters.hasAudio) params.set("hasAudio", filters.hasAudio);

      const response = await fetch(`${API_BASE}/api/assets?${params.toString()}`);
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.message || "Failed to fetch assets");
      }

      const data = await response.json();
      setAssets(Array.isArray(data.assets) ? data.assets : []);
    } catch (error) {
      setAssetsError(error instanceof Error ? error.message : "Failed to fetch assets");
    } finally {
      setAssetsLoading(false);
    }
  };

  useEffect(() => {
    fetchAssets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.q, filters.difficulty, filters.hasAudio]);

  const deleteAsset = async (asset: Asset) => {
    const confirmed = window.confirm(
      `Delete ${asset.word} (${asset.id})? This removes files and manifest entry from GitHub.`,
    );
    if (!confirmed) return;

    setDeletingId(asset.id);
    setStatus({ state: "idle" });
    try {
      const response = await fetch(`${API_BASE}/api/assets/${encodeURIComponent(asset.id)}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.message || "Delete failed");
      }

      setStatus({ state: "success", message: `Deleted asset ${asset.id}` });
      await fetchAssets();
    } catch (error) {
      setStatus({
        state: "error",
        message: error instanceof Error ? error.message : "Delete failed",
      });
    } finally {
      setDeletingId("");
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!imageFile) {
      setStatus({ state: "error", message: "Image file is required" });
      return;
    }

    setStatus({ state: "submitting" });
    const payload = new FormData();
    Object.entries(formValues).forEach(([key, value]) => {
      if (value) payload.append(key, value);
    });
    payload.append("imageFile", imageFile);
    if (audioFile) {
      payload.append("audioFile", audioFile);
    }

    try {
      const response = await fetch(`${API_BASE}/api/assets`, {
        method: "POST",
        body: payload,
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        const validationText = Array.isArray(errorBody?.errors)
          ? `: ${errorBody.errors.join(", ")}`
          : "";
        throw new Error((errorBody.message || "Upload failed") + validationText);
      }

      const result = await response.json();
      setStatus({
        state: "success",
        message: `Uploaded asset ${result?.asset?.id ?? ""}`,
      });
      setFormValues(initialFormState);
      setImageFile(null);
      setAudioFile(null);
      (event.target as HTMLFormElement).reset();
      await fetchAssets();
    } catch (error) {
      setStatus({
        state: "error",
        message: error instanceof Error ? error.message : "Unexpected error",
      });
    }
  };

  return (
    <div className="dashboard-root">
      <aside className="dashboard-sidebar">
        <h2 className="sidebar-title">Pictionary Assets</h2>
        <nav>
          <ul>
            <li><a href="#upload">Upload</a></li>
            <li><a href="#gallery">Gallery</a></li>
            <li><a href="#about">About</a></li>
          </ul>
        </nav>
      </aside>
      <main className="dashboard-main">
        <header className="dashboard-header">
          <h1>Sanskrit Pictionary Asset Dashboard</h1>
          <p>Upload flashcards for Pictionary in the same schema the game consumes.</p>
        </header>

        <section className="dashboard-section" id="upload">
          <h2>Upload New Asset</h2>
          <form className="upload-form" onSubmit={handleSubmit}>
            <fieldset className="form-group">
              <legend>Files</legend>
              <label htmlFor="imageFile">Image File<span className="required">*</span></label>
              <input
                type="file"
                id="imageFile"
                name="imageFile"
                accept="image/*"
                required
                onChange={(event) => setImageFile(event.target.files?.[0] ?? null)}
              />

              <label htmlFor="audioFile">Audio File (optional)</label>
              <input
                type="file"
                id="audioFile"
                name="audioFile"
                accept="audio/*"
                onChange={(event) => setAudioFile(event.target.files?.[0] ?? null)}
              />
            </fieldset>

            <fieldset className="form-grid">
              <legend>Flashcard Data</legend>
              <div className="grid-field">
                <label htmlFor="assetId">Asset ID (optional override)</label>
                <input
                  type="text"
                  id="assetId"
                  name="assetId"
                  placeholder="auto-generated if empty"
                  value={formValues.assetId}
                  onChange={updateField}
                />
              </div>

              <div className="grid-field">
                <label htmlFor="word">Word (Devanagari)<span className="required">*</span></label>
                <input
                  type="text"
                  id="word"
                  name="word"
                  placeholder="e.g. अग्नि"
                  value={formValues.word}
                  onChange={updateField}
                  required
                />
              </div>

              <div className="grid-field">
                <label htmlFor="transliteration">Transliteration<span className="required">*</span></label>
                <input
                  type="text"
                  id="transliteration"
                  name="transliteration"
                  placeholder="e.g. agni"
                  value={formValues.transliteration}
                  onChange={updateField}
                  required
                />
              </div>

              <div className="grid-field">
                <label htmlFor="translation">English Translation<span className="required">*</span></label>
                <input
                  type="text"
                  id="translation"
                  name="translation"
                  placeholder="e.g. fire"
                  value={formValues.translation}
                  onChange={updateField}
                  required
                />
              </div>

              <div className="grid-field">
                <label htmlFor="difficulty">Difficulty<span className="required">*</span></label>
                <select
                  id="difficulty"
                  name="difficulty"
                  value={formValues.difficulty}
                  onChange={updateField}
                  required
                >
                  <option value="">Select...</option>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>

              <div className="grid-field">
                <label htmlFor="otherNames">Other Names (comma separated)</label>
                <input
                  type="text"
                  id="otherNames"
                  name="otherNames"
                  placeholder="Alternate Sanskrit spellings"
                  value={formValues.otherNames}
                  onChange={updateField}
                />
              </div>
            </fieldset>

            {status.state === "error" && (
              <p className="status status-error">{status.message}</p>
            )}
            {status.state === "success" && (
              <p className="status status-success">{status.message}</p>
            )}

            <button className="upload-btn" type="submit" disabled={isSubmitDisabled}>
              {status.state === "submitting" ? "Uploading..." : "Upload Asset"}
            </button>
          </form>
        </section>

        <section className="dashboard-section" id="gallery">
          <h2>Gallery</h2>
          <div className="gallery-controls">
            <input
              type="text"
              name="q"
              placeholder="Search word, transliteration, translation, aliases"
              value={filters.q}
              onChange={updateFilter}
            />
            <select name="difficulty" value={filters.difficulty} onChange={updateFilter}>
              <option value="">All Difficulties</option>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
            <select name="hasAudio" value={filters.hasAudio} onChange={updateFilter}>
              <option value="">Audio: Any</option>
              <option value="true">Has Audio</option>
              <option value="false">No Audio</option>
            </select>
          </div>

          {assetsError && <p className="status status-error">{assetsError}</p>}
          {assetsLoading ? <p className="gallery-placeholder">Loading assets...</p> : null}

          {!assetsLoading && !assets.length ? (
            <p className="gallery-placeholder">No assets match current filters.</p>
          ) : null}

          <div className="gallery-grid">
            {assets.map((asset) => (
              <article className="asset-card" key={asset.id}>
                <img src={asset.imageSrc} alt={asset.translation || asset.word} />
                <div className="asset-card-body">
                  <h3>{asset.word}</h3>
                  <p>{asset.transliteration} · {asset.translation}</p>
                  <p className="asset-meta">Difficulty: {asset.difficulty}</p>
                  {asset.otherNames?.length ? (
                    <p className="asset-meta">Other: {asset.otherNames.join(", ")}</p>
                  ) : null}
                  {asset.audioSrc ? (
                    <audio controls preload="none" src={asset.audioSrc} />
                  ) : (
                    <p className="asset-meta">No audio</p>
                  )}
                  <div className="asset-actions">
                    <button
                      className="edit-btn"
                      type="button"
                      onClick={() => openEditModal(asset)}
                    >
                      Edit
                    </button>
                    <button
                      className="delete-btn"
                      type="button"
                      disabled={deletingId === asset.id}
                      onClick={() => deleteAsset(asset)}
                    >
                      {deletingId === asset.id ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="dashboard-section" id="about">
          <h2>About</h2>
          <p>
            Assets commit directly into the GitHub repository and update the Pictionary flashcard manifest used by
            the game server.
          </p>
          <p>
            Asset links use raw.githubusercontent.com URLs so updates appear immediately without CDN cache delay.
          </p>
        </section>

        {editingAsset && editForm ? (
          <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="edit-title">
            <div className="modal-card">
              <div className="modal-header">
                <h2 id="edit-title">Edit Asset: {editingAsset.id}</h2>
                <button type="button" className="modal-close" onClick={closeEditModal}>
                  Close
                </button>
              </div>

              <form className="modal-form" onSubmit={submitEdit}>
                <div className="form-grid">
                  <div className="grid-field">
                    <label htmlFor="edit-word">Word (Devanagari)<span className="required">*</span></label>
                    <input
                      id="edit-word"
                      name="word"
                      type="text"
                      value={editForm.word}
                      onChange={updateEditField}
                      required
                    />
                  </div>

                  <div className="grid-field">
                    <label htmlFor="edit-transliteration">Transliteration<span className="required">*</span></label>
                    <input
                      id="edit-transliteration"
                      name="transliteration"
                      type="text"
                      value={editForm.transliteration}
                      onChange={updateEditField}
                      required
                    />
                  </div>

                  <div className="grid-field">
                    <label htmlFor="edit-translation">English Translation<span className="required">*</span></label>
                    <input
                      id="edit-translation"
                      name="translation"
                      type="text"
                      value={editForm.translation}
                      onChange={updateEditField}
                      required
                    />
                  </div>

                  <div className="grid-field">
                    <label htmlFor="edit-difficulty">Difficulty<span className="required">*</span></label>
                    <select
                      id="edit-difficulty"
                      name="difficulty"
                      value={editForm.difficulty}
                      onChange={updateEditField}
                      required
                    >
                      <option value="">Select...</option>
                      <option value="easy">Easy</option>
                      <option value="medium">Medium</option>
                      <option value="hard">Hard</option>
                    </select>
                  </div>

                  <div className="grid-field">
                    <label htmlFor="edit-otherNames">Other Names (comma separated)</label>
                    <input
                      id="edit-otherNames"
                      name="otherNames"
                      type="text"
                      value={editForm.otherNames}
                      onChange={updateEditField}
                    />
                  </div>

                  <div className="grid-field">
                    <label htmlFor="edit-imageFile">Replace Image (optional)</label>
                    <input
                      id="edit-imageFile"
                      name="imageFile"
                      type="file"
                      accept="image/*"
                      onChange={(e) => setEditImageFile(e.target.files?.[0] ?? null)}
                    />
                  </div>

                  <div className="grid-field">
                    <label htmlFor="edit-audioFile">Replace Audio (optional)</label>
                    <input
                      id="edit-audioFile"
                      name="audioFile"
                      type="file"
                      accept="audio/*"
                      onChange={(e) => {
                        setEditAudioFile(e.target.files?.[0] ?? null);
                        if (e.target.files?.[0]) {
                          setEditForm((prev) => (prev ? { ...prev, removeAudio: false } : prev));
                        }
                      }}
                    />
                  </div>

                  <div className="grid-field checkbox-field">
                    <label>
                      <input
                        name="removeAudio"
                        type="checkbox"
                        checked={editForm.removeAudio}
                        onChange={updateEditField}
                        disabled={Boolean(editAudioFile)}
                      />
                      Remove existing audio
                    </label>
                  </div>
                </div>

                {editErrors.length ? (
                  <div className="status status-error">
                    {editErrors.join("; ")}
                  </div>
                ) : null}

                <div className="modal-actions">
                  <button type="button" className="modal-cancel" onClick={closeEditModal} disabled={isSavingEdit}>
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="upload-btn"
                    disabled={
                      isSavingEdit ||
                      !editForm.word.trim() ||
                      !editForm.transliteration.trim() ||
                      !editForm.translation.trim() ||
                      !editForm.difficulty
                    }
                  >
                    {isSavingEdit ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}

export default App;
