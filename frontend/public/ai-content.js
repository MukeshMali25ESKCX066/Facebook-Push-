(function () {
  const root = document.getElementById("ai-content-app");
  const campaignId = new URLSearchParams(window.location.search).get("campaign") || "";
  const state = { campaign: null, settings: null, content: [], usage: [], busy: false, message: "", messageType: "" };

  function createRequestId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return `pc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }

  function escapeHtml(value) {
    const node = document.createElement("span");
    node.textContent = String(value == null ? "" : value);
    return node.innerHTML;
  }

  function safeImageSource(value) {
    const source = String(value || "");
    if (/^https:\/\/[^ ]+$/i.test(source) || /^data:image\/(?:png|jpeg|webp);base64,/i.test(source)) return source;
    return "";
  }

  async function request(path, options = {}) {
    const { timeoutMs = 30000, ...fetchOptions } = options;
    const requestId = createRequestId();
    let response;
    try {
      response = await fetch(path, {
        credentials: "include",
        ...fetchOptions,
        signal: fetchOptions.signal || AbortSignal.timeout(timeoutMs),
        headers: {
          ...(options.body ? { "Content-Type": "application/json" } : {}),
          ...(options.headers || {}),
          "X-Request-ID": requestId
        }
      });
    } catch (error) {
      if (error && (error.name === "TimeoutError" || error.name === "AbortError")) {
        throw new Error(`PageCrew API request timed out after ${Math.round(timeoutMs / 1000)} seconds. Request ID: ${requestId}`);
      }
      throw new Error(`Could not connect to the PageCrew API. Check the Vercel API rewrite and backend availability. Request ID: ${requestId}`);
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("application/json")) {
      throw new Error(`The API returned a non-JSON response (HTTP ${response.status}). Check the Vercel /api rewrite. Request ID: ${response.headers.get("x-request-id") || requestId}`);
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const requestIdFromServer = response.headers.get("x-request-id") || data.requestId || requestId;
      const detail = data.error || `Request failed (HTTP ${response.status}).`;
      throw new Error(`${detail} (HTTP ${response.status}; Request ID: ${requestIdFromServer})`);
    }
    return data;
  }

  function defaultSettings() {
    return {
      language: "English",
      tone: "Engaging",
      goal: "Website Traffic",
      captionLength: "Medium",
      emoji: true,
      hashtags: true,
      ctaMode: "automatic",
      manualCta: "",
      imageStyle: "Festival",
      variations: 3
    };
  }

  function optionList(values, selected) {
    return values.map(value => `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(value)}</option>`).join("");
  }

  function showMessage(message, type = "") {
    state.message = message;
    state.messageType = type;
    const banner = root.querySelector("#ai-message");
    if (!banner) return;
    banner.className = `ai-alert${type ? ` ${type}` : ""}`;
    banner.textContent = message;
    banner.hidden = !message;
  }

  function render() {
    if (!state.campaign) return;
    const campaign = state.campaign;
    const settings = { ...defaultSettings(), ...(state.settings || {}) };
    const approvedCount = state.content.filter(item => item.status === "approved").length;
    const pageCount = Array.isArray(campaign.pages) ? campaign.pages.length : 0;
    const imageCount = state.content.reduce((sum, item) => sum + (item.images || []).length, 0);

    root.innerHTML = `
      <section class="ai-hero">
        <div class="ai-hero-copy">
          <p class="ai-eyebrow">Step 2 of 5 · Page-wise content</p>
          <h2>${escapeHtml(campaign.campaignName || campaign.eventName || "Campaign content")}</h2>
          <p>${escapeHtml(campaign.eventName || "Event")} · ${pageCount} ${pageCount === 1 ? "Page" : "Pages"} selected · ${escapeHtml((campaign.article || {}).title || campaign.articleUrl || "Article")}</p>
        </div>
        <a class="ai-button secondary" href="/event-campaigns.html">← Edit campaign brief</a>
      </section>
      <section class="ai-steps" aria-label="Campaign workflow">
        <div class="ai-step"><span>1</span><strong>Event &amp; article</strong></div>
        <div class="ai-step active"><span>2</span><strong>AI content</strong></div>
        <div class="ai-step"><span>3</span><strong>Smart schedule</strong></div>
        <div class="ai-step"><span>4</span><strong>Facebook publishing</strong></div>
        <div class="ai-step"><span>5</span><strong>Analytics</strong></div>
      </section>
      <div id="ai-message" class="ai-alert" role="status" ${state.message ? "" : "hidden"}>${escapeHtml(state.message)}</div>
      <div class="ai-layout">
        <div class="ai-main-column">
          <section class="ai-panel">
            <div class="ai-panel-heading">
              <div><h3>Generation settings</h3><p>Each selected Page gets its own angle, caption, CTA and relevant hashtag set.</p></div>
            </div>
            <form id="ai-settings-form">
              <div class="ai-settings">
                <label class="ai-field">Content language<input name="language" maxlength="40" value="${escapeHtml(settings.language)}" placeholder="English"></label>
                <label class="ai-field">Content tone<select name="tone">${optionList(["Friendly", "Professional", "Emotional", "Informative", "Engaging"], settings.tone)}</select></label>
                <label class="ai-field">Content goal<select name="goal">${optionList(["Website Traffic", "Engagement", "Awareness"], settings.goal)}</select></label>
                <label class="ai-field">Caption length<select name="captionLength">${optionList(["Short", "Medium", "Long"], settings.captionLength)}</select></label>
                <label class="ai-field">CTA<select name="ctaMode">${optionList(["automatic", "manual"], settings.ctaMode)}</select></label>
                <label class="ai-field" id="ai-manual-cta-field" ${settings.ctaMode === "manual" ? "" : "hidden"}>Manual CTA<input name="manualCta" maxlength="120" value="${escapeHtml(settings.manualCta)}" placeholder="Read the full guide"></label>
                <label class="ai-field">Creative style<select name="imageStyle">${optionList(["Festival", "Minimal", "Informative", "Promotional", "Emotional"], settings.imageStyle)}</select></label>
                <label class="ai-field">Image variations per Page<select name="variations">${optionList(["1", "3", "5"], String(settings.variations))}</select></label>
                <label class="ai-toggle"><input type="checkbox" name="emoji" ${settings.emoji ? "checked" : ""}> Use emojis when relevant</label>
                <label class="ai-toggle"><input type="checkbox" name="hashtags" ${settings.hashtags ? "checked" : ""}> Include relevant hashtags</label>
              </div>
              <div class="ai-settings-actions">
                <span class="ai-cost-note">Text generation uses the configured AI provider. Image generation is optional and may incur extra provider charges; images are only requested when you click Generate images.</span>
                <button class="ai-button" type="submit" ${state.busy || pageCount === 0 ? "disabled" : ""}>${state.busy ? "Generating…" : state.content.length ? "Regenerate all drafts" : "Generate page-wise content"}</button>
              </div>
            </form>
          </section>
          <section class="ai-panel">
            <div class="ai-panel-heading">
              <div><h3>Generated Page content</h3><p>Review and edit each post. Nothing is published automatically.</p></div>
            </div>
            <div id="ai-post-list" class="ai-post-list">${state.content.length ? state.content.map(renderPost).join("") : `<div class="ai-empty">Your Page-specific post drafts will appear here after you generate content.</div>`}</div>
          </section>
        </div>
        <aside class="ai-summary">
          <h3>Content summary</h3>
          <p>${escapeHtml(campaign.eventName || "Campaign")} · ${pageCount} selected ${pageCount === 1 ? "Page" : "Pages"}</p>
          <dl>
            <div><dt>Unique captions</dt><dd>${state.content.length}</dd></div>
            <div><dt>CTA suggestions</dt><dd>${state.content.filter(item => item.cta).length}</dd></div>
            <div><dt>Hashtag sets</dt><dd>${state.content.filter(item => (item.hashtags || []).length).length}</dd></div>
            <div><dt>Image variations</dt><dd>${imageCount}</dd></div>
            <div><dt>Approved</dt><dd>${approvedCount} / ${state.content.length}</dd></div>
          </dl>
          <div class="ai-summary-status">${state.content.length ? "Saved to this campaign" : "Waiting for generation"}</div>
          <p class="ai-summary-note">Approval only marks content ready for your next workflow step. It does not publish to Facebook.</p>
          <a class="ai-button secondary ai-continue" href="/scheduler.html?campaign=${encodeURIComponent(campaign.id)}" ${approvedCount ? "" : `aria-disabled="true" title="Approve at least one post to continue"`}>Continue to Smart Scheduler →</a>
          ${state.usage.length ? `<div class="ai-usage">${state.usage[0].status === "failed" ? `Last attempt failed: ${escapeHtml(state.usage[0].error || "AI request failed.")}` : `Latest ${escapeHtml(state.usage[0].action || "generation")}: ${Number(state.usage[0].inputTokens || 0)} input / ${Number(state.usage[0].outputTokens || 0)} output tokens${state.usage[0].estimatedCostUsd != null && Number.isFinite(Number(state.usage[0].estimatedCostUsd)) ? ` · estimated $${Number(state.usage[0].estimatedCostUsd).toFixed(4)}` : ""} · ${escapeHtml(state.usage[0].model || "")}`}</div>` : ""}
        </aside>
      </div>`;

    root.querySelector("#ai-settings-form").addEventListener("submit", generateAll);
    root.querySelector(".ai-continue").addEventListener("click", event => {
      if (!approvedCount) {
        event.preventDefault();
        showMessage("Approve at least one Page post before continuing to the Smart Scheduler.", "error");
      }
    });
    root.querySelector('[name="ctaMode"]').addEventListener("change", event => {
      root.querySelector("#ai-manual-cta-field").hidden = event.target.value !== "manual";
      state.settings = collectSettings();
    });
    root.querySelector("#ai-settings-form").addEventListener("input", () => { state.settings = collectSettings(); });
    root.querySelector("#ai-settings-form").addEventListener("change", () => { state.settings = collectSettings(); });
    root.querySelector("#ai-post-list").addEventListener("input", updateCharacterCount);
    root.querySelector("#ai-post-list").addEventListener("click", handlePostAction);
    showMessage(state.message, state.messageType);
  }

  function renderPost(post) {
    const profileImage = safeImageSource(post.pagePictureUrl);
    const selectedImage = (post.images || []).find(image => image.id === post.selectedImageId);
    const selectedImageUrl = selectedImage ? contentImageUrl(post, selectedImage.id) : safeImageSource(post.featuredImage);
    const variations = (post.images || []).map(image => `
      <button class="ai-image-choice ${image.id === post.selectedImageId ? "selected" : ""}" type="button" data-action="select-image" data-content-id="${escapeHtml(post.id)}" data-image-id="${escapeHtml(image.id)}" aria-label="Select generated image">
        <img src="${escapeHtml(contentImageUrl(post, image.id))}" alt="Generated ${escapeHtml(image.style)} variation" loading="lazy"><span>${image.id === post.selectedImageId ? "Selected" : "Select"}</span>
      </button>`).join("");

    return `
      <article class="ai-post-card" data-content-id="${escapeHtml(post.id)}">
        <header class="ai-post-header">
          <div class="ai-page-identity">
            <span class="ai-page-avatar">${profileImage ? `<img src="${escapeHtml(profileImage)}" alt="">` : escapeHtml(String(post.pageName || "P").slice(0, 1).toUpperCase())}</span>
            <span class="ai-page-name"><strong>${escapeHtml(post.pageName || "Facebook Page")}</strong><small>${escapeHtml(post.angle || "Page-specific post")}</small></span>
          </div>
          <span class="ai-badge ${post.status === "approved" ? "approved" : ""}">${escapeHtml(post.status || "draft")}</span>
        </header>
        <div class="ai-post-grid">
          <div>
            <div class="ai-post-fields">
              <label>Caption<textarea data-field="caption" maxlength="5000">${escapeHtml(post.caption || "")}</textarea><span class="ai-char-count"><span data-char-count>${String(post.caption || "").length}</span> / 5,000 characters</span></label>
              <label>Call to action<input data-field="cta" maxlength="240" value="${escapeHtml(post.cta || "")}"></label>
              <label>Hashtags · comma or space separated<input data-field="hashtags" maxlength="1000" value="${escapeHtml((post.hashtags || []).join(" "))}"></label>
            </div>
            <a class="ai-article-link" href="${escapeHtml(post.articleUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(post.articleUrl)}</a>
            <div class="ai-post-actions">
              <button class="ai-button secondary" type="button" data-action="save" data-content-id="${escapeHtml(post.id)}">Save edits</button>
              <button class="ai-button secondary" type="button" data-action="regenerate" data-content-id="${escapeHtml(post.id)}" ${post.status === "approved" ? "disabled" : ""}>Regenerate</button>
              <button class="ai-button ${post.status === "approved" ? "approved" : ""}" type="button" data-action="approve" data-content-id="${escapeHtml(post.id)}">${post.status === "approved" ? "Approved · Undo" : "Approve"}</button>
            </div>
          </div>
          <div class="ai-image-area">
            ${selectedImageUrl ? `<img src="${escapeHtml(selectedImageUrl)}" alt="Selected campaign creative" loading="lazy">` : `<div class="ai-image-placeholder">Article image or generated creative appears here</div>`}
            <div>
              <p class="ai-image-caption">${selectedImage ? `Selected ${escapeHtml(selectedImage.style)} creative` : "Featured article image"}</p>
              <button class="ai-button secondary" type="button" data-action="generate-images" data-content-id="${escapeHtml(post.id)}" ${post.status === "approved" ? "disabled" : ""}>Generate ${Number(state.settings?.variations || 3)} images</button>
              <label class="ai-overlay-field">Text on creative<input data-field="overlay" maxlength="80" value="${escapeHtml(post.overlayText || "")}" placeholder="Optional short headline"></label>
              <button class="ai-button secondary" type="button" data-action="save-overlay" data-content-id="${escapeHtml(post.id)}" ${post.status === "approved" || !selectedImage ? "disabled" : ""}>Apply &amp; save text</button>
              ${selectedImage ? `<a class="ai-download-link" href="${escapeHtml(contentImageUrl(post, selectedImage.id))}" download="pagecrew-${escapeHtml(post.pageId)}.png">Download selected creative</a>` : ""}
              ${variations ? `<div class="ai-image-variations">${variations}</div>` : ""}
            </div>
          </div>
        </div>
      </article>`;
  }

  function contentImageUrl(post, imageId) {
    return `/api/campaigns/${encodeURIComponent(campaignId)}/ai/content/${encodeURIComponent(post.id)}/images/${encodeURIComponent(imageId)}`;
  }

  function collectSettings() {
    const form = root.querySelector("#ai-settings-form");
    const data = new FormData(form);
    return {
      language: String(data.get("language") || "").trim(),
      tone: data.get("tone"),
      goal: data.get("goal"),
      captionLength: data.get("captionLength"),
      emoji: data.has("emoji"),
      hashtags: data.has("hashtags"),
      ctaMode: data.get("ctaMode"),
      manualCta: String(data.get("manualCta") || "").trim(),
      imageStyle: data.get("imageStyle"),
      variations: Number(data.get("variations"))
    };
  }

  function collectCardValues(card) {
    return {
      caption: card.querySelector('[data-field="caption"]').value,
      cta: card.querySelector('[data-field="cta"]').value,
      hashtags: [...new Set(card.querySelector('[data-field="hashtags"]').value.split(/[\s,]+/).map(tag => {
        const clean = tag.trim().replace(/^#+/, "").replace(/[^\p{L}\p{N}_]/gu, "");
        return clean ? `#${clean}` : "";
      }).filter(Boolean))].slice(0, 12),
      overlayText: card.querySelector('[data-field="overlay"]').value.trim(),
      selectedImageId: state.content.find(item => item.id === card.dataset.contentId)?.selectedImageId || ""
    };
  }

  async function saveCard(card) {
    const post = state.content.find(item => item.id === card.dataset.contentId);
    if (!post) throw new Error("Post content not found.");
    const saved = await request(`/api/campaigns/${encodeURIComponent(campaignId)}/ai/content/${encodeURIComponent(post.id)}`, {
      method: "PUT",
      body: JSON.stringify(collectCardValues(card))
    });
    state.content = state.content.map(item => item.id === saved.id ? saved : item);
    return saved;
  }

  async function generateAll(event) {
    event.preventDefault();
    if (state.busy) return;
    if (state.content.some(item => item.status === "approved")) {
      showMessage("Some posts are approved. Unapprove those posts before generating the full campaign again; draft Pages can still be regenerated individually.", "error");
      return;
    }
    if (state.content.length && !window.confirm("Generate fresh content for all selected Pages? Existing drafts will be replaced.")) return;
    const settings = collectSettings();
    state.settings = settings;
    state.busy = true;
    render();
    try {
      const result = await request(`/api/campaigns/${encodeURIComponent(campaignId)}/ai/generate`, {
        method: "POST",
        timeoutMs: 120000,
        body: JSON.stringify({ settings })
      });
      state.content = result.content;
      state.settings = result.settings;
      state.usage = [result.usage, ...state.usage].filter(Boolean).slice(0, 20);
      state.busy = false;
      state.message = "Unique Page-wise drafts generated and saved. Review them before approving.";
      state.messageType = "success";
      render();
    } catch (error) {
      state.busy = false;
      state.message = error.message;
      state.messageType = "error";
      render();
    }
  }

  async function handlePostAction(event) {
    const button = event.target.closest("[data-action]");
    if (!button || button.disabled) return;
    const card = button.closest(".ai-post-card");
    const action = button.dataset.action;
    const contentId = button.dataset.contentId;
    if (!card || !contentId) return;
    button.disabled = true;
    try {
      if (action === "save") {
        await saveCard(card);
        state.message = "Edits saved to this campaign.";
        state.messageType = "success";
        render();
        return;
      }
      if (action === "approve") {
        await saveCard(card);
        const updated = await request(`/api/campaigns/${encodeURIComponent(campaignId)}/ai/content/${encodeURIComponent(contentId)}/approve`, { method: "POST" });
        state.content = state.content.map(item => item.id === updated.id ? updated : item);
        state.message = updated.status === "approved" ? "Post approved for review. It has not been published." : "Approval removed; this post is a draft again.";
        state.messageType = "success";
        render();
        return;
      }
      if (action === "regenerate") {
        if (!window.confirm("Regenerate this Page's caption, CTA and hashtags? Your current edits will be replaced.")) {
          button.disabled = false;
          return;
        }
        const updated = await request(`/api/campaigns/${encodeURIComponent(campaignId)}/ai/content/${encodeURIComponent(contentId)}/regenerate`, { method: "POST" });
        state.content = state.content.map(item => item.id === updated.id ? updated : item);
        state.message = "This Page's content has been regenerated and saved.";
        state.messageType = "success";
        render();
        return;
      }
      if (action === "generate-images") {
        const settings = collectSettings();
        state.settings = settings;
        if (!window.confirm(`Generate ${Number(state.settings?.variations || 3)} image variation(s) for ${state.content.find(item => item.id === contentId)?.pageName || "this Page"}? Image generation may incur additional AI provider charges.`)) {
          button.disabled = false;
          return;
        }
        const result = await request(`/api/campaigns/${encodeURIComponent(campaignId)}/ai/content/${encodeURIComponent(contentId)}/images`, {
          method: "POST",
          body: JSON.stringify({ style: settings.imageStyle || "Festival", count: Number(settings.variations || 3) })
        });
        state.content = state.content.map(item => item.id === result.content.id ? result.content : item);
        state.message = `${result.images.length} image variation(s) generated and saved. Review any image text before use.`;
        state.messageType = "success";
        render();
        return;
      }
      if (action === "save-overlay") {
        const post = state.content.find(item => item.id === contentId);
        const image = (post?.images || []).find(item => item.id === post.selectedImageId);
        const overlayText = card.querySelector('[data-field="overlay"]').value.trim();
        if (!image) throw new Error("Generate and select a creative before applying text.");
        if (!overlayText) throw new Error("Enter the short text you want on the creative.");
        await saveCard(card);
        const source = new Image();
        await new Promise((resolve, reject) => {
          source.onload = resolve;
          source.onerror = () => reject(new Error("Selected creative could not be loaded for editing."));
          source.src = contentImageUrl(post, image.id);
        });
        const canvas = document.createElement("canvas");
        canvas.width = source.naturalWidth;
        canvas.height = source.naturalHeight;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Image editor is not available in this browser.");
        context.drawImage(source, 0, 0);
        const fontSize = Math.max(26, Math.round(canvas.width * 0.055));
        context.font = `700 ${fontSize}px Arial, sans-serif`;
        context.textAlign = "center";
        context.textBaseline = "middle";
        const maxWidth = canvas.width * 0.84;
        const words = overlayText.split(/\s+/);
        const lines = [];
        let line = "";
        words.forEach(word => {
          const candidate = line ? `${line} ${word}` : word;
          if (line && context.measureText(candidate).width > maxWidth) {
            lines.push(line);
            line = word;
          } else {
            line = candidate;
          }
        });
        if (line) lines.push(line);
        const visibleLines = lines.slice(0, 3);
        if (lines.length > 3) visibleLines[2] = `${visibleLines[2].slice(0, 32).trimEnd()}…`;
        const lineHeight = fontSize * 1.2;
        const padding = fontSize * 0.55;
        const blockHeight = visibleLines.length * lineHeight + padding * 2;
        const top = canvas.height - blockHeight - canvas.height * 0.06;
        context.fillStyle = "rgba(12, 22, 38, 0.76)";
        context.fillRect(canvas.width * 0.05, top, canvas.width * 0.9, blockHeight);
        context.fillStyle = "#ffffff";
        context.shadowColor = "rgba(0,0,0,0.35)";
        context.shadowBlur = fontSize * 0.12;
        visibleLines.forEach((text, index) => {
          context.fillText(text, canvas.width / 2, top + padding + lineHeight * (index + 0.5), maxWidth);
        });
        const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
        if (!blob) throw new Error("Edited creative could not be exported.");
        const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/ai/content/${encodeURIComponent(contentId)}/overlay-image`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "image/png" },
          body: blob
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || `Image save failed (${response.status}).`);
        state.content = state.content.map(item => item.id === result.content.id ? result.content : item);
        state.message = "Text overlay applied and saved as a new creative variation.";
        state.messageType = "success";
        render();
        return;
      }
      if (action === "select-image") {
        const post = state.content.find(item => item.id === contentId);
        const values = collectCardValues(card);
        values.selectedImageId = button.dataset.imageId;
        const updated = await request(`/api/campaigns/${encodeURIComponent(campaignId)}/ai/content/${encodeURIComponent(contentId)}`, {
          method: "PUT",
          body: JSON.stringify(values)
        });
        state.content = state.content.map(item => item.id === updated.id ? updated : item);
        state.message = `Creative selected for ${post?.pageName || "this Page"}.`;
        state.messageType = "success";
        render();
      }
    } catch (error) {
      button.disabled = false;
      showMessage(error.message, "error");
    }
  }

  function updateCharacterCount(event) {
    if (!event.target.matches('[data-field="caption"]')) return;
    const count = event.target.closest(".ai-post-fields").querySelector("[data-char-count]");
    if (count) count.textContent = String(event.target.value.length);
  }

  async function start() {
    if (!campaignId) {
      root.innerHTML = `<section class="ai-hero"><div class="ai-hero-copy"><p class="ai-eyebrow">Campaign required</p><h2>Choose an event campaign</h2><p>Save an event, article and selected Facebook Pages before generating content.</p></div><a class="ai-button" href="/event-campaigns.html">Open Event Campaigns</a></section>`;
      return;
    }
    try {
      const [campaign, generated] = await Promise.all([
        request(`/api/campaigns/${encodeURIComponent(campaignId)}`),
        request(`/api/campaigns/${encodeURIComponent(campaignId)}/ai/content`)
      ]);
      state.campaign = campaign;
      state.content = generated.content || [];
      state.settings = generated.settings || defaultSettings();
      state.usage = generated.usage || [];
      render();
      if (!state.content.length && !campaign.pages?.length) {
        showMessage("This campaign has no selected Pages. Edit the campaign and select at least one connected Facebook Page.", "error");
      }
    } catch (error) {
      root.innerHTML = `<section class="ai-hero"><div class="ai-hero-copy"><p class="ai-eyebrow">PageCrew workspace</p><h2>Campaign content could not be loaded</h2><p>${escapeHtml(error.message)}${error.message.toLowerCase().includes("login") ? " Sign in and reopen the campaign." : ""}</p></div><a class="ai-button" href="/event-campaigns.html">Open Event Campaigns</a></section>`;
    }
  }

  start();
})();
