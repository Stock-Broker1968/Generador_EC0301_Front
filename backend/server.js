require('dotenv').config();
const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const mysql = require('mysql2/promise');

const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json());
app.use(cors());

// MySQL pool
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  database: process.env.DB_NAME,
  password: process.env.DB_PASS,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Función para generar un código de acceso aleatorio (8 caracteres)
function generarCodigoAcceso() {
  return Math.random().toString(36).substr(2, 8).toUpperCase();
}

// Función para guardar el código de acceso en la base de datos
async function guardarCodigoAccesso(email, accessCode) {
  const sql = `INSERT INTO codigos_acceso (email, codigo, fecha_generacion, expiracion)
               VALUES (?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 1 YEAR))
               ON DUPLICATE KEY UPDATE codigo = VALUES(codigo), fecha_generacion = VALUES(fecha_generacion),
               expiracion = VALUES(expiracion)`;
  const conn = await pool.getConnection();
  try {
    await conn.execute(sql, [email, accessCode]);
  } finally {
    conn.release();
  }
}

// Función para registrar la transacción de pago
async function registrarTransaccion(email, monto, referencia) {
  const sql = `INSERT INTO transacciones_pagos (email, monto, referencia, fecha)
               VALUES (?, ?, ?, NOW())`;
  const conn = await pool.getConnection();
  try {
    await conn.execute(sql, [email, monto, referencia]);
  } finally {
    conn.release();
  }
}

// Función para log de actividad
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

// Ruta de health check mejorada
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
    version: '1.0.0'
  });
});

// Crear sesión de pago con Stripe
app.post('/create-checkout-session', async (req, res) => {
  try {
    if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_SECRET_KEY.startsWith('sk_')) {
      return res.status(500).json({ error: 'Stripe no configurado correctamente', details: 'Verifica STRIPE_SECRET_KEY en .env' });
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
          product_data: { name: 'Acceso SkillsCert EC0301', description: 'Curso, acceso por 1 año' },
          unit_amount: 50000,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_email: email,
      metadata: { sistema: 'ec0301', email, timestamp: new Date().toISOString() }
    });

    res.status(200).json({ success: true, id: session.id, url: session.url });
  } catch (error) {
    res.status(500).json({ error: error.message, type: error.type || 'api_error', code: error.code || 'unknown_error' });
  }
});

// Verificación de pago y generación de código de acceso
app.post('/verify-payment', async (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId)
    return res.status(400).json({ success: false, error: 'SessionId requerido' });

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
        expirationDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      });
    } else {
      res.json({ success: false, error: 'Pago no completado', status: session.payment_status });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, type: error.type || 'api_error', code: error.code || 'unknown_error' });
  }
});

// Exportar helpers si usarás en otros módulos:
module.exports = {
  generarCodigoAcceso,
  guardarCodigoAccesso,
  registrarTransaccion,
  logActividad
};

// Lanzar el servidor
app.listen(PORT, () => {
  console.log(`Servidor escuchando en puerto ${PORT}`);
});
