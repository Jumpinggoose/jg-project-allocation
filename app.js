'use strict';

const STORAGE_KEY = 'jg-project-allocation-v1';
const CONFLICT_STORAGE_KEY = 'jg-project-allocation-conflict-v1';
const PROJECT_TYPES = ['Retainer', 'One-Time', 'Pitch', 'Internal'];
const STATUSES = ['Not Started', 'Active', 'In Progress', 'Ending Soon', 'Ending Urgent', 'On Hold', 'Paused', 'Completed'];
const MEMBER_TYPES = ['Employee', 'Intern', 'Freelancer'];
const GROUPS = ['POND 1', 'POND 2', 'POOL'];
const PRIORITIES = ['Low', 'Normal', 'High', 'Urgent'];
const SUPPORT_KEYS = ['support1', 'support2', 'support3', 'support4'];
const MENTOR_KEYS = ['mentor1', 'mentor2'];
const ROLE_KEYS = ['leadSpoc', 'primary1', 'primary2', ...SUPPORT_KEYS, ...MENTOR_KEYS];
const AGENCY_SUGGESTIONS = ['SS', 'SSS', 'TT', 'BW', 'FU', 'BD', 'Internal', 'SS + SSS', 'FU + SS', 'BD + FU + TT', 'FU + TT', 'BD + FU', 'FU + SS + TT', 'BW + FU', 'SS + TT', 'SSS + TT', 'BW + SS'];

const DEFAULT_DATA = {
  version: 2,
  revision: 0,
  meta: {
    agency: 'JUMPINGGOOSE',
    period: '2026-27',
    currentFY: '2026-27',
    financialYears: ['2026-27'],
    lastUpdated: null
  },
  settings: {
    projectLimits: { Retainer: 20, 'One-Time': 40, Pitch: 40, Internal: 20 },
    roleWeights: {
      leadSpoc: 0.05,
      primary1: 0.6,
      primary2: 0.4,
      support1: 0.1,
      support2: 0.1,
      support3: 0.1,
      support4: 0.1,
      mentor1: 0,
      mentor2: 0
    },
    loadBands: { balancedMax: 1, highMax: 1.5 }
  },
  members: [
    { id: 'piyush', name: 'Piyush', group: 'POND 1', type: 'Employee', active: true },
    { id: 'theo', name: 'Theo', group: 'POND 1', type: 'Employee', active: true },
    { id: 'apeksha', name: 'Apeksha', group: 'POND 1', type: 'Employee', active: true },
    { id: 'siraj', name: 'Siraj', group: 'POND 1', type: 'Employee', active: true },
    { id: 'nandini', name: 'Nandini', group: 'POND 1', type: 'Employee', active: true },
    { id: 'tuhin', name: 'Tuhin', group: 'POND 2', type: 'Employee', active: true },
    { id: 'supriya', name: 'Supriya', group: 'POND 2', type: 'Employee', active: true },
    { id: 'manvith', name: 'Manvith', group: 'POND 2', type: 'Employee', active: true },
    { id: 'adil', name: 'Adil', group: 'POND 2', type: 'Employee', active: true },
    { id: 'pranjal', name: 'Pranjal', group: 'POND 2', type: 'Employee', active: true },
    { id: 'midhun', name: 'Midhun', group: 'POOL', type: 'Employee', active: true },
    { id: 'vedant', name: 'Vedant', group: 'POOL', type: 'Employee', active: true },
    { id: 'anas', name: 'Anas', group: 'POOL', type: 'Employee', active: true },
    { id: 'sukanya', name: 'Sukanya', group: 'POOL', type: 'Employee', active: true },
    { id: 'bhagya', name: 'Bhagya', group: 'POOL', type: 'Employee', active: true }
  ],
  projects: []
};

let state = deepClone(DEFAULT_DATA);
let storageMode = 'local';
let saveTimer = null;
let remotePollTimer = null;
let remotePending = null;
let modalCommitted = false;
let isSaving = false;
let sessionUser = null;

const supabaseConfig = window.JG_SUPABASE;
if (!supabaseConfig?.url || !supabaseConfig?.publishableKey || !window.supabase) {
  throw new Error('Supabase configuration is missing.');
}
const supabaseClient = window.supabase.createClient(
  supabaseConfig.url,
  supabaseConfig.publishableKey
);

const ui = {
  view: 'dashboard',
  search: '',
  financialYear: '2026-27',
  pondFilters: {
    'POND 1': { status: 'Open', type: 'All' },
    'POND 2': { status: 'Open', type: 'All' }
  },
  teamGroup: 'All'
};

const els = {};

document.addEventListener('DOMContentLoaded', init);

async function init() {
  cacheElements();
  bindStaticEvents();
  updateSyncUI('loading');
  const authenticated = await loadSession();
  if (!authenticated) return;
  state = normalizeState(await loadState());
  ui.financialYear = state.meta.currentFY || state.meta.period || '2026-27';
  renderCurrentView();

  if (storageMode === 'server') {
    remotePollTimer = window.setInterval(pollServer, 12000);
  }
}

function cacheElements() {
  els.sidebar = document.getElementById('sidebar');
  els.mobileMenu = document.getElementById('mobileMenu');
  els.mobileBackdrop = document.getElementById('mobileBackdrop');
  els.pageTitle = document.getElementById('pageTitle');
  els.pageSubtitle = document.getElementById('pageSubtitle');
  els.viewContainer = document.getElementById('viewContainer');
  els.globalSearch = document.getElementById('globalSearch');
  els.globalSearchWrap = document.getElementById('globalSearchWrap');
  els.dataButton = document.getElementById('dataButton');
  els.primaryAction = document.getElementById('primaryAction');
  els.currentUserLabel = document.getElementById('currentUserLabel');
  els.financialYearSelect = document.getElementById('financialYearSelect');
  els.appEyebrow = document.getElementById('appEyebrow');
  els.logoutButton = document.getElementById('logoutButton');
  els.syncDot = document.getElementById('syncDot');
  els.syncLabel = document.getElementById('syncLabel');
  els.syncDetail = document.getElementById('syncDetail');
  els.modal = document.getElementById('appModal');
  els.modalShell = document.getElementById('modalFormShell');
  els.modalEyebrow = document.getElementById('modalEyebrow');
  els.modalTitle = document.getElementById('modalTitle');
  els.modalDescription = document.getElementById('modalDescription');
  els.modalBody = document.getElementById('modalBody');
  els.modalFooter = document.getElementById('modalFooter');
  els.toastRegion = document.getElementById('toastRegion');
}

function bindStaticEvents() {
  document.querySelectorAll('.nav-item').forEach((button) => {
    button.addEventListener('click', () => setView(button.dataset.view, true));
  });

  els.mobileMenu.addEventListener('click', openMobileNav);
  els.mobileBackdrop.addEventListener('click', closeMobileNav);

  els.globalSearch.addEventListener('input', (event) => {
    ui.search = event.target.value.trim().toLowerCase();
    renderCurrentView();
  });

  els.financialYearSelect.addEventListener('change', (event) => {
    ui.financialYear = event.target.value;
    renderCurrentView();
  });

  els.dataButton.addEventListener('click', openDataModal);
  els.primaryAction.addEventListener('click', handlePrimaryAction);
  els.logoutButton.addEventListener('click', logout);
  els.viewContainer.addEventListener('click', handleViewClick);
  els.viewContainer.addEventListener('change', handleViewChange);
  els.viewContainer.addEventListener('input', handleViewInput);

  els.modal.addEventListener('close', () => {
    if (remotePending && !modalCommitted) {
      state = normalizeState(remotePending);
      localBackup();
      renderCurrentView();
      showToast('The latest shared data has been loaded.');
    }
    remotePending = null;
    modalCommitted = false;
  });

  document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      els.globalSearch.focus();
    }
  });
}

async function loadSession() {
  try {
    const { data, error } = await supabaseClient.auth.getUser();
    if (error || !data.user) {
      redirectToLogin();
      return false;
    }

    const email = String(data.user.email || '').toLowerCase();
    if (!email.endsWith('@jumpinggoose.com')) {
      await supabaseClient.auth.signOut();
      showToast('Access is limited to @jumpinggoose.com accounts.', 'error');
      redirectToLogin();
      return false;
    }

    sessionUser = {
      id: data.user.id,
      email,
      name: data.user.user_metadata?.name || data.user.email || 'JG user',
      role: email === 'theo@jumpinggoose.com' ? 'admin' : 'editor'
    };

    const roleLabel = sessionUser.role === 'admin' ? 'Admin' : 'Editor';
    els.currentUserLabel.textContent = `${sessionUser.name} · ${roleLabel}`;
    return true;
  } catch (error) {
    console.error(error);
    redirectToLogin();
    return false;
  }
}

function userCanEdit() {
  return Boolean(sessionUser);
}

function userIsAdmin() {
  return Boolean(sessionUser && sessionUser.role === 'admin');
}

function redirectToLogin() {
  window.location.replace('/login.html');
}

async function logout() {
  els.logoutButton.disabled = true;
  try {
    await supabaseClient.auth.signOut();
  } catch (error) {
    console.info('Logout could not be confirmed.', error);
  } finally {
    window.location.replace('/login.html');
  }
}

async function loadState() {
  const localData = readLocalBackup();

  try {
    const { data: row, error } = await supabaseClient
      .from('app_state')
      .select('data, revision, updated_at')
      .eq('id', 1)
      .single();

    if (error) throw error;

    const serverData = row?.data || deepClone(DEFAULT_DATA);
    serverData.revision = Number(row?.revision || 0);
    serverData.meta = serverData.meta || {};
    serverData.meta.lastUpdated = row?.updated_at || serverData.meta.lastUpdated || null;

    storageMode = 'server';
    updateSyncUI('saved', 'Supabase shared database');
    return serverData;
  } catch (error) {
    console.error('Supabase storage unavailable.', error);
    storageMode = 'offline';
    updateSyncUI('error', 'Read-only browser backup');
    return localData || deepClone(DEFAULT_DATA);
  }
}

function readLocalBackup() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn('Unable to read local backup.', error);
    return null;
  }
}

function localBackup() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (error) {
    console.warn('Unable to save local backup.', error);
    return false;
  }
}

function scheduleSave(options = {}) {
  if (!userCanEdit()) {
    showToast('Sign in to edit this workspace.', 'warning');
    return;
  }
  if (storageMode !== 'server') {
    showToast('Cloud storage is unavailable. This view is read-only until the connection returns.', 'error');
    return;
  }

  state.meta.lastUpdated = new Date().toISOString();
  localBackup();
  updateSyncUI('saving');
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => persistState(options), 350);
}

async function persistState(options = {}) {
  if (isSaving || storageMode !== 'server') return;
  isSaving = true;

  const expectedRevision = Number(state.revision || 0);
  const nextRevision = expectedRevision + 1;
  const attemptedState = deepClone(state);
  attemptedState.revision = nextRevision;
  attemptedState.meta = attemptedState.meta || {};
  attemptedState.meta.lastUpdated = new Date().toISOString();
  attemptedState.meta.lastUpdatedBy = sessionUser?.email || sessionUser?.id || null;

  try {
    const { data: rows, error } = await supabaseClient
      .from('app_state')
      .update({
        data: attemptedState,
        revision: nextRevision,
        updated_at: attemptedState.meta.lastUpdated,
        updated_by: sessionUser?.id || null
      })
      .eq('id', 1)
      .eq('revision', expectedRevision)
      .select('data, revision, updated_at');

    if (error) throw error;

    if (!rows || rows.length === 0) {
      try { localStorage.setItem(CONFLICT_STORAGE_KEY, JSON.stringify(attemptedState)); } catch (_error) {}

      const { data: latest, error: latestError } = await supabaseClient
        .from('app_state')
        .select('data, revision, updated_at')
        .eq('id', 1)
        .single();

      if (latestError) throw latestError;
      const latestState = normalizeState(latest.data || DEFAULT_DATA);
      latestState.revision = Number(latest.revision || 0);
      latestState.meta = latestState.meta || {};
      latestState.meta.lastUpdated = latest.updated_at || latestState.meta.lastUpdated || null;
      state = latestState;
      localBackup();
      renderCurrentView();
      updateSyncUI('error', 'Another person saved first');
      showToast('Another person saved first. The latest shared version is loaded; your attempted version is available in Data.', 'warning');
      return;
    }

    const saved = rows[0];
    state = normalizeState(saved.data || attemptedState);
    state.revision = Number(saved.revision || nextRevision);
    state.meta = state.meta || {};
    state.meta.lastUpdated = saved.updated_at || attemptedState.meta.lastUpdated;
    localBackup();
    updateSyncUI('saved', 'Supabase shared database');

    if (!options.silent) showToast('Changes saved.');
  } catch (error) {
    console.error(error);
    updateSyncUI('error', 'Browser backup retained');
    showToast('Cloud save failed. Your browser backup is still available.', 'error');
  } finally {
    isSaving = false;
  }
}

