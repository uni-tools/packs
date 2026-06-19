'use strict';

// uni-tools 应用市场 — 统一 Pack 目录与后台安装
function marketPage() {
  return {
    tab: 'installed',
    query: '',
    items: [],
    tasks: [],
    loading: false,
    loadError: '',
    installingId: null,
    _pollTimer: null,

    kindParam: function() {
      if (this.tab === 'skills') return 'skill';
      if (this.tab === 'hands') return 'hand';
      if (this.tab === 'extensions') return 'extension';
      if (this.tab === 'utcp') return 'utcp-provider';
      if (this.tab === 'dashboard') return 'dashboard';
      if (this.tab === 'channels') return 'channel';
      return '';
    },

    async loadCatalog() {
      this.loading = true;
      this.loadError = '';
      try {
        var params = new URLSearchParams();
        var kind = this.kindParam();
        if (kind) params.set('type', kind);
        if (this.query.trim()) params.set('q', this.query.trim());
        params.set('limit', '40');
        var data = await OpenFangAPI.get('/api/market/catalog?' + params.toString());
        this.items = data.items || [];
      } catch (e) {
        this.items = [];
        this.loadError = e.message || 'Failed to load catalog';
      }
      this.loading = false;
    },

    async loadInstalled() {
      this.loading = true;
      this.loadError = '';
      try {
        var params = new URLSearchParams();
        var kind = this.kindParam();
        if (kind) params.set('type', kind);
        var data = await OpenFangAPI.get('/api/market/installed?' + params.toString());
        this.items = data.items || [];
      } catch (e) {
        this.items = [];
        this.loadError = e.message || 'Failed to load installed packs';
      }
      this.loading = false;
    },

    async loadTasks() {
      try {
        var data = await OpenFangAPI.get('/api/market/tasks');
        this.tasks = data.tasks || [];
      } catch (e) {
        this.tasks = [];
      }
    },

    async refresh() {
      if (this.tab === 'installed') {
        await this.loadInstalled();
      } else {
        await this.loadCatalog();
      }
      await this.loadTasks();
    },

    switchTab(tab) {
      this.tab = tab;
      this.refresh();
    },

    onSearchInput() {
      clearTimeout(this._searchTimer);
      var self = this;
      this._searchTimer = setTimeout(function() { self.refresh(); }, 400);
    },

    packKey: function(item) {
      return (item.kind || 'pack') + ':' + item.id;
    },

    sourceLabel: function(item) {
      var s = item.source || '';
      if (s === 'clawhub') return 'ClawHub';
      if (s === 'fanghub') return 'FangHub';
      if (s === 'registry') return window.t ? window.t('market.source_registry') : 'uni-tools';
      if (s === 'bundled') return window.t ? window.t('market.source_bundled') : 'Built-in';
      return s;
    },

    kindLabel: function(item) {
      var k = item.kind || '';
      var map = {
        skill: window.t ? window.t('nav.skills') : 'Skill',
        hand: window.t ? window.t('nav.hands') : 'Hand',
        extension: window.t ? window.t('nav.extensions') : 'Extension',
        'utcp-provider': window.t ? window.t('market.tab_utcp') : 'UTCP',
        dashboard: window.t ? window.t('market.tab_dashboard') : 'Dashboard',
        channel: window.t ? window.t('market.tab_channels') : 'Channel',
      };
      return map[k] || k;
    },

    packIconUrl: function(item) {
      var icon = item && item.icon;
      if (!icon || typeof icon !== 'string') return '';
      if (icon.indexOf('http://') === 0 || icon.indexOf('https://') === 0 || icon.indexOf('data:') === 0) {
        return icon;
      }
      return '';
    },

    packIconEmoji: function(item) {
      if (item && item.icon_emoji) return item.icon_emoji;
      var map = {
        skill: '🧩',
        hand: '🤖',
        extension: '🔌',
        'utcp-provider': '⚡',
        dashboard: '📊',
        channel: '💬',
      };
      return map[item.kind] || '📦';
    },

    versionLabel: function(item) {
      return item.version ? ('v' + item.version) : '';
    },

    isInstalling: function(item) {
      return this.installingId === this.packKey(item);
    },

    statusLabel: function(task) {
      return task.status || '';
    },

    async installPack(item) {
      var key = this.packKey(item);
      this.installingId = key;
      try {
        var body = {
          type: item.kind,
          id: item.id,
        };
        if (item.source) body.source = item.source;
        var data = await OpenFangAPI.post('/api/market/install', body);
        this.startTaskPoll(data.task_id);
        await this.refresh();
        window.dispatchEvent(new CustomEvent('pack:changed'));
      } catch (e) {
        alert(e.message || 'Install failed');
      }
      this.installingId = null;
    },

    async removePack(item) {
      if (!confirm((window.t ? window.t('market.confirm_remove') : 'Remove') + ' ' + item.name + '?')) return;
      try {
        await OpenFangAPI.post('/api/market/remove', { type: item.kind, id: item.id });
        await this.refresh();
        window.dispatchEvent(new CustomEvent('pack:changed'));
      } catch (e) {
        alert(e.message || 'Remove failed');
      }
    },

    startTaskPoll(taskId) {
      var self = this;
      var attempts = 0;
      clearInterval(this._pollTimer);
      this._pollTimer = setInterval(async function() {
        attempts += 1;
        try {
          var task = await OpenFangAPI.get('/api/market/tasks/' + encodeURIComponent(taskId));
          await self.loadTasks();
          if (task.status === 'completed' || task.status === 'failed' || attempts > 60) {
            clearInterval(self._pollTimer);
            await self.refresh();
          }
        } catch (e) {
          if (attempts > 10) clearInterval(self._pollTimer);
        }
      }, 1500);
    },

    initMarketPage: function() {
      this.refresh();
    }
  };
}

function initMarketPage() {
  /* Alpine x-init hook */
}
