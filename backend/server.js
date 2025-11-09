require('dotenv').config();
const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const mysql = require('mysql2/promise');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// MIDDLEWARE
// ============================================================
app.use(express.json());
app.use(cors({
  origin: [
    'https://ec0301-globalskillscert.onrender.com',
    'https://ec0301-globalskillscert-frontend.onrender.com',
    'http://localhost:3000',
    'http://localhost:5500',
    'http://127.0.0.1:5500'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// ============================================================
// VALIDAR STRIPE CONFIGURADO
// ============================================================
if (!process.env.STRIPE_SECRET_KEY) {
  console.error('❌ ERROR CRÍTICO: STRIPE_SECRET_KEY no configurada');
  process.exit(1);
}

if (!process.env.STRIPE_SECRET_KEY.startsWith('sk_test_') && !process.env.STRIPE_SECRET_KEY.startsWith('sk_live_')) {
  console.error('❌ ERROR: STRIPE_SECRET_KEY tiene formato inválido');
  process.exit(1);
}

console.log('✅ Stripe configurado correctamente');

// ============================================================
// MYSQL POOL
// ============================================================
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  database: process.env.DB_NAME,
  password: process.env.DB_PASS,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// ============================================================
// FUNCIONES AUXILIARES
// ============================================================

// Generar código de acceso aleatorio (8 caracteres)
function generarCodigoAcceso() {
  return Math.random().toString(36).substr(2, 8).toUpperCase();
}

// Guardar código de acceso en BD
async function guardarCodigoAcceso(email, accessCode) {
  const sql = `INSERT INTO codigos_acceso (email, codigo, fecha_generacion, expiracion)
    VALUES (?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 1 YEAR))
    ON DUPLICATE KEY UPDATE codigo = VALUES(codigo), fecha_generacion = VALUES(fecha_generacion),
    expiracion = VALUES(expiracion)`;
  const conn = await pool.getConnection();
  try {
    await conn.execute(sql, [email, accessCode]);
    console.log(`✅ Código guardado para: ${email}`);
  } finally {
    conn.release();
  }
}

// Registrar transacción de pago
async function registrarTransaccion(email, monto, referencia) {
  const sql = `INSERT INTO transacciones_pagos (email, monto, referencia, fecha)
    VALUES (?, ?, ?, NOW())`;
  const conn = await pool.getConnection();
  try {
    await conn.execute(sql, [email, monto, referencia]);
    console.log(`✅ Transacción registrada: ${referencia}`);
  } finally {
    conn.release();
  }
}

// Log de actividad
async function logActividad(email, accion, detalles) {
  const sql = `INSERT INTO logs_actividad (email, accion, detalles, fecha)
    VALUES (?, ?, ?, NOW())`;
  const conn = await pool.getConnection();
  try {
    await conn.execute(sql, [email, accion, detalles]);
  } finally {
    conn.release();
  }
}

// ============================================================
// RUTAS
// ============================================================

// Health Check
app.get('/health', async (req, res) => {
  let stripeStatus = 'not checked';
  try {
    const account = await stripe.accounts.retrieve();
    stripeStatus = account.id ? 'ok' : 'fail';
  } catch (e) {
    stripeStatus = 'fail: ' + e.message;
  }
  res.status(200).json({
    status: 'ok',
    stripe: stripeStatus,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    version: '2.0.0'
  });
});

// ============================================================
// CREAR SESIÓN DE PAGO CON STRIPE
// ============================================================
app.post('/create-checkout-session', async (req, res) => {
  try {
    console.log('📨 Solicitud recibida:', {
      origen: req.headers.origin,
      timestamp: new Date().toISOString()
    });

    // Validar configuración de Stripe
    if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_SECRET_KEY.startsWith('sk_')) {
      return res.status(500).json({
        error: 'Stripe no configurado correctamente',
        details: 'Verifica STRIPE_SECRET_KEY en .env',
        code: 'STRIPE_CONFIG_ERROR'
      });
    }

    // Extraer y validar email
    const { email, courseName, amount } = req.body;
    
    if (!email || typeof email !== 'string') {
      return res.status(400).json({
        error: 'Email requerido',
        code: 'INVALID_EMAIL'
      });
    }

    const emailLimpio = email.toLowerCase().trim();
    
    if (!emailLimpio.includes('@') || emailLimpio.length < 5) {
      return res.status(400).json({
        error: 'Email inválido',
        code: 'INVALID_EMAIL_FORMAT'
      });
    }

    // Valores por defecto
    const courseTitle = courseName || 'Acceso SkillsCert EC0301';
    const priceInCents = (amount || 500) * 100; // Convertir a centavos

    // Obtener URLs desde variables de entorno o usar defaults
    const frontendUrl = process.env.FRONTEND_URL || 'https://ec0301-globalskillscert.onrender.com';
    const successUrl = `${frontendUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${frontendUrl}/index.html?canceled=true`;

    console.log('💳 Creando sesión Stripe:', {
      email: emailLimpio,
      course: courseTitle,
      amount: amount || 500,
      currency: 'MXN'
    });

    // ✅ CREAR SESIÓN DE STRIPE
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'mxn',
          product_data: {
            name: courseTitle,
            description: 'Acceso completo por 30 días a materiales, evaluaciones y certificación'
          },
          unit_amount: priceInCents,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_email: emailLimpio,
      metadata: {
        email: emailLimpio,
        course: courseTitle,
        timestamp: new Date().toISOString()
      }
    });

    console.log('✅ Sesión Stripe creada:', session.id);

    // Respuesta exitosa
    return res.status(200).json({
      success: true,
      id: session.id,
      url: session.url,
      status: 'session_created',
      email: emailLimpio,
      message: 'Sesión de pago creada exitosamente'
    });

  } catch (error) {
    console.error('❌ Error creando sesión de Stripe:', {
      message: error.message,
      code: error.code,
      type: error.type,
      timestamp: new Date().toISOString()
    });

    // Manejo específico de errores de Stripe
    if (error.type === 'StripeAuthenticationError') {
      return res.status(500).json({
        error: 'Error de autenticación con Stripe',
        code: 'STRIPE_AUTH_ERROR'
      });
    }

    if (error.type === 'StripeConnectionError') {
      return res.status(503).json({
        error: 'No se puede conectar con Stripe',
        code: 'STRIPE_CONNECTION_ERROR'
      });
    }

    // Error genérico
    return res.status(500).json({
      error: 'No se pudo iniciar el proceso de pago',
      details: error.message,
      code: 'CHECKOUT_ERROR',
      type: error.type || 'api_error'
    });
  }
});

// ============================================================
// VERIFICAR PAGO Y GENERAR CÓDIGO DE ACCESO
// ============================================================
app.post('/verify-payment', async (req, res) => {
  const { sessionId } = req.body;
  
  if (!sessionId) {
    return res.status(400).json({
      success: false,
      error: 'SessionId requerido',
      code: 'MISSING_SESSION_ID'
    });
  }

  try {
    console.log('🔍 Verificando pago:', sessionId);

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status === 'paid') {
      const email = session.customer_email;
      
      if (!email) {
        throw new Error('Email no encontrado en la sesión de Stripe');
      }

      const accessCode = generarCodigoAcceso();
      
      // Guardar código en BD
      await guardarCodigoAcceso(email, accessCode);
      
      // Registrar transacción
      await registrarTransaccion(email, session.amount_total / 100, session.id);
      
      // Log de actividad
      await logActividad(email, 'Pago Stripe', `Sesión: ${session.id}`);

      console.log('✅ Pago verificado y código generado para:', email);

      return res.json({
        success: true,
        email,
        accessCode,
        expirationDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        message: 'Pago procesado exitosamente'
      });
    } else {
      return res.json({
        success: false,
        error: 'Pago no completado',
        status: session.payment_status,
        code: 'PAYMENT_NOT_COMPLETED'
      });
    }

  } catch (error) {
    console.error('❌ Error verificando pago:', {
      message: error.message,
      sessionId: sessionId,
      timestamp: new Date().toISOString()
    });

    return res.status(500).json({
      success: false,
      error: error.message,
      code: 'VERIFICATION_ERROR'
    });
  }
});

// ============================================================
// EXPORTAR HELPERS
// ============================================================
module.exports = {
  generarCodigoAcceso,
  guardarCodigoAcceso,
  registrarTransaccion,
  logActividad
};

// ============================================================
// INICIAR SERVIDOR
// ============================================================
app.listen(PORT, () => {
  console.log(`\n${'='.repeat(60)}`);
  console.log('🚀 Servidor SkillsCert EC0301 iniciado');
  console.log(`📍 Puerto: ${PORT}`);
  console.log(`🔌 Stripe: ${process.env.STRIPE_SECRET_KEY?.substring(0, 20)}...`);
  console.log(`🗄️  Base de datos: ${process.env.DB_NAME || 'no configurada'}`);
  console.log(`${'='.repeat(60)}\n`);
});
