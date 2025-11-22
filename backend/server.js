// =====================================================
// SERVER.JS - Backend EC0301 GlobalSkillsCert
// Para desplegar en Render.com
// =====================================================

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const Stripe = require('stripe');

const app = express();
const PORT = process.env.PORT || 3000;

// =====================================================
// CONFIGURACIÓN DE STRIPE
// =====================================================
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const STRIPE_PRICE = 99900; // $999.00 MXN en centavos
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://ec0301-globalskillscert.onrender.com';

// =====================================================
// MIDDLEWARE
// =====================================================
app.use(cors({
    origin: [
        'https://ec0301-globalskillscert.onrender.com',
        'http://localhost:3000',
        'http://127.0.0.1:5500'
    ],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// =====================================================
// BASE DE DATOS EN MEMORIA (Para producción usar MongoDB/PostgreSQL)
// =====================================================
const users = new Map();
const sessions = new Map();
const pendingPayments = new Map();

// =====================================================
// FUNCIONES AUXILIARES
// =====================================================

// Generar código de acceso de 8 dígitos
function generateAccessCode() {
    return crypto.randomInt(10000000, 99999999).toString();
}

// Generar token de sesión
function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

// Calcular fecha de expiración (90 días)
function getExpirationDate() {
    const date = new Date();
    date.setDate(date.getDate() + 90);
    return date;
}

// =====================================================
// RUTAS DE LA API
// =====================================================

// Health check
app.get('/', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'EC0301 GlobalSkillsCert API',
        version: '2.0.0',
        endpoints: ['/login', '/create-checkout', '/verify-payment', '/webhook']
    });
});

