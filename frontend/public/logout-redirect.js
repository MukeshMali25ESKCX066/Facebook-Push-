(() => {
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const requestUrl = typeof input === "string" ? input : input.url;
    const method = String((init && init.method) || (input && input.method) || "GET").toUpperCase();
    const response = await originalFetch(input, init);
    if (method === "POST" && requestUrl
      && new URL(requestUrl, window.location.href).pathname.replace(/\/+$/, "").endsWith("/api/auth/logout")
      && response.ok) {
      const result = await response.clone().json().catch(() => ({}));
      window.location.replace(result.redirectTo === "/" ? "/" : "/login");
    }
    return response;
  };
})();
