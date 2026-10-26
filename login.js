'use strict';

const message = document.getElementById('formMessage');
const googleSignInButton = document.getElementById('googleSignInButton');
const config = window.JG_SUPABASE;

function showMessage(text) {
  message.textContent = text;
  message.hidden = false;
}

if (!config?.url || !config?.publishableKey || !window.supabase) {
  showMessage('Supabase configuration is missing.');
  throw new Error('Supabase configuration is missing.');
}

const supabaseClient = window.supabase.createClient(config.url, config.publishableKey);

async function checkExistingSession() {
  const { data, error } = await supabaseClient.auth.getSession();
  if (!error && data.session) window.location.replace('/');
}

googleSignInButton.addEventListener('click', async () => {
  googleSignInButton.disabled = true;
  message.hidden = true;
  try {
    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/' }
    });
    if (error) throw error;
  } catch (error) {
    showMessage(error.message || 'Unable to open Google sign-in.');
    googleSignInButton.disabled = false;
  }
});

checkExistingSession();
