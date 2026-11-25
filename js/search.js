/**
 * search.js - Enhanced product search with history & suggestions
 * Will's Tech Store
 * Depends on: utils.js (debounce, formatPrice), products.js (Products)
 */

const Search = {
  container: null,
  input: null,
  results: null,
  historyKey: 'willstech-search-history',
  clickedProductsKey: 'willstech-clicked-products',
  searchedAndClickedKey: 'willstech-searched-and-clicked',
  maxHistory: 10,
  selectedIndex: -1,
  searchResults: [],

  /** Trending / popular searches shown when input is empty */
  trending: ['iPhone', 'Samsung', 'JBL', 'AirPods', 'MacBook', 'PlayStation', 'Earbuds', 'Smartwatch'],

  init() {
    this.container = document.getElementById('search-section');
    this.input = document.getElementById('search-input');
    this.results = document.getElementById('search-results');
    this.clearBtn = document.getElementById('search-clear-btn');

    if (!this.container || !this.input) return;

    // Search button click handler
    const searchBtn = document.getElementById('search-btn');
    if (searchBtn) {
      searchBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.input.focus();
        if (!this.input.value.trim()) {
          this.showDefaultView();
        }
      });
    }

    // Clear button functionality
    if (this.clearBtn) {
      this.clearBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.input.value = '';
        this.clearBtn.style.display = 'none';
        this.showDefaultView();
        this.input.focus();
      });
    }

    // Toggle clear button visibility based on input
    this.input.addEventListener('input', () => {
      if (this.clearBtn) {
        this.clearBtn.style.display = this.input.value.trim() ? 'flex' : 'none';
      }
    });

    // Keyboard shortcut (Ctrl/Cmd + K)
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        this.input.focus();
        if (!this.input.value.trim()) {
          this.showDefaultView();
        }
      }
    });

    // Debounced search on input
    this.input.addEventListener('input', debounce((e) => {
      const val = e.target.value.trim();
      this.selectedIndex = -1;
      if (val.length < 2) {
        this.showDefaultView();
      } else {
        this.performSearch(val);
      }
    }, 200));

    // Show default view when input is focused and empty
    this.input.addEventListener('focus', () => {
      if (!this.input.value.trim()) {
        this.showDefaultView();
      }
    });

    // Keyboard navigation
    this.input.addEventListener('keydown', (e) => this.handleKeydown(e));

    // Close results when clicking outside
    document.addEventListener('click', (e) => {
      if (!this.container.contains(e.target)) {
        this.results.classList.remove('has-results');
        this.selectedIndex = -1;
      }
    });
  },

  handleKeydown(e) {
    const items = this.results.querySelectorAll('.search-result-item, .search-tag, .search-product-compact');
    
    if (items.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.selectedIndex = Math.min(this.selectedIndex + 1, items.length - 1);
        this.updateSelection(items);
        break;
      
      case 'ArrowUp':
        e.preventDefault();
        this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
        this.updateSelection(items);
        break;
      
      case 'Enter':
        e.preventDefault();
        if (this.selectedIndex >= 0 && items[this.selectedIndex]) {
          items[this.selectedIndex].click();
        } else if (this.input.value.trim()) {
          // If no item selected, perform search
          const query = this.input.value.trim();
          this.addToHistory(query);
          window.location.href = `/shop?q=${encodeURIComponent(query)}`;
        }
        break;
      
      case 'Escape':
        this.results.classList.remove('has-results');
        this.selectedIndex = -1;
        break;
    }
  },

  updateSelection(items) {
    items.forEach((item, i) => {
      if (i === this.selectedIndex) {
        item.classList.add('selected');
        item.scrollIntoView({ block: 'nearest' });
      } else {
        item.classList.remove('selected');
      }
    });
  },

  // ─────────────────────────────────────────────
  // Search History
  // ─────────────────────────────────────────────
  getHistory() {
    try {
      const raw = localStorage.getItem(this.historyKey);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  },

  addToHistory(query) {
    if (!query || query.length < 2) return;
    let history = this.getHistory().filter(h => h.toLowerCase() !== query.toLowerCase());
    history.unshift(query);
    history = history.slice(0, this.maxHistory);
    try { localStorage.setItem(this.historyKey, JSON.stringify(history)); } catch {}
  },

  clearHistory() {
    try { localStorage.removeItem(this.historyKey); } catch {}
    this.showDefaultView();
  },

  clearViewed() {
    try { localStorage.removeItem(this.searchedAndClickedKey); } catch {}
    this.showDefaultView();
  },

  // Get clicked products
  getClickedProducts() {
    try {
      const raw = localStorage.getItem(this.clickedProductsKey);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  },

  // Add clicked product
  addClickedProduct(productId) {
    try {
      let clicked = this.getClickedProducts();
      // Remove if exists to update timestamp
      clicked = clicked.filter(item => item.id !== String(productId));
      clicked.unshift({
        id: String(productId),
        timestamp: Date.now()
      });
      localStorage.setItem(this.clickedProductsKey, JSON.stringify(clicked));
    } catch {}
  },

  // Get searched and clicked products
  getSearchedAndClickedProducts() {
    try {
      const raw = localStorage.getItem(this.searchedAndClickedKey);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  },

  // Add searched and clicked product
  addSearchedAndClickedProduct(productId) {
    try {
      let products = this.getSearchedAndClickedProducts();
      // Remove if exists to update timestamp
      products = products.filter(item => item.id !== String(productId));
      products.unshift({
        id: String(productId),
        timestamp: Date.now()
      });
      // Keep only most recent 8
      products = products.slice(0, 8);
      localStorage.setItem(this.searchedAndClickedKey, JSON.stringify(products));
    } catch {}
  },

  // ─────────────────────────────────────────────
  // Default view: recent searches + searched and clicked + trending + categories
  // ─────────────────────────────────────────────
  showDefaultView() {
    const history = this.getHistory();
    const products = Products.allProducts || [];
    
    // Get searched and clicked products
    const searchedAndClickedIds = this.getSearchedAndClickedProducts();
    const searchedAndClickedProducts = searchedAndClickedIds
      .map(item => Products.getProductById ? Products.getProductById(item.id) : products.find(p => String(p.id) === String(item.id)))
      .filter(Boolean)
      .filter(p => p.status === 'active');

    // Gather unique categories
    const categories = [...new Set(products.filter(p => p.status === 'active' && p.category).map(p => p.category))];

    let html = '<div class="search-default-view">';

    // Recent searches
    if (history.length > 0) {
      html += '<div class="search-section">';
      html += '<div class="search-section-header"><span class="search-section-title">Recent Searches</span><button class="search-clear-history" id="search-clear-history">Clear All</button></div>';
      html += '<div class="search-tags">';
      history.slice(0, 8).forEach(h => {
        html += `<button class="search-tag search-tag-history" data-query="${escapeHTML(h)}">
          <i class="fa-regular fa-clock"></i>
          ${escapeHTML(h)}</button>`;
      });
      html += '</div></div>';
    }

    // Searched and Clicked Products
    if (searchedAndClickedProducts.length > 0) {
      html += '<div class="search-section search-section-products">';
      html += '<div class="search-section-header"><span class="search-section-title">Recently Viewed</span><button class="search-clear-history" id="search-clear-viewed">Clear All</button></div>';
      html += '<div class="search-products-compact">';
      
      searchedAndClickedProducts.slice(0, 6).forEach(p => {
        const img = Array.isArray(p.images) && p.images.length ? p.images[0] : '/IMAGES/logo-mark-phone-purple.svg';
        const productLink = WT.productPath(p);
        
        html += `<a href="${productLink}" class="search-product-compact" title="${escapeHTML(p.name)}">
          <img src="${escapeHTML(WT.img(img))}" data-fallback="${escapeHTML(WT.imgOriginal(img))}" alt="${escapeHTML(p.name)}" class="search-product-compact-img" loading="lazy">
        </a>`;
      });
      
      html += '</div></div>';
    }

    // Trending
    html += '<div class="search-section">';
    html += '<div class="search-section-header"><span class="search-section-title">Trending Searches</span></div>';
    html += '<div class="search-tags">';
    this.trending.slice(0, 8).forEach(t => {
      html += `<button class="search-tag search-tag-trending" data-query="${escapeHTML(t)}">
        <i class="fa-solid fa-arrow-trend-up"></i>
        ${escapeHTML(t)}</button>`;
    });
    html += '</div></div>';

    // Categories
    if (categories.length > 0) {
      html += '<div class="search-section">';
      html += '<div class="search-section-header"><span class="search-section-title">Browse Categories</span></div>';
      html += '<div class="search-tags">';
      categories.slice(0, 8).forEach(c => {
        const count = products.filter(p => p.category === c && p.status === 'active').length;
        html += `<button class="search-tag search-tag-category" data-query="${escapeHTML(c)}">${escapeHTML(c)} <span class="search-tag-count">${count}</span></button>`;
      });
      html += '</div></div>';
    }

    html += '</div>';

    this.results.innerHTML = html;
    this.results.classList.add('has-results');

    // Bind events
    this.bindDefaultViewEvents();
  },

  bindDefaultViewEvents() {
    // Tag clicks
    this.results.querySelectorAll('.search-tag').forEach(tag => {
      tag.addEventListener('click', (e) => {
        e.stopPropagation();
        const query = tag.dataset.query;
        if (query) {
          this.input.value = query;
          this.addToHistory(query);
          this.performSearch(query);
        }
      });
    });

    // Compact product clicks
    this.results.querySelectorAll('.search-product-compact').forEach(product => {
      product.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    });

    // Clear history
    const clearBtn = document.getElementById('search-clear-history');
    if (clearBtn) {
      clearBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.clearHistory();
      });
    }

    // Clear recently viewed
    const clearViewedBtn = document.getElementById('search-clear-viewed');
    if (clearViewedBtn) {
      clearViewedBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.clearViewed();
      });
    }
  },

  // ─────────────────────────────────────────────
  // Perform Search
  // ─────────────────────────────────────────────
  performSearch(query) {
    if (!query || query.length < 2) {
      this.showDefaultView();
      return;
    }

    // (history is saved only when the search is committed: Enter, a result click, View all, or a suggestion tap)

    const q = query.toLowerCase();
    const products = Products.allProducts || [];
    const matches = products
      .filter(p => p.status === 'active')
      .filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.category && p.category.toLowerCase().includes(q)) ||
        (p.description && p.description.toLowerCase().includes(q))
      )
      .slice(0, 10);

    if (!matches.length) {
      this.results.innerHTML = `
        <div class="search-empty">
          <i class="fa-solid fa-magnifying-glass" style="font-size:36px;opacity:.35"></i>
          <p class="search-empty-title">No products found</p>
          <p class="search-empty-sub">Try searching for "${escapeHTML(query)}" in a different category or browse our <a href="${this._shopLink()}">shop page</a>.</p>
        </div>`;
      this.results.classList.add('has-results');
      return;
    }

    this.results.innerHTML = `
      <div class="search-results-header">
        <span>${matches.length} result${matches.length !== 1 ? 's' : ''} for "${escapeHTML(query)}"</span>
        <a href="/shop?q=${encodeURIComponent(query)}" class="search-view-all">View All &rarr;</a>
      </div>
      ${matches.map(p => {
        const img = Array.isArray(p.images) && p.images.length ? p.images[0] : '/IMAGES/logo-mark-phone-purple.svg';
        const productLink = WT.productPath(p);
        const rating = p.rating || 0;
        const starsHTML = WT.stars(rating);
        const isDiscounted = p.originalPrice && Number(p.originalPrice) > Number(p.price);
        return `
          <a href="${productLink}" class="search-result-item" data-product-id="${p.id}">
            <img src="${escapeHTML(WT.img(img))}" data-fallback="${escapeHTML(WT.imgOriginal(img))}" alt="${escapeHTML(p.name)}" class="search-result-img" loading="lazy">
            <div class="search-result-info">
              <div class="search-result-category">${escapeHTML(p.category)}</div>
              <div class="search-result-name">${escapeHTML(p.name)}</div>
              <div class="search-result-meta">
                <div class="search-result-stars">${starsHTML}</div>
                ${p.reviewCount ? `<span class="search-result-reviews">(${p.reviewCount})</span>` : ''}
              </div>
              <div class="search-result-price">
                ${formatPrice(p.price)}
                ${isDiscounted ? `<span class="search-result-original">${formatPrice(p.originalPrice)}</span>` : ''}
              </div>
            </div>
            <i class="fa-solid fa-chevron-right search-result-arrow"></i>
          </a>`;
      }).join('')}`;

    this.results.classList.add('has-results');

    this.results.querySelectorAll('.search-view-all').forEach(a => a.addEventListener('click', () => { if (this.input.value.trim().length >= 2) this.addToHistory(this.input.value.trim()); }));

    // Track clicks on search result items
    this.results.querySelectorAll('.search-result-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const productId = item.dataset.productId;
        if (this.input && this.input.value.trim().length >= 2) this.addToHistory(this.input.value.trim());   // a result was chosen: now it's worth remembering
        if (productId) {
          this.addSearchedAndClickedProduct(productId);
        }
      });
    });
  },

  _shopLink() {
    return '/shop';
  }
};

window.Search = Search;
