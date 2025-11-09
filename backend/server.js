require('dotenv').config();
const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const mysql = require('mysql2/promise');
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10
});

const app = express();
const PORT = process.env.PORT || 10000;

// =========================
// MIDDLEWARES
// =========================
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// ========================
// UTILS (DB functions)
// ========================
async function guardarCodigoAccesso(email, code) {
  await pool.execute(
    "INSERT INTO access_codes (email, code, created_at, expires_at, status) VALUES (?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 1 YEAR), 1)",
    [email, code]
  );
}

async function verificarCodigoAccesso(email, accessCode) {
  const [rows] = await pool.execute(
    "SELECT * FROM access_codes WHERE email=? AND code=? AND status=1 AND expires_at>NOW() LIMIT 1",
    [email, accessCode]
  );
  return rows.length > 0;
}

async function registrarTransaccion(email, amount, referencia) {
  await pool.execute(
    "INSERT INTO transacciones (email, amount, referencia, fecha) VALUES (?, ?, ?, NOW())",
    [email, amount, referencia]
  );
}

async function registrarModulo(email, modulo, avance) {
  await pool.execute(
    "INSERT INTO modulos_completados (email, modulo, avance, completado_en) VALUES (?, ?, ?, NOW())",
    [email, modulo, avance]
  );
}

async function logActividad(email, accion, info) {
  await pool.execute(
    "INSERT INTO logs_actividad (usuario, accion, detalles, fecha) VALUES (?, ?, ?, NOW())",
    [email, accion, info]
  );
}

// ========================
// HEALTH CHECK Mejorado
// ========================
app.get('/health', async (req, res) => {
  let stripeStatus = 'not checked';
  try {
    const account = await stripe.accounts.retrieve(); // prueba real de conexión a Stripe
    stripeStatus = account.id ? 'ok' : 'fail';
  } catch (e) {
    stripeStatus = 'fail: ' + e.message;
  }
  res.status(200).json({
    status: 'ok',
    stripe: stripeStatus,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0'
  });
});

// ========================
// CREATE CHECKOUT SESSION
// ========================
app.post('/create-checkout-session', async (req, res) => {
  try {
    if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_SECRET_KEY.startsWith('sk_')) {
      return res.status(500).json({
        error: 'Stripe no configurado correctamente',
        details: 'Verifica STRIPE_SECRET_KEY en .env'
      });
    }
    const email = req.body.email;
    const origin = req.headers.origin || 'https://ec0301-globalskillscert-backend.onrender.com';
    const successUrl = `${origin}/success.html?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${origin}/index.html?canceled=true`;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'mxn',
          product_data: {
            name: 'Acceso SkillsCert EC0301',
            description: 'Curso, acceso por 1 año',
          },
          unit_amount: 50000,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_email: email,
      metadata: {
        sistema: 'ec0301',
        email,
        timestamp: new Date().toISOString()
      }
    });
    res.status(200).json({
      success: true,
      id: session.id,
      url: session.url
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      type: error.type || 'api_error',
      code: error.code || 'unknown_error'
    });
  }
});

// ========================
// VERIFY PAYMENT AND GENERATE ACCESS CODE
// ========================
app.post('/verify-payment', async (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) return res.status(400).json({ success: false, error: 'SessionId requerido' });

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status === 'paid') {
      const email = session.customer_details.email;
      const accessCode = generarCodigoAcceso();
      await guardarCodigoAccesso(email, accessCode);
      await registrarTransaccion(email, session.amount_total, session.id);
      await logActividad(email, 'Pago Stripe', `Referencia: ${session.id}`);
      res.json({
        success: true,
        email,
        accessCode,
        expirationDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
      });
    } else {
      res.json({ success: false, error: 'Pago no completado', status: session.payment_status });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

function generarCodigoAcceso() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
}

// ========================
// LOGIN
// ========================
app.post('/login', async (req, res) => {
  const { email, accessCode } = req.body;
  if (!email || !accessCode) return res.status(400).json({ success: false, error: 'Email y código requerido' });
  try {
    if (await verificarCodigoAccesso(email, accessCode)) {
      await logActividad(email, 'Login', `Code: ${accessCode}`);
      return res.json({ success: true, token: Buffer.from(email + Date.now()).toString('base64') });
    } else {
      res.status(401).json({ success: false, error: 'Código inválido o expirado' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========================
// MODULO-COMPLETADO
// ========================
app.post('/modulo-completado', async (req, res) => {
  const { email, modulo, avance } = req.body;
  try {
    await registrarModulo(email, modulo, avance);
    await logActividad(email, 'Módulo completado', `Módulo: ${modulo}, Avance: ${avance}`);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========================
// ERROR/404 Handlers
// ========================
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Endpoint no encontrado',
    path: req.path,
    method: req.method
  });
});
app.use((error, req, res, next) => {
  res.status(500).json({ error: 'Error interno', message: error.message });
});

// ========================
// Arranque Server
// ========================
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Backend EC0301 listo en puerto ${PORT}`);
});

process.on('unhandledRejection', error => {
  console.error('❌ Unhandled Rejection:', error);
});
process.on('uncaughtException', error => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});
