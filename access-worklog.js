'use strict';

const JG_ACTIVITY_TYPES = [
  'Design / Execution',
  'Idea / Concept',
  'Research',
  'Planning / Strategy',
  'Meeting / Review',
  'Coordination / Management',
  'Production / Shoot',
  'Copy / Content',
  'Other'
];

let jgAccessProfile = null;
let jgTimeEntries = [];
let jgFinancialEntries = [];
let jgCompensationHistory = [];
let jgOperationalLoadStarted = false;

ui.worklogDate = ui.worklogDate || jgLocalISODate();
ui.profitabilityMonth = ui.profitabilityMonth || 'ALL';

const JG_ORIGINAL_LOAD_SESSION = loadSession;
const JG_ORIGINAL_LOAD_STATE = loadState;
const JG_ORIGINAL_RENDER_CURRENT_VIEW = renderCurrentView;
const JG_ORIGINAL_HANDLE_PRIMARY_ACTION = handlePrimaryAction;
const JG_ORIGINAL_HANDLE_VIEW_CLICK = handleViewClick;
const JG_ORIGINAL_HANDLE_VIEW_CHANGE = handleViewChange;

loadSession = async function () {
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

    const { data: access, error: accessError } = await supabaseClient
      .from('user_access')
      .select('email, member_id, display_name, access_level, title, head_group, active')
      .eq('email', email)
      .maybeSingle();

    if (accessError) throw accessError;
    if (!access || !access.active) {
      await supabaseClient.auth.signOut();
      showToast('Your JG account has not been enabled for this workspace yet.', 'error');
      redirectToLogin();
      return false;
    }

    jgAccessProfile = access;
    sessionUser = {
      id: data.user.id,
      email,
      name: access.display_name || data.user.user_metadata?.name || data.user.email || 'JG user',
      memberId: access.member_id,
      accessLevel: access.access_level,
      title: access.title || '',
      headGroup: access.head_group || ''
    };

    els.currentUserLabel.textContent = `${sessionUser.name} · ${sessionUser.title || jgAccessLabel(sessionUser.accessLevel)}`;
    return true;
  } catch (error) {
    console.error(error);
    redirectToLogin();
    return false;
  }
};

loadState = async function () {
  const result = await JG_ORIGINAL_LOAD_STATE();
  window.setTimeout(async () => {
    if (!sessionUser || jgOperationalLoadStarted) return;
    jgOperationalLoadStarted = true;
    await jgLoadOperationalData();
    if (jgIsEmployeeOnly()) ui.view = 'worklog';
    jgApplyAccessNavigation();
    renderCurrentView();
  }, 0);
  return result;
};

userCanEdit = function () {
  return jgCanManageProjects();
};

userIsAdmin = function () {
  return jgIsManagement();
};

canEditSelectedFY = function () {
  return jgCanManageProjects() && storageMode === 'server' && ui.financialYear === state.meta.currentFY;
};

setView = function (view, clearSearch = false) {
  if (!jgCanAccessView(view)) view = 'worklog';
  ui.view = view;
  if (clearSearch) {
    ui.search = '';
    if (els.globalSearch) els.globalSearch.value = '';
  }
  document.querySelectorAll('.nav-item').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.view === view);
  });
  closeMobileNav();
  renderCurrentView();
};

