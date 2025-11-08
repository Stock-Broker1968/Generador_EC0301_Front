// === CÓDIGO PARA PAGO CON STRIPE - CORREGIDO ===

// 1. Clave pública de Stripe (modo prueba)
const stripePublicKey = 'pk_test_51SJ0gXFupe2fTa5zdrZlQfwpB1Y3esGAdUBw1r4Hc9vIerMj90cm0w4t6tJUJmVV7bEqZ3v5d11cqvPrFps4P31600xqM9IUsj';
const backendUrl = 'https://ec0301-globalskillscert-backend.onrender.com'; // ✅ CORREGIDO

// 2. Inicializa Stripe.js
const stripe = Stripe(stripePublicKey);

// 3. Busca el botón de pago en tu HTML
const checkoutButton = document.getElementById('checkout-button');

// 4. Añade el Event Listener
if (checkoutButton) {
  checkoutButton.addEventListener('click', async () => {
    checkoutButton.disabled = true;
    const originalButtonText = checkoutButton.textContent;
    checkoutButton.textContent = 'Procesando...';

    try {
      console.log('Solicitando sesión de Checkout al backend...');
      const response = await fetch(`${backendUrl}/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        let errorMsg = 'No se pudo iniciar el proceso de pago.';
        try {
            const errorData = await response.json();
            errorMsg = `Error del servidor (${response.status}): ${errorData.error || response.statusText}`;
        } catch (parseError) {
             errorMsg = `Error del servidor (${response.status}): ${response.statusText}`;
        }
        console.error('Error del backend:', errorMsg);
        throw new Error(errorMsg);
      }

      const session = await response.json();
      console.log('Sesión de Checkout recibida:', session);

      if (!session.id && !session.url) {
        console.error('Respuesta inesperada del backend. Falta id o url de sesión.');
        throw new Error('Respuesta inválida del servidor de pagos.');
      }

      console.log('Redirigiendo a Stripe Checkout...');
      if (session.id) {
          const result = await stripe.redirectToCheckout({
            sessionId: session.id
          });

          if (result.error) {
            console.error('Error al redirigir a Stripe:', result.error);
            throw new Error(result.error.message);
          }
      } else {
          window.location.href = session.url;
      }

    } catch (error) {
      console.error('Error en el proceso de pago:', error);
      alert(`Hubo un problema al iniciar el pago: ${error.message}\nRevisa la consola para más detalles.`);
      checkoutButton.disabled = false;
      checkoutButton.textContent = originalButtonText;
    }
  });

  console.log('Listener de pago añadido al botón #checkout-button.');

} else {
  console.error('¡Error! No se encontró el botón con id="checkout-button" en la página.');
  alert('Error de configuración: El botón de pago no está presente.');
}
