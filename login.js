'use strict';

const form = document.getElementById('loginForm');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const message = document.getElementById('formMessage');
const button = document.getElementById('signInButton');

const config = window.JG_SUPABASE;
if (!config?.url || !config?.publishableKey || !window.supabase) {
  showMessage('Supabase configuration is missing.');
  throw new Error('Supabase configuration is missing.');
}

const supabaseClient = window.supabase.createClient(config.url, config.publishableKey);

async function checkExistingSession() {
  const { data, error } = await supabaseClient.auth.getSession();
  if (!error && data.session) window.location.replace('/');
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  message.hidden = true;

  const email = emailInput.value.trim().toLowerCase();
  const password = passwordInput.value;
  if (!email || !password) {
    showMessage('Enter both your email address and password.');
    return;
  }

  button.disabled = true;
  button.textContent = 'Signing in…';

  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });

  if (error) {
    showMessage(error.message || 'Unable to sign in. Please try again.');
    button.disabled = false;
    button.textContent = 'Sign in';
    return;
  }

  window.location.replace('/');
});

function showMessage(text) {
  message.textContent = text;
  message.hidden = false;
}

checkExistingSession();
