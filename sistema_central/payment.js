/**
 * Sistema de Pagos para SkillsCert EC0301
 * Integración con Stripe para procesamiento de pagos
 * @version 2.0.0
 */

const payment = (function() {
    'use strict';

    // ==================== CONFIGURACIÓN ====================
    const CONFIG = {
        STRIPE_PUBLIC_KEY: 'pk_test_51SJ0gXFupe2fTa5zdzZlQfwpB1Y3esGAdUBw1R4hc9vIerMj90cm0w4t6tJUJmVV7bEqZ3v5d11cqvPrFps4P31600xqM9IUsj',
        BACKEND_URL: 'https://ec0301-globalskillscert-backend.onrender.com',
        PRICE_MXN: 500,
        PAYMENT_TIMEOUT: 30000, // 30 segundos
        RETRY_ATTEMPTS: 3,
        RETRY_DELAY: 2000
    };

    // ==================== ESTADO INTERNO ====================
    let stripe = null;
    let isProcessing = false;
    let currentSessionId = null;

    // ==================== INICIALIZACIÓN ====================
    function init() {
        try {
            console.log('[Payment] Inicializando sistema de pagos...');
            
            if (typeof Stripe === 'undefined') {
                console.error('[Payment] Stripe.js no está cargado');
                throw new Error('Sistema de pagos no disponible');
            }

            stripe = Stripe(CONFIG.STRIPE_PUBLIC_KEY);
            console.log('[Payment] Stripe inicializado correctamente');
            
            return true;
        } catch (error) {
            console.error('[Payment] Error inicializando Stripe:', error);
            return false;
        }
    }

    // ==================== CREACIÓN DE SESIÓN ====================
    async function createCheckoutSession(metadata = {}) {
        try {
            console.log('[Payment] Creando sesión de checkout...');

            const response = await fetchWithRetry(`${CONFIG.BACKEND_URL}/create-checkout-session`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: JSON.stringify({
                    priceId: 'price_skillscert_ec0301', // ID del producto en Stripe
                    successUrl: `${window.location.origin}/success.html?session_id={CHECKOUT_SESSION_ID}`,
                    cancelUrl: `${window.location.origin}/index.html`,
                    metadata: {
                        product: 'EC0301 Full Access',
                        ...metadata
                    }
                })
            }, CONFIG.RETRY_ATTEMPTS);

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `Error ${response.status}: ${response.statusText}`);
            }

            const session = await response.json();
            
            if (!session?.id) {
                throw new Error('Respuesta inválida del servidor de pagos');
            }

            console.log('[Payment] Sesión creada:', session.id);
            currentSessionId = session.id;
            
            return session;
        } catch (error) {
            console.error('[Payment] Error creando sesión:', error);
            throw error;
        }
    }

    // ==================== PROCESO DE PAGO ====================
    async function processPayment(customMetadata = {}) {
        if (isProcessing) {
            console.warn('[Payment] Ya hay un pago en proceso');
            return false;
        }

        isProcessing = true;

        try {
            // Verificar backend health
            await checkBackendHealth();

            // Confirmar intención
            const confirmResult = await Swal.fire({
                title: 'Confirmar Pago',
                html: `
                    <div style="text-align: left;">
                        <h3 style="color: #1E3A8A; margin-bottom: 1rem;">SkillsCert EC0301 - Acceso Completo</h3>
                        <div style="background: #F8FAFC; padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
                            <p style="font-size: 2rem; font-weight: bold; color: #1E3A8A; margin: 0;">$${CONFIG.PRICE_MXN} MXN</p>
                            <p style="color: #6B7280; margin: 0;">Pago único</p>
                        </div>
                        <ul style="color: #1F2937; margin: 0; padding-left: 1.5rem;">
                            <li>Acceso completo al sistema EC0301</li>
                            <li>Generación ilimitada de proyectos</li>
                            <li>Soporte técnico incluido</li>
                            <li>Actualizaciones gratuitas</li>
                        </ul>
                        <p style="font-size: 0.85rem; color: #6B7280; margin-top: 1rem;">
                            <i class="fa-solid fa-lock"></i> Pago seguro procesado por Stripe
                        </p>
                    </div>
                `,
                icon: 'info',
                showCancelButton: true,
                confirmButtonText: '<i class="fa-solid fa-credit-card"></i> Proceder al Pago',
                cancelButtonText: 'Cancelar',
                confirmButtonColor: '#1E3A8A',
                cancelButtonColor: '#6B7280',
                width: 500
            });

            if (!confirmResult.isConfirmed) {
                isProcessing = false;
                return false;
            }

            // Mostrar loading
            Swal.fire({
                title: 'Procesando...',
                html: '<p>Conectando con el sistema de pagos seguro</p>',
                allowOutsideClick: false,
                allowEscapeKey: false,
                didOpen: () => {
                    Swal.showLoading();
                }
            });

            // Crear sesión de checkout
            const session = await createCheckoutSession(customMetadata);

            // Redirigir a Stripe Checkout
            console.log('[Payment] Redirigiendo a Stripe Checkout...');
            const result = await stripe.redirectToCheckout({
                sessionId: session.id
            });

            if (result.error) {
                throw new Error(result.error.message);
            }

            // Si llegamos aquí, hubo un error (no debería ocurrir porque redirectToCheckout redirige)
            return true;
        } catch (error) {
            console.error('[Payment] Error en proceso de pago:', error);
            
            await Swal.fire({
                icon: 'error',
                title: 'Error de Pago',
                html: `
                    <p>${error.message || 'No se pudo procesar el pago'}</p>
                    <p style="font-size: 0.9rem; color: #6B7280; margin-top: 1rem;">
                        Si el problema persiste, contacta a soporte.
                    </p>
                `,
                confirmButtonColor: '#EF4444'
            });
            
            return false;
        } finally {
            isProcessing = false;
        }
    }

    // ==================== VERIFICACIÓN DE PAGO ====================
    async function verifyPayment(sessionId) {
        try {
            console.log('[Payment] Verificando pago:', sessionId);

            const response = await fetch(`${CONFIG.BACKEND_URL}/api/payment/verify`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ sessionId })
            });

            if (!response.ok) {
                throw new Error('No se pudo verificar el pago');
            }

            const data = await response.json();
            
            return {
                success: data.success,
                accessCode: data.accessCode,
                email: data.email,
                paymentStatus: data.paymentStatus
            };
        } catch (error) {
            console.error('[Payment] Error verificando pago:', error);
            throw error;
        }
    }

    // ==================== GESTIÓN DE CÓDIGOS ====================
    async function requestAccessCode(email) {
        try {
            const response = await fetch(`${CONFIG.BACKEND_URL}/api/access/request-code`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || 'No se pudo solicitar el código');
            }

            const data = await response.json();
            return data;
        } catch (error) {
            console.error('[Payment] Error solicitando código:', error);
            throw error;
        }
    }

    async function validateAccessCode(code) {
        try {
            const response = await fetch(`${CONFIG.BACKEND_URL}/api/access/validate-code`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ code })
            });

            if (!response.ok) {
                return { valid: false };
            }

            const data = await response.json();
            return {
                valid: data.valid,
                email: data.email,
                expiresAt: data.expiresAt
            };
        } catch (error) {
            console.error('[Payment] Error validando código:', error);
            return { valid: false };
        }
    }

    // ==================== UTILIDADES ====================
    async function checkBackendHealth() {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);

            const response = await fetch(`${CONFIG.BACKEND_URL}/health`, {
                method: 'GET',
                signal: controller.signal
            });

            clearTimeout(timeout);

            if (!response.ok) {
                throw new Error('Servidor de pagos no disponible');
            }

            return true;
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('Tiempo de espera agotado. Verifica tu conexión.');
            }
            throw new Error('No se puede conectar con el servidor de pagos');
        }
    }

    async function fetchWithRetry(url, options, maxRetries) {
        let lastError;

        for (let i = 0; i < maxRetries; i++) {
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), CONFIG.PAYMENT_TIMEOUT);

                const response = await fetch(url, {
                    ...options,
                    signal: controller.signal
                });

                clearTimeout(timeout);
                return response;
            } catch (error) {
                lastError = error;
                console.warn(`[Payment] Intento ${i + 1}/${maxRetries} falló:`, error.message);

                if (i < maxRetries - 1) {
                    await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY));
                }
            }
        }

        throw lastError;
    }

    function formatPrice(amount, currency = 'MXN') {
        return new Intl.NumberFormat('es-MX', {
            style: 'currency',
            currency: currency
        }).format(amount);
    }

    // ==================== WEBHOOKS (PROCESAMIENTO) ====================
    function handleSuccessfulPayment(sessionData) {
        console.log('[Payment] Pago exitoso procesado:', sessionData);
        
        // Guardar información del pago
        try {
            localStorage.setItem('payment_success', JSON.stringify({
                sessionId: sessionData.sessionId,
                timestamp: Date.now(),
                amount: sessionData.amount,
                email: sessionData.email
            }));
        } catch (error) {
            console.error('[Payment] Error guardando información de pago:', error);
        }

        // Notificar éxito
        Swal.fire({
            icon: 'success',
            title: '¡Pago Exitoso!',
            html: `
                <p>Tu código de acceso ha sido enviado a:</p>
                <p style="font-weight: bold; color: #1E3A8A;">${sessionData.email}</p>
                <p style="font-size: 0.9rem; color: #6B7280; margin-top: 1rem;">
                    Revisa tu WhatsApp para obtener el código de 6 dígitos.
                </p>
            `,
            confirmButtonColor: '#22C55E'
        });
    }

    function handleFailedPayment(error) {
        console.error('[Payment] Pago fallido:', error);

        Swal.fire({
            icon: 'error',
            title: 'Pago No Completado',
            html: `
                <p>${error.message || 'El pago no pudo ser procesado'}</p>
                <p style="font-size: 0.9rem; color: #6B7280; margin-top: 1rem;">
                    No se realizó ningún cargo. Puedes intentar nuevamente.
                </p>
            `,
            confirmButtonColor: '#EF4444'
        });
    }

    // ==================== API PÚBLICA ====================
    const publicAPI = {
        init,
        processPayment,
        verifyPayment,
        requestAccessCode,
        validateAccessCode,
        checkBackendHealth,
        formatPrice,
        handleSuccessfulPayment,
        handleFailedPayment,
        get isProcessing() {
            return isProcessing;
        },
        get price() {
            return CONFIG.PRICE_MXN;
        }
    };

    // Auto-inicialización
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    return publicAPI;
})();

// Exportar para uso global
window.payment = payment;
