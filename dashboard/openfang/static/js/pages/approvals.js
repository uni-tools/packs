// OpenFang Approvals Page — Execution approval queue for sensitive agent actions
'use strict';

function approvalsPage() {
  return {
    approvals: [],
    filterStatus: 'all',
    loading: true,
    loadError: '',
    refreshTimer: null,

    init() {
      var self = this;
      this.loadData();
      this.refreshTimer = setInterval(function() {
        self.loadData();
      }, 5000);
    },

    destroy() {
      if (this.refreshTimer) {
        clearInterval(this.refreshTimer);
        this.refreshTimer = null;
      }
    },

    get filtered() {
      var f = this.filterStatus;
      if (f === 'all') return this.approvals;
      return this.approvals.filter(function(a) { return a.status === f; });
    },

    get pendingCount() {
      return this.approvals.filter(function(a) { return a.status === 'pending'; }).length;
    },

    get pendingBadgeText() {
      if (this.pendingCount <= 0) return '';
      if (window.i18n && window.i18n.isInitialized && window.i18n.isInitialized()) {
        return window.i18n.t('approvals.pending_count', { n: this.pendingCount });
      }
      return this.pendingCount + ' pending';
    },

    approvalStatusLabel(status) {
      if (!status) return '';
      var key = 'approvals.status.' + status;
      if (window.i18n && window.i18n.isInitialized && window.i18n.isInitialized()) {
        var tr = window.i18n.t(key);
        if (tr !== key) return tr;
      }
      return status;
    },

    async loadData() {
      this.loading = true;
      this.loadError = '';
      try {
        var data = await OpenFangAPI.get('/api/approvals');
        this.approvals = data.approvals || [];
      } catch(e) {
        this.loadError = e.message || 'Could not load approvals.';
      }
      this.loading = false;
    },

    async approve(id) {
      var t = window.i18n && window.i18n.t ? window.i18n.t.bind(window.i18n) : function(k) { return k; };
      try {
        await OpenFangAPI.post('/api/approvals/' + id + '/approve', {});
        OpenFangToast.success(t('approvals.toast_approved'));
        await this.loadData();
      } catch(e) {
        OpenFangToast.error(e.message);
      }
    },

    async reject(id) {
      var self = this;
      var t = window.i18n && window.i18n.t ? window.i18n.t.bind(window.i18n) : function(k) { return k; };
      OpenFangToast.confirm(t('approvals.reject_confirm_title'), t('approvals.reject_confirm_body'), async function() {
        try {
          await OpenFangAPI.post('/api/approvals/' + id + '/reject', {});
          OpenFangToast.success(t('approvals.toast_rejected'));
          await self.loadData();
        } catch(e) {
          OpenFangToast.error(e.message);
        }
      });
    },

    timeAgo(dateStr) {
      if (window.i18n && window.i18n.timeAgoLocalized) return window.i18n.timeAgoLocalized(dateStr);
      if (!dateStr) return '';
      var d = new Date(dateStr);
      var secs = Math.floor((Date.now() - d.getTime()) / 1000);
      if (secs < 60) return secs + 's ago';
      if (secs < 3600) return Math.floor(secs / 60) + 'm ago';
      if (secs < 86400) return Math.floor(secs / 3600) + 'h ago';
      return Math.floor(secs / 86400) + 'd ago';
    }
  };
}
