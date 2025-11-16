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

// Logging middleware
app.use((req, res, next) => {
  if (req.path !== '/webhook/stripe') {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  }
  next();
});

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

// Funciones para guardar usuario, registrar transacciones, log de actividad, y enviar notificaciones via email y WhatsApp (las funciones de `guardarUsuarioYCodigo`, `registrarTransaccion`, etc., siguen igual)
...

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
