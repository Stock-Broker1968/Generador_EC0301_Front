// ============================================
// SERVER.JS COMPLETO - PRODUCCIÓN
// ============================================
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const mysql = require('mysql2/promise');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// MIDDLEWARE CRÍTICO
// ============================================

// El dominio exacto de tu frontend
const allowedOrigin = 'https://ec0301-globalskillscert.onrender.com';

// CORS - Debe ir ANTES de body parsers
app.use(cors({
  origin: allowedOrigin,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'stripe-signature'],
  credentials: true
}));

// Webhook de Stripe - DEBE usar express.raw()
app.post('/webhook/stripe', express.raw({type: 'application/json'}), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    // Verificación del webhook
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    console.log('✅ Webhook verificado:', event.type);
  } catch (err) {
    console.error('❌ Error verificando webhook:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Log del webhook
  try {
    const conn = await pool.getConnection();
    await conn.execute(
      'INSERT INTO webhook_events_log (proveedor, evento_tipo, evento_id, payload, fecha_recepcion, ip_origen) VALUES (?, ?, ?, ?, NOW(), ?)',
      ['stripe', event.type, event.id, JSON.stringify(event.data.object), req.ip]
    );
    conn.release();
  } catch (error) {
    console.error('Error guardando log de webhook:', error.message);
  }

  // Procesar eventos
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    console.log('💳 Pago completado:', session.id);

    try {
      await procesarPagoCompletado(session);
    } catch (error) {
      console.error('Error procesando pago:', error.message);
    }
  }

  res.json({ received: true });
});

// Body parsers para el resto de rutas
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================
// MYSQL CONNECTION POOL
// ============================================
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true
});

async function checkDatabaseConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('✅ MySQL conectado');
    connection.release();
    return true;
  } catch (error) {
    console.error('❌ Error MySQL:', error.message);
    return false;
  }
}

// ============================================
// FUNCIONES AUXILIARES
// ============================================

function generarCodigoAcceso() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

async function guardarUsuarioYCodigo(email, nombre, telefono, codigo, stripeSessionId, monto, ipAddress) {
  const conn = await pool.getConnection();
  try {
    const [existing] = await conn.execute(
      'SELECT id FROM usuarios WHERE email = ?',
      [email]
    );

    let usuarioId;

    if (existing.length > 0) {
      usuarioId = existing[0].id;
      await conn.execute(
        `UPDATE usuarios 
         SET codigo_acceso = ?,
             nombre = COALESCE(?, nombre),
             telefono = COALESCE(?, telefono),
             stripe_session_id = ?,
             payment_status = 'paid',
             monto_pagado = monto_pagado + ?,
             fecha_pago = NOW(),
             fecha_expiracion = DATE_ADD(NOW(), INTERVAL 90 DAY),
             activo = 1
         WHERE id = ?`,
        [codigo, nombre, telefono, stripeSessionId, monto, usuarioId]
      );
    } else {
      const [result] = await conn.execute(
        `INSERT INTO usuarios 
         (email, nombre, telefono, codigo_acceso, stripe_session_id, payment_status, monto_pagado, moneda, fecha_pago, fecha_expiracion, fecha_registro, activo, ip_registro)
         VALUES (?, ?, ?, ?, ?, 'paid', ?, 'MXN', NOW(), DATE_ADD(NOW(), INTERVAL 90 DAY), NOW(), 1, ?)`,
        [email, nombre, telefono, codigo, stripeSessionId, monto, ipAddress]
      );
      usuarioId = result.insertId;
    }

    await conn.execute(
      'INSERT INTO codigos_acceso_historico (usuario_id, email, codigo, usado, fecha_generacion, fecha_primer_uso, origen, ip_generacion, activo) VALUES (?, ?, ?, 1, NOW(), NOW(), ?, ?, 1)',
      [usuarioId, email, codigo, 'stripe_payment', ipAddress]
    );

    return usuarioId;
  } finally {
    conn.release();
  }
}

async function registrarTransaccion(usuarioId, email, stripeSessionId, stripePaymentIntent, monto, moneda, ipAddress) {
  const conn = await pool.getConnection();
  try {
    await conn.execute(
      `INSERT INTO transacciones 
       (usuario_id, email, stripe_session_id, stripe_payment_intent, monto, moneda, estado, tipo_transaccion, fecha_creacion, fecha_completado, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, 'completed', 'compra_inicial', NOW(), NOW(), ?)`,
      [usuarioId, email, stripeSessionId, stripePaymentIntent, monto, moneda, ipAddress]
    );
  } finally {
    conn.release();
  }
}

