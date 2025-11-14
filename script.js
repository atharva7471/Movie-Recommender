/* static/script.js
   - Floating autocomplete appended to <body>
   - Lottie init (auto-loads lottie-web)
   - Theme toggle (localStorage)
   - AJAX recommend -> renders cards
   - Poster click -> fetch /movie/:id -> populate modal
*/

(function () {
  // ---------- helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) =>
    Array.from((root || document).querySelectorAll(sel));
  const debounce = (fn, wait = 220) => {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  };

  // ---------- DOM elements ----------
  const searchInput = $("#search-input");
  const selectEl = $("#movie-select");
  const recommendBtn = $("#recommend-btn");
  const spinner = $("#spinner");
  const results = $("#results");
  const themeToggle = $("#theme-toggle");

  // Modal elements
  const modal = $("#movie-modal");
  const modalClose = $("#modal-close");
  const modalPoster = $("#modal-poster");
  const modalTitle = $("#modal-title");
  const modalStar = $("#modal-star");
  const modalLanguage = $("#modal-language");
  const modalOverview = $("#modal-overview");
  const modalRelease = $("#modal-release");
  const modalRuntime = $("#modal-runtime");
  const modalGenres = $("#modal-genres");

  // If any of the required elements are missing, fail gracefully
  if (!searchInput || !selectEl || !recommendBtn || !results) {
    console.warn(
      "script.js: required DOM elements not found. Make sure index.html has #search-input, #movie-select, #recommend-btn, #results."
    );
  }

  // ---------------- Theme toggle (animated sun <-> moon) ----------------
  (function themeToggleInit() {
    const toggle = document.getElementById("theme-toggle");
    if (!toggle) return;

    // load saved theme (default dark)
    let saved = localStorage.getItem("theme") || "dark";
    document.documentElement.setAttribute("data-theme", saved);
    toggle.setAttribute("aria-pressed", saved === "light" ? "true" : "false");

    // visual sync (in case you used previous icon logic)
    // clicking toggles theme and animates
    toggle.addEventListener("click", () => {
      const cur = document.documentElement.getAttribute("data-theme") || "dark";
      const next = cur === "dark" ? "light" : "dark";
      // set theme attribute (CSS handles icon transitions)
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("theme", next);
      toggle.setAttribute("aria-pressed", next === "light" ? "true" : "false");

      // tiny press animation
      toggle.style.transform = "scale(0.98)";
      setTimeout(() => {
        toggle.style.transform = "";
      }, 120);
    });

    // keyboard support: space/enter
    toggle.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle.click();
      }
    });

    // ensure initial icon visibility is correct (in case DOM loads before CSS)
    window.requestAnimationFrame(() => {
      const theme =
        document.documentElement.getAttribute("data-theme") || "dark";
      toggle.setAttribute("aria-pressed", theme === "light" ? "true" : "false");
    });
  })();

  // ---------- FLOATING AUTOCOMPLETE ----------
  const floatingList = document.createElement("div");
  floatingList.id = "autocomplete-float";
  floatingList.className = "autocomplete-list";
  floatingList.style.position = "absolute";
  floatingList.style.display = "none";
  floatingList.style.zIndex = 22000; // match CSS
  document.body.appendChild(floatingList);

  // position helper
  function positionFloatingList() {
    if (floatingList.style.display === "none") return;
    const rect = searchInput.getBoundingClientRect();
    floatingList.style.left = `${rect.left + window.scrollX}px`;
    floatingList.style.top = `${rect.bottom + window.scrollY + 8}px`;
    floatingList.style.width = `${rect.width}px`;
  }

  // build items and attach click handler (delegation)
  function buildAutocomplete(items) {
    floatingList.innerHTML = "";
    if (!items || items.length === 0) {
      floatingList.style.display = "none";
      return;
    }
    items.forEach((it) => {
      const div = document.createElement("div");
      div.className = "autocomplete-item";
      div.textContent = it;
      floatingList.appendChild(div);
    });
    floatingList.style.display = "block";
    positionFloatingList();
  }

  // hide on outside click
  document.addEventListener("click", (ev) => {
    const t = ev.target;
    if (t === searchInput || floatingList.contains(t)) return;
    floatingList.style.display = "none";
  });

  // keyboard navigation (up/down/enter)
  let acIndex = -1;
  searchInput.addEventListener("keydown", (e) => {
    const items = Array.from(
      floatingList.querySelectorAll(".autocomplete-item")
    );
    if (!items.length || floatingList.style.display === "none") return;
    if (e.key === "ArrowDown") {
      acIndex = (acIndex + 1) % items.length;
      items.forEach((i) => i.classList.remove("active"));
      items[acIndex].classList.add("active");
      items[acIndex].scrollIntoView({ block: "nearest" });
      e.preventDefault();
    } else if (e.key === "ArrowUp") {
      acIndex = (acIndex - 1 + items.length) % items.length;
      items.forEach((i) => i.classList.remove("active"));
      items[acIndex].classList.add("active");
      items[acIndex].scrollIntoView({ block: "nearest" });
      e.preventDefault();
    } else if (e.key === "Enter") {
      if (acIndex >= 0 && items[acIndex]) {
        items[acIndex].click();
        e.preventDefault();
      }
    } else {
      acIndex = -1;
    }
  });

  // click handler for floating list (delegation)
  floatingList.addEventListener("click", (e) => {
    const it = e.target.closest(".autocomplete-item");
    if (!it) return;
    const text = it.textContent.trim();
    searchInput.value = text;
    // set select (if present)
    const opt = Array.from(selectEl.options).find((o) => o.value === text);
    if (opt) selectEl.value = opt.value;
    floatingList.style.display = "none";
  });

  // fetch suggestions (debounced)
  const fetchSuggestions = debounce(async function (q) {
    if (!q) {
      floatingList.style.display = "none";
      return;
    }
    try {
      const res = await fetch(`/search?q=${encodeURIComponent(q)}`);
      if (!res.ok) throw new Error("network");
      const data = await res.json();
      buildAutocomplete(data || []);
    } catch (err) {
      console.warn("Autocomplete error", err);
      floatingList.style.display = "none";
    }
  }, 200);

  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      const q = e.target.value.trim();
      fetchSuggestions(q);
    });
    // reposition on scroll/resize
    window.addEventListener("scroll", positionFloatingList, { passive: true });
    window.addEventListener("resize", positionFloatingList);
  }

  // ---------- LOTTIE INIT (auto-load the lib if missing) ----------
  (function initLottie() {
    const lottieEl = document.getElementById("lottie-cinema");
    if (!lottieEl) return;

    const animPaths = [
      "/static/animations/cinema.json",
      "/static/Cinema animation.json",
      "/static/Cinema_animation.json",
      "/static/cinema.json",
    ];

    const loadAnim = () => {
      try {
        const reduced = window.matchMedia(
          "(prefers-reduced-motion: reduce)"
        ).matches;
        // choose first available path by testing with fetch (small HEAD)
        (async () => {
          let found = null;
          for (const p of animPaths) {
            try {
              const r = await fetch(p, { method: "GET" });
              if (r.ok) {
                found = p;
                break;
              }
            } catch (_) {}
          }
          const path = found || animPaths[0];
          if (window.lottie && !reduced) {
            window.lottie.loadAnimation({
              container: lottieEl,
              path,
              renderer: "svg",
              loop: true,
              autoplay: true,
              rendererSettings: { progressiveLoad: true },
            });
          } else if (window.lottie && reduced) {
            // just render a first frame as static svg by auto-playing then pausing after load
            const anim = window.lottie.loadAnimation({
              container: lottieEl,
              path,
              renderer: "svg",
              loop: false,
              autoplay: true,
            });
            anim.addEventListener("DOMLoaded", () => anim.pause());
          } else {
            // load lottie script dynamically then init
            const s = document.createElement("script");
            s.src =
              "https://cdnjs.cloudflare.com/ajax/libs/lottie-web/5.7.6/lottie.min.js";
            s.onload = () => {
              // small delay to ensure library ready
              setTimeout(() => {
                if (window.lottie && !reduced) {
                  window.lottie.loadAnimation({
                    container: lottieEl,
                    path: path,
                    renderer: "svg",
                    loop: true,
                    autoplay: true,
                    rendererSettings: { progressiveLoad: true },
                  });
                }
              }, 50);
            };
            document.head.appendChild(s);
          }
        })();
      } catch (e) {
        console.warn("Lottie init failed", e);
      }
    };

    loadAnim();
  })();

  // ---------- RENDER HELPERS (recommendations) ----------
  function renderRecommendations(data) {
    results.innerHTML = ""; // clear
    if (!data || !data.names || data.names.length === 0) {
      results.innerHTML =
        '<p class="muted" style="text-align:center;width:100%;">No recommendations found.</p>';
      return;
    }

    // create cards
    data.names.forEach((name, i) => {
      const poster = data.posters[i] || "/static/no_poster.png";
      const id = data.ids ? data.ids[i] : "";
      const card = document.createElement("div");
      card.className = "card glass";
      card.innerHTML = `
        <div class="ribbon">Rec</div>
        <img src="${poster}" data-movie-id="${id}" alt="${escapeHtml(
        name
      )}" class="poster-img">
        <p>${escapeHtml(name)}</p>
      `;
      results.appendChild(card);
    });
    // ensure event delegation will handle poster clicks
  }

  function escapeHtml(s) {
    if (!s) return "";
    return s.replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        }[c])
    );
  }

  // ---------- DELEGATED POSTER CLICK HANDLER ----------
  // Use event delegation: listen on results container
  results.addEventListener("click", async (e) => {
    const img = e.target.closest(".poster-img");
    if (!img) return;
    const movieId = img.dataset.movieId;
    if (!movieId) return;

    // show modal
    openModal();
    // show loading placeholders
    modalPoster.src = "/static/no_poster.png";
    modalTitle.textContent = "Loading...";
    modalOverview.textContent = "";
    modalStar.textContent = "";
    modalLanguage.textContent = "";
    modalRelease.textContent = "";
    modalRuntime.textContent = "";
    modalGenres.textContent = "";

    try {
      const res = await fetch(`/movie/${movieId}`);
      if (!res.ok) throw new Error("failed to fetch details");
      const d = await res.json();
      modalPoster.src = d.poster || "/static/no_poster.png";
      modalTitle.textContent = d.title || "Unknown Title";
      modalOverview.textContent = d.overview || "No overview available.";
      modalStar.textContent = d.main_star || "Unknown";
      modalLanguage.textContent =
        d.language || d.original_language || "Unknown";
      modalRelease.textContent = d.release_date || "N/A";
      modalRuntime.textContent = d.runtime || "N/A";
      modalGenres.textContent =
        d.genres && d.genres.length ? d.genres.join(", ") : "N/A";
    } catch (err) {
      modalTitle.textContent = "Failed to load";
      modalOverview.textContent = "Could not retrieve movie details.";
      console.error(err);
    }
  });

  // ---------- modal open/close ----------
  // Open modal (centered flex) and reset scroll
  function openModal() {
    if (!modal) return;
    modal.style.display = "flex"; // use flex so children can be centered
    modal.setAttribute("aria-hidden", "false");
    document.documentElement.style.overflow = "hidden"; // avoid page scroll behind modal
    document.body.style.overflow = "hidden";
    // reset scroll of details pane
    if (modal.querySelector(".modal-right")) {
      modal.querySelector(".modal-right").scrollTop = 0;
    }
  }

  // Close modal and restore scroll
  function closeModal() {
    if (!modal) return;
    modal.style.display = "none";
    modal.setAttribute("aria-hidden", "true");
    document.documentElement.style.overflow = "";
    document.body.style.overflow = "";
  }

  if (modalClose) modalClose.addEventListener("click", closeModal);
  if (modal)
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeModal();
    });

  // ---------- RECOMMEND BUTTON (AJAX) ----------
  recommendBtn &&
    recommendBtn.addEventListener("click", async () => {
      const selected = selectEl.value;
      if (!selected) return;
      spinner && spinner.classList.remove("hidden");
      results.innerHTML = "";
      try {
        const res = await fetch("/api/recommend", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ movie: selected }),
        });
        const data = await res.json();
        if (!res.ok) {
          results.innerHTML = `<p class="muted" style="text-align:center;width:100%;">Error: ${
            data.error || "unknown"
          }</p>`;
        } else {
          renderRecommendations(data);
        }
      } catch (err) {
        console.error("Recommend failed", err);
        results.innerHTML = `<p class="muted" style="text-align:center;width:100%;">Network error. Try again.</p>`;
      } finally {
        spinner && spinner.classList.add("hidden");
      }
    });

  // ---------- initial attach (if server rendered items present) ----------
  // If page had server-rendered recommendations with .poster-img, the delegation above handles it.

  // ---------- utility: reposition floating when needed ----------
  window.addEventListener("resize", () =>
    requestAnimationFrame(positionFloatingList)
  );
  window.addEventListener("scroll", () =>
    requestAnimationFrame(positionFloatingList)
  );
})();

// close modal on Escape
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && modal && modal.style.display === "flex") {
    closeModal();
  }
});
