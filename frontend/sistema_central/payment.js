// sistema_central/payment.js
// Pasarela de pago Stripe (Frontend)

const PAYMENT_API = 'https://ec0301-globalskillscert-backend.onrender.com';

const payment = {
    startCheckout: async (email, nombre, telefono) => {
        try {
            // Feedback visual
            Swal.fire({
                title: 'Iniciando pago...',
                text: 'Conectando con Stripe de manera segura.',
                allowOutsideClick: false,
                didOpen: () => Swal.showLoading()
            });

            // Petición al backend
            const response = await fetch(`${PAYMENT_API}/create-checkout-session`, {
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
                window.location.href = data.url; // Redirección a Stripe
            } else {
                console.error('Stripe Error:', data);
                throw new Error(data.error || 'No se recibió enlace de pago');
            }

        } catch (error) {
            console.error('Payment Error:', error);
            Swal.fire({
                icon: 'error',
                title: 'Error de conexión',
                text: 'No se pudo contactar al servidor de pagos. Intenta de nuevo más tarde.'
            });
        }
    }
};

window.payment = payment;
