// sistema_central/payment.js

const API_URL = 'https://ec0301-globalskillscert-backend.onrender.com'; // Tu backend

const payment = {
    // Iniciar proceso de pago (Redirigir a Stripe)
    startCheckout: async (email, nombre, telefono) => {
        try {
            // 1. Mostrar spinner o bloquear botón
            Swal.fire({
                title: 'Procesando...',
                text: 'Te estamos redirigiendo a la pasarela de pago segura.',
                allowOutsideClick: false,
                didOpen: () => {
                    Swal.showLoading();
                }
            });

            // 2. Solicitar sesión al backend
            const response = await fetch(`${API_URL}/create-checkout-session`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    email: email,
                    nombre: nombre,
                    telefono: telefono
                })
            });

            const data = await response.json();

            // 3. Redirigir a la URL que nos da Stripe
            if (data.url) {
                window.location.href = data.url;
            } else {
                throw new Error('No se recibió la URL de pago');
            }

        } catch (error) {
            console.error('Error en pago:', error);
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'No se pudo conectar con el servidor de pagos. Intenta de nuevo.'
            });
        }
    }
};

// Exponer globalmente
window.payment = payment;
