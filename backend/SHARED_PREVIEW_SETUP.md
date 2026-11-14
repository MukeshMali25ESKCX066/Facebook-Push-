# Shared Facebook Preview Setup

The Advanced Auto Publishing image toggle is off by default. When enabled for a campaign, PageCrew uploads each selected image to Cloudflare R2, publishes the corresponding `share` URL as a link-only Facebook post, and serves Open Graph metadata from that URL. A human visitor is redirected to the stored article URL; Facebook receives the metadata HTML without requiring login or JavaScript.

## Required backend setup

1. Create a private Cloudflare R2 bucket for preview images.
2. Create an R2 API token limited to that bucket. Keep the token values in Render's backend environment only.
3. Configure the R2 bucket's public custom domain as `media.happythanks-giving.com`. Confirm that an uploaded object can be fetched publicly over HTTPS before using the feature.
4. If using a Vercel-facing preview domain, attach `share.happythanks-giving.com` (or another public Vercel domain) to the frontend project and use the DNS target Vercel supplies. The Vercel rewrite forwards `/p/:slug` to the Render backend. Alternatively, point the preview domain directly to Render and use Render's supplied DNS target; in that setup the Vercel rewrite is not used.
5. Configure these backend environment variable names in Render:
   - `DATABASE_URL` (PostgreSQL/Neon)
   - `R2_ACCOUNT_ID`
   - `R2_ACCESS_KEY_ID`
   - `R2_SECRET_ACCESS_KEY`
   - `R2_BUCKET_NAME`
   - `R2_PUBLIC_BASE_URL` (`https://media.happythanks-giving.com`)
   - `SHARED_PREVIEW_BASE_URL` (the public HTTPS origin visitors and Facebook should see, such as `https://share.happythanks-giving.com`)
6. Optional backend limits:
   - `SHARED_PREVIEW_MAX_IMAGE_BYTES` (default: 8 MiB; maximum accepted setting: 25 MiB)
   - `SHARED_PREVIEW_MAX_ACTIVE_PER_USER` (default: 500)
   - `SHARED_PREVIEW_RATE_LIMIT_PER_MINUTE` (default: 30)
7. Apply `migrations/2026-03-20-shared-preview-posts.sql` to the existing PostgreSQL database after confirming the `users` table exists. This migration adds a separate table and indexes; it does not modify existing records.
8. Deploy the changed frontend static files and backend runtime to their existing hosting services. No DNS or deployment setting is changed by this code.
9. In Advanced Auto Publishing, select campaign images and turn on **Use selected image as a clickable article preview**. Check activation readiness before activating.
10. Test a generated URL with Meta's Sharing Debugger. Verify that the raw response has the unique `og:title`, `og:description`, and public HTTPS `og:image`, and then test that a normal browser is redirected to the original article.

Use the DNS record types and targets shown by the Vercel, Cloudflare, or Render dashboards; they cannot be safely inferred from this repository. Do not put R2 credentials in Vercel or browser-visible configuration.

## Management API

Authenticated, owner-scoped management endpoints are available under `/api/shared-previews`. They use PageCrew's existing approved-workspace session and add no separate preview approval step:

- `POST /api/shared-previews` (multipart form: `title`, `description`, `originalArticleUrl`, `image`)
- `GET /api/shared-previews`
- `GET /api/shared-previews/:id`
- `PATCH /api/shared-previews/:id`
- `DELETE /api/shared-previews/:id` (disables the link without deleting its R2 object)

Public pages use `GET /p/:slug`. Slugs are random 48-character hexadecimal values. Unsupported or disabled slugs return 404 or 410. Article URLs are checked with PageCrew's existing public URL/DNS validation; the preview server does not fetch the article.

## Rollback

Turn the campaign toggle off and stop publishing before rolling back application code. Existing links remain available and their images are retained. The migration is additive. Do not drop the table or delete the bucket as a routine rollback: first export the preview rows, reconcile stored object keys, and confirm that no published posts depend on those URLs.
