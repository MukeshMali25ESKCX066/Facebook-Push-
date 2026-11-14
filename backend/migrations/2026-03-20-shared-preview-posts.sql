CREATE TABLE shared_preview_posts (
    id UUID PRIMARY KEY,
    owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[0-9a-f]{48}$'),
    title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
    description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 1000),
    original_article_url TEXT NOT NULL,
    image_object_key TEXT NOT NULL,
    public_image_url TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'deleted')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ,
    source_campaign_id UUID,
    source_image_id UUID,
    source_image_updated_at TIMESTAMPTZ
);

CREATE INDEX shared_preview_posts_owner_user_id_idx
    ON shared_preview_posts(owner_user_id);
CREATE INDEX shared_preview_posts_status_idx
    ON shared_preview_posts(status);
CREATE UNIQUE INDEX shared_preview_posts_campaign_assignment_unique_idx
    ON shared_preview_posts(owner_user_id, source_campaign_id, original_article_url, source_image_id)
    WHERE source_campaign_id IS NOT NULL;
