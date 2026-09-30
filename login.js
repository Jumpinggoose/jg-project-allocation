'use strict';

const form = document.getElementById('loginForm');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const message = document.getElementById('formMessage');
const button = document.getElementById('signInButton');

async function checkExistingSession() {
  try {
    const response = await fetch('/api/session', { cache: 'no-store' });
    if (response.ok) window.location.replace('/');
  } catch (_error) {
    // The form remains available and will show a useful error on submit.
  }
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

  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Sign-in failed.');
    window.location.replace('/');
  } catch (error) {
    showMessage(error.message || 'Unable to sign in. Please try again.');
    button.disabled = false;
    button.textContent = 'Sign in';
  }
});

function showMessage(text) {
  message.textContent = text;
  message.hidden = false;
}

checkExistingSession();
