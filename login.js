'use strict';

const form = document.getElementById('loginForm');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const message = document.getElementById('formMessage');
const button = document.getElementById('signInButton');
const googleButton = document.getElementById('googleSignInButton');

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

googleButton.addEventListener('click', async () => {
  message.hidden = true;
  googleButton.disabled = true;
  googleButton.querySelector('span:last-child').textContent = 'Connecting to Google…';

  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin + '/',
      queryParams: {
        hd: 'jumpinggoose.com',
        prompt: 'select_account'
      }
    }
  });

  if (error) {
    showMessage(error.message || 'Unable to start Google sign-in.');
    googleButton.disabled = false;
    googleButton.querySelector('span:last-child').textContent = 'Continue with Google';
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  message.hidden = true;

  const email = emailInput.value.trim().toLowerCase();
  const password = passwordInput.value;

  if (!email || !password) {
    showMessage('Enter both your email address and password.');
    return;
  }

  if (!email.endsWith('@jumpinggoose.com')) {
    showMessage('Use your @jumpinggoose.com email address.');
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