async function pollServer() {
  if (storageMode !== 'server' || document.hidden || isSaving) return;

  try {
    const { data: row, error } = await supabaseClient
      .from('app_state')
      .select('data, revision, updated_at')
      .eq('id', 1)
      .single();

    if (error) throw error;

    const remoteRevision = Number(row?.revision || 0);
    if (remoteRevision > Number(state.revision || 0)) {
      const remoteData = normalizeState(row.data || DEFAULT_DATA);
      remoteData.revision = remoteRevision;
      remoteData.meta = remoteData.meta || {};
      remoteData.meta.lastUpdated = row.updated_at || remoteData.meta.lastUpdated || null;

      if (els.modal.open) {
        remotePending = remoteData;
        showToast('New shared changes are ready and will load after this form closes.', 'warning');
      } else {
        state = remoteData;
        localBackup();
        renderCurrentView();
        updateSyncUI('saved', 'Updated from Supabase');
      }
    }
  } catch (error) {
    console.error('Supabase poll failed.', error);
    updateSyncUI('error', 'Working from local backup');
  }
}

function updateSyncUI(status, detail = '') {
  els.syncDot.className = 'sync-dot';
  if (status === 'saved') els.syncDot.classList.add('is-online');
  if (status === 'error') els.syncDot.classList.add('is-error');

  const labels = {
    loading: 'Loading data',
    saving: 'Saving changes',
    saved: storageMode === 'server' ? 'Cloud synced' : storageMode === 'offline' ? 'Read only' : 'Saved locally',
    error: 'Sync issue'
  };
  els.syncLabel.textContent = labels[status] || 'Ready';
  els.syncDetail.textContent = detail || (status === 'saving' ? 'Please wait' : formatTimestamp(state?.meta?.lastUpdated));
}

function setView(view, clearSearch = false) {
  ui.view = view;
  if (clearSearch) {
    ui.search = '';
    els.globalSearch.value = '';
  }

  document.querySelectorAll('.nav-item').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.view === view);
  });
  closeMobileNav();
  renderCurrentView();
}

function renderCurrentView() {
  refreshFinancialYearControls();
  const viewMeta = {
    dashboard: {
      title: 'Consolidated Dashboard',
      subtitle: 'A live view of projects, Pond allocation and team capacity.',
      action: 'Add project'
    },
    pond1: {
      title: 'Pond 1 Project Tracker',
      subtitle: 'Retainers, one-time projects, pitches and internal work assigned to Pond 1.',
      action: 'Add Pond 1 project'
    },
    pond2: {
      title: 'Pond 2 Project Tracker',
      subtitle: 'Retainers, one-time projects, pitches and internal work assigned to Pond 2.',
      action: 'Add Pond 2 project'
    },
    team: {
      title: 'Team Capacity Overview',
      subtitle: 'Calculated allocation, role mix and workload across both Ponds and the Pool.',
      action: 'Add team member'
    },
    setup: {
      title: 'Admin Panel',
      subtitle: 'Manage employees, interns, freelancers, role weights and project limits. Admin access only.',
      action: 'Add team member'
    }
  }[ui.view];

  els.pageTitle.textContent = viewMeta.title;
  els.pageSubtitle.textContent = viewMeta.subtitle;
  els.primaryAction.textContent = viewMeta.action;
  const globalSetupView = ui.view === 'team' || ui.view === 'setup';
  els.primaryAction.hidden = globalSetupView ? (!userCanEdit() || storageMode !== 'server') : !canEditSelectedFY();
  const setupNav = document.querySelector('[data-view="setup"]');
  if (setupNav) setupNav.hidden = !userIsAdmin();
  els.globalSearch.placeholder = ui.view === 'team' || ui.view === 'setup'
    ? 'Search team members'
    : 'Search projects or people';

  if (ui.view === 'dashboard') els.viewContainer.innerHTML = renderDashboard();
  if (ui.view === 'pond1') els.viewContainer.innerHTML = renderPond('POND 1');
  if (ui.view === 'pond2') els.viewContainer.innerHTML = renderPond('POND 2');
  if (ui.view === 'team') els.viewContainer.innerHTML = renderTeamOverview();
  if (ui.view === 'setup') {
    if (!userIsAdmin()) {
      ui.view = 'dashboard';
      els.viewContainer.innerHTML = renderDashboard();
      showToast('Admin Panel access is limited to theo@jumpinggoose.com.', 'warning');
    } else {
      els.viewContainer.innerHTML = renderTeamSetup();
    }
  }

  updateSyncUI(storageMode === 'server' ? 'saved' : 'error', storageMode === 'server' ? 'Shared cloud storage' : 'Read-only browser backup');
}

function renderDashboard() {
  const allProjects = getVisibleProjects(state.projects);
  const total = allProjects.length;
  const active = allProjects.filter(isActiveProject).length;
  const completed = allProjects.filter((project) => project.status === 'Completed').length;
  const onHold = allProjects.filter((project) => project.status === 'On Hold').length;
  const pond1 = allProjects.filter((project) => project.pond === 'POND 1').length;
  const pond2 = allProjects.filter((project) => project.pond === 'POND 2').length;

  const typeCounts = Object.fromEntries(PROJECT_TYPES.map((type) => [type, allProjects.filter((project) => project.type === type).length]));
  const typeStatusCounts = Object.fromEntries(PROJECT_TYPES.map((type) => {
    const projects = allProjects.filter((project) => project.type === type);
    return [type, {
      ongoing: projects.filter((project) => !['On Hold', 'Paused', 'Completed'].includes(project.status)).length,
      holdPaused: projects.filter((project) => ['On Hold', 'Paused'].includes(project.status)).length,
      completed: projects.filter((project) => project.status === 'Completed').length
    }];
  }));
  const activeMembers = state.members.filter((member) => member.active && matchesSearch(member.name, member.group, member.type));
  const capacityCounts = { Available: 0, Balanced: 0, High: 0, Overloaded: 0 };
  activeMembers.forEach((member) => { capacityCounts[computeMemberStats(member.id).loadStatus] += 1; });

  const upcoming = allProjects
    .filter((project) => isActiveProject(project) && project.endDate)
    .sort((a, b) => a.endDate.localeCompare(b.endDate))
    .slice(0, 6);

  const maxType = Math.max(1, ...Object.values(typeCounts));
  const teamLoads = activeMembers
    .map((member) => ({ member, stats: computeMemberStats(member.id) }))
    .sort((a, b) => b.stats.loadScore - a.stats.loadScore || a.member.name.localeCompare(b.member.name))
    .slice(0, 8);
  const maxLoad = Math.max(state.settings.loadBands.highMax, ...teamLoads.map((item) => item.stats.loadScore), 1);

  return `
    <div class="stack-lg">
      <section class="kpi-grid" aria-label="Key project metrics">
        ${kpiCard('Total projects', total, 'Across Pond 1 and Pond 2', 'is-accent')}
        ${kpiCard('Active load', active, 'Everything except completed', 'is-dark')}
        ${kpiCard('Completed', completed, total ? `${Math.round((completed / total) * 100)}% of all projects` : 'No projects yet')}
        ${kpiCard('On hold', onHold, onHold ? 'Needs attention' : 'No blocked work')}
        ${kpiCard('Pond 1', pond1, `${countActiveByPond('POND 1')} currently active`)}
        ${kpiCard('Pond 2', pond2, `${countActiveByPond('POND 2')} currently active`)}
      </section>

      <section class="grid-2">
        <article class="panel">
          <div class="panel-header">
            <div>
              <div class="section-eyebrow">Project mix · all JG</div>
              <h2 class="panel-title">Work by engagement type</h2>
            </div>
            <span class="pill-count">${total}</span>
          </div>
          <div class="panel-body">
            <div class="donut-wrap">
              <div class="donut" style="background:${donutGradient(typeCounts)}">
                <div class="donut-center"><strong>${total}</strong><span>Projects</span></div>
              </div>
              <div class="legend-list">
                ${PROJECT_TYPES.map((type, index) => `
                  <div class="legend-item">
                    <span class="legend-swatch" style="background:${['var(--forest)','var(--purple)','var(--teal)','var(--orange)'][index]}"></span>
                    <span>${escapeHtml(type)}</span>
                    <strong>${typeCounts[type]}</strong>
                  </div>`).join('')}
              </div>
            </div>
            <div class="metric-list" style="margin-top:22px">
              ${PROJECT_TYPES.map((type, index) => `
                <div class="metric-row">
                  <span class="metric-name">${escapeHtml(type)}</span>
                  <span class="progress-track"><span class="progress-fill ${['forest','','teal','yellow'][index]}" style="width:${(typeCounts[type] / maxType) * 100}%"></span></span>
                  <span class="metric-status-summary" aria-label="${typeCounts[type]} total projects">
                    <strong class="metric-total">${typeCounts[type]}</strong>
                    <span><b>${typeStatusCounts[type].ongoing}</b> Ongoing</span>
                    <span><b>${typeStatusCounts[type].holdPaused}</b> Hold/Paused</span>
                    <span><b>${typeStatusCounts[type].completed}</b> Completed</span>
                  </span>
                </div>`).join('')}
            </div>
          </div>
        </article>

        <article class="panel">
          <div class="panel-header">
            <div>
              <div class="section-eyebrow">Team capacity</div>
              <h2 class="panel-title">Current allocation health</h2>
              <p class="panel-subtitle">Calculated from active project roles and workbook-equivalent weights.</p>
            </div>
            <button class="link-button" type="button" data-action="go-view" data-view="team">View team</button>
          </div>
          <div class="panel-body">
            <div class="metric-list">
              ${capacityMetric('Available', capacityCounts.Available, activeMembers.length, 'forest')}
              ${capacityMetric('Balanced', capacityCounts.Balanced, activeMembers.length, 'teal')}
              ${capacityMetric('High', capacityCounts.High, activeMembers.length, 'yellow')}
              ${capacityMetric('Overloaded', capacityCounts.Overloaded, activeMembers.length, 'red')}
            </div>
            <div class="notice" style="margin-top:20px">
              Pool members can be assigned to either Pond. In each project form, names are ordered by their current load so available people surface first.
            </div>
          </div>
        </article>
      </section>

      <section class="panel">
        <div class="panel-header">
          <div>
            <div class="section-eyebrow">Projects by Pond & type</div>
            <h2 class="panel-title">Consolidated breakdown</h2>
          </div>
        </div>
        <div class="panel-body flush">
          <div class="table-wrap">
            <table class="data-table data-table--summary">
              <thead>
                <tr><th>Pond</th><th>Retainer</th><th>One-Time</th><th>Pitch</th><th>Internal</th><th>Total</th><th>Active</th><th>Completed</th></tr>
              </thead>
              <tbody>
                ${['POND 1','POND 2'].map((pond) => renderPondBreakdownRow(pond, allProjects)).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section class="grid-2">
        <article class="panel">
          <div class="panel-header">
            <div>
              <div class="section-eyebrow">Upcoming deadlines</div>
              <h2 class="panel-title">What is ending next</h2>
            </div>
          </div>
          <div class="panel-body">
            ${upcoming.length ? `<div class="deadline-list">${upcoming.map(renderDeadlineItem).join('')}</div>` : renderMiniEmpty('No upcoming deadlines', 'Add project end dates to see the upcoming schedule here.')}
          </div>
        </article>

        <article class="panel">
          <div class="panel-header">
            <div>
              <div class="section-eyebrow">Allocation check</div>
              <h2 class="panel-title">Highest current loads</h2>
            </div>
          </div>
          <div class="panel-body">
            ${teamLoads.length ? `<div class="metric-list">${teamLoads.map(({member, stats}) => `
              <div class="metric-row">
                <span class="metric-name">${escapeHtml(member.name)} <small style="color:var(--muted);font-weight:500">${escapeHtml(shortGroup(member.group))}</small></span>
                <span class="progress-track"><span class="progress-fill ${loadColorClass(stats.loadStatus)}" style="width:${Math.min(100, (stats.loadScore / maxLoad) * 100)}%"></span></span>
                <span class="metric-value">${formatScore(stats.loadScore)}</span>
              </div>`).join('')}</div>` : renderMiniEmpty('No active team members', 'Add or reactivate team members in Team Setup.')}
          </div>
        </article>
      </section>
    </div>`;
}

