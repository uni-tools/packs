'use strict';

// UTCP 工具面板：独立页面，用于浏览与调用 /api/utcp/* 接口。
function utcpToolsPage() {
  var RECENT_KEY = 'openfang-utcp-recent-tools';
  var COUNT_KEY = 'openfang-utcp-tool-counts';

  function safeParse(jsonText, fallback) {
    try {
      var v = JSON.parse(jsonText);
      return v == null ? fallback : v;
    } catch (e) {
      return fallback;
    }
  }

  function loadRecent() {
    var arr = safeParse(localStorage.getItem(RECENT_KEY) || '[]', []);
    return Array.isArray(arr) ? arr.filter(Boolean).slice(0, 20) : [];
  }

  function saveRecent(arr) {
    localStorage.setItem(RECENT_KEY, JSON.stringify((arr || []).slice(0, 20)));
  }

  function loadCounts() {
    var obj = safeParse(localStorage.getItem(COUNT_KEY) || '{}', {});
    return (obj && typeof obj === 'object' && !Array.isArray(obj)) ? obj : {};
  }

  function saveCounts(obj) {
    localStorage.setItem(COUNT_KEY, JSON.stringify(obj || {}));
  }

  function normalizeText(text) {
    return String(text || '').toLowerCase();
  }

  function fuzzyScore(query, candidate) {
    var q = normalizeText(query).trim();
    var c = normalizeText(candidate);
    if (!q) return 1;
    if (!c) return 0;
    if (c.indexOf(q) >= 0) return 100 - (c.indexOf(q) * 0.01);
    var qi = 0;
    var score = 0;
    for (var i = 0; i < c.length && qi < q.length; i++) {
      if (c[i] === q[qi]) {
        score += 1;
        qi += 1;
      }
    }
    if (qi < q.length) return 0;
    return score / q.length;
  }

  return {
    loading: false,
    invoking: false,
    query: '',
    fuzzyQuery: '',
    quickInput: '',
    quickSelectedIndex: 0,
    limit: 50,
    toolName: '',
    confirm: false,
    auditTool: '',
    auditStatus: '',
    auditLimit: 20,
    argsText: '{\n  \n}',
    tools: [],
    loadError: '',
    invokeResult: null,
    invokeError: '',
    invokeCode: '',
    invokeHint: '',
    auditLoading: false,
    auditError: '',
    auditEntries: [],
    recentToolNames: [],
    toolUseCounts: {},
    selectedTool: null,
    selectedToolOpen: false,
    nlAgentId: '',
    initUtcpTools() {
      this.recentToolNames = loadRecent();
      this.toolUseCounts = loadCounts();
      this.loadTools();
      this.loadAudit();
    },
    async loadTools() {
      this.loading = true;
      this.loadError = '';
      try {
        var q = encodeURIComponent(this.query || '');
        var lim = Number(this.limit) || 50;
        var resp = await OpenFangAPI.get('/api/utcp/tools?query=' + q + '&limit=' + lim);
        this.tools = Array.isArray(resp.tools) ? resp.tools : [];
      } catch (e) {
        this.tools = [];
        this.loadError = e.message || '加载 UTCP 工具失败';
      } finally {
        this.loading = false;
      }
    },
    useTool(tool) {
      if (!tool || !tool.name) return;
      this.toolName = tool.name;
      this.selectTool(tool);
      this.recordToolUsage(tool.name);
    },
    onQuickInputKeydown(evt) {
      var candidates = this.quickCandidates;
      if (evt.key === 'Enter') {
        evt.preventDefault();
        this.executeQuickCommand();
        return;
      }
      if (!candidates.length) return;
      if (evt.key === 'ArrowDown') {
        evt.preventDefault();
        this.quickSelectedIndex = (this.quickSelectedIndex + 1) % candidates.length;
      } else if (evt.key === 'ArrowUp') {
        evt.preventDefault();
        this.quickSelectedIndex = (this.quickSelectedIndex - 1 + candidates.length) % candidates.length;
      }
    },
    chooseQuickCandidate(idx) {
      var candidates = this.quickCandidates;
      if (!candidates[idx]) return;
      this.quickSelectedIndex = idx;
      this.applyQuickCandidate(candidates[idx]);
    },
    applyQuickCandidate(tool) {
      this.toolName = tool.name;
      this.selectTool(tool);
      // 仅输入工具名，参数仍让用户按需编辑。
      this.quickInput = tool.name + ' ';
    },
    parseQuickCommand(input) {
      var raw = String(input || '').trim();
      if (!raw) return { toolName: '', args: null, parseError: 'empty' };
      var firstSpace = raw.indexOf(' ');
      if (firstSpace < 0) {
        return { toolName: raw, args: {}, parseError: '' };
      }
      var name = raw.slice(0, firstSpace).trim();
      var rest = raw.slice(firstSpace + 1).trim();
      if (!rest) return { toolName: name, args: {}, parseError: '' };
      // 约定：后半段优先按 JSON 对象解析。
      try {
        var parsed = JSON.parse(rest);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          return { toolName: name, args: null, parseError: 'args-not-object' };
        }
        return { toolName: name, args: parsed, parseError: '' };
      } catch (e) {
        return { toolName: name, args: null, parseError: 'invalid-json' };
      }
    },
    findToolByName(name) {
      var n = normalizeText(name || '');
      if (!n) return null;
      var all = Array.isArray(this.tools) ? this.tools : [];
      for (var i = 0; i < all.length; i++) {
        if (normalizeText(all[i].name) === n) return all[i];
      }
      return null;
    },
    async ensureNlAgent() {
      if (this.nlAgentId) return this.nlAgentId;
      var list = await OpenFangAPI.get('/api/agents');
      var agents = Array.isArray(list) ? list : [];
      if (!agents.length) return '';

      // 优先复用已有助手型智能体，避免重复造轮子和重复创建代理。
      var preferred = agents.find(function(a) {
        var n = normalizeText(a && a.name);
        return n.indexOf('assistant') >= 0 || n.indexOf('助手') >= 0;
      });
      var chosen = preferred || agents[0];
      this.nlAgentId = (chosen && chosen.id) ? chosen.id : '';
      return this.nlAgentId;
    },
    async executeNaturalLanguage(raw) {
      this.invoking = true;
      this.invokeResult = null;
      this.invokeError = '';
      this.invokeCode = '';
      this.invokeHint = '';
      try {
        var agentId = await this.ensureNlAgent();
        if (!agentId) {
          this.invokeError = '未检测到可用智能体。请先在智能体页面创建一个助手后再试。';
          this.invokeHint = '已改为自然语言模式：普通文本会走 OpenFang 智能体能力，而不是直接当作工具名。';
          return;
        }

        var res = await OpenFangAPI.post('/api/agents/' + encodeURIComponent(agentId) + '/message', {
          message: raw
        });
        this.invokeResult = {
          mode: 'natural_language',
          agent_id: agentId,
          input: raw,
          answer: (res && (res.response || res.answer || res.output)) || '',
          usage: {
            input_tokens: (res && res.input_tokens) || 0,
            output_tokens: (res && res.output_tokens) || 0,
            cost_usd: (res && res.cost_usd) || 0
          }
        };
      } catch (e) {
        this.invokeError = '自然语言执行失败：' + (e && e.message ? e.message : 'unknown error');
        this.invokeHint = '如果要强制指定工具，请用：工具名 {"参数":"值"}';
      } finally {
        this.invoking = false;
      }
    },
    async executeQuickCommand() {
      this.invokeResult = null;
      this.invokeError = '';
      this.invokeCode = '';
      this.invokeHint = '';
      var raw = String(this.quickInput || '').trim();
      var parsed = this.parseQuickCommand(raw);
      if (!raw || !parsed.toolName) {
        this.invokeError = '请输入工具命令，例如：web_search {"query":"openfang"}';
        return;
      }
      var matchedTool = this.findToolByName(parsed.toolName);
      var looksLikeToolCall = !!matchedTool;
      if (!looksLikeToolCall) {
        await this.executeNaturalLanguage(raw);
        return;
      }
      if (parsed.parseError === 'invalid-json') {
        this.invokeError = '参数必须是 JSON 对象，例如：tool {"k":"v"}';
        this.invokeHint = '如果你是想自然语言对话，请直接输入完整句子，不要带半截 JSON。';
        return;
      }
      if (parsed.parseError === 'args-not-object') {
        this.invokeError = '参数 JSON 必须是对象类型。';
        return;
      }
      this.toolName = parsed.toolName;
      this.argsText = JSON.stringify(parsed.args || {}, null, 2);
      await this.invokeTool();
    },
    selectTool(tool) {
      this.selectedTool = tool || null;
      this.selectedToolOpen = !!tool;
    },
    closeToolDetail() {
      this.selectedToolOpen = false;
    },
    fillExample(exampleObj) {
      if (!exampleObj || typeof exampleObj !== 'object') return;
      this.argsText = JSON.stringify(exampleObj, null, 2);
    },
    recordToolUsage(toolName) {
      if (!toolName) return;
      var counts = this.toolUseCounts || {};
      counts[toolName] = (counts[toolName] || 0) + 1;
      this.toolUseCounts = counts;
      saveCounts(counts);

      var recent = this.recentToolNames || [];
      recent = recent.filter(function(n) { return n !== toolName; });
      recent.unshift(toolName);
      this.recentToolNames = recent.slice(0, 20);
      saveRecent(this.recentToolNames);
    },
    async invokeTool() {
      this.invokeResult = null;
      this.invokeError = '';
      this.invokeCode = '';
      this.invokeHint = '';
      if (!this.toolName || !this.toolName.trim()) {
        this.invokeError = window.i18n ? window.i18n.t('utcp.tool_name_required', '请先填写工具名。') : '请先填写工具名。';
        return;
      }

      var parsedArgs = {};
      var source = this.argsText || '{}';
      try {
        parsedArgs = JSON.parse(source);
        if (!parsedArgs || typeof parsedArgs !== 'object' || Array.isArray(parsedArgs)) {
          throw new Error('args 必须是 JSON 对象');
        }
      } catch (e) {
        this.invokeError = (window.i18n ? window.i18n.t('utcp.invalid_json', '参数 JSON 格式无效。') : '参数 JSON 格式无效。') + ' ' + (e.message || '');
        return;
      }

      this.invoking = true;
      try {
        var result = await OpenFangAPI.post('/api/utcp/tools/invoke', {
          tool_name: this.toolName.trim(),
          args: parsedArgs,
          confirm: !!this.confirm
        });
        this.recordToolUsage(this.toolName.trim());
        if (result && result.ok) {
          this.invokeResult = result.data;
          this.loadAudit();
        } else {
          this.invokeCode = (result && result.code) ? result.code : '';
          this.invokeHint = (result && result.hint) ? result.hint : '';
          this.invokeError = (result && result.error) ? result.error : (window.i18n ? window.i18n.t('utcp.invoke_failed', '工具调用失败。') : '工具调用失败。');
          this.loadAudit();
        }
      } catch (e2) {
        this.invokeError = e2.message || (window.i18n ? window.i18n.t('utcp.invoke_failed', '工具调用失败。') : '工具调用失败。');
      } finally {
        this.invoking = false;
      }
    },
    async loadAudit() {
      this.auditLoading = true;
      this.auditError = '';
      try {
        var q = [];
        if (this.auditTool && this.auditTool.trim()) q.push('tool=' + encodeURIComponent(this.auditTool.trim()));
        if (this.auditStatus && this.auditStatus.trim()) q.push('status=' + encodeURIComponent(this.auditStatus.trim()));
        q.push('limit=' + encodeURIComponent(String(Number(this.auditLimit) || 20)));
        var url = '/api/utcp/audit?' + q.join('&');
        var resp = await OpenFangAPI.get(url);
        this.auditEntries = Array.isArray(resp.entries) ? resp.entries : [];
      } catch (e) {
        this.auditEntries = [];
        this.auditError = e.message || '加载审计记录失败';
      } finally {
        this.auditLoading = false;
      }
    },
    fmtTime(tsMs) {
      if (!tsMs) return '-';
      try {
        return new Date(Number(tsMs)).toLocaleString();
      } catch (e) {
        return String(tsMs);
      }
    },
    get filteredTools() {
      var all = Array.isArray(this.tools) ? this.tools.slice() : [];
      var q = this.fuzzyQuery || this.query || '';
      if (!q || !q.trim()) return all;
      var self = this;
      return all
        .map(function(t) {
          var target = [t.name, t.description, (t.tags || []).join(' ')].join(' ');
          return { tool: t, score: fuzzyScore(q, target) };
        })
        .filter(function(x) { return x.score > 0; })
        .sort(function(a, b) {
          var ca = (self.toolUseCounts[a.tool.name] || 0);
          var cb = (self.toolUseCounts[b.tool.name] || 0);
          if (cb !== ca) return cb - ca;
          return b.score - a.score;
        })
        .map(function(x) { return x.tool; });
    },
    get quickCandidates() {
      var q = normalizeText(this.quickInput || '').trim();
      // 若输入包含空格，认为用户已在填参数，此时只按工具名前半段匹配。
      var firstToken = q.split(/\s+/)[0] || '';
      if (!firstToken) return this.filteredTools.slice(0, 8);
      return (this.filteredTools || [])
        .filter(function(t) {
          return normalizeText(t.name).indexOf(firstToken) >= 0
            || normalizeText(t.description).indexOf(firstToken) >= 0;
        })
        .slice(0, 8);
    },
    get recentTools() {
      var map = {};
      (this.tools || []).forEach(function(t) { map[t.name] = t; });
      return (this.recentToolNames || [])
        .map(function(name) { return map[name]; })
        .filter(Boolean)
        .slice(0, 8);
    },
    get frequentTools() {
      var counts = this.toolUseCounts || {};
      var map = {};
      (this.tools || []).forEach(function(t) { map[t.name] = t; });
      return Object.keys(counts)
        .map(function(name) { return { name: name, count: counts[name] }; })
        .sort(function(a, b) { return b.count - a.count; })
        .map(function(x) {
          var tool = map[x.name];
          if (!tool) return null;
          return { tool: tool, count: x.count };
        })
        .filter(Boolean)
        .slice(0, 8);
    },
    pretty(value) {
      try {
        return JSON.stringify(value, null, 2);
      } catch (e) {
        return String(value);
      }
    }
  };
}
