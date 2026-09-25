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
              body: JSON.stringify({ phoneNumber: requestedPhone }),
            });
            if (result.otp) {
              document.getElementById('mobile-otp').value = result.otp;
            }
            showMobileMessage('success', result.message);
            showStep(3);
          } catch (error) {
            showMobileMessage('error', error.message);
          }
          return;
        }
        showMobileMessage('', '');
        showStep(currentStep + 1);
      });
    });

    document.getElementById('mobile-verify').addEventListener('click', async () => {
      try {
        await api('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({
            phoneNumber: requestedPhone || document.getElementById('mobile-phone').value,
            otp: document.getElementById('mobile-otp').value,
            client: 'mobile',
          }),
        });
        onboarding.hidden = true;
        mobileHome.hidden = false;
      } catch (error) {
        showMobileMessage('error', error.message);
      }
    });

    document.getElementById('mobile-password-mode').addEventListener('click', () => {
      showMobileMessage('success', 'Password fallback is available from the web portal.');
      showStep(2);
    });
  }

  const portalForm = document.getElementById('portal-form');
  if (portalForm) {
    const banner = document.createElement('div');
    banner.className = 'message-banner';
    portalForm.appendChild(banner);

    portalForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(portalForm);
      const phoneNumber = formData.get('phoneNumber');
      const otp = formData.get('otp');

      try {
        const result = await api('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({ phoneNumber, otp: otp || undefined }),
        });

        showBanner('success', result.message || 'Account created.');
        portalForm.reset();
      } catch (error) {
        showBanner('error', error.message || 'Unable to create account.');
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