function renderPond(pond) {
  const filter = ui.pondFilters[pond];
  const allPondProjects = getProjectsForSelectedFY().filter((project) => project.pond === pond);
  const filtered = allPondProjects.filter((project) => {
    if (!matchesProjectSearch(project)) return false;
    if (filter.type !== 'All' && project.type !== filter.type) return false;
    if (filter.status === 'Open' && !isActiveProject(project)) return false;
    if (filter.status === 'Completed' && project.status !== 'Completed') return false;
    if (filter.status !== 'All' && filter.status !== 'Open' && filter.status !== 'Completed' && project.status !== filter.status) return false;
    return true;
  });

  const active = allPondProjects.filter(isActiveProject).length;
  const completed = allPondProjects.filter((project) => project.status === 'Completed').length;
  const poolAssignments = new Set();
  allPondProjects.filter(isActiveProject).forEach((project) => {
    ROLE_KEYS.forEach((key) => {
      const member = memberById(project[key]);
      if (member?.group === 'POOL') poolAssignments.add(member.id);
    });
  });

  return `
    <div class="stack-lg">
      <section class="grid-4">
        ${kpiCard('Total projects', allPondProjects.length, `All ${pond.toLowerCase()} work`, 'is-accent')}
        ${kpiCard('Active load', active, 'Non-completed projects', 'is-dark')}
        ${kpiCard('Completed', completed, completed ? 'Closed projects' : 'Nothing closed yet')}
        ${kpiCard('Pool support', poolAssignments.size, 'Distinct active Pool members')}
      </section>

      <section class="project-toolbar">
        <div class="toolbar-group">
          <div class="segmented" aria-label="Project status filter">
            ${['Open','All','Completed'].map((status) => `<button type="button" class="${filter.status === status ? 'is-active' : ''}" data-action="set-pond-status" data-pond="${pond}" data-status="${status}">${status}</button>`).join('')}
          </div>
          <select class="select-compact" data-control="pond-type-filter" data-pond="${pond}" aria-label="Filter project type">
            <option value="All" ${filter.type === 'All' ? 'selected' : ''}>All project types</option>
            ${PROJECT_TYPES.map((type) => `<option value="${escapeAttr(type)}" ${filter.type === type ? 'selected' : ''}>${escapeHtml(type)}</option>`).join('')}
          </select>
        </div>
        <div class="toolbar-group">
          <span class="capacity-pill">Showing ${filtered.length} of ${allPondProjects.length}</span>
          <button class="button button-primary" type="button" data-action="add-project" data-pond="${pond}">Add project</button>
        </div>
      </section>

      <section class="stack">
        ${PROJECT_TYPES.map((type) => renderProjectSection(pond, type, filtered.filter((project) => project.type === type), allPondProjects.filter((project) => project.type === type).length)).join('')}
      </section>
    </div>`;
}

function renderProjectSection(pond, type, projects, totalTypeCount) {
  const limit = Number(state.settings.projectLimits[type] || 0);
  const isFull = limit > 0 && totalTypeCount >= limit;
  const typeClass = slug(type);
  return `
    <details class="project-section" open>
      <summary>
        <div class="project-summary-left">
          <span class="project-type-mark ${typeClass}"></span>
          <div>
            <h3 class="project-summary-title">${escapeHtml(type)} projects</h3>
            <div class="project-summary-meta">${projectTypeDescription(type)}</div>
          </div>
        </div>
        <div class="project-summary-actions">
          <span class="capacity-pill ${isFull ? 'is-full' : ''}">${totalTypeCount} / ${limit || '∞'} slots</span>
          <button class="button button-quiet" type="button" data-action="add-project" data-pond="${pond}" data-type="${escapeAttr(type)}">Add ${escapeHtml(type)}</button>
        </div>
      </summary>
      <div class="project-section-content">
        ${projects.length ? renderProjectTable(projects) : renderEmptyProjectSection(pond, type, totalTypeCount)}
      </div>
    </details>`;
}

function renderProjectTable(projects) {
  return `
    <div class="table-wrap">
      <table class="data-table data-table--projects">
        <thead>
          <tr>
            <th>Brand / Engagement</th>
            <th>Dates</th>
            <th>Status</th>
            <th>Lead & Primary</th>
            <th>Support / Mentors</th>
            <th class="center">Actions</th>
          </tr>
        </thead>
        <tbody>${projects.map(renderProjectRow).join('')}</tbody>
      </table>
    </div>
    <div class="project-card-list">${projects.map(renderProjectCard).join('')}</div>`;
}

function renderProjectRow(project) {
  const leadPrimary = [project.leadSpoc, project.primary1, project.primary2].filter(Boolean);
  const support = [...SUPPORT_KEYS, ...MENTOR_KEYS].map((key) => project[key]).filter(Boolean);
  return `
    <tr>
      <td>
        <div class="cell-title">${escapeHtml(project.brand)}</div>
        <div class="cell-subtitle">${escapeHtml([project.agencies, project.engagement].filter(Boolean).join(' · ') || 'No engagement details')}</div>
      </td>
      <td>
        <div>${formatDate(project.startDate)} → ${formatDate(project.endDate)}</div>
        <div class="cell-subtitle">${deadlineLabel(project)}</div>
      </td>
      <td>
        <span class="status-pill ${slug(project.status)}">${escapeHtml(project.status)}</span>
        <div style="margin-top:6px"><span class="priority-pill ${slug(project.priority || 'Normal')}">${escapeHtml(project.priority || 'Normal')}</span></div>
      </td>
      <td><div class="chip-row">${leadPrimary.length ? leadPrimary.map(memberChip).join('') : '<span class="cell-subtitle">Unassigned</span>'}</div></td>
      <td><div class="chip-row">${support.length ? support.map(memberChip).join('') : '<span class="cell-subtitle">No support</span>'}</div></td>
      <td class="center">
        <button class="icon-button" type="button" title="Edit project" data-action="edit-project" data-id="${escapeAttr(project.id)}">✎</button>
        <button class="icon-button" type="button" title="Delete project" data-action="delete-project" data-id="${escapeAttr(project.id)}">×</button>
      </td>
    </tr>`;
}

function renderProjectCard(project) {
  const assigned = ROLE_KEYS.map((key) => project[key]).filter(Boolean);
  return `
    <article class="project-card">
      <div class="project-card-head">
        <div>
          <h4>${escapeHtml(project.brand)}</h4>
          <p>${escapeHtml([project.agencies, project.engagement].filter(Boolean).join(' · ') || 'No engagement details')}</p>
        </div>
        <span class="status-pill ${slug(project.status)}">${escapeHtml(project.status)}</span>
      </div>
      <div class="project-card-grid">
        <div><div class="mini-label">Dates</div><div class="mini-value">${formatDate(project.startDate)} → ${formatDate(project.endDate)}</div></div>
        <div><div class="mini-label">Priority</div><div class="mini-value">${escapeHtml(project.priority || 'Normal')}</div></div>
      </div>
      <div style="margin-top:12px"><div class="mini-label">Assigned team</div><div class="chip-row" style="margin-top:6px">${assigned.length ? assigned.map(memberChip).join('') : '<span class="cell-subtitle">Unassigned</span>'}</div></div>
      <div class="project-card-actions">
        <button class="button button-secondary" type="button" data-action="edit-project" data-id="${escapeAttr(project.id)}">Edit</button>
        <button class="button button-danger-soft" type="button" data-action="delete-project" data-id="${escapeAttr(project.id)}">Delete</button>
      </div>
    </article>`;
}

function renderEmptyProjectSection(pond, type, totalTypeCount = 0) {
  const hasSearch = totalTypeCount > 0 || Boolean(ui.search || ui.pondFilters[pond].type !== 'All');
  return `
    <div class="empty-state">
      <div class="empty-icon">＋</div>
      <h3>${hasSearch ? 'No matching projects' : `No ${escapeHtml(type.toLowerCase())} projects yet`}</h3>
      <p>${hasSearch ? 'Change the search or filter to see more projects.' : 'Add a project and assign Pond or Pool team members.'}</p>
      ${hasSearch ? '' : `<button class="button button-primary" style="margin-top:15px" type="button" data-action="add-project" data-pond="${pond}" data-type="${escapeAttr(type)}">Add project</button>`}
    </div>`;
}

function renderTeamOverview() {
  const members = state.members
    .filter((member) => matchesSearch(member.name, member.group, member.type))
    .filter((member) => ui.teamGroup === 'All' || member.group === ui.teamGroup)
    .map((member) => ({ member, stats: computeMemberStats(member.id) }))
    .sort((a, b) => groupOrder(a.member.group) - groupOrder(b.member.group) || b.stats.loadScore - a.stats.loadScore || a.member.name.localeCompare(b.member.name));

  const activeMembers = state.members.filter((member) => member.active);
  const loadCounts = { Available: 0, Balanced: 0, High: 0, Overloaded: 0 };
  activeMembers.forEach((member) => { loadCounts[computeMemberStats(member.id).loadStatus] += 1; });

  return `
    <div class="stack-lg">
      <section class="grid-5">
        ${kpiCard('Active people', activeMembers.length, `${state.members.length - activeMembers.length} inactive`,'is-accent')}
        ${kpiCard('Available', loadCounts.Available, 'No active allocation','is-dark')}
        ${kpiCard('Balanced', loadCounts.Balanced, `Load score ≤ ${state.settings.loadBands.balancedMax}`)}
        ${kpiCard('High', loadCounts.High, `Up to ${state.settings.loadBands.highMax}`)}
        ${kpiCard('Overloaded', loadCounts.Overloaded, 'Requires rebalancing')}
      </section>

      <section class="project-toolbar">
        <div class="toolbar-group">
          <span class="field-label">View group</span>
          <select class="select-compact" data-control="team-group-filter">
            <option value="All" ${ui.teamGroup === 'All' ? 'selected' : ''}>All groups</option>
            ${GROUPS.map((group) => `<option value="${group}" ${ui.teamGroup === group ? 'selected' : ''}>${group}</option>`).join('')}
          </select>
        </div>
        <div class="toolbar-group">
          <span class="capacity-pill">${members.length} people shown</span>
          <button class="button button-primary" type="button" data-action="add-member">Add team member</button>
        </div>
      </section>

      ${members.length ? `<section class="team-grid">${members.map(({member,stats}) => renderTeamCard(member,stats)).join('')}</section>` : renderMiniEmpty('No team members found', 'Try a different search or group filter.')}

      <section class="panel">
        <div class="panel-header">
          <div>
            <div class="section-eyebrow">Detailed capacity</div>
            <h2 class="panel-title">Role and project breakdown</h2>
          </div>
        </div>
        <div class="panel-body flush">
          <div class="table-wrap">
            <table class="data-table data-table--capacity">
              <thead><tr><th>Team member</th><th>Active load</th><th>Retainers</th><th>One-Time</th><th>Pitches</th><th>Internal</th><th>Primary</th><th>Support</th><th>SPOC</th><th>Score</th><th>Status</th></tr></thead>
              <tbody>${members.map(({member,stats}) => renderTeamTableRow(member,stats)).join('')}</tbody>
            </table>
          </div>
        </div>
      </section>
    </div>`;
}

