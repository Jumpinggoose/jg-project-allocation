'use strict';

const form = document.getElementById('setupPasswordForm');
const emailInput = document.getElementById('setupEmail');
const passwordInput = document.getElementById('setupPassword');
const confirmInput = document.getElementById('setupPasswordConfirm');
const message = document.getElementById('setupMessage');
const submitButton = document.getElementById('setupSubmit');
const backButton = document.getElementById('backToLogin');

const config = window.JG_SUPABASE;
if (!config?.url || !config?.publishableKey || !window.supabase) {
  showMessage('Supabase configuration is missing.');
  throw new Error('Supabase configuration is missing.');
}

const supabaseClient = window.supabase.createClient(config.url, config.publishableKey);

backButton.addEventListener('click', () => {
  window.location.href = '/login.html';
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  message.hidden = true;

  const email = emailInput.value.trim().toLowerCase();
  const password = passwordInput.value;
  const confirmation = confirmInput.value;

  if (!email.endsWith('@jumpinggoose.com')) {
    showMessage('Use your @jumpinggoose.com email address.');
    return;
  }

  if (password.length < 8) {
    showMessage('Use a password with at least 8 characters.');
    return;
  }

  if (password !== confirmation) {
    showMessage('The passwords do not match.');
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = 'Creating account…';

  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: window.location.origin + '/'
    }
  });

  if (error) {
    showMessage(error.message || 'Unable to create the account.');
    submitButton.disabled = false;
    submitButton.textContent = 'Create password';
    return;
  }

  if (data.session) {
    window.location.replace('/');
    return;
  }

  showMessage('Check your JUMPINGGOOSE inbox to verify the account, then sign in.');
  submitButton.disabled = false;
  submitButton.textContent = 'Create password';
});

function showMessage(text) {
  message.textContent = text;
  message.hidden = false;
}
