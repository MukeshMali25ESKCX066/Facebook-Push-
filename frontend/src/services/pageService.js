
const STORAGE_KEY = "pagecrew_demo_pages";

export const DEFAULT_PAGES = [
  {
    id: 1,
    name: "Tech Daily",
    category: "Technology",
    followers: "12.5K",
    connected: true
  },
  {
    id: 2,
    name: "Creative Studio",
    category: "Digital Creator",
    followers: "8.2K",
    connected: true
  },
  {
    id: 3,
    name: "Business Hub",
    category: "Business",
    followers: "24.1K",
    connected: true
  }
];

export function getPages() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);

    if (saved === null) {
      return DEFAULT_PAGES;
    }

    const pages = JSON.parse(saved);

    return Array.isArray(pages)
      ? pages
      : DEFAULT_PAGES;
  } catch {
    return DEFAULT_PAGES;
  }
}

export function getConnectedPages() {
  return getPages().filter(
    (page) => page.connected === true
  );
}

export function savePages(pages) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(pages)
  );

  window.dispatchEvent(
    new Event("pagecrew:pages-updated")
  );
}

export function subscribeToPages(callback) {
  const handleUpdate = () => callback(getPages());

  window.addEventListener(
    "pagecrew:pages-updated",
    handleUpdate
  );

  window.addEventListener(
    "storage",
    handleUpdate
  );

  return () => {
    window.removeEventListener(
      "pagecrew:pages-updated",
      handleUpdate
    );

    window.removeEventListener(
      "storage",
      handleUpdate
    );
  };
}