function renderTeamCard(member, stats) {
  const meterWidth = Math.min(100, (stats.loadScore / Math.max(state.settings.loadBands.highMax, 0.01)) * 100);
  return `
    <article class="team-card ${member.active ? '' : 'is-inactive'}">
      <div class="team-card-head">
        <div style="display:flex;gap:10px;align-items:center">
          <div class="avatar ${slug(member.group)} ${member.active ? '' : 'inactive'}">${escapeHtml(initials(member.name))}</div>
          <div>
            <h3 class="person-name">${escapeHtml(member.name)}</h3>
            <div class="person-meta">${escapeHtml(member.group)} · ${escapeHtml(member.type)}${member.active ? '' : ' · Inactive'}</div>
          </div>
        </div>
        <div class="load-score">
          <strong>${formatScore(stats.loadScore)}</strong>
          <span style="color:${loadStatusColor(stats.loadStatus)}">${stats.loadStatus}</span>
        </div>
      </div>
      <div class="load-meter"><span class="${slug(stats.loadStatus)}" style="width:${meterWidth}%"></span></div>
      <div class="team-stat-grid">
        <div class="team-stat"><strong>${stats.activeLoad}</strong><span>Active</span></div>
        <div class="team-stat"><strong>${stats.asPrimary}</strong><span>Primary</span></div>
        <div class="team-stat"><strong>${stats.asSupport}</strong><span>Support</span></div>
      </div>
    </article>`;
}

function renderTeamTableRow(member, stats) {
  return `
    <tr>
      <td><div class="cell-title">${escapeHtml(member.name)}</div><div class="cell-subtitle">${escapeHtml(member.group)} · ${escapeHtml(member.type)}${member.active ? '' : ' · Inactive'}</div></td>
      <td class="num">${stats.activeLoad}</td>
      <td class="num">${stats.Retainer}</td>
      <td class="num">${stats['One-Time']}</td>
      <td class="num">${stats.Pitch}</td>
      <td class="num">${stats.Internal}</td>
      <td class="num">${stats.asPrimary}</td>
      <td class="num">${stats.asSupport}</td>
      <td class="num">${stats.asSpoc}</td>
      <td class="num"><strong>${formatScore(stats.loadScore)}</strong></td>
      <td><span class="status-pill ${slug(stats.loadStatus)}">${stats.loadStatus}</span></td>
    </tr>`;
}

function renderTeamSetup() {
  return `
    <div class="stack-lg">
      <section class="section-header">
        <div>
          <div class="section-eyebrow">Ponds & shared talent</div>
          <h2>People setup</h2>
          <p>Add future employees, interns or freelancers and place them in the correct working group.</p>
        </div>
        <button class="button button-primary" type="button" data-action="add-member">Add team member</button>
      </section>

      <section class="grid-3">
        ${GROUPS.map(renderSetupGroup).join('')}
      </section>

      <section class="section-header">
        <div>
          <div class="section-eyebrow">Calculation controls</div>
          <h2>Allocation settings</h2>
          <p>These settings drive the team load scores and capacity warnings across the app.</p>
        </div>
      </section>

      <section class="settings-grid">
        <article class="settings-card">
          <h3>Role weights</h3>
          <p>Equivalent to the percentages used in the spreadsheet. Mentors remain advisory at zero load.</p>
          ${[
            ['leadSpoc','Lead SPOC'],['primary1','Primary 1'],['primary2','Primary 2'],['support1','Support 1'],['support2','Support 2'],['support3','Support 3'],['support4','Support 4'],['mentor1','Mentors']
          ].map(([key,label]) => settingRow(label, state.settings.roleWeights[key], 'roleWeight', key, 0.01)).join('')}
        </article>

        <article class="settings-card">
          <h3>Load bands</h3>
          <p>Available is always zero. Scores above the high limit are marked overloaded.</p>
          ${settingRow('Balanced maximum', state.settings.loadBands.balancedMax, 'loadBand', 'balancedMax', 0.05)}
          ${settingRow('High maximum', state.settings.loadBands.highMax, 'loadBand', 'highMax', 0.05)}
          <div class="notice" style="margin-top:12px">Current logic: 0 = Available, up to ${state.settings.loadBands.balancedMax} = Balanced, up to ${state.settings.loadBands.highMax} = High.</div>
        </article>

        <article class="settings-card">
          <h3>Project limits per Pond</h3>
          <p>These reflect the original sheet structure and trigger a visual warning when reached.</p>
          ${PROJECT_TYPES.map((type) => settingRow(type, state.settings.projectLimits[type], 'projectLimit', type, 1)).join('')}
        </article>
      </section>

      <section class="section-header">
        <div>
          <div class="section-eyebrow">Financial year management</div>
          <h2>Year rollover & archive</h2>
          <p>Current FY: <strong>FY ${escapeHtml(state.meta.currentFY)}</strong>. Older financial years remain available from the top selector as read-only history.</p>
        </div>
        <button class="button button-primary" type="button" data-action="start-new-fy">Start new financial year</button>
      </section>

      <section class="settings-grid">
        <article class="settings-card">
          <h3>Available years</h3>
          <p>Switch between years from the top bar. Historical years do not affect current capacity.</p>
          <div class="fy-year-list">${getFinancialYears().map((fy) => `<div class="fy-year-row"><span>FY ${escapeHtml(fy)}</span><strong>${state.projects.filter((project) => project.financialYear === fy).length} projects</strong>${fy === state.meta.currentFY ? '<em>Current</em>' : '<em>Archived</em>'}</div>`).join('')}</div>
        </article>
        <article class="settings-card">
          <h3>Year-end review</h3>
          <p>Use Data → Export FY Review to download an Excel workbook that can be opened directly in Google Sheets.</p>
          <div class="notice">The workbook includes project registers, Pond tabs, project types, status summary and team review for the selected FY.</div>
        </article>
        <article class="settings-card">
          <h3>Rollover rule</h3>
          <p>Starting a new FY creates fresh allocation records. The previous year's staffing and status history stays unchanged.</p>
          <div class="notice">Recommended: carry forward active retainers and any ongoing projects that continue beyond 31 March.</div>
        </article>
      </section>
    </div>`;
}

function renderSetupGroup(group) {
  const members = state.members.filter((member) => member.group === group && matchesSearch(member.name, member.type, member.group));
  return `
    <article class="setup-group">
      <div class="setup-group-header ${slug(group)}">
        <div><h3>${escapeHtml(group)}</h3><span>${members.length} member${members.length === 1 ? '' : 's'}</span></div>
        <button class="button button-quiet" style="color:#fff;border-color:rgba(255,255,255,.25)" type="button" data-action="add-member" data-group="${group}">Add</button>
      </div>
      <div class="member-list">
        ${members.length ? members.map(renderMemberSetupRow).join('') : `<div class="empty-state" style="min-height:130px"><p>No matching members in this group.</p></div>`}
      </div>
    </article>`;
}

function renderMemberSetupRow(member) {
  return `
    <div class="member-row ${member.active ? '' : 'is-inactive'}">
      <div>
        <div class="cell-title">${escapeHtml(member.name)}</div>
        <div class="cell-subtitle">${escapeHtml(member.type)} · ${assignedProjectCount(member.id)} assigned project${assignedProjectCount(member.id) === 1 ? '' : 's'}</div>
      </div>
      <span class="type-pill ${slug(member.type)}">${escapeHtml(member.type)}</span>
      <div class="member-actions">
        <label class="toggle" title="${member.active ? 'Deactivate' : 'Activate'} ${escapeAttr(member.name)}">
          <input type="checkbox" data-control="member-active" data-id="${escapeAttr(member.id)}" ${member.active ? 'checked' : ''}>
          <span class="toggle-track"></span>
        </label>
        <button class="icon-button" type="button" title="Edit" data-action="edit-member" data-id="${escapeAttr(member.id)}">✎</button>
        <button class="icon-button" type="button" title="Delete" data-action="delete-member" data-id="${escapeAttr(member.id)}">×</button>
      </div>
    </div>`;
}

function handlePrimaryAction() {
  if (ui.view === 'team' || ui.view === 'setup') {
    if (!userCanEdit() || storageMode !== 'server') return showToast('Editing is not available for this account or connection.', 'warning');
    return openMemberModal();
  }
  if (!canEditSelectedFY()) {
    showToast('Select the current financial year to make allocation changes.', 'warning');
    return;
  }
  if (ui.view === 'pond1') return openProjectModal({ pond: 'POND 1' });
  if (ui.view === 'pond2') return openProjectModal({ pond: 'POND 2' });
  openProjectModal({ pond: null });
}

function handleViewClick(event) {
  const trigger = event.target.closest('[data-action]');
  if (!trigger) return;
  const action = trigger.dataset.action;
  const projectEditActions = new Set(['add-project', 'edit-project', 'delete-project']);
  const memberEditActions = new Set(['add-member', 'edit-member', 'delete-member']);
  if (projectEditActions.has(action) && !canEditSelectedFY()) {
    showToast('Historical financial years are read-only. Select the current FY to edit.', 'warning');
    return;
  }
  if (memberEditActions.has(action) && (!userCanEdit() || storageMode !== 'server')) {
    showToast('Editing is not available for this account or connection.', 'warning');
    return;
  }

  if (trigger.closest('summary')) {
    event.preventDefault();
    event.stopPropagation();
  }

  if (action === 'go-view') setView(trigger.dataset.view, true);
  if (action === 'add-project') openProjectModal({ pond: trigger.dataset.pond || null, type: trigger.dataset.type || null });
  if (action === 'edit-project') openProjectModal({ project: projectById(trigger.dataset.id) });
  if (action === 'delete-project') deleteProject(trigger.dataset.id);
  if (action === 'add-member') openMemberModal({ group: trigger.dataset.group || null });
  if (action === 'edit-member') openMemberModal({ member: memberById(trigger.dataset.id) });
  if (action === 'delete-member') deleteMember(trigger.dataset.id);
  if (action === 'start-new-fy') {
    if (!userIsAdmin()) return showToast('Only the administrator can start a new financial year.', 'warning');
    openStartFinancialYearModal();
  }
  if (action === 'set-pond-status') {
    ui.pondFilters[trigger.dataset.pond].status = trigger.dataset.status;
    renderCurrentView();
  }
}

function handleViewChange(event) {
  const control = event.target.dataset.control;
  if (!control) return;

  if (control === 'pond-type-filter') {
    ui.pondFilters[event.target.dataset.pond].type = event.target.value;
    renderCurrentView();
  }

  if (control === 'team-group-filter') {
    ui.teamGroup = event.target.value;
    renderCurrentView();
  }

  if (control === 'member-active') {
    if (!userCanEdit() || storageMode !== 'server') {
      event.target.checked = !event.target.checked;
      showToast('Editing is not available for this account or connection.', 'warning');
      return;
    }
    const member = memberById(event.target.dataset.id);
    if (!member) return;
    member.active = event.target.checked;
    scheduleSave();
    renderCurrentView();
  }
}

function handleViewInput(event) {
  const setting = event.target.dataset.setting;
  if (setting && (!userCanEdit() || storageMode !== 'server')) {
    showToast('Editing is not available for this account or connection.', 'warning');
    renderCurrentView();
    return;
  }
  if (!setting) return;
  const value = Number(event.target.value);
  if (!Number.isFinite(value) || value < 0) return;

  if (setting === 'roleWeight') {
    state.settings.roleWeights[event.target.dataset.key] = value;
    if (event.target.dataset.key === 'mentor1') {
      MENTOR_KEYS.forEach((key) => { state.settings.roleWeights[key] = value; });
    }
  }
  if (setting === 'loadBand') state.settings.loadBands[event.target.dataset.key] = value;
  if (setting === 'projectLimit') state.settings.projectLimits[event.target.dataset.key] = Math.round(value);

  scheduleSave({ silent: true });
}

