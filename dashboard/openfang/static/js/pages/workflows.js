// OpenFang Workflows Page — Workflow builder + run history
'use strict';

function workflowsPage() {
  return {
    // -- Workflows state --
    workflows: [],
    showCreateModal: false,
    runModal: null,
    runInput: '',
    runResult: '',
    running: false,
    loading: true,
    loadError: '',
    newWf: { name: '', description: '', steps: [{ name: '', agent_name: '', mode: 'sequential', prompt: '{{input}}' }] },
    editModal: null,
    editWf: { name: '', description: '', steps: [] },

    stepCountLabel(wf) {
      if (!wf || !Array.isArray(wf.steps)) return wf && wf.steps ? String(wf.steps) : '';
      var n = wf.steps.length;
      if (typeof window.t === 'function') {
        return n === 1 ? window.t('workflows.steps_count_one') : window.t('workflows.steps_count_many', { n: n });
      }
      return n + ' step' + (n !== 1 ? 's' : '');
    },

    // -- Workflows methods --
    async loadWorkflows() {
      this.loading = true;
      this.loadError = '';
      try {
        this.workflows = await OpenFangAPI.get('/api/workflows');
      } catch(e) {
        this.workflows = [];
        this.loadError = e.message || (typeof window.t === 'function' ? window.t('workflows.load_error') : 'Could not load workflows.');
      }
      this.loading = false;
    },

    async loadData() { return this.loadWorkflows(); },

    async createWorkflow() {
      var steps = this.newWf.steps.map(function(s) {
        return { name: s.name || 'step', agent_name: s.agent_name, mode: s.mode, prompt: s.prompt || '{{input}}' };
      });
      try {
        var wfName = this.newWf.name;
        await OpenFangAPI.post('/api/workflows', { name: wfName, description: this.newWf.description, steps: steps });
        this.showCreateModal = false;
        this.newWf = { name: '', description: '', steps: [{ name: '', agent_name: '', mode: 'sequential', prompt: '{{input}}' }] };
        OpenFangToast.success(typeof window.t === 'function' ? window.t('workflows.toast_created') : 'Workflow created');
        await this.loadWorkflows();
      } catch(e) {
        OpenFangToast.error((typeof window.t === 'function' ? window.t('workflows.toast_create_failed') : 'Failed to create workflow') + ': ' + e.message);
      }
    },

    showRunModal(wf) {
      this.runModal = wf;
      this.runInput = '';
      this.runResult = '';
    },

    async executeWorkflow() {
      if (!this.runModal) return;
      this.running = true;
      this.runResult = '';
      try {
        var res = await OpenFangAPI.post('/api/workflows/' + this.runModal.id + '/run', { input: this.runInput });
        this.runResult = res.output || JSON.stringify(res, null, 2);
        OpenFangToast.success(typeof window.t === 'function' ? window.t('workflows.toast_completed') : 'Workflow completed');
      } catch(e) {
        this.runResult = 'Error: ' + e.message;
        OpenFangToast.error((typeof window.t === 'function' ? window.t('workflows.toast_failed') : 'Workflow failed') + ': ' + e.message);
      }
      this.running = false;
    },

    async viewRuns(wf) {
      try {
        var runs = await OpenFangAPI.get('/api/workflows/' + wf.id + '/runs');
        this.runResult = JSON.stringify(runs, null, 2);
        this.runModal = wf;
      } catch(e) {
        OpenFangToast.error((typeof window.t === 'function' ? window.t('workflows.toast_run_history_failed') : 'Failed to load run history') + ': ' + e.message);
      }
    },

    async deleteWorkflow(wf) {
      if (!confirm(typeof window.t === 'function' ? window.t('workflows.delete_confirm') : 'Delete workflow? This cannot be undone.')) return;
      try {
        await OpenFangAPI.delete('/api/workflows/' + wf.id);
        OpenFangToast.success(typeof window.t === 'function' ? window.t('workflows.toast_deleted') : 'Workflow deleted');
        await this.loadWorkflows();
      } catch(e) {
        OpenFangToast.error((typeof window.t === 'function' ? window.t('workflows.toast_delete_failed') : 'Failed to delete workflow') + ': ' + e.message);
      }
    },

    async showEditModal(wf) {
      try {
        var full = await OpenFangAPI.get('/api/workflows/' + wf.id);
        this.editWf = {
          name: full.name || '',
          description: full.description || '',
          steps: (full.steps || []).map(function(s) {
            return {
              name: s.name || '',
              agent_name: (s.agent && s.agent.name) || '',
              mode: s.mode || 'sequential',
              prompt: s.prompt_template || '{{input}}'
            };
          })
        };
        if (this.editWf.steps.length === 0) {
          this.editWf.steps.push({ name: '', agent_name: '', mode: 'sequential', prompt: '{{input}}' });
        }
        this.editModal = wf;
      } catch(e) {
        OpenFangToast.error((typeof window.t === 'function' ? window.t('workflows.toast_load_failed') : 'Failed to load workflow') + ': ' + e.message);
      }
    },

    async saveWorkflow() {
      if (!this.editModal) return;
      var steps = this.editWf.steps.map(function(s) {
        return { name: s.name || 'step', agent_name: s.agent_name, mode: s.mode, prompt: s.prompt || '{{input}}' };
      });
      try {
        var wfName = this.editWf.name;
        await OpenFangAPI.put('/api/workflows/' + this.editModal.id, { name: wfName, description: this.editWf.description, steps: steps });
        this.editModal = null;
        OpenFangToast.success(typeof window.t === 'function' ? window.t('workflows.toast_updated') : 'Workflow updated');
        await this.loadWorkflows();
      } catch(e) {
        OpenFangToast.error((typeof window.t === 'function' ? window.t('workflows.toast_update_failed') : 'Failed to update workflow') + ': ' + e.message);
      }
    }
  };
}