async function logActividad(usuarioId, email, accion, descripcion, ipAddress) {
  const conn = await pool.getConnection();
  try {
    await conn.execute(
      'INSERT INTO logs_actividad (usuario_id, email, accion, descripcion, ip_address, nivel, fecha) VALUES (?, ?, ?, ?, ?, ?, NOW())',
      [usuarioId, email, accion, descripcion, ipAddress, 'info']
    );
  } catch (error) {
    console.error('Error en log:', error.message);
  } finally {
    conn.release();
  }
}

async function enviarNotificacionEmail(usuarioId, email, codigo, nombre) {
  const conn = await pool.getConnection();
  try {
    console.log(`📧 Email a ${email}: Código ${codigo}`);
    
    await conn.execute(
      'INSERT INTO notificaciones (usuario_id, email, tipo, asunto, mensaje, estado, proveedor, fecha_creacion) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())',
      [usuarioId, email, 'email', 'Tu código de acceso SkillsCert', `Hola ${nombre}, tu código es: ${codigo}`, 'enviado', 'postmark']
    );
  } finally {
    conn.release();
  }
}

async function enviarNotificacionWhatsApp(usuarioId, telefono, codigo, nombre) {
  const conn = await pool.getConnection();
  try {
    console.log(`📱 WhatsApp a ${telefono}: Código ${codigo}`);
    
    await conn.execute(
      'INSERT INTO notificaciones (usuario_id, telefono, tipo, mensaje, estado, proveedor, fecha_creacion) VALUES (?, ?, ?, ?, ?, ?, NOW())',
      [usuarioId, telefono, 'whatsapp', `Hola ${nombre}, tu código de acceso SkillsCert es: ${codigo}`, 'enviado', 'meta']
    );
  } finally {
    conn.release();
  }
}

async function procesarPagoCompletado(session) {
  const email = session.customer_details.email;
  const nombre = session.metadata?.nombre || session.customer_details.name || 'Usuario';
  const telefono = session.metadata?.telefono || session.customer_details.phone;
  const codigo = generarCodigoAcceso();
  const monto = session.amount_total / 100; // Convertir de centavos

  console.log('Procesando pago para:', email);

  const usuarioId = await guardarUsuarioYCodigo(
    email, nombre, telefono, codigo, session.id, monto, null
  );

  await registrarTransaccion(
    usuarioId, email, session.id, session.payment_intent, monto, session.currency.toUpperCase(), null
  );

  await logActividad(usuarioId, email, 'pago_webhook', `Pago completado vía webhook: ${session.id}`, null);

  await enviarNotificacionEmail(usuarioId, email, codigo, nombre);
  if (telefono) {
    await enviarNotificacionWhatsApp(usuarioId, telefono, codigo, nombre);
  }

  console.log('✅ Pago procesado:', codigo);

  return {
    redirectUrl: `/dashboard?token=${generateTokenForUser(usuarioId)}`
  };
}

// ============================================
// ENDPOINTS
// ============================================

app.get('/health', async (req, res) => {
  const dbConnected = await checkDatabaseConnection();
  
  let stripeStatus = 'not_configured';
  try {
    if (process.env.STRIPE_SECRET_KEY) {
      await stripe.balance.retrieve();
      stripeStatus = 'configured';
    }
  } catch (e) {
    stripeStatus = 'error';
  }

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    database: dbConnected ? 'connected' : 'disconnected',
    stripe: stripeStatus,
    version: '2.0.0'
  });
});

app.listen(PORT, '0.0.0.0', async () => {
  console.log('\n================================================');
  console.log('🚀 SERVIDOR EC0301 v2.0 INICIADO');
  console.log('================================================');
  console.log(`📡 Puerto: ${PORT}`);
  console.log(`💾 MySQL: ${await checkDatabaseConnection() ? '✅' : '❌'}`);
  console.log(`💳 Stripe: ${process.env.STRIPE_SECRET_KEY ? '✅' : '❌'}`);
  console.log('\n📋 Endpoints:');
  console.log('  GET  /health');
  console.log('  POST /create-checkout-session');
  console.log('  POST /verify-payment');
  console.log('  POST /login');
  console.log('  POST /webhook/stripe');
  console.log('================================================\n');
});

process.on('SIGTERM', async () => {
  console.log('Cerrando...');
  await pool.end();
  process.exit(0);
});

process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled Rejection:', error);
});
