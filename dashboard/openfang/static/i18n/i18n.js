/**
 * OpenFang i18n (Internationalization) Module
 * 
 * Provides runtime language switching for the OpenFang dashboard UI.
 * Supports English (default) and Russian.
 * 
 * Usage:
 *   - HTML: <span data-i18n="nav.overview">Overview</span>
 *   - JS:   window.t('nav.overview')
 *   - Auto-applies translations on load based on stored/preferred language
 */

(function() {
  'use strict';

  // Language store
  let currentLang = 'en';
  let translations = {};
  let fallbackTranslations = {};
  let isInitialized = false;
  let observerStarted = false;
  let applyTimer = null;
  let literalMap = null;
  const I18N_REV = '2026-04-17-p';

  /**
   * Load translations from a JSON file
   * @param {string} lang - Language code (en, ru)
   * @returns {Promise<Object>} Translation object
   */
  async function loadTranslations(lang) {
    try {
      // Use cached translations if available
      if (window.__i18nCache && window.__i18nCache[lang]) {
        return window.__i18nCache[lang];
      }

      const response = await fetch(`/i18n/${lang}?v=${encodeURIComponent(I18N_REV)}`);
      if (!response.ok) {
        console.warn(`[i18n] Failed to load ${lang}, falling back to en`);
        if (lang !== 'en') {
          return loadTranslations('en');
        }
        return {};
      }

      const data = await response.json();
      
      // Cache for future use
      if (!window.__i18nCache) window.__i18nCache = {};
      window.__i18nCache[lang] = data;
      
      return data;
    } catch (error) {
      console.error(`[i18n] Error loading translations for ${lang}:`, error);
      if (lang !== 'en') {
        return loadTranslations('en');
      }
      return {};
    }
  }

  async function loadFallbackTranslations() {
    if (window.__i18nCache && window.__i18nCache.en) {
      return window.__i18nCache.en;
    }
    return loadTranslations('en');
  }

  /**
   * Get a translated string by key
   * @param {string} key - Translation key (e.g., 'nav.overview')
   * @param {Object} params - Optional interpolation parameters
   * @returns {string} Translated string or key if not found
   */
  function t(key, params) {
    if (!isInitialized) {
      console.warn('[i18n] Not initialized, returning key');
      return key;
    }

    let text = translations[key] || fallbackTranslations[key] || key;

    // Handle interpolation (e.g., 'Hello, {{name}}')
    if (params && typeof params === 'object') {
      Object.keys(params).forEach(param => {
        text = text.replace(new RegExp(`{{${param}}}`, 'g'), params[param]);
      });
    }

    return text;
  }

  /**
   * Apply translations to all elements with data-i18n attribute
   * Also updates the <html> lang attribute
   */
  function applyTranslations() {
    // Update document language
    document.documentElement.lang = currentLang;
    
    // Find and translate all elements with data-i18n attribute
    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach(el => {
      const key = el.getAttribute('data-i18n');
      const translation = t(key);
      // Keep HTML fallback text when translations failed to load.
      if (translation === key) return;

      // Check if element is a form input/textarea
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        // For form elements, only update if it's a placeholder or aria-label
        if (el.hasAttribute('placeholder')) {
          el.placeholder = translation;
        }
        if (el.hasAttribute('aria-label')) {
          el.setAttribute('aria-label', translation);
        }
        if (el.hasAttribute('title')) {
          el.setAttribute('title', translation);
        }
      } else {
        // For regular elements, update text content
        el.textContent = translation;
      }
    });

    // Update elements with data-i18n-* attributes for attributes
    const attrElements = document.querySelectorAll('[data-i18n-placeholder], [data-i18n-title], [data-i18n-aria-label]');
    attrElements.forEach(el => {
      if (el.hasAttribute('data-i18n-placeholder')) {
        el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
      }
      if (el.hasAttribute('data-i18n-title')) {
        el.title = t(el.getAttribute('data-i18n-title'));
      }
      if (el.hasAttribute('data-i18n-aria-label')) {
        el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria-label')));
      }
    });

    // Update meta tags
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      const desc = t('app.description', { name: 'OpenFang' });
      if (desc !== 'app.description') {
        metaDesc.content = desc;
      }
    }

    // Fallback pass: auto-translate plain literal text that forgot data-i18n
    applyLiteralFallbacks();

    console.log(`[i18n] Applied translations for language: ${currentLang}`);
  }

  function buildLiteralMap() {
    if (literalMap) return literalMap;
    literalMap = {};
    Object.keys(fallbackTranslations || {}).forEach((key) => {
      const enVal = fallbackTranslations[key];
      if (typeof enVal === 'string') {
        const k = enVal.trim();
        if (k && !literalMap[k]) literalMap[k] = key;
      }
    });
    return literalMap;
  }

  function applyLiteralFallbacks() {
    if (!isInitialized || currentLang === 'en') return;
    const map = buildLiteralMap();
    if (!map || Object.keys(map).length === 0) return;

    const candidates = document.querySelectorAll('h1, h2, h3, h4, h5, h6, p, span, div, button, label, a, option');
    candidates.forEach((el) => {
      if (el.hasAttribute('data-i18n')) return;
      if (el.children && el.children.length > 0) return;
      const raw = (el.textContent || '').trim();
      if (!raw) return;
      const key = map[raw];
      if (!key) return;
      const translated = t(key);
      if (translated && translated !== key && translated !== raw) {
        el.textContent = translated;
      }
    });
  }

  function scheduleApplyTranslations() {
    if (!isInitialized) return;
    if (applyTimer) clearTimeout(applyTimer);
    applyTimer = setTimeout(() => {
      applyTranslations();
    }, 50);
  }

  function startDomObserver() {
    if (observerStarted || typeof MutationObserver === 'undefined') return;
    observerStarted = true;
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'childList' && (m.addedNodes && m.addedNodes.length > 0)) {
          scheduleApplyTranslations();
          break;
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function bindLanguageSelector() {
    document.addEventListener('change', function (event) {
      var target = event.target;
      if (!target || target.tagName !== 'SELECT') return;
      var aria = target.getAttribute('aria-label') || '';
      if (aria !== 'Language selector') return;
      setLanguage(target.value, true);
    });
  }

  /**
   * Set the current language and apply translations
   * @param {string} lang - Language code (en, ru)
   * @param {boolean} persist - Whether to save to localStorage
   */
  async function setLanguage(lang, persist = true) {
    if (lang === 'zh' || lang === 'zh-cn' || lang === 'zh_CN') {
      lang = 'zh-CN';
    }
    if (!['en', 'ru', 'zh-CN'].includes(lang)) {
      console.warn(`[i18n] Unknown language: ${lang}, defaulting to en`);
      lang = 'en';
    }

    currentLang = lang;
    const loaded = await Promise.all([
      loadTranslations(lang),
      loadFallbackTranslations(),
    ]);
    translations = loaded[0] || {};
    fallbackTranslations = loaded[1] || {};
    literalMap = null;
    isInitialized = true;

    // Save preference
    if (persist) {
      localStorage.setItem('openfang_language', lang);
    }

    // Apply to DOM
    applyTranslations();

    // Dispatch event for Alpine.js components to react
    window.dispatchEvent(new CustomEvent('i18n:language-changed', { 
      detail: { language: lang } 
    }));
  }

  /**
   * Get the current language
   * @returns {string} Current language code
   */
  function getLanguage() {
    return currentLang;
  }

  /**
   * Initialize i18n system
   * Loads language preference and applies translations
   */
  async function init() {
    // Determine language priority:
    // 1. localStorage (user preference)
    // 2. Browser language
    // 3. Default to English

    let lang = localStorage.getItem('openfang_language');
    
    if (!lang) {
      // Try to detect browser language
      const browserLang = navigator.language || navigator.userLanguage || '';
      if (browserLang.startsWith('zh')) {
        lang = 'zh-CN';
      } else if (browserLang.startsWith('ru')) {
        lang = 'ru';
      } else {
        lang = 'en';
      }
    }

    await setLanguage(lang, false);
    startDomObserver();
    bindLanguageSelector();
  }

  /**
   * Get available languages
   * @returns {Array<{code: string, name: string}>}
   */
  function getAvailableLanguages() {
    return [
      { code: 'en', name: 'English' },
      { code: 'ru', name: 'Русский' },
      { code: 'zh-CN', name: '简体中文' }
    ];
  }

  /**
   * Localize audit action enum as returned by the API (e.g. ConfigChange).
   */
  function friendlyAuditAction(action) {
    if (!action) return isInitialized ? t('audit.action.unknown') : 'Unknown';
    const key = 'audit.action.' + action;
    const tr = t(key);
    if (tr !== key) return tr;
    return action.replace(/([A-Z])/g, ' $1').trim();
  }

  /**
   * Localize known audit detail strings from the kernel/API; pass through unknown free text.
   */
  function translateAuditDetail(detail, action) {
    if (!detail) return '';
    if (!isInitialized) return detail;
    if (detail === 'shutdown requested via API') return t('audit.detail.shutdown_via_api');
    if (detail === 'agent loop failed') return t('audit.detail.agent_loop_failed');

    const spawnMatch = /^name=(.+),\s*parent=(.+)$/.exec(detail);
    if (spawnMatch && action === 'AgentSpawn') {
      const parentRaw = spawnMatch[2].trim();
      const parentDisp = parentRaw === 'None' ? t('audit.parent_none') : parentRaw;
      return t('audit.detail.spawn', { name: spawnMatch[1].trim(), parent: parentDisp });
    }

    const killMatch = /^name=(.+)$/.exec(detail);
    if (killMatch && action === 'AgentKill') {
      return t('audit.detail.kill', { name: killMatch[1].trim() });
    }

    const tok = /^tokens_in=(\d+),\s*tokens_out=(\d+)$/.exec(detail);
    if (tok) {
      return t('audit.detail.tokens', { in_tok: tok[1], out_tok: tok[2] });
    }

    return detail;
  }

  /**
   * Relative time for activity feeds (matches previous overview.js behavior).
   */
  function timeAgoLocalized(timestamp) {
    if (!timestamp) return '';
    const now = Date.now();
    const ts = new Date(timestamp).getTime();
    const diff = Math.floor((now - ts) / 1000);
    if (!isInitialized) {
      if (diff < 10) return 'just now';
      if (diff < 60) return diff + 's ago';
      if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
      if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
      return Math.floor(diff / 86400) + 'd ago';
    }
    if (diff < 10) return t('timeago.just_now');
    if (diff < 60) return t('timeago.seconds', { n: diff });
    if (diff < 3600) return t('timeago.minutes', { n: Math.floor(diff / 60) });
    if (diff < 86400) return t('timeago.hours', { n: Math.floor(diff / 3600) });
    return t('timeago.days', { n: Math.floor(diff / 86400) });
  }

  // Expose to global scope
  window.i18n = {
    t,
    setLanguage,
    getLanguage,
    getAvailableLanguages,
    init,
    isInitialized: () => isInitialized,
    friendlyAuditAction,
    translateAuditDetail,
    timeAgoLocalized
  };

  // Back-compat alias used by chat.js and other pages (delegates to i18n.t)
  window.t = function (key, params) {
    if (window.i18n && typeof window.i18n.t === 'function') {
      return window.i18n.t(key, params);
    }
    return key;
  };

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
