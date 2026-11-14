"use strict";

async function publishJobToPages(job, { getPageToken, publishToPage, persist }) {
    const publishedPostIds = job.publishedPostIds || (job.publishedPostIds = {});
    const pageErrors = {};

    for (const pageId of job.pageIds) {
        if (publishedPostIds[pageId] || job.fbScheduled?.[pageId]) {
            continue;
        }

        const pageToken = getPageToken(pageId);
        if (!pageToken) {
            pageErrors[pageId] = "No Page access token. Reconnect Facebook and reload your Pages.";
            continue;
        }

        try {
            publishedPostIds[pageId] = await publishToPage(
                pageId,
                pageToken,
                job.content,
                job.media,
                job.media ? { disableMediaLinkPreview: true } : undefined
            );
        }
        catch (error) {
            pageErrors[pageId] = error instanceof Error ? error.message : "Facebook publish failed.";
            continue;
        }

        await persist(job);
    }

    job.pageErrors = pageErrors;
    const publishedCount = job.pageIds.filter((pageId) => publishedPostIds[pageId] || job.fbScheduled?.[pageId]).length;
    if (publishedCount === job.pageIds.length) {
        job.status = "published";
    }
    else if (publishedCount > 0) {
        job.status = "partial";
    }
    else {
        job.status = "failed";
    }
}

module.exports = { publishJobToPages };
