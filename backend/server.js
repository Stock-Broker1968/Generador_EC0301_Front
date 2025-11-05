// === Importar dependencias ===
require('dotenv').config(); 
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise'); // Para conectar a Hostinger
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const jwt = require('jsonwebtoken'); // Para crear tokens de sesión
const bcrypt = require('bcryptjs'); // Para comparar códigos de forma segura

// === Inicializar la app Express ===
const app = express();
const PORT = process.env.PORT || 3000;

// === Configuración de Conexión a Base de Datos (Hostinger) ===
const dbPool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// === Middlewares ===
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));

// --- Webhook Endpoint (Stripe) ---
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
        console.log(`✅ Webhook verificado: ${event.type}`);
    } catch (err) {
        console.error(`❌ Error verificación webhook: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // --- Manejo del Evento de Pago ---
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        console.log(`🛒 Pago completado para sesión: ${session.id}`);

        try {
            // 1. Obtener email/teléfono del cliente en Stripe
            // (Asumimos que el cliente los ingresó en el checkout)
            const customerDetails = session.customer_details;
            const email = customerDetails.email;
            const phone = customerDetails.phone; // Asegúrate de pedir teléfono en el checkout de Stripe

            if (!phone) {
                throw new Error('No se proporcionó número de teléfono en el pago.');
            }

            // 2. Generar un código de acceso SEGURO
            const accessCode = Math.random().toString().substring(2, 8); // Código simple de 6 dígitos
            const hashedCode = await bcrypt.hash(accessCode, 10); // HASH del código

            // 3. Guardar en tu tabla 'access_codes'
            const [dbResult] = await dbPool.execute(
                // Asumiendo que tu tabla 'access_codes' tiene estas columnas
                'INSERT INTO access_codes (code_hash, email, phone, stripe_session_id, expires_at) VALUES (?, ?, ?, ?, NOW() + INTERVAL 1 DAY)',
                [hashedCode, email, phone, session.id]
            );
            console.log(`   - Código guardado en BD, ID: ${dbResult.insertId}`);

            // 4. Llama a la API de WhatsApp (Meta) para enviar el CÓDIGO REAL (NO el hash)
            // await sendWhatsAppMessage(phone, `¡Gracias por tu pago! Tu código de acceso es: ${accessCode}`);
            console.log(`   - Simulando: Envío de WhatsApp a ${phone} con código ${accessCode}`);

        } catch (dbOrApiError) {
            console.error(`❌ Error en lógica post-pago (BD/WhatsApp) para sesión ${session.id}:`, dbOrApiError);
        }
    }
    
    // ... maneja otros eventos si es necesario ...

    res.status(200).json({ received: true });
});

// --- Middlewares de JSON ---
// (Debe ir DESPUÉS del webhook raw)
app.use(express.json());

// === Rutas ===
app.get('/', (req, res) => {
    res.send('¡Backend Generando EC v1.1 con Auth está funcionando!');
});

// --- Ruta de Creación de Sesión de Stripe ---
app.post('/create-checkout-session', async (req, res) => {
    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card', 'oxxo'],
            line_items: [
                {
                    price_data: {
                        currency: 'mxn',
                        product_data: { name: 'Acceso Plataforma Generando EC' },
                        unit_amount: 50000, // $500.00 MXN
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            // ¡IMPORTANTE! Pedir email y teléfono en el checkout de Stripe
            billing_address_collection: 'required', // Para OXXO
            customer_creation: 'always', // Crea un cliente para guardar sus datos
            customer_email: req.body.email || null, // Opcional: pre-llena el email si el usuario ya lo dio
            phone_number_collection: {
                enabled: true, // ¡Pedir el teléfono para WhatsApp!
            },
            success_url: `${process.env.FRONTEND_URL}/Paginas_principales/success.html`, // Página de éxito
            cancel_url: `${process.env.FRONTEND_URL}/Paginas_principales/index.html`, // Página de cancelación
            payment_method_options: {
                oxxo: { expires_after_days: 3 },
            },
        });
        console.log(`✅ Sesión de Checkout creada: ${session.id}`);
        res.json({ id: session.id }); // Enviar el ID de la sesión al frontend

    } catch (error) {
        console.error("❌ Error creando sesión de Stripe:", error);
        res.status(500).json({ error: 'No se pudo iniciar el proceso de pago.' });
    }
});


// === (NUEVO) RUTAS DE AUTENTICACIÓN ===
const authRouter = express.Router();
app.use('/api/auth', authRouter);

/**
 * Endpoint para validar un código de acceso y devolver un token de sesión (JWT)
 */
authRouter.post('/login-code', async (req, res) => {
    const { accessCode } = req.body;

    if (!accessCode) {
        return res.status(400).json({ error: 'Código de acceso requerido.' });
    }

    try {
        // 1. Buscar códigos que no estén usados y no hayan expirado
        const [rows] = await dbPool.execute(
            // Asumiendo que 'access_codes' tiene 'code_hash', 'email', 'is_used', 'expires_at'
            'SELECT * FROM access_codes WHERE is_used = 0 AND expires_at > NOW()',
            []
        );

        if (rows.length === 0) {
            return res.status(401).json({ error: 'Código inválido o expirado.' });
        }

        let validCodeMatch = null;
        let userData = null;

        // 2. Comparar el código proporcionado con todos los hashes válidos
        for (const row of rows) {
            const isMatch = await bcrypt.compare(accessCode, row.code_hash);
            if (isMatch) {
                validCodeMatch = row;
                break;
            }
        }

        if (!validCodeMatch) {
            return res.status(401).json({ error: 'Código inválido o expirado.' });
        }

        // 3. ¡Código válido! Marcar el código como usado
        await dbPool.execute(
            'UPDATE access_codes SET is_used = 1, used_at = NOW() WHERE id = ?',
            [validCodeMatch.id]
        );

        // 4. Crear un token de sesión (JWT)
        const userPayload = {
            id: validCodeMatch.id, // O un ID de usuario si lo tienes
            email: validCodeMatch.email,
            phone: validCodeMatch.phone
        };
        
        const token = jwt.sign(
            userPayload,
            process.env.JWT_SECRET,
            { expiresIn: '7d' } // El token es válido por 7 días
        );

        // 5. Devolver el token al frontend
        res.status(200).json({
            message: 'Inicio de sesión exitoso.',
            token: token,
            user: userPayload
        });

    } catch (error) {
        console.error("❌ Error en /login-code:", error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});


// === Iniciar el servidor ===
app.listen(PORT, () => {
    console.log(`🚀 Servidor escuchando en http://localhost:${PORT}`);
});
