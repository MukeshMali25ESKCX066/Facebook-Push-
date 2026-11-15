(() => {
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const requestUrl = typeof input === "string" ? input : input.url;
    const method = String((init && init.method) || (input && input.method) || "GET").toUpperCase();
    const response = await originalFetch(input, init);
    if (method === "POST" && requestUrl
      && new URL(requestUrl, window.location.href).pathname.replace(/\/+$/, "").endsWith("/api/auth/logout")
      && response.ok) {
      window.location.replace("/dashboard-choice");
    }
    return response;
  };
})();
