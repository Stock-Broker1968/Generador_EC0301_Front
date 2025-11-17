// Interfaz/js/pago.js
(function () {
  'use strict';

  // 👉 URL PÚBLICA DEL BACKEND NODE
  const API_BASE_URL = 'https://ec0301-globalskillscert-backend.onrender.com';

  async function handlePayment(event) {
    event.preventDefault();

    const email  = document.getElementById('pago-email')?.value.trim();
    const name   = document.getElementById('pago-nombre')?.value.trim();
    const phone  = document.getElementById('pago-telefono')?.value.trim();

    if (!email) {
      alert('Por favor ingresa tu correo electrónico.');
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/create-checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, phone })
      });

      if (!response.ok) {
        const text = await response.text();
        console.error('Respuesta NO OK /create-checkout-session:', response.status, text);
        throw new Error('Error al crear sesión de pago');
      }

      const data = await response.json();
      console.log('Respuesta /create-checkout-session:', data);

      if (!data.success || !data.url) {
        throw new Error(data.error || 'Error al crear sesión de pago');
      }

      // Redirigir a Stripe Checkout
      window.location.href = data.url;

    } catch (err) {
      console.error(err);
      alert('Error de Pago: ' + (err.message || 'Error al crear sesión de pago'));
    }
  }

  window.addEventListener('DOMContentLoaded', () => {
    const btnStripe = document.getElementById('btn-pagar-stripe');
    if (btnStripe) {
      btnStripe.addEventListener('click', handlePayment);
    }
  });
})();
