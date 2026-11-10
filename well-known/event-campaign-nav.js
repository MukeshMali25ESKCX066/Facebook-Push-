(function () {
  function installCategory() {
    const nav = document.querySelector(".nav");
    if (!nav || nav.querySelector('[data-pagecrew-category="event-campaigns"]')) return;
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.pagecrewCategory = "event-campaigns";
    button.innerHTML = '<span aria-hidden="true">✦</span>Event Campaigns';
    button.addEventListener("click", () => {
      window.location.assign("/event-campaigns.html");
    });
    nav.appendChild(button);
  }

  installCategory();
  const root = document.getElementById("root");
  if (root) new MutationObserver(installCategory).observe(root, { childList: true, subtree: true });
})();
