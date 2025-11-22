// sistema_central/payment.js (VERSIÓN FRONTEND)

// URL de tu backend en Render
const PAYMENT_API_URL = 'https://ec0301-globalskillscert-backend.onrender.com';

const payment = {
    startCheckout: async (email, nombre, telefono) => {
        try {
            // 1. Mostrar aviso de carga
            Swal.fire({
                title: 'Procesando...',
                text: 'Conectando con la pasarela de pago segura.',
                allowOutsideClick: false,
                didOpen: () => {
                    Swal.showLoading();
                }
            });

            // 2. Pedir la sesión al Backend
            const response = await fetch(`${PAYMENT_API_URL}/create-checkout-session`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    email: email,
                    nombre: nombre,
                    telefono: telefono,
                    courseName: 'Certificación EC0301'
                })
            });

            if (!response.ok) {
Utilice Control + Shift + m para alternar el foco móvil de la tecla tab. Alternativamente, use esc y luego tab para pasar al siguiente elemento interactivo de la página.
¡La traducción de páginas con IA ya está disponible! Haz clic aquí para configurarla.
                throw new Error(`Error del servidor: ${response.status}`);
            }

            const data = await response.json();

            // 3. Redirigir si hay URL
            if (data.url) {
                window.location.href = data.url;
            } else {
                console.error('Respuesta sin URL:', data);
                throw new Error('El sistema no devolvió el enlace de pago.');
            }

        } catch (error) {
            console.error('Error en payment.js:', error);
            Swal.fire({
                icon: 'error',
                title: 'Error de conexión',
                text: 'No se pudo conectar con el servidor. Verifica tu internet o intenta más tarde.'
            });
        }
    }
};

// Exponer al navegador
window.payment = payment;