app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// =====================================================
// POST /create-checkout - Crear sesión de pago en Stripe
// =====================================================
app.post('/create-checkout', async (req, res) => {
    try {
        const { name, email, whatsapp } = req.body;

        // Validaciones
        if (!name || !email) {
            return res.status(400).json({ 
                success: false, 
                message: 'Nombre y correo electrónico son requeridos.' 
            });
        }

        // Validar formato de email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Formato de correo electrónico inválido.' 
            });
        }

        console.log(`📝 Creando checkout para: ${name} (${email})`);

        // Crear sesión de Stripe Checkout
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            mode: 'payment',
            customer_email: email,
            line_items: [{
                price_data: {
                    currency: 'mxn',
                    product_data: {
                        name: 'Acceso SkillsCert EC0301',
                        description: 'Sistema completo de diseño instruccional - 90 días de acceso',
                        images: ['https://ec0301-globalskillscert.onrender.com/logo.png']
                    },
                    unit_amount: STRIPE_PRICE
                },
                quantity: 1
            }],
            metadata: {
                userName: name,
                userEmail: email,
                userWhatsapp: whatsapp || ''
            },
            success_url: `${FRONTEND_URL}/index.html?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${FRONTEND_URL}/index.html?canceled=true`
        });

        // Guardar pago pendiente
        pendingPayments.set(session.id, {
            name,
            email,
            whatsapp: whatsapp || '',
            createdAt: new Date()
        });

        console.log(`✅ Sesión de Stripe creada: ${session.id}`);

        res.json({ 
            success: true, 
            url: session.url,
            sessionId: session.id
        });

    } catch (error) {
        console.error('❌ Error en create-checkout:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error al crear la sesión de pago. Intenta de nuevo.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// =====================================================
// POST /verify-payment - Verificar pago completado
// =====================================================
app.post('/verify-payment', async (req, res) => {
    try {
        const { session_id } = req.body;

        if (!session_id) {
            return res.status(400).json({ 
                success: false, 
                message: 'Session ID es requerido.' 
            });
        }

        console.log(`🔍 Verificando pago: ${session_id}`);

        // Obtener sesión de Stripe
        const session = await stripe.checkout.sessions.retrieve(session_id);

        if (session.payment_status !== 'paid') {
            return res.status(400).json({ 
                success: false, 
                message: 'El pago no ha sido completado.' 
            });
        }

        // Obtener datos del usuario
        const userData = pendingPayments.get(session_id) || {
            name: session.metadata?.userName || 'Usuario',
            email: session.customer_email || session.metadata?.userEmail,
            whatsapp: session.metadata?.userWhatsapp || ''
        };

        // Verificar si ya existe el usuario
        let user = users.get(userData.email);
        
        if (!user) {
            // Crear nuevo usuario
            const accessCode = generateAccessCode();
            user = {
                id: crypto.randomUUID(),
                name: userData.name,
                email: userData.email,
                whatsapp: userData.whatsapp,
                accessCode,
                stripeSessionId: session_id,
                stripePaymentIntent: session.payment_intent,
                createdAt: new Date(),
                expiresAt: getExpirationDate(),
                isActive: true
            };
            users.set(userData.email, user);
            console.log(`👤 Nuevo usuario creado: ${userData.email} | Código: ${accessCode}`);
        }

        // Crear token de sesión
        const token = generateToken();
        sessions.set(token, {
            email: user.email,
            createdAt: new Date()
        });

        // Limpiar pago pendiente
        pendingPayments.delete(session_id);

        console.log(`✅ Pago verificado para: ${user.email}`);

        res.json({
            success: true,
            message: 'Pago verificado exitosamente.',
            token,
            user: {
                name: user.name,
                email: user.email,
                accessCode: user.accessCode,
                expiresAt: user.expiresAt
            }
        });

    } catch (error) {
        console.error('❌ Error en verify-payment:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error al verificar el pago.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// =====================================================
// POST /login - Iniciar sesión con código de acceso
// =====================================================
app.post('/login', (req, res) => {
    try {
        const { email, code } = req.body;

        if (!email || !code) {
            return res.status(400).json({ 
                success: false, 
                message: 'Correo y código de acceso son requeridos.' 
            });
        }

        console.log(`🔐 Intento de login: ${email}`);

        // Buscar usuario
        const user = users.get(email.toLowerCase().trim());

        if (!user) {
            console.log(`❌ Usuario no encontrado: ${email}`);
            return res.status(401).json({ 
                success: false, 
                message: 'Usuario no encontrado. Verifica tu correo electrónico.' 
            });
        }

        // Verificar código
        if (user.accessCode !== code.trim()) {
            console.log(`❌ Código incorrecto para: ${email}`);
            return res.status(401).json({ 
                success: false, 
                message: 'Código de acceso incorrecto.' 
            });
        }

        // Verificar si está activo
        if (!user.isActive) {
            return res.status(403).json({ 
                success: false, 
                message: 'Tu cuenta ha sido desactivada. Contacta soporte.' 
            });
        }

        // Verificar expiración
        if (new Date() > new Date(user.expiresAt)) {
            return res.status(403).json({ 
                success: false, 
                message: 'Tu acceso ha expirado. Renueva tu suscripción.' 
            });
        }

        // Crear token de sesión
        const token = generateToken();
        sessions.set(token, {
            email: user.email,
            createdAt: new Date()
        });

        console.log(`✅ Login exitoso: ${email}`);

        res.json({
            success: true,
            message: 'Inicio de sesión exitoso.',
            token,
            user: {
                name: user.name,
                email: user.email,
                expiresAt: user.expiresAt
            }
        });

    } catch (error) {
        console.error('❌ Error en login:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error al iniciar sesión.' 
        });
    }
});

// =====================================================
// POST /webhook - Webhook de Stripe (opcional pero recomendado)
// =====================================================
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;

    try {
        if (endpointSecret) {
            event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
        } else {
            event = JSON.parse(req.body);
        }
    } catch (err) {
        console.error('❌ Webhook signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Manejar el evento
    switch (event.type) {
        case 'checkout.session.completed':
            const session = event.data.object;
            console.log(`💰 Pago completado via webhook: ${session.id}`);
            // El usuario se crea en /verify-payment
            break;
        
        case 'payment_intent.payment_failed':
            const failedPayment = event.data.object;
            console.log(`❌ Pago fallido: ${failedPayment.id}`);
            break;

        default:
            console.log(`ℹ️ Evento no manejado: ${event.type}`);
    }

    res.json({ received: true });
});

// =====================================================
// GET /user/:email - Obtener info del usuario (para admin)
// =====================================================
app.get('/user/:email', (req, res) => {
    const user = users.get(req.params.email.toLowerCase());
    
    if (!user) {
        return res.status(404).json({ 
            success: false, 
            message: 'Usuario no encontrado.' 
        });
    }

    res.json({
        success: true,
        user: {
            name: user.name,
            email: user.email,
            whatsapp: user.whatsapp,
            accessCode: user.accessCode,
            createdAt: user.createdAt,
            expiresAt: user.expiresAt,
            isActive: user.isActive
        }
    });
});

// =====================================================
// MANEJO DE ERRORES 404
// =====================================================
app.use((req, res) => {
    res.status(404).json({ 
        success: false, 
        message: `Endpoint no encontrado: ${req.method} ${req.path}`,
        availableEndpoints: ['/', '/health', '/login', '/create-checkout', '/verify-payment']
    });
});

// =====================================================
// INICIAR SERVIDOR
// =====================================================
app.listen(PORT, () => {
    console.log('='.repeat(50));
    console.log('🚀 EC0301 GlobalSkillsCert Backend');
    console.log(`📡 Servidor corriendo en puerto ${PORT}`);
    console.log(`🌐 Frontend URL: ${FRONTEND_URL}`);
    console.log(`💳 Stripe configurado: ${process.env.STRIPE_SECRET_KEY ? 'Sí' : 'No'}`);
    console.log('='.repeat(50));
});
