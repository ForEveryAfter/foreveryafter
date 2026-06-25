# Recording & Upload Limits

All content is captured in-app or typed in-app. No external file uploads of unknown provenance.

## Duration Caps

Consistent 5 minutes across all media:

| Media | Max Duration | Enforcement |
|-------|-------------|-------------|
| Video | 5 minutes | Recording UI auto-stop |
| Audio | 5 minutes | Recording UI auto-stop |
| Text | N/A | 10,000 character max per answer |

## File Size Caps

Defense layer — reject before storage:

| Media | Max Size |
|-------|----------|
| Video | 100 MB |
| Audio | 10 MB |
| Photo | 5 MB |
| Text | 50 KB (well above 10K char ceiling) |

## Upload Defense-in-Depth

1. **Client recording:** MediaRecorder stops at 5 min automatically
2. **Pre-upload check:** Verify file duration via metadata before upload
3. **API:** Verify size, type, user quota, rate limit before issuing presigned URL
4. **Presigned URL:** Bake content-length-range condition into R2 presigned POST
5. **Post-upload:** ffprobe verification of actual duration. Reject and delete if >305s
6. **R2 lifecycle:** 7-day auto-cleanup of incomplete multipart uploads

## Per-User Quotas

| Limit | Value |
|-------|-------|
| Total storage | 10 GB |
| Soft warning | 8 GB |
| Upload rate | 20 uploads/hour |
| Daily rate | 50 uploads/day |

## Photo Uploads

Applies to obituary, funeral program, and memorial slideshow photos:

- 5 MB max per file
- 3 photos max per parent (one per tag: `obituary`, `funeral_program`, `memorial_slideshow`)
- JPEG/PNG only, magic-byte verified

## Current State vs. Target

| Component | Current | Target |
|-----------|---------|--------|
| `Recorder.tsx` | 5 min auto-stop | Correct |
| Letters multer | 300 MB limit | 100 MB video / 10 MB audio |
| Final Wishes multer | 200 MB limit | 100 MB video |
| Occasions multer | 300 MB limit | 100 MB video / 10 MB audio |
| Documents multer | 25 MB limit | Keep (PDF only) |
| Presigned URL flow | Not implemented | Required |
| ffprobe verification | Not implemented | Required |
| R2 lifecycle | Not implemented | Required |
| Per-user quota tracking | Not implemented | Required |
| Photo magic-byte check | Not implemented | Required |
