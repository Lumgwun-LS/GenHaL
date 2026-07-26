---
name: VendorHub Media Library
description: Architecture of the media library feature — unified image/video browsing, editing, and picking from the website builder and social post creator.
---

## Endpoints (all auth-gated, vendor resolved from Clerk session)
- `GET /media-library` — merges `aiGenerationsTable` (image/video, not deleted) + `vendorUploadsTable` (not deleted), sorted by createdAt desc. Returns `MediaLibraryItem[]`.
- `POST /media/upload-url` — auth-based presigned upload URL; derives `vendorId` from the Clerk session, inserts a `vendorUploadsTable` row, returns `{ uploadUrl, mediaUrl }`. **Do NOT pass vendorId from the frontend** — use this endpoint instead of `POST /ai/upload-image-url` / `POST /ai/upload-video-url` when no vendorId is known on the client.
- `POST /media/process-video` — ffmpeg trim + drawtext caption overlay; saves result as a new `vendorUploadsTable` row; returns `{ videoUrl }`.

## Components
- `media-picker-dialog.tsx` — reusable picker (typeFilter: "image"|"video"|"all"). No vendorId prop needed — uploads go via `/api/media/upload-url`. Used in website builder and social create.
- `image-editor-dialog.tsx` — canvas-based rotate/flip/filter/brightness/contrast/saturation. No vendorId prop — saves via `/api/media/upload-url`. `onSave(newUrl)` callback.
- `video-editor-dialog.tsx` — HTML5 video + trim sliders + caption position. Calls `POST /api/media/process-video`. `onSave(newUrl)` callback.

## Page integrations
- `pages/ai-studio/index.tsx` — rewritten as full Media Library (All/Images/Videos/Captions tabs). Upload via `/api/media/upload-url`. Edit opens image/video editor dialogs. "Use for Post" navigates to `/social/create?imageUrl=...` or `?videoUrl=...`.
- `pages/website/index.tsx` — SectionEditor gains `onPickFromLibrary?(sectionId, field)` prop. Every `uploadBtn(field, label)` now shows a "Library" button alongside "Upload". MediaPickerDialog (typeFilter="image") renders at page root.
- `pages/social/create.tsx` — "From Library" button added to the caption toolbar. MediaPickerDialog (typeFilter="all") sets `generatedImage` or `generatedVideo` based on the selected type.

**Why:**
- `POST /media/upload-url` was necessary because existing upload endpoints required vendorId in the request body, but the frontend media components don't always have it readily available. Auth-based resolution is cleaner.

**How to apply:**
- Any new component that uploads vendor media should prefer `POST /media/upload-url` over the old `/ai/upload-image-url` / `/ai/upload-video-url`.
- The `MediaPickerDialog` is the canonical way to let users pick existing media (no new picker widgets needed).
