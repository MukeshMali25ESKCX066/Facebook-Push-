(function () {
  function installCategory() {
    const nav = document.querySelector(".nav");
    if (!nav) return;
    [
      { key: "event-campaigns", icon: "✦", label: "Event Campaigns", href: "/event-campaigns.html" },
      { key: "ai-content", icon: "✧", label: "AI Content Generator", href: "/ai-content.html" },
      { key: "scheduler", icon: "◷", label: "Smart Scheduler", href: "/scheduler.html" },
      { key: "analytics", icon: "▥", label: "Analytics", href: "/analytics.html" },
      { key: "hybrid-function", icon: "◈", label: "Hybrid Function", href: "/hybrid-studio.html" }
    ].forEach(item => {
      if (nav.querySelector(`[data-pagecrew-category="${item.key}"]`)) return;
      const link = document.createElement("a");
      link.className = "nav-link";
      link.dataset.pagecrewCategory = item.key;
      link.href = item.href;
      link.innerHTML = `<span aria-hidden="true">${item.icon}</span>${item.label}`;
      nav.appendChild(link);
    });
  }

  installCategory();
  const root = document.getElementById("root");
  if (root) new MutationObserver(installCategory).observe(root, { childList: true, subtree: true });
})();
