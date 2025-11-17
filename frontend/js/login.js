// Interfaz/js/login.js
(function () {
  'use strict';

  const API_BASE_URL = 'https://ec0301-globalskillscert-backend.onrender.com';

  async function handleLogin(event) {
    event.preventDefault();

    const email = document.getElementById('login-email')?.value.trim();
    const code  = document.getElementById('login-code')?.value.trim();

    if (!email || !code) {
      alert('Ingresa tu correo y código de acceso.');
      return;
    }

    try {
      const resp = await fetch(`${API_BASE_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, accessCode: code })
      });

      if (!resp.ok) {
        const text = await resp.text();
        console.error('Respuesta NO OK /login:', resp.status, text);
        throw new Error('Error al iniciar sesión');
      }

      const data = await resp.json();
      console.log('Respuesta /login:', data);

      if (!data.success || !data.token) {
        throw new Error(data.error || 'Credenciales inválidas');
      }

      auth.login(data.token);
      localStorage.setItem('userEmail', email);

      window.location.href = 'carta_descriptiva.html'; // o la que sea tu pantalla principal

    } catch (err) {
      console.error(err);
      alert(err.message || 'Error al iniciar sesión');
    }
  }

  window.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('login-form');
    if (form) {
      form.addEventListener('submit', handleLogin);
    }
  });
})();
