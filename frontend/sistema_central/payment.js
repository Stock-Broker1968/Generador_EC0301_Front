// sistema_central/payment.js (Versión Frontend Segura)

const PAYMENT_API_URL = 'https://ec0301-globalskillscert-backend.onrender.com';

const payment = {
    startCheckout: async (email, nombre, telefono) => {
        try {
            // Mostrar spinner de carga
            Swal.fire({
                title: 'Conectando con Stripe...',
                text: 'Te estamos redirigiendo a la pasarela de pago segura.',
                allowOutsideClick: false,
                didOpen: () => {
                    Swal.showLoading();
                }
            });

            // Petición al backend para crear la sesión
            const response = await fetch(`${PAYMENT_API_URL}/create-checkout-session`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    email: email,
                    nombre: nombre,
                    telefono: telefono,
                    courseName: 'Certificación EC0301'
                })
            });

            const data = await response.json();

            if (data.url) {
                // ÉXITO: Redirigir a Stripe
                window.location.href = data.url;
            } else {
                console.error('Error del servidor:', data);
                throw new Error(data.error || 'No se recibió la URL de pago');
            }

        } catch (error) {
            console.error('Error en el proceso de pago:', error);
            Swal.fire({
                icon: 'error',
                title: 'Error de conexión',
                text: 'No se pudo conectar con el servidor de pagos. Por favor intenta de nuevo.'
            });
        }
    }
};

// Exponer globalmente
window.payment = payment;
