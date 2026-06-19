// OpenFang Channels Page — OpenClaw-style setup UX with QR code support
'use strict';

function channelsPage() {
  return {
    allChannels: [],
    categoryFilter: 'all',
    searchQuery: '',
    setupModal: null,
    configuring: false,
    testing: {},
    formValues: {},
    showAdvanced: false,
    showBusinessApi: false,
    loading: true,
    loadError: '',
    pollTimer: null,

    // Setup flow step tracking
    setupStep: 1, // 1=Configure, 2=Verify, 3=Ready
    testPassed: false,

    // WhatsApp QR state
    qr: {
      loading: false,
      available: false,
      dataUrl: '',
      sessionId: '',
      message: '',
      help: '',
      connected: false,
      expired: false,
      error: ''
    },
    qrPollTimer: null,

    get categories() {
      var t = typeof window.t === 'function' ? window.t : function(k) { return k; };
      return [
        { key: 'all', label: t('channels.cat_all') },
        { key: 'messaging', label: t('channels.cat_messaging') },
        { key: 'social', label: t('channels.cat_social') },
        { key: 'enterprise', label: t('channels.cat_enterprise') },
        { key: 'developer', label: t('channels.cat_developer') },
        { key: 'notifications', label: t('channels.cat_notifications') }
      ];
    },

    get filteredChannels() {
      var self = this;
      return this.allChannels.filter(function(ch) {
        if (self.categoryFilter !== 'all' && ch.category !== self.categoryFilter) return false;
        if (self.searchQuery) {
          var q = self.searchQuery.toLowerCase();
          return ch.name.toLowerCase().indexOf(q) !== -1 ||
                 ch.display_name.toLowerCase().indexOf(q) !== -1 ||
                 ch.description.toLowerCase().indexOf(q) !== -1;
        }
        return true;
      });
    },

    get configuredCount() {
      return this.allChannels.filter(function(ch) { return ch.configured; }).length;
    },

    categoryCount(cat) {
      var all = this.allChannels.filter(function(ch) { return cat === 'all' || ch.category === cat; });
      var configured = all.filter(function(ch) { return ch.configured; });
      return configured.length + '/' + all.length;
    },

    basicFields() {
      if (!this.setupModal || !this.setupModal.fields) return [];
      return this.setupModal.fields.filter(function(f) { return !f.advanced; });
    },

    advancedFields() {
      if (!this.setupModal || !this.setupModal.fields) return [];
      return this.setupModal.fields.filter(function(f) { return f.advanced; });
    },

    hasAdvanced() {
      return this.advancedFields().length > 0;
    },

    isQrChannel() {
      return this.setupModal && this.setupModal.setup_type === 'qr';
    },

    async loadChannels() {
      this.loading = true;
      this.loadError = '';
      try {
        var data = await OpenFangAPI.get('/api/channels');
        this.allChannels = (data.channels || []).map(function(ch) {
          ch.connected = ch.configured && ch.has_token;
          return ch;
        });
      } catch(e) {
        this.loadError = e.message || (typeof window.t === 'function' ? window.t('channels.load_error') : 'Could not load channels.');
      }
      this.loading = false;
      this.startPolling();
    },

    async loadData() { return this.loadChannels(); },

    startPolling() {
      var self = this;
      if (this.pollTimer) clearInterval(this.pollTimer);
      this.pollTimer = setInterval(function() { self.refreshStatus(); }, 15000);
    },

    async refreshStatus() {
      try {
        var data = await OpenFangAPI.get('/api/channels');
        var byName = {};
        (data.channels || []).forEach(function(ch) { byName[ch.name] = ch; });
        this.allChannels.forEach(function(c) {
          var fresh = byName[c.name];
          if (fresh) {
            c.configured = fresh.configured;
            c.has_token = fresh.has_token;
            c.connected = fresh.configured && fresh.has_token;
            c.fields = fresh.fields;
          }
        });
      } catch(e) { console.warn('Channel refresh failed:', e.message); }
    },

    statusBadge(ch) {
      var t = typeof window.t === 'function' ? window.t : function(k) { return k; };
      if (!ch.configured) return { text: t('channels.status_not_configured'), cls: 'badge-muted' };
      if (!ch.has_token) return { text: t('channels.status_missing_token'), cls: 'badge-warn' };
      if (ch.connected) return { text: t('channels.status_ready'), cls: 'badge-success' };
      return { text: t('channels.status_configured'), cls: 'badge-info' };
    },

    difficultyClass(d) {
      if (d === 'Easy') return 'difficulty-easy';
      if (d === 'Hard') return 'difficulty-hard';
      return 'difficulty-medium';
    },

    openSetup(ch) {
      this.setupModal = ch;
      // Pre-populate form values from saved config (non-secret fields).
      var vals = {};
      if (ch.fields) {
        ch.fields.forEach(function(f) {
          if (f.value !== undefined && f.value !== null && f.type !== 'secret') {
            vals[f.key] = String(f.value);
          }
        });
      }
      this.formValues = vals;
      this.showAdvanced = false;
      this.showBusinessApi = false;
      this.setupStep = ch.configured ? 3 : 1;
      this.testPassed = !!ch.configured;
      this.resetQR();
      // Auto-start QR flow for QR-type channels
      if (ch.setup_type === 'qr') {
        this.startQR();
      }
    },

    // ── QR Code Flow (WhatsApp Web style) ──────────────────────────

    resetQR() {
      this.qr = {
        loading: false, available: false, dataUrl: '', sessionId: '',
        message: '', help: '', connected: false, expired: false, error: ''
      };
      if (this.qrPollTimer) { clearInterval(this.qrPollTimer); this.qrPollTimer = null; }
    },

    async startQR() {
      this.qr.loading = true;
      this.qr.error = '';
      this.qr.connected = false;
      this.qr.expired = false;
      try {
        var result = await OpenFangAPI.post('/api/channels/whatsapp/qr/start', {});
        this.qr.available = result.available || false;
        this.qr.dataUrl = result.qr_data_url || '';
        this.qr.sessionId = result.session_id || '';
        this.qr.message = result.message || '';
        this.qr.help = result.help || '';
        this.qr.connected = result.connected || false;
        if (this.qr.available && this.qr.dataUrl && !this.qr.connected) {
          this.pollQR();
        }
        if (this.qr.connected) {
          OpenFangToast.success(typeof window.t === 'function' ? window.t('channels.toast_whatsapp_connected') : 'WhatsApp connected!');
          await this.refreshStatus();
        }
      } catch(e) {
        this.qr.error = e.message || (typeof window.t === 'function' ? window.t('channels.qr_start_failed') : 'Could not start QR login');
      }
      this.qr.loading = false;
    },

    pollQR() {
      var self = this;
      if (this.qrPollTimer) clearInterval(this.qrPollTimer);
      this.qrPollTimer = setInterval(async function() {
        try {
          var result = await OpenFangAPI.get('/api/channels/whatsapp/qr/status?session_id=' + encodeURIComponent(self.qr.sessionId));
          if (result.connected) {
            clearInterval(self.qrPollTimer);
            self.qrPollTimer = null;
            self.qr.connected = true;
            self.qr.message = result.message || (typeof window.t === 'function' ? window.t('channels.qr_connected') : 'Connected!');
            OpenFangToast.success(typeof window.t === 'function' ? window.t('channels.linked_success') : 'WhatsApp linked successfully!');
            await self.refreshStatus();
          } else if (result.expired) {
            clearInterval(self.qrPollTimer);
            self.qrPollTimer = null;
            self.qr.expired = true;
            self.qr.message = typeof window.t === 'function' ? window.t('channels.qr_expired_msg') : 'QR code expired. Click to generate a new one.';
          } else {
            self.qr.message = result.message || (typeof window.t === 'function' ? window.t('channels.qr_waiting_scan') : 'Waiting for scan...');
          }
        } catch(e) { /* silent retry */ }
      }, 3000);
    },

    // ── Standard Form Flow ─────────────────────────────────────────

    async saveChannel() {
      if (!this.setupModal) return;
      var name = this.setupModal.name;
      this.configuring = true;
      try {
        await OpenFangAPI.post('/api/channels/' + name + '/configure', {
          fields: this.formValues
        });
        this.setupStep = 2;
        // Auto-test after save
        try {
          var testResult = await OpenFangAPI.post('/api/channels/' + name + '/test', {});
          if (testResult.status === 'ok') {
            this.testPassed = true;
            this.setupStep = 3;
            OpenFangToast.success(typeof window.t === 'function' ? window.t('channels.toast_channel_activated', { name: this.setupModal.display_name }) : this.setupModal.display_name + ' activated!');
          } else {
            OpenFangToast.success((typeof window.t === 'function' ? window.t('channels.toast_channel_saved', { name: this.setupModal.display_name }) : this.setupModal.display_name + ' saved.') + ' ' + (testResult.message || ''));
          }
        } catch(te) {
          OpenFangToast.success(typeof window.t === 'function' ? window.t('channels.toast_saved_test_verify', { name: this.setupModal.display_name }) : this.setupModal.display_name + ' saved. Test to verify connection.');
        }
        await this.refreshStatus();
      } catch(e) {
        OpenFangToast.error((typeof window.t === 'function' ? window.t('channels.toast_failed') : 'Failed') + ': ' + (e.message || 'Unknown error'));
      }
      this.configuring = false;
    },

    async removeChannel() {
      if (!this.setupModal) return;
      var name = this.setupModal.name;
      var displayName = this.setupModal.display_name;
      var self = this;
      var rt = typeof window.t === 'function' ? window.t : function(k, p) { return k; };
      OpenFangToast.confirm(rt('channels.remove_title'), rt('channels.remove_body', { name: displayName }), async function() {
        try {
          await OpenFangAPI.delete('/api/channels/' + name + '/configure');
          OpenFangToast.success(typeof window.t === 'function' ? window.t('channels.toast_removed', { name: displayName }) : displayName + ' removed and deactivated.');
          await self.refreshStatus();
          self.setupModal = null;
        } catch(e) {
          OpenFangToast.error((typeof window.t === 'function' ? window.t('channels.toast_failed') : 'Failed') + ': ' + (e.message || 'Unknown error'));
        }
      });
    },

    async testChannel() {
      if (!this.setupModal) return;
      var name = this.setupModal.name;
      this.testing[name] = true;
      try {
        var result = await OpenFangAPI.post('/api/channels/' + name + '/test', {});
        if (result.status === 'ok') {
          this.testPassed = true;
          this.setupStep = 3;
          OpenFangToast.success(result.message);
        } else {
          OpenFangToast.error(result.message);
        }
      } catch(e) {
        OpenFangToast.error((typeof window.t === 'function' ? window.t('channels.test_failed') : 'Test failed') + ': ' + (e.message || 'Unknown error'));
      }
      this.testing[name] = false;
    },

    async copyConfig(ch) {
      var tpl = ch ? ch.config_template : (this.setupModal ? this.setupModal.config_template : '');
      if (!tpl) return;
      try {
        await navigator.clipboard.writeText(tpl);
        OpenFangToast.success(typeof window.t === 'function' ? window.t('channels.toast_copied') : 'Copied to clipboard');
      } catch(e) {
        OpenFangToast.error(typeof window.t === 'function' ? window.t('channels.copy_failed') : 'Copy failed');
      }
    },

    destroy() {
      if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
      if (this.qrPollTimer) { clearInterval(this.qrPollTimer); this.qrPollTimer = null; }
    }
  };
}