renderCurrentView = function () {
  if (!jgCanAccessView(ui.view)) ui.view = 'worklog';
  jgApplyAccessNavigation();

  if (ui.view === 'worklog') {
    refreshFinancialYearControls();
    els.pageTitle.textContent = 'My Work Log';
    els.pageSubtitle.textContent = 'Log actual time spent on each project and activity. No daily hour target is enforced.';
    els.primaryAction.hidden = true;
    if (els.globalSearchWrap) els.globalSearchWrap.hidden = true;
    if (els.dataButton) els.dataButton.hidden = true;
    const fySwitcher = document.querySelector('.fy-switcher');
    if (fySwitcher) fySwitcher.hidden = jgIsEmployeeOnly();
    els.viewContainer.innerHTML = jgRenderWorkLog();
    jgSetActiveNav('worklog');
    updateSyncUI(storageMode === 'server' ? 'saved' : 'error', storageMode === 'server' ? 'Shared cloud storage' : 'Read-only browser backup');
    return;
  }

  if (ui.view === 'profitability') {
    if (!jgIsManagement()) {
      ui.view = 'worklog';
      return renderCurrentView();
    }
    refreshFinancialYearControls();
    els.pageTitle.textContent = 'Profitability';
    els.pageSubtitle.textContent = 'Revenue ownership, delivery contribution and project profitability from actual logged time.';
    els.primaryAction.textContent = 'Add financial entry';
    els.primaryAction.hidden = false;
    if (els.globalSearchWrap) els.globalSearchWrap.hidden = true;
    if (els.dataButton) els.dataButton.hidden = false;
    const fySwitcher = document.querySelector('.fy-switcher');
    if (fySwitcher) fySwitcher.hidden = false;
    els.viewContainer.innerHTML = jgRenderProfitability();
    jgSetActiveNav('profitability');
    updateSyncUI(storageMode === 'server' ? 'saved' : 'error', storageMode === 'server' ? 'Shared cloud storage' : 'Read-only browser backup');
    return;
  }

  JG_ORIGINAL_RENDER_CURRENT_VIEW();
  if (els.globalSearchWrap) els.globalSearchWrap.hidden = false;
  if (els.dataButton) els.dataButton.hidden = !jgIsManagement();
  const fySwitcher = document.querySelector('.fy-switcher');
  if (fySwitcher) fySwitcher.hidden = false;
  if (ui.view === 'team' && !jgIsManagement()) els.primaryAction.hidden = true;
  if (ui.view === 'setup' && !jgIsManagement()) {
    ui.view = 'worklog';
    return renderCurrentView();
  }
  jgApplyAccessNavigation();
  jgSetActiveNav(ui.view);
};

handlePrimaryAction = function () {
  if (ui.view === 'profitability') {
    if (!jgIsManagement()) return showToast('Profitability is limited to JG management.', 'warning');
    return jgOpenProjectFinanceModal();
  }
  if (ui.view === 'team' || ui.view === 'setup') {
    if (!jgIsManagement() || storageMode !== 'server') return showToast('Editing is not available for this account or connection.', 'warning');
    return openMemberModal();
  }
  return JG_ORIGINAL_HANDLE_PRIMARY_ACTION();
};

handleViewClick = function (event) {
  const trigger = event.target.closest('[data-action]');
  if (trigger) {
    const action = trigger.dataset.action;
    if (action === 'worklog-save') return void jgSaveWorklogEntry();
    if (action === 'worklog-today') {
      ui.worklogDate = jgLocalISODate();
      return renderCurrentView();
    }
    if (action === 'worklog-edit') return jgOpenWorklogEditModal(trigger.dataset.id);
    if (action === 'worklog-delete') return void jgDeleteWorklogEntry(trigger.dataset.id);
    if (action === 'finance-add') return jgOpenProjectFinanceModal(trigger.dataset.projectId || null);
    if (action === 'compensation-manage') return jgOpenCompensationModal();
  }
  return JG_ORIGINAL_HANDLE_VIEW_CLICK(event);
};

handleViewChange = function (event) {
  const control = event.target.dataset.control;
  if (control === 'worklog-date') {
    ui.worklogDate = event.target.value || jgLocalISODate();
    renderCurrentView();
    return;
  }
  if (control === 'profitability-month') {
    ui.profitabilityMonth = event.target.value || 'ALL';
    renderCurrentView();
    return;
  }
  return JG_ORIGINAL_HANDLE_VIEW_CHANGE(event);
};

function jgAccessLabel(level) {
  if (level === 'management') return 'Management';
  if (level === 'project_manager') return 'Project Manager';
  return 'Work Log';
}

function jgIsManagement() {
  return Boolean(sessionUser && sessionUser.accessLevel === 'management');
}

function jgCanManageProjects() {
  return Boolean(sessionUser && ['management', 'project_manager'].includes(sessionUser.accessLevel));
}

function jgIsEmployeeOnly() {
  return Boolean(sessionUser && sessionUser.accessLevel === 'employee');
}

function jgCanAccessView(view) {
  if (view === 'workl