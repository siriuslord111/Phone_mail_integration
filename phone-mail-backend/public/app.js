const showBanner = (kind, message) => {
  const existing = document.querySelector('.message-banner');
  if (!existing) return;
  existing.className = `message-banner ${kind}`;
  existing.textContent = message;
};

const api = async (path, options = {}) => {
  const response = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || 'Request failed');
  }

  return data;
};

document.addEventListener('DOMContentLoaded', () => {
  const onboarding = document.getElementById('onboarding');
  const mobileHome = document.getElementById('mobile-home');
  if (onboarding && mobileHome) {
    const steps = [...onboarding.querySelectorAll('.onboarding-step')];
    const progressBar = document.getElementById('onboarding-progress-bar');
    const message = document.getElementById('mobile-onboarding-message');
    let currentStep = 0;
    let requestedPhone = '';

    const showStep = (index) => {
      currentStep = index;
      steps.forEach((step, stepIndex) => step.classList.toggle('active', stepIndex === index));
      progressBar.style.width = `${((index + 1) / steps.length) * 100}%`;
    };

    const showMobileMessage = (kind, text) => {
      message.className = `message-banner ${kind}`;
      message.textContent = text;
    };

    onboarding.querySelectorAll('.onboarding-next').forEach((button) => {
      button.addEventListener('click', async () => {
        if (currentStep === 1 && !document.getElementById('terms-check').checked) {
          showMobileMessage('error', 'Please accept the Terms of Service to continue.');
          return;
        }
        if (currentStep === 2) {
          requestedPhone = document.getElementById('mobile-phone').value;
          try {
            const result = await api('/api/auth/send-otp', {
              method: 'POST',
              body: JSON.stringify({ phoneNumber: requestedPhone, purpose: 'register' }),
            });
            showMobileMessage('success', result.message);
            showStep(3);
          } catch (error) {
            showMobileMessage('error', error.message);
            showStep(3);
          }
          return;
        }
        showMobileMessage('', '');
        showStep(currentStep + 1);
      });
    });

    document.getElementById('mobile-verify').addEventListener('click', async () => {
      try {
        const result = await api('/api/auth/register-otp', {
          method: 'POST',
          body: JSON.stringify({
            phoneNumber: requestedPhone || document.getElementById('mobile-phone').value,
            otp: document.getElementById('mobile-otp').value,
            client: 'mobile',
          }),
        });
        localStorage.setItem('phonemail_token', result.token);
        onboarding.hidden = true;
        mobileHome.hidden = false;
      } catch (error) {
        showMobileMessage('error', error.message);
      }
    });

    const passwordFallback = document.getElementById('mobile-password-fallback');
    const passwordInput = document.getElementById('mobile-password');
    const passwordSubmit = document.getElementById('mobile-password-submit');
    const passwordToggle = document.getElementById('mobile-password-toggle');
    let passwordMode = 'register';

    document.getElementById('mobile-password-mode').addEventListener('click', () => {
      passwordFallback.hidden = false;
      document.getElementById('mobile-verify').hidden = true;
      document.getElementById('mobile-password-mode').hidden = true;
    });

    document.getElementById('mobile-otp-mode').addEventListener('click', () => {
      passwordFallback.hidden = true;
      document.getElementById('mobile-verify').hidden = false;
      document.getElementById('mobile-password-mode').hidden = false;
    });

    passwordToggle.addEventListener('click', () => {
      passwordMode = passwordMode === 'register' ? 'login' : 'register';
      passwordInput.autocomplete = passwordMode === 'register' ? 'new-password' : 'current-password';
      passwordSubmit.textContent = passwordMode === 'register' ? 'Create account with password' : 'Log in with password';
      passwordToggle.textContent = passwordMode === 'register' ? 'Already have an account? Log in' : 'Need an account? Sign up';
    });

    passwordSubmit.addEventListener('click', async () => {
      const endpoint = passwordMode === 'register' ? '/api/auth/register' : '/api/auth/login-password';
      try {
        const result = await api(endpoint, {
          method: 'POST',
          body: JSON.stringify({
            phoneNumber: requestedPhone || document.getElementById('mobile-phone').value,
            password: passwordInput.value,
            client: 'mobile',
          }),
        });
        localStorage.setItem('phonemail_token', result.token);
        onboarding.hidden = true;
        mobileHome.hidden = false;
      } catch (error) {
        showMobileMessage('error', error.message);
      }
    });
  }

  const portalForm = document.getElementById('portal-form');
  if (portalForm) {
    const banner = document.createElement('div');
    banner.className = 'message-banner';
    portalForm.appendChild(banner);
    const showPortalMessage = (kind, text) => {
      banner.className = `message-banner ${kind}`;
      banner.textContent = text;
    };
    const otpInput = portalForm.elements.namedItem('otp');
    const phoneInput = portalForm.elements.namedItem('phoneNumber');
    const submitButton = portalForm.querySelector('button[type="submit"]');
    let otpRequested = false;
    const passwordForm = document.getElementById('portal-password-form');
    const passwordModeToggle = document.getElementById('portal-password-mode');
    const passwordConfirmLabel = document.getElementById('portal-confirm-label');
    const passwordSubmit = passwordForm.querySelector('button[type="submit"]');
    let passwordMode = 'register';

    passwordModeToggle.addEventListener('click', () => {
      portalForm.hidden = true;
      passwordModeToggle.hidden = true;
      passwordForm.hidden = false;
    });

    document.getElementById('portal-password-toggle').addEventListener('click', () => {
      passwordMode = passwordMode === 'register' ? 'login' : 'register';
      passwordConfirmLabel.hidden = passwordMode === 'login';
      passwordConfirmLabel.querySelector('input').required = passwordMode === 'register';
      passwordSubmit.textContent = passwordMode === 'register' ? 'Create account with password' : 'Log in with password';
      document.getElementById('portal-password-toggle').textContent =
        passwordMode === 'register' ? 'Already have an account? Log in' : 'Need an account? Sign up';
    });

    passwordForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(passwordForm);
      const password = String(formData.get('password') || '');
      if (passwordMode === 'register' && password !== formData.get('confirmPassword')) {
        showPortalMessage('error', 'Passwords do not match.');
        return;
      }
      try {
        const endpoint = passwordMode === 'register' ? '/api/auth/register' : '/api/auth/login-password';
        const result = await api(endpoint, {
          method: 'POST',
          body: JSON.stringify({ phoneNumber: phoneInput.value, password, client: 'portal' }),
        });
        localStorage.setItem('phonemail_token', result.token);
        showPortalMessage('success', passwordMode === 'register' ? 'Account created.' : 'Login successful.');
      } catch (error) {
        showPortalMessage('error', error.message || 'Unable to authenticate.');
      }
    });

    portalForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(portalForm);
      const phoneNumber = formData.get('phoneNumber');
      const otp = String(formData.get('otp') || '');

      try {
        if (!otpRequested) {
          const result = await api('/api/auth/send-otp', {
            method: 'POST',
            body: JSON.stringify({ phoneNumber, purpose: 'register' }),
          });
          otpRequested = true;
          otpInput.required = true;
          phoneInput.readOnly = true;
          submitButton.textContent = 'Create account';
          showPortalMessage('success', result.message || 'OTP sent. Enter it to create your account.');
          return;
        }

        const result = await api('/api/auth/register-otp', {
          method: 'POST',
          body: JSON.stringify({ phoneNumber, otp, client: 'portal' }),
        });
        localStorage.setItem('phonemail_token', result.token);
        showPortalMessage('success', result.message || 'Account created.');
        portalForm.reset();
        otpRequested = false;
        otpInput.required = false;
        phoneInput.readOnly = false;
        submitButton.textContent = 'Send OTP';
      } catch (error) {
        showPortalMessage('error', error.message || 'Unable to create account.');
        if (otpRequested) {
          otpRequested = false;
          otpInput.required = false;
          phoneInput.readOnly = false;
          submitButton.textContent = 'Send OTP';
        }
      }
    });
  }

  const webForm = document.getElementById('web-form');
  if (webForm) {
    webForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(webForm);
      const payload = {
        from: '9876543210',
        to: [formData.get('to')],
        subject: formData.get('subject') || 'New message',
        body: formData.get('body'),
      };

      try {
        await api('/api/email/send', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        alert('Email sent.');
        webForm.reset();
      } catch (error) {
        alert(error.message || 'Unable to send email.');
      }
    });
  }
});