function openProjectModal({ pond = null, type = null, project = null } = {}) {
  const isEdit = Boolean(project);
  const draft = project ? deepClone(project) : {
    id: '',
    financialYear: ui.financialYear === 'ALL' ? state.meta.currentFY : ui.financialYear,
    pond: pond || 'POND 1',
    type: type || 'Retainer',
    brand: '',
    agencies: '',
    engagement: '',
    startDate: '',
    endDate: '',
    status: 'Not Started',
    priority: 'Normal',
    leadSpoc: '',
    primary1: '',
    primary2: '',
    support1: '',
    support2: '',
    support3: '',
    support4: '',
    mentor1: '',
    mentor2: '',
    notes: ''
  };
  const fixedPond = pond && !isEdit;
  const selectedPond = project?.pond || pond || draft.pond;
  const suggestions = suggestedMembers(selectedPond, project?.id);

  openModal({
    eyebrow: isEdit ? 'Update allocation' : 'New project entry',
    title: isEdit ? `Edit ${project.brand}` : 'Add project',
    description: 'One person may hold multiple roles on the same project. Each selected role contributes its configured workload weight, and all dashboards update automatically after saving.',
    body: `
      <div class="form-grid">
        <div class="field">
          <label for="projectFinancialYear">Financial year</label>
          <select id="projectFinancialYear" ${isEdit ? 'disabled' : ''}>
            ${getFinancialYears().map((fy) => `<option value="${escapeAttr(fy)}" ${(draft.financialYear || state.meta.currentFY) === fy ? 'selected' : ''}>FY ${escapeHtml(fy)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="projectPond">Pond</label>
          <select id="projectPond" ${fixedPond ? 'disabled' : ''}>
            ${['POND 1','POND 2'].map((item) => `<option value="${item}" ${selectedPond === item ? 'selected' : ''}>${item}</option>`).join('')}
          </select>
          ${fixedPond ? `<input id="projectPondFixed" type="hidden" value="${selectedPond}">` : ''}
        </div>
        <div class="field">
          <label for="projectType">Project type</label>
          <select id="projectType">${PROJECT_TYPES.map((item) => `<option value="${escapeAttr(item)}" ${draft.type === item ? 'selected' : ''}>${escapeHtml(item)}</option>`).join('')}</select>
        </div>
        <div class="field span-2">
          <label for="projectBrand">Brand / Project name *</label>
          <input id="projectBrand" type="text" required maxlength="120" value="${escapeAttr(draft.brand)}" placeholder="e.g. BOLDFIT Retail Experience">
        </div>
        <div class="field">
          <label for="projectAgency">Agency / Team code</label>
          <input id="projectAgency" type="text" list="agencyOptions" maxlength="100" value="${escapeAttr(draft.agencies)}" placeholder="SS, TT, Internal…">
          <datalist id="agencyOptions">${AGENCY_SUGGESTIONS.map((item) => `<option value="${escapeAttr(item)}"></option>`).join('')}</datalist>
        </div>
        <div class="field">
          <label for="projectPriority">Priority</label>
          <select id="projectPriority">${PRIORITIES.map((item) => `<option value="${item}" ${(draft.priority || 'Normal') === item ? 'selected' : ''}>${item}</option>`).join('')}</select>
        </div>
        <div class="field span-2">
          <label for="projectEngagement">Engagement / Scope</label>
          <input id="projectEngagement" type="text" maxlength="180" value="${escapeAttr(draft.engagement)}" placeholder="Short description of the engagement">
        </div>
        <div class="field">
          <label for="projectStartDate">Start date</label>
          <input id="projectStartDate" type="date" value="${escapeAttr(draft.startDate)}">
        </div>
        <div class="field">
          <label for="projectEndDate">End date</label>
          <input id="projectEndDate" type="date" value="${escapeAttr(draft.endDate)}">
        </div>
        <div class="field span-2">
          <label for="projectStatus">Status</label>
          <select id="projectStatus">${STATUSES.map((item) => `<option value="${escapeAttr(item)}" ${draft.status === item ? 'selected' : ''}>${escapeHtml(item)}</option>`).join('')}</select>
        </div>
      </div>

      <div class="recommendation-box" style="margin:18px 0">
        <h4>Lowest-load suggestions for ${escapeHtml(selectedPond)}</h4>
        <div class="recommendation-list">${suggestions.length ? suggestions.map(({member,stats}) => `<span class="recommendation-chip">${escapeHtml(member.name)} · ${escapeHtml(member.group)} · ${formatScore(stats.loadScore)}</span>`).join('') : '<span class="field-help">No active members available.</span>'}</div>
      </div>

      <div class="form-grid">
        ${assignmentField('projectLeadSpoc','Lead SPOC',draft.leadSpoc,selectedPond)}
        ${assignmentField('projectPrimary1','Primary 1',draft.primary1,selectedPond)}
        ${assignmentField('projectPrimary2','Primary 2',draft.primary2,selectedPond)}
        ${assignmentField('projectSupport1','Support talent 1',draft.support1,selectedPond)}
        ${assignmentField('projectSupport2','Support talent 2',draft.support2,selectedPond)}
        ${assignmentField('projectSupport3','Support talent 3',draft.support3,selectedPond)}
        ${assignmentField('projectSupport4','Support talent 4',draft.support4,selectedPond)}
        ${assignmentField('projectMentor1','Mentor / Escalation 1',draft.mentor1,selectedPond)}
        ${assignmentField('projectMentor2','Mentor / Escalation 2',draft.mentor2,selectedPond)}
        <div class="field span-2">
          <label for="projectNotes">Notes</label>
          <textarea id="projectNotes" maxlength="1000" placeholder="Dependencies, next steps or additional allocation notes">${escapeHtml(draft.notes)}</textarea>
        </div>
        <div class="field span-2"><p class="form-error" id="projectFormError" hidden></p></div>
      </div>`,
    footer: `
      <button class="button button-secondary" type="button" data-modal-action="cancel">Cancel</button>
      <button class="button button-primary" type="button" id="saveProjectButton">${isEdit ? 'Save changes' : 'Add project'}</button>`
  });

  const pondSelect = document.getElementById('projectPond');
  if (!fixedPond && pondSelect) {
    pondSelect.addEventListener('change', () => refreshAssignmentOptions(pondSelect.value));
  }
  document.getElementById('saveProjectButton').addEventListener('click', () => saveProjectFromModal(project?.id || null, fixedPond ? selectedPond : null));
}

function refreshAssignmentOptions(pond) {
  const selectMap = [
    ['projectLeadSpoc','leadSpoc'],['projectPrimary1','primary1'],['projectPrimary2','primary2'],['projectSupport1','support1'],['projectSupport2','support2'],['projectSupport3','support3'],['projectSupport4','support4'],['projectMentor1','mentor1'],['projectMentor2','mentor2']
  ];
  selectMap.forEach(([id]) => {
    const select = document.getElementById(id);
    if (!select) return;
    const current = select.value;
    select.innerHTML = memberOptions(current, pond);
  });
}

function saveProjectFromModal(projectId, fixedPond) {
  const errorEl = document.getElementById('projectFormError');
  errorEl.hidden = true;
  const brand = document.getElementById('projectBrand').value.trim();
  const pond = fixedPond || document.getElementById('projectPond').value;
  const startDate = document.getElementById('projectStartDate').value;
  const endDate = document.getElementById('projectEndDate').value;

  if (!brand) return showModalError(errorEl, 'Brand / Project name is required.');
  if (startDate && endDate && endDate < startDate) return showModalError(errorEl, 'End date cannot be earlier than the start date.');

  const assignments = {
    leadSpoc: document.getElementById('projectLeadSpoc').value,
    primary1: document.getElementById('projectPrimary1').value,
    primary2: document.getElementById('projectPrimary2').value,
    support1: document.getElementById('projectSupport1').value,
    support2: document.getElementById('projectSupport2').value,
    support3: document.getElementById('projectSupport3').value,
    support4: document.getElementById('projectSupport4').value,
    mentor1: document.getElementById('projectMentor1').value,
    mentor2: document.getElementById('projectMentor2').value
  };
  const now = new Date().toISOString();
  const existingIndex = projectId ? state.projects.findIndex((item) => item.id === projectId) : -1;
  const existing = existingIndex >= 0 ? state.projects[existingIndex] : null;
  const project = {
    id: existing?.id || uid('project'),
    financialYear: existing?.financialYear || document.getElementById('projectFinancialYear').value || state.meta.currentFY,
    pond,
    type: document.getElementById('projectType').value,
    brand,
    agencies: document.getElementById('projectAgency').value.trim(),
    engagement: document.getElementById('projectEngagement').value.trim(),
    startDate,
    endDate,
    status: document.getElementById('projectStatus').value,
    priority: document.getElementById('projectPriority').value,
    ...assignments,
    notes: document.getElementById('projectNotes').value.trim(),
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };

  if (existingIndex >= 0) state.projects.splice(existingIndex, 1, project);
  else state.projects.push(project);

  scheduleSave();
  modalCommitted = true;
  els.modal.close();
  renderCurrentView();

  const typeCount = state.projects.filter((item) => item.financialYear === project.financialYear && item.pond === project.pond && item.type === project.type).length;
  const limit = Number(state.settings.projectLimits[project.type] || 0);
  if (limit && typeCount > limit) showToast(`${project.pond} now exceeds the ${project.type} project limit of ${limit}.`, 'warning');
}

function openStartFinancialYearModal() {
  const currentFY = state.meta.currentFY;
  const suggestedFY = nextFinancialYear(currentFY);
  const currentProjects = state.projects.filter((project) => project.financialYear === currentFY && project.status !== 'Completed');
  openModal({
    eyebrow: 'Financial year rollover',
    title: `Start FY ${suggestedFY}`,
    description: `Create the next allocation year without changing FY ${currentFY}. Carried projects become new allocation records.`,
    body: `
      <div class="form-grid">
        <div class="field">
          <label for="newFinancialYear">New financial year</label>
          <input id="newFinancialYear" type="text" value="${escapeAttr(suggestedFY)}" placeholder="2027-28">
        </div>
        <div class="field">
          <label for="fyCarryMode">Carry forward</label>
          <select id="fyCarryMode">
            <option value="ongoing">All ongoing projects</option>
            <option value="retainers">Active retainers only</option>
            <option value="selected">Select projects manually</option>
            <option value="empty">Start empty</option>
          </select>
        </div>
        <div class="field span-2">
          <div class="notice">FY ${escapeHtml(currentFY)} remains archived and read-only after rollover. Team members and allocation settings continue into the new FY.</div>
        </div>
      </div>
      <div id="fyCarryProjectList" class="fy-carry-list" style="margin-top:16px">
        ${currentProjects.length ? currentProjects.map((project) => `<label class="fy-carry-item"><input type="checkbox" value="${escapeAttr(project.id)}" checked><span><strong>${escapeHtml(project.brand)}</strong><small>${escapeHtml(project.type)} · ${escapeHtml(project.pond)} · ${escapeHtml(project.status)}</small></span></label>`).join('') : '<div class="notice">There are no ongoing projects in the current FY.</div>'}
      </div>
      <p class="form-error" id="fyRolloverError" hidden></p>`,
    footer: `
      <button class="button button-secondary" type="button" data-modal-action="cancel">Cancel</button>
      <button class="button button-primary" type="button" id="confirmFYRollover">Create FY ${escapeHtml(suggestedFY)}</button>`
  });

  const modeSelect = document.getElementById('fyCarryMode');
  const checkboxes = () => [...document.querySelectorAll('#fyCarryProjectList input[type="checkbox"]')];
  const syncMode = () => {
    const mode = modeSelect.value;
    document.getElementById('fyCarryProjectList').hidden = mode === 'empty';
    checkboxes().forEach((checkbox) => {
      const project = projectById(checkbox.value);
      if (mode === 'ongoing') checkbox.checked = Boolean(project && project.status !== 'Completed');
      if (mode === 'retainers') checkbox.checked = Boolean(project && project.type === 'Retainer' && project.status !== 'Completed');
      if (mode === 'empty') checkbox.checked = false;
    });
  };
  modeSelect.addEventListener('change', syncMode);
  syncMode();
  document.getElementById('confirmFYRollover').addEventListener('click', createFinancialYearFromModal);
}

function createFinancialYearFromModal() {
  const errorEl = document.getElementById('fyRolloverError');
  const newFY = document.getElementById('newFinancialYear').value.trim();
  if (!/^\d{4}-\d{2}$/.test(newFY)) return showModalError(errorEl, 'Use the format 2027-28.');
  if (getFinancialYears().includes(newFY)) return showModalError(errorEl, `FY ${newFY} already exists.`);

  const mode = document.getElementById('fyCarryMode').value;
  const selectedIds = mode === 'empty' ? [] : [...document.querySelectorAll('#fyCarryProjectList input[type="checkbox"]:checked')].map((input) => input.value);
  const sourceFY = state.meta.currentFY;
  const startDate = financialYearStartDate(newFY);
  const now = new Date().toISOString();
  const carried = selectedIds.map((id) => projectById(id)).filter(Boolean).map((source) => {
    const copy = deepClone(source);
    copy.id = uid('project');
    copy.financialYear = newFY;
    copy.previousProjectId = source.id;
    copy.startDate = (!source.startDate || source.startDate < startDate) ? startDate : source.startDate;
    if (copy.endDate && copy.endDate < startDate) copy.endDate = '';
    copy.createdAt = now;
    copy.updatedAt = now;
    const carryNote = `Carried forward from FY ${sourceFY}.`;
    copy.notes = [copy.notes, carryNote].filter(Boolean).join('\n');
    return copy;
  });

  state.projects.push(...carried);
  state.meta.currentFY = newFY;
  state.meta.period = newFY;
  state.meta.financialYears = [...new Set([...getFinancialYears(), newFY])].sort(compareFY);
  ui.financialYear = newFY;
  scheduleSave();
  modalCommitted = true;
  els.modal.close();
  renderCurrentView();
  showToast(`FY ${newFY} created with ${carried.length} carried project${carried.length === 1 ? '' : 's'}.`);
}

function openMemberModal({ member = null, group = null } = {}) {
  const isEdit = Boolean(member);
  const draft = member ? deepClone(member) : { id: '', name: '', group: group || 'POND 1', type: 'Employee', active: true };
  openModal({
    eyebrow: isEdit ? 'Update team setup' : 'New team member',
    title: isEdit ? `Edit ${member.name}` : 'Add team member',
    description: 'Members marked active become available in project allocation dropdowns.',
    body: `
      <div class="form-grid">
        <div class="field span-2">
          <label for="memberName">Name *</label>
          <input id="memberName" type="text" required maxlength="100" value="${escapeAttr(draft.name)}" placeholder="Full name">
        </div>
        <div class="field">
          <label for="memberGroup">Group</label>
          <select id="memberGroup">${GROUPS.map((item) => `<option value="${item}" ${draft.group === item ? 'selected' : ''}>${item}</option>`).join('')}</select>
        </div>
        <div class="field">
          <label for="memberType">Member type</label>
          <select id="memberType">${MEMBER_TYPES.map((item) => `<option value="${item}" ${draft.type === item ? 'selected' : ''}>${item}</option>`).join('')}</select>
        </div>
        <div class="field span-2">
          <label class="toggle" style="width:auto;height:auto;gap:10px;align-items:center">
            <input id="memberActive" type="checkbox" ${draft.active ? 'checked' : ''}>
            <span class="toggle-track" style="width:39px;height:22px;position:relative;display:inline-block"></span>
            <span style="font-size:12px;font-weight:750">Active and available for assignment</span>
          </label>
        </div>
        <div class="field span-2"><p class="form-error" id="memberFormError" hidden></p></div>
      </div>`,
    footer: `
      <button class="button button-secondary" type="button" data-modal-action="cancel">Cancel</button>
      <button class="button button-primary" type="button" id="saveMemberButton">${isEdit ? 'Save changes' : 'Add member'}</button>`
  });
  document.getElementById('saveMemberButton').addEventListener('click', () => saveMemberFromModal(member?.id || null));
}

function saveMemberFromModal(memberId) {
  const errorEl = document.getElementById('memberFormError');
  const name = document.getElementById('memberName').value.trim();
  if (!name) return showModalError(errorEl, 'Name is required.');

  const duplicate = state.members.find((item) => item.name.toLowerCase() === name.toLowerCase() && item.id !== memberId);
  if (duplicate) return showModalError(errorEl, 'A team member with this name already exists.');

  const existingIndex = memberId ? state.members.findIndex((item) => item.id === memberId) : -1;
  const member = {
    id: existingIndex >= 0 ? state.members[existingIndex].id : uniqueMemberId(name),
    name,
    group: document.getElementById('memberGroup').value,
    type: document.getElementById('memberType').value,
    active: document.getElementById('memberActive').checked
  };

  if (existingIndex >= 0) state.members.splice(existingIndex, 1, member);
  else state.members.push(member);

  scheduleSave();
  modalCommitted = true;
  els.modal.close();
  renderCurrentView();
}

function deleteProject(id) {
  const project = projectById(id);
  if (!project) return;
  if (!window.confirm(`Delete “${project.brand}”? This cannot be undone.`)) return;
  state.projects = state.projects.filter((item) => item.id !== id);
  scheduleSave();
  renderCurrentView();
}

function deleteMember(id) {
  const member = memberById(id);
  if (!member) return;
  const assigned = assignedProjectCount(id);
  if (assigned > 0) {
    showToast(`${member.name} is assigned to ${assigned} project${assigned === 1 ? '' : 's'}. Deactivate them instead of deleting.`, 'warning');
    return;
  }
  if (!window.confirm(`Delete ${member.name} from Team Setup?`)) return;
  state.members = state.members.filter((item) => item.id !== id);
  scheduleSave();
  renderCurrentView();
}

function openDataModal() {
  const canEdit = userCanEdit() && storageMode === 'server';
  const conflictAvailable = Boolean(localStorage.getItem(CONFLICT_STORAGE_KEY));
  const storageText = storageMode === 'server'
    ? 'This copy is connected to shared cloud storage. A browser backup is also maintained.'
    : 'Shared cloud storage is unavailable. The current browser copy is read-only until the connection returns.';

  openModal({
    eyebrow: 'Backup, transfer & print',
    title: 'Data management',
    description: storageText,
    body: `
      <div class="data-actions-grid">
        <button class="data-action" type="button" data-data-action="export-json"><strong>Export complete backup</strong><span>Downloads all projects, people and settings as a restorable JSON file.</span></button>
        ${canEdit ? `<button class="data-action" type="button" data-data-action="import-json"><strong>Import backup</strong><span>Restores a previously exported JSON file and replaces the current data.</span></button>` : ''}
        ${conflictAvailable ? `<button class="data-action" type="button" data-data-action="export-conflict"><strong>Export unsaved conflict copy</strong><span>Downloads the version preserved when another person saved first.</span></button>` : ''}
        <button class="data-action" type="button" data-data-action="export-fy-review"><strong>Export FY Review (.xlsx)</strong><span>Creates a multi-tab annual review workbook that opens directly in Excel or Google Sheets.</span></button>
        <button class="data-action" type="button" data-data-action="export-projects"><strong>Export projects CSV</strong><span>Downloads the selected FY project register for both Ponds.</span></button>
        <button class="data-action" type="button" data-data-action="export-team"><strong>Export team CSV</strong><span>Downloads calculated team allocation for the selected FY.</span></button>
        <button class="data-action" type="button" data-data-action="print"><strong>Print current view</strong><span>Uses the browser print dialog for a PDF or paper copy.</span></button>
        ${canEdit ? `<button class="data-action" type="button" data-data-action="reset"><strong>Reset all data</strong><span>Returns the app to the original 15-member setup with no projects.</span></button>` : ''}
      </div>
      <div class="field" style="margin-top:16px">
        <label for="fyExportSelect">FY for review export</label>
        <select id="fyExportSelect">${getFinancialYears().map((fy) => `<option value="${escapeAttr(fy)}" ${(ui.financialYear === fy || (ui.financialYear === 'ALL' && state.meta.currentFY === fy)) ? 'selected' : ''}>FY ${escapeHtml(fy)}</option>`).join('')}</select>
      </div>
      <input id="importFileInput" type="file" accept="application/json,.json" hidden>
      <div class="notice" style="margin-top:16px">Last updated: ${escapeHtml(formatTimestamp(state.meta.lastUpdated))}${state.meta.lastUpdatedBy?.name ? ` by ${escapeHtml(state.meta.lastUpdatedBy.name)}` : ''}. Current revision: ${Number(state.revision || 0)}.</div>`,
    footer: `<button class="button button-secondary" type="button" data-modal-action="cancel">Close</button>`
  });

  els.modalBody.querySelectorAll('[data-data-action]').forEach((button) => {
    button.addEventListener('click', () => handleDataAction(button.dataset.dataAction));
  });
  document.getElementById('importFileInput').addEventListener('change', importBackupFile);
}

function handleDataAction(action) {
  if (action === 'export-json') {
    downloadFile(`JG_Project_Allocation_Backup_${dateStamp()}.json`, JSON.stringify(state, null, 2), 'application/json');
    showToast('Complete backup exported.');
  }
  if (action === 'import-json' && userCanEdit()) document.getElementById('importFileInput').click();
  if (action === 'export-conflict') {
    const raw = localStorage.getItem(CONFLICT_STORAGE_KEY);
    if (raw) {
      downloadFile(`JG_Unsaved_Conflict_Backup_${dateStamp()}.json`, raw, 'application/json');
      showToast('Unsaved conflict copy exported.');
    }
  }
  if (action === 'export-fy-review') exportFYReviewWorkbook(document.getElementById('fyExportSelect')?.value || state.meta.currentFY);
  if (action === 'export-projects') exportProjectsCsv();
  if (action === 'export-team') exportTeamCsv();
  if (action === 'print') {
    els.modal.close();
    window.setTimeout(() => window.print(), 150);
  }
  if (action === 'reset' && userCanEdit()) resetAllData();
}

async function importBackupFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    if (!parsed || !Array.isArray(parsed.members) || !Array.isArray(parsed.projects)) throw new Error('Invalid backup format');
    if (!window.confirm('Importing this backup will replace the current projects, team setup and settings. Continue?')) return;
    const currentRevision = Number(state.revision || 0);
    state = normalizeState(parsed);
    state.revision = currentRevision;
    scheduleSave();
    modalCommitted = true;
    els.modal.close();
    renderCurrentView();
    showToast('Backup imported successfully.');
  } catch (error) {
    showToast('This file is not a valid JG allocation backup.', 'error');
  } finally {
    event.target.value = '';
  }
}

function resetAllData() {
  if (!window.confirm('Reset all projects and restore the original 15-member team setup? Export a backup first if needed.')) return;
  const currentRevision = Number(state.revision || 0);
  state = deepClone(DEFAULT_DATA);
  state.revision = currentRevision;
  state.meta.lastUpdated = new Date().toISOString();
  scheduleSave();
  modalCommitted = true;
  els.modal.close();
  renderCurrentView();
  showToast('The app has been reset.');
}

function exportProjectsCsv() {
  const headers = ['Financial Year','Pond','Project Type','Brand','Agency/Team','Engagement','Start Date','End Date','Status','Priority','Lead SPOC','Primary 1','Primary 2','Support 1','Support 2','Support 3','Support 4','Mentor 1','Mentor 2','Notes'];
  const rows = getProjectsForSelectedFY().map((project) => [
    project.financialYear, project.pond, project.type, project.brand, project.agencies, project.engagement, project.startDate, project.endDate, project.status, project.priority,
    memberName(project.leadSpoc), memberName(project.primary1), memberName(project.primary2), memberName(project.support1), memberName(project.support2),
    memberName(project.support3), memberName(project.support4), memberName(project.mentor1), memberName(project.mentor2), project.notes
  ]);
  const fyLabel = ui.financialYear === 'ALL' ? 'All_Years' : `FY_${ui.financialYear}`;
  downloadCsv(`JG_Consolidated_Projects_${fyLabel}_${dateStamp()}.csv`, headers, rows);
  showToast('Projects CSV exported.');
}

function exportTeamCsv() {
  const headers = ['Team Member','Group','Type','Active','Active Load','Retainers','One-Time','Pitches','Internal','As Primary','As Support','As SPOC','Load Score','Load Status'];
  const rows = state.members.map((member) => {
    const stats = computeMemberStats(member.id);
    return [member.name,member.group,member.type,member.active ? 'Yes' : 'No',stats.activeLoad,stats.Retainer,stats['One-Time'],stats.Pitch,stats.Internal,stats.asPrimary,stats.asSupport,stats.asSpoc,formatScore(stats.loadScore),stats.loadStatus];
  });
  downloadCsv(`JG_Team_Capacity_${dateStamp()}.csv`, headers, rows);
  showToast('Team CSV exported.');
}

function exportFYReviewWorkbook(fy) {
  if (!window.XLSX) {
    showToast('Excel export library did not load. Refresh the page and try again.', 'error');
    return;
  }
  const projects = state.projects.filter((project) => project.financialYear === fy);
  const previousFY = ui.financialYear;
  ui.financialYear = fy;
  try {
    const workbook = XLSX.utils.book_new();
    const projectHeaders = ['Financial Year','Pond','Project Type','Brand','Agency/Team','Engagement','Start Date','End Date','Status','Priority','Lead SPOC','Primary 1','Primary 2','Support 1','Support 2','Support 3','Support 4','Mentor 1','Mentor 2','Notes'];
    const projectRow = (project) => [project.financialYear,project.pond,project.type,project.brand,project.agencies,project.engagement,project.startDate,project.endDate,project.status,project.priority,memberName(project.leadSpoc),memberName(project.primary1),memberName(project.primary2),memberName(project.support1),memberName(project.support2),memberName(project.support3),memberName(project.support4),memberName(project.mentor1),memberName(project.mentor2),project.notes];
    const addSheet = (name, headers, rows) => {
      const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      sheet['!cols'] = headers.map((header, index) => ({ wch: Math.min(40, Math.max(String(header).length + 2, ...rows.slice(0, 100).map((row) => String(row[index] ?? '').length + 2))) }));
      XLSX.utils.book_append_sheet(workbook, sheet, name.slice(0, 31));
    };

    const completed = projects.filter((project) => project.status === 'Completed').length;
    const holdPaused = projects.filter((project) => ['On Hold','Paused'].includes(project.status)).length;
    const ongoing = projects.length - completed - holdPaused;
    const summaryRows = [
      ['Financial Year', `FY ${fy}`],
      ['Total Projects', projects.length],
      ['Ongoing', ongoing],
      ['On Hold / Paused', holdPaused],
      ['Completed', completed],
      ['Pond 1 Projects', projects.filter((project) => project.pond === 'POND 1').length],
      ['Pond 2 Projects', projects.filter((project) => project.pond === 'POND 2').length],
      ['Retainers', projects.filter((project) => project.type === 'Retainer').length],
      ['One-Time', projects.filter((project) => project.type === 'One-Time').length],
      ['Pitches', projects.filter((project) => project.type === 'Pitch').length],
      ['Internal', projects.filter((project) => project.type === 'Internal').length]
    ];
    addSheet('FY Summary', ['Metric','Value'], summaryRows);
    addSheet('All Projects', projectHeaders, projects.map(projectRow));
    addSheet('Pond 1', projectHeaders, projects.filter((project) => project.pond === 'POND 1').map(projectRow));
    addSheet('Pond 2', projectHeaders, projects.filter((project) => project.pond === 'POND 2').map(projectRow));
    addSheet('Retainers', projectHeaders, projects.filter((project) => project.type === 'Retainer').map(projectRow));
    addSheet('One-Time', projectHeaders, projects.filter((project) => project.type === 'One-Time').map(projectRow));
    addSheet('Pitches', projectHeaders, projects.filter((project) => project.type === 'Pitch').map(projectRow));
    addSheet('Internal', projectHeaders, projects.filter((project) => project.type === 'Internal').map(projectRow));
    const statusRows = STATUSES.map((status) => [status, projects.filter((project) => project.status === status).length]);
    addSheet('Status Summary', ['Status','Project Count'], statusRows);
    const teamHeaders = ['Team Member','Group','Type','Active','Projects Worked','Active Load','Retainers','One-Time','Pitches','Internal','As Primary','As Support','As SPOC','Load Score','Load Status'];
    const teamRows = state.members.map((member) => {
      const stats = computeMemberStats(member.id);
      const worked = projects.filter((project) => ROLE_KEYS.some((key) => project[key] === member.id)).length;
      return [member.name,member.group,member.type,member.active ? 'Yes' : 'No',worked,stats.activeLoad,stats.Retainer,stats['One-Time'],stats.Pitch,stats.Internal,stats.asPrimary,stats.asSupport,stats.asSpoc,formatScore(stats.loadScore),stats.loadStatus];
    });
    addSheet('Team Review', teamHeaders, teamRows);
    XLSX.writeFile(workbook, `JG_FY_${fy}_Review_${dateStamp()}.xlsx`);
    showToast(`FY ${fy} review workbook exported.`);
  } finally {
    ui.financialYear = previousFY;
  }
}

function openModal({ eyebrow = '', title = '', description = '', body = '', footer = '' }) {
  modalCommitted = false;
  els.modalEyebrow.textContent = eyebrow;
  els.modalTitle.textContent = title;
  els.modalDescription.textContent = description;
  els.modalBody.innerHTML = body;
  els.modalFooter.innerHTML = footer;
  els.modalFooter.querySelectorAll('[data-modal-action="cancel"]').forEach((button) => button.addEventListener('click', () => els.modal.close()));
  if (!els.modal.open) els.modal.showModal();
}

function showModalError(element, message) {
  element.textContent = message;
  element.hidden = false;
  element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  return false;
}

function assignmentField(id, label, selected, pond) {
  return `<div class="field"><label for="${id}">${escapeHtml(label)}</label><select id="${id}">${memberOptions(selected, pond)}</select></div>`;
}

function memberOptions(selectedId, pond) {
  const otherPond = pond === 'POND 1' ? 'POND 2' : 'POND 1';
  const groupOrderList = [pond, 'POOL', otherPond];
  const options = ['<option value="">— Unassigned —</option>'];

  groupOrderList.forEach((group) => {
    const groupMembers = state.members
      .filter((member) => member.group === group && (member.active || member.id === selectedId))
      .map((member) => ({ member, stats: computeMemberStats(member.id) }))
      .sort((a, b) => a.stats.loadScore - b.stats.loadScore || a.member.name.localeCompare(b.member.name));
    if (!groupMembers.length) return;
    const groupLabel = group === pond ? `${group} · home team` : group === 'POOL' ? 'POOL · shared talent' : `${group} · cross-Pond`;
    options.push(`<optgroup label="${escapeAttr(groupLabel)}">`);
    groupMembers.forEach(({member,stats}) => {
      const inactive = member.active ? '' : ' · inactive';
      options.push(`<option value="${escapeAttr(member.id)}" ${selectedId === member.id ? 'selected' : ''}>${escapeHtml(member.name)} · ${escapeHtml(stats.loadStatus)} ${formatScore(stats.loadScore)}${inactive}</option>`);
    });
    options.push('</optgroup>');
  });

  return options.join('');
}

function suggestedMembers(pond, excludeProjectId = null) {
  return state.members
    .filter((member) => member.active && (member.group === pond || member.group === 'POOL'))
    .map((member) => ({ member, stats: computeMemberStats(member.id, excludeProjectId) }))
    .sort((a, b) => a.stats.loadScore - b.stats.loadScore || groupOrder(a.member.group) - groupOrder(b.member.group) || a.member.name.localeCompare(b.member.name))
    .slice(0, 5);
}

function computeMemberStats(memberId, excludeProjectId = null) {
  const activeProjects = getProjectsForSelectedFY().filter((project) => project.id !== excludeProjectId && isActiveProject(project));
  const assignedProjects = activeProjects.filter((project) => ROLE_KEYS.some((key) => project[key] === memberId));
  const stats = {
    activeLoad: assignedProjects.length,
    Retainer: 0,
    'One-Time': 0,
    Pitch: 0,
    Internal: 0,
    asPrimary: 0,
    asSupport: 0,
    asSpoc: 0,
    loadScore: 0,
    loadStatus: 'Available'
  };

  assignedProjects.forEach((project) => {
    if (Object.prototype.hasOwnProperty.call(stats, project.type)) stats[project.type] += 1;
    if (project.primary1 === memberId || project.primary2 === memberId) stats.asPrimary += 1;
    if (SUPPORT_KEYS.some((key) => project[key] === memberId)) stats.asSupport += 1;
    if (project.leadSpoc === memberId) stats.asSpoc += 1;
  });

  activeProjects.forEach((project) => {
    ROLE_KEYS.forEach((key) => {
      if (project[key] === memberId) stats.loadScore += Number(state.settings.roleWeights[key] || 0);
    });
  });

  stats.loadScore = roundNumber(stats.loadScore, 2);
  stats.loadStatus = loadStatus(stats.loadScore);
  return stats;
}

function loadStatus(score) {
  if (score === 0) return 'Available';
  if (score <= Number(state.settings.loadBands.balancedMax ?? 1)) return 'Balanced';
  if (score <= Number(state.settings.loadBands.highMax ?? 1.5)) return 'High';
  return 'Overloaded';
}

function getVisibleProjects(projects) {
  return projects.filter(projectMatchesSelectedFY).filter(matchesProjectSearch);
}

function getProjectsForSelectedFY() {
  return state.projects.filter(projectMatchesSelectedFY);
}

function projectMatchesSelectedFY(project) {
  return ui.financialYear === 'ALL' || project.financialYear === ui.financialYear;
}

function getFinancialYears() {
  const years = new Set(Array.isArray(state.meta?.financialYears) ? state.meta.financialYears : []);
  if (state.meta?.currentFY) years.add(state.meta.currentFY);
  state.projects.forEach((project) => { if (project.financialYear) years.add(project.financialYear); });
  return [...years].filter(Boolean).sort(compareFY);
}

function compareFY(a, b) {
  return Number(String(a).slice(0, 4)) - Number(String(b).slice(0, 4));
}

function canEditSelectedFY() {
  return userCanEdit() && storageMode === 'server' && ui.financialYear === state.meta.currentFY;
}

function refreshFinancialYearControls() {
  if (!els.financialYearSelect) return;
  const years = getFinancialYears();
  const valid = ui.financialYear === 'ALL' || years.includes(ui.financialYear);
  if (!valid) ui.financialYear = state.meta.currentFY || years[years.length - 1] || '2026-27';
  els.financialYearSelect.innerHTML = [
    ...years.map((fy) => `<option value="${escapeAttr(fy)}" ${ui.financialYear === fy ? 'selected' : ''}>FY ${escapeHtml(fy)}${fy === state.meta.currentFY ? ' · Current' : ''}</option>`),
    `<option value="ALL" ${ui.financialYear === 'ALL' ? 'selected' : ''}>All Years</option>`
  ].join('');
  if (els.appEyebrow) {
    els.appEyebrow.textContent = `JUMPINGGOOSE · ${ui.financialYear === 'ALL' ? 'ALL FINANCIAL YEARS' : 'FY ' + ui.financialYear}`;
  }
}

function financialYearForDate(value) {
  if (!value) return state.meta?.currentFY || state.meta?.period || '2026-27';
  const date = parseLocalDate(value);
  if (!date) return state.meta?.currentFY || state.meta?.period || '2026-27';
  const year = date.getFullYear();
  const start = date.getMonth() >= 3 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

function nextFinancialYear(fy) {
  const start = Number(String(fy || '').slice(0, 4)) || new Date().getFullYear();
  return `${start + 1}-${String((start + 2) % 100).padStart(2, '0')}`;
}

function financialYearStartDate(fy) {
  const start = Number(String(fy || '').slice(0, 4));
  return start ? `${start}-04-01` : '';
}

function matchesProjectSearch(project) {
  if (!ui.search) return true;
  const memberNames = ROLE_KEYS.map((key) => memberName(project[key])).join(' ');
  return matchesSearch(project.brand, project.agencies, project.engagement, project.status, project.type, project.pond, project.priority, project.notes, memberNames);
}

function matchesSearch(...values) {
  if (!ui.search) return true;
  return values.some((value) => String(value || '').toLowerCase().includes(ui.search));
}

function projectById(id) {
  return state.projects.find((project) => project.id === id) || null;
}

function memberById(id) {
  return state.members.find((member) => member.id === id) || null;
}

function memberName(id) {
  return memberById(id)?.name || '';
}

function assignedProjectCount(memberId) {
  return state.projects.filter((project) => ROLE_KEYS.some((key) => project[key] === memberId)).length;
}

function isActiveProject(project) {
  return project.status !== 'Completed';
}

function countActiveByPond(pond) {
  return getProjectsForSelectedFY().filter((project) => project.pond === pond && isActiveProject(project)).length;
}

function renderPondBreakdownRow(pond, projects) {
  const pondProjects = projects.filter((project) => project.pond === pond);
  const count = (type) => pondProjects.filter((project) => project.type === type).length;
  return `<tr>
    <td><span class="group-pill ${slug(pond)}">${pond}</span></td>
    <td class="num">${count('Retainer')}</td>
    <td class="num">${count('One-Time')}</td>
    <td class="num">${count('Pitch')}</td>
    <td class="num">${count('Internal')}</td>
    <td class="num"><strong>${pondProjects.length}</strong></td>
    <td class="num">${pondProjects.filter(isActiveProject).length}</td>
    <td class="num">${pondProjects.filter((project) => project.status === 'Completed').length}</td>
  </tr>`;
}

function renderDeadlineItem(project) {
  const date = parseLocalDate(project.endDate);
  const day = date ? String(date.getDate()).padStart(2, '0') : '--';
  const month = date ? date.toLocaleDateString('en-GB', { month: 'short' }) : '';
  return `<div class="deadline-item">
    <div class="deadline-date"><strong>${day}</strong><span>${escapeHtml(month)}</span></div>
    <div><h4>${escapeHtml(project.brand)}</h4><p>${escapeHtml(project.pond)} · ${escapeHtml(project.type)} · ${escapeHtml(deadlineLabel(project))}</p></div>
    <span class="status-pill ${slug(project.status)}">${escapeHtml(project.status)}</span>
  </div>`;
}

function deadlineLabel(project) {
  if (!project.endDate) return 'No end date';
  if (project.status === 'Completed') return 'Completed';
  const days = daysBetweenToday(project.endDate);
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`;
  if (days === 0) return 'Due today';
  return `${days} day${days === 1 ? '' : 's'} remaining`;
}

function kpiCard(label, value, meta, className = '') {
  return `<article class="kpi-card ${className}"><div class="kpi-label">${escapeHtml(label)}</div><div class="kpi-value">${escapeHtml(String(value))}</div><div class="kpi-meta">${escapeHtml(meta)}</div></article>`;
}

function capacityMetric(label, value, total, colorClass) {
  const width = total ? (value / total) * 100 : 0;
  return `<div class="metric-row"><span class="metric-name">${label}</span><span class="progress-track"><span class="progress-fill ${colorClass}" style="width:${width}%"></span></span><span class="metric-value">${value}</span></div>`;
}

function settingRow(label, value, setting, key, step) {
  return `<label class="setting-row"><span>${escapeHtml(label)}</span><input type="number" min="0" step="${step}" value="${escapeAttr(String(value))}" data-setting="${setting}" data-key="${escapeAttr(key)}"></label>`;
}

function memberChip(memberId) {
  const member = memberById(memberId);
  if (!member) return '<span class="chip">Unknown</span>';
  return `<span class="chip ${member.group === 'POOL' ? 'is-pool' : ''}" title="${escapeAttr(member.group)}">${escapeHtml(member.name)}</span>`;
}

function renderMiniEmpty(title, message) {
  return `<div class="empty-state" style="min-height:180px"><div class="empty-icon">·</div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(message)}</p></div>`;
}

function projectTypeDescription(type) {
  const descriptions = {
    Retainer: 'Ongoing client engagements · 20 planned slots per Pond',
    'One-Time': 'Finite assignments and campaigns · 40 planned slots per Pond',
    Pitch: 'New business and proposal work · 40 planned slots per Pond',
    Internal: 'JG initiatives and internal operations · 20 planned slots per Pond'
  };
  return descriptions[type] || '';
}

function donutGradient(counts) {
  const values = PROJECT_TYPES.map((type) => counts[type] || 0);
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!total) return '#ece8df';
  const colors = ['var(--forest)','var(--purple)','var(--teal)','var(--orange)'];
  let cursor = 0;
  const segments = values.map((value, index) => {
    const start = cursor;
    cursor += (value / total) * 360;
    return `${colors[index]} ${start}deg ${cursor}deg`;
  });
  return `conic-gradient(${segments.join(',')})`;
}

function loadColorClass(status) {
  if (status === 'Overloaded') return 'red';
  if (status === 'High') return 'yellow';
  if (status === 'Balanced') return 'teal';
  return 'forest';
}

function loadStatusColor(status) {
  return ({ Available: '#777d77', Balanced: '#2f7659', High: '#9a652a', Overloaded: '#a34842' })[status] || '#777d77';
}

function shortGroup(group) {
  return group === 'POOL' ? 'Pool' : group.replace('POND ', 'P');
}

function groupOrder(group) {
  return ({ 'POND 1': 1, 'POND 2': 2, POOL: 3 })[group] || 9;
}

function initials(name) {
  return String(name || '').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function normalizeState(input) {
  const source = input && typeof input === 'object' ? deepClone(input) : deepClone(DEFAULT_DATA);
  source.version = 2;
  source.revision = Number(source.revision || 0);
  source.meta = { ...deepClone(DEFAULT_DATA.meta), ...(source.meta || {}) };
  source.meta.currentFY = source.meta.currentFY || source.meta.period || '2026-27';
  source.meta.period = source.meta.currentFY;
  source.settings = source.settings || {};
  source.settings.projectLimits = { ...deepClone(DEFAULT_DATA.settings.projectLimits), ...(source.settings.projectLimits || {}) };
  source.settings.roleWeights = { ...deepClone(DEFAULT_DATA.settings.roleWeights), ...(source.settings.roleWeights || {}) };
  delete source.settings.roleWeights.mentor3;
  source.settings.loadBands = { ...deepClone(DEFAULT_DATA.settings.loadBands), ...(source.settings.loadBands || {}) };
  source.members = Array.isArray(source.members) ? source.members.map((member) => ({
    id: member.id || uniqueMemberId(member.name || 'member'),
    name: String(member.name || '').trim(),
    group: GROUPS.includes(member.group) ? member.group : 'POOL',
    type: MEMBER_TYPES.includes(member.type) ? member.type : 'Employee',
    active: member.active !== false
  })).filter((member) => member.name) : deepClone(DEFAULT_DATA.members);
  source.projects = Array.isArray(source.projects) ? source.projects.map((project) => normalizeProject({
    ...project,
    financialYear: project.financialYear || source.meta.currentFY
  })).filter((project) => project.brand) : [];
  const fySet = new Set(Array.isArray(source.meta.financialYears) ? source.meta.financialYears : []);
  fySet.add(source.meta.currentFY);
  source.projects.forEach((project) => { if (project.financialYear) fySet.add(project.financialYear); });
  source.meta.financialYears = [...fySet].filter(Boolean).sort(compareFY);
  source.projects.forEach((project) => {
    if (!project.legacyMentor3) return;
    const legacyName = source.members.find((member) => member.id === project.legacyMentor3)?.name || project.legacyMentor3;
    const migrationNote = `Previous Mentor 3 assignment: ${legacyName}`;
    if (!project.notes.includes(migrationNote)) project.notes = [project.notes, migrationNote].filter(Boolean).join('\n');
    delete project.legacyMentor3;
  });
  return source;
}

function normalizeProject(project) {
  const normalized = {
    id: project.id || uid('project'),
    financialYear: String(project.financialYear || state.meta?.currentFY || state.meta?.period || financialYearForDate(project.startDate)),
    pond: project.pond === 'POND 2' ? 'POND 2' : 'POND 1',
    type: PROJECT_TYPES.includes(project.type) ? project.type : 'Retainer',
    brand: String(project.brand || '').trim(),
    agencies: String(project.agencies || ''),
    engagement: String(project.engagement || ''),
    startDate: String(project.startDate || ''),
    endDate: String(project.endDate || ''),
    status: STATUSES.includes(project.status) ? project.status : 'Not Started',
    priority: PRIORITIES.includes(project.priority) ? project.priority : 'Normal',
    notes: String(project.notes || ''),
    createdAt: project.createdAt || new Date().toISOString(),
    updatedAt: project.updatedAt || new Date().toISOString()
  };
  ROLE_KEYS.forEach((key) => { normalized[key] = String(project[key] || ''); });
  const legacyMentor3 = String(project.mentor3 || '');
  if (legacyMentor3 && !normalized.mentor2 && legacyMentor3 !== normalized.mentor1) {
    normalized.mentor2 = legacyMentor3;
  } else if (legacyMentor3 && legacyMentor3 !== normalized.mentor1 && legacyMentor3 !== normalized.mentor2) {
    normalized.legacyMentor3 = legacyMentor3;
  }
  return normalized;
}

function openMobileNav() {
  els.sidebar.classList.add('is-open');
  els.mobileBackdrop.classList.add('is-open');
}

function closeMobileNav() {
  els.sidebar.classList.remove('is-open');
  els.mobileBackdrop.classList.remove('is-open');
}

function showToast(message, type = '') {
  const toast = document.createElement('div');
  toast.className = `toast ${type ? `is-${type}` : ''}`;
  toast.textContent = message;
  els.toastRegion.appendChild(toast);
  window.setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    window.setTimeout(() => toast.remove(), 220);
  }, 3200);
}

function downloadCsv(filename, headers, rows) {
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
  downloadFile(filename, `\ufeff${csv}`, 'text/csv;charset=utf-8');
}

function csvCell(value) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

function dateStamp() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatDate(value) {
  if (!value) return '—';
  const date = parseLocalDate(value);
  return date ? date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
}

function parseLocalDate(value) {
  if (!value) return null;
  const [year, month, day] = String(value).split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function daysBetweenToday(value) {
  const target = parseLocalDate(value);
  if (!target) return 0;
  const today = new Date();
  const localToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target - localToday) / 86400000);
}

function formatTimestamp(value) {
  if (!value) return 'Not yet updated';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not yet updated';
  return date.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatScore(value) {
  return Number(value || 0).toFixed(2).replace(/\.00$/, '.00');
}

function roundNumber(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function uid(prefix) {
  if (window.crypto?.randomUUID) return `${prefix}-${window.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function uniqueMemberId(name) {
  const base = slug(name) || 'member';
  let candidate = base;
  let counter = 2;
  while (state.members.some((member) => member.id === candidate)) {
    candidate = `${base}-${counter}`;
    counter += 1;
  }
  return candidate;
}

function slug(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#096;');
}
