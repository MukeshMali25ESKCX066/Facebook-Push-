
import { getConnectedPages } from "./pageService";

const STORAGE_KEY = "pagecrew_demo_scheduled_posts";

export function getScheduledPosts() {
  try {
    const data = JSON.parse(
      localStorage.getItem(STORAGE_KEY) || "[]"
    );

    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function saveScheduledPosts(posts) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(posts)
  );

  window.dispatchEvent(
    new Event("pagecrew:posts-updated")
  );
}

export function scheduleCampaignPosts({
  campaign,
  campaignType,
  date,
  time
}) {
  if (
    !campaign?.id ||
    !Array.isArray(campaign.posts) ||
    campaign.posts.length === 0
  ) {
    throw new Error("Campaign has no generated posts.");
  }

  if (!date || !time) {
    throw new Error("Select a date and time.");
  }

  const scheduledAt = new Date(`${date}T${time}`);

  if (
    Number.isNaN(scheduledAt.getTime()) ||
    scheduledAt <= new Date()
  ) {
    throw new Error("Select a future date and time.");
  }

  const existingPosts = getScheduledPosts();

  if (
    existingPosts.some(
      (post) =>
        post.campaignId === campaign.id &&
        post.campaignType === campaignType
    )
  ) {
    throw new Error("This campaign is already scheduled.");
  }

  const connectedPages = getConnectedPages();

  const newPosts = campaign.posts.map((post) => {
    const matchingPage = connectedPages.find((page) => {
      if (post.pageId !== undefined && post.pageId !== null) {
        return String(page.id) === String(post.pageId);
      }

      return page.name === post.pageName;
    });

    if (!matchingPage) {
      throw new Error(
        `Page "${post.pageName}" is disconnected or unavailable.`
      );
    }

    return {
      id: crypto.randomUUID(),
      content: [
        post.title,
        post.caption,
        (post.hashtags || []).join(" "),
        post.url
      ]
        .filter(Boolean)
        .join("\n\n"),
      pages: [matchingPage.name],
      date,
      time,
      hasImage: Boolean(campaign.imageName),
      imageName: campaign.imageName || "",
      status: "Scheduled",
      campaignId: campaign.id,
      campaignType
    };
  });

  saveScheduledPosts([
    ...newPosts,
    ...existingPosts
  ]);

  return newPosts;
}
