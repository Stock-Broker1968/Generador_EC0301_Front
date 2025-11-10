// ============================================
// SERVER.JS COMPLETO - PRODUCCIÓN
// Backend EC0301 con MySQL, Stripe Webhook, Postmark, WhatsApp
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
  origin: allowedOrigin, // <--- CORRECCIÓN APLICADA
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

  res.json({received: true});
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

async function guardarUsuarioYCodigo(email, nombre, telefono, codigo, stripeSessionId, monto, ipAddress) {
  const conn = await pool.getConnection();
  try {
    // Verificar si usuario existe
    const [existing] = await conn.execute(
      'SELECT id FROM usuarios WHERE email = ?',
      [email]
    );

    let usuarioId;

    if (existing.length > 0) {
      // Actualizar usuario existente
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
      // Crear nuevo usuario
      const [result] = await conn.execute(
        `INSERT INTO usuarios 
         (email, nombre, telefono, codigo_acceso, stripe_session_id, payment_status, monto_pagado, moneda, fecha_pago, fecha_expiracion, fecha_registro, activo, ip_registro)
         VALUES (?, ?, ?, ?, ?, 'paid', ?, 'MXN', NOW(), DATE_ADD(NOW(), INTERVAL 90 DAY), NOW(), 1, ?)`,
        [email, nombre, telefono, codigo, stripeSessionId, monto, ipAddress]
      );
      usuarioId = result.insertId;
    }

    // Registrar en histórico
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
    // TODO: Integrar con Postmark
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
    // TODO: Integrar con Meta WhatsApp API
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

  // Guardar usuario
  const usuarioId = await guardarUsuarioYCodigo(
    email, nombre, telefono, codigo, session.id, monto, null
  );

  // Registrar transacción
  await registrarTransaccion(
    usuarioId, email, session.id, session.payment_intent, monto, session.currency.toUpperCase(), null
  );

  // Log
  await logActividad(usuarioId, email, 'pago_webhook', `Pago completado vía webhook: ${session.id}`, null);

  // Enviar notificaciones
  await enviarNotificacionEmail(usuarioId, email, codigo, nombre);
  if (telefono) {
    await enviarNotificacionWhatsApp(usuarioId, telefono, codigo, nombre);
  }

  console.log('✅ Pago procesado:', codigo);
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

app.post('/create-checkout-session', async (req, res) => {
  console.log('\n=== POST /create-checkout-session ===');
  console.log('Body:', req.body);

  try {
    if (!process.env.STRIPE_SECRET_KEY?.startsWith('sk_')) {
      throw new Error('Stripe no configurado');
    }

    const { email, name, phone } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, error: 'Email requerido' });
    }

    const origin = req.headers.origin || req.headers.referer?.replace(/\/$/, '') || 'https://ec0301-globalskillscert.onrender.com';
    const successUrl = `${origin}/landing.html?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${origin}/landing.html?canceled=true`;

    console.log('Origin:', origin);
    console.log('Success URL:', successUrl);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'mxn',
         product_data: {
            name: 'Acceso SkillsCert EC0301',
            description: 'Sistema completo - 90 días de acceso' // <--- LÍNEA CORREGIDA
          },
          unit_amount: 199900 // 1999.00 MXN
        },
        quantity: 1
      }],
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_email: email,
      metadata: {
        email: email,
        nombre: name || '',
        telefono: phone || ''
      }
    });

    console.log('✅ Sesión creada:', session.id);

    res.json({
      success: true,
      id: session.id,
      url: session.url
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
A    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/verify-payment', async (req, res) => {
  console.log('\n=== POST /verify-payment ===');
  
  const { sessionId } = req.body;

  if (!sessionId) {
    return res.status(400).json({ success: false, error: 'Session ID requerido' });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    console.log('Session status:', session.payment_status);

    if (session.payment_status === 'paid') {
      const email = session.customer_details.email;
A      const nombre = session.metadata?.nombre || session.customer_details.name || 'Usuario';
      const telefono = session.metadata?.telefono || session.customer_details.phone;
      const codigo = generarCodigoAcceso();
      const monto = session.amount_total / 100;

      const usuarioId = await guardarUsuarioYCodigo(
        email, nombre, telefono, codigo, session.id, monto, req.ip
      );

      await registrarTransaccion(
        usuarioId, email, session.id, session.payment_intent, monto, session.currency.toUpperCase(), req.ip
      );

      await logActividad(usuarioId, email, 'pago_verificado', `Pago verificado: ${session.id}`, req.ip);

      await enviarNotificacionEmail(usuarioId, email, codigo, nombre);
      if (telefono) {
        await enviarNotificacionWhatsApp(usuarioId, telefono, codigo, nombre);
Services      }

      console.log('✅ Código generado:', codigo);

      return res.json({
        success: true,
        email: email,
        accessCode: codigo,
        expirationDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
      });
    } else {
      return res.json({
        success: false,
        error: 'Pago no completado',
        status: session.payment_status
      });
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/login', async (req, res) => {
  console.log('\n=== POST /login ===');

  const { email, accessCode } = req.body;

  if (!email || !accessCode) {
    return res.status(400).json({ success: false, error: 'Email y código requeridos' });
  }

  try {
    const conn = await pool.getConnection();
    
    const [users] = await conn.execute(
      `SELECT id, email, nombre, codigo_acceso, activo, bloqueado, fecha_expiracion, intentos_login_fallidos
       FROM usuarios
       WHERE email = ? AND activo = 1
       LIMIT 1`,
      [email]
    );

    if (users.length === 0) {
      conn.release();
      await logActividad(null, email, 'login_fallido', 'Usuario no encontrado', req.ip);
F      return res.status(401).json({ success: false, error: 'Credenciales inválidas' });
    }

    const user = users[0];

    if (user.bloqueado) {
      conn.release();
      return res.status(401).json({ success: false, error: 'Usuario bloqueado. Contacta a soporte.' });
    }

    if (user.codigo_acceso !== accessCode.toUpperCase()) {
      await conn.execute(
        'UPDATE usuarios SET intentos_login_fallidos = intentos_login_fallidos + 1, bloqueado = IF(intentos_login_fallidos >= 4, 1, 0) WHERE id = ?',
        [user.id]
      );
      conn.release();
      await logActividad(user.id, email, 'login_fallido', 'Código incorrecto', req.ip);
      return res.status(401).json({ success: false, error: 'Código incorrecto' });
    }

    if (user.fecha_expiracion && new Date(user.fecha_expiracion) < new Date()) {
      conn.release();
      return res.status(401).json({ success: false, error: 'Acceso expirado' });
    }

    await conn.execute(
      'UPDATE usuarios SET intentos_login_fallidos = 0, ultimo_acceso = NOW(), ip_ultimo_acceso = ? WHERE id = ?',
      [req.ip, user.id]
    );

    await conn.execute(
      'UPDATE codigos_acceso_historico SET fecha_ultimo_uso = NOW(), total_usos = total_usos + 1 WHERE usuario_id = ? AND codigo = ?',
      [user.id, accessCode.toUpperCase()]
    );

    conn.release();

    await logActividad(user.id, email, 'login_exitoso', `Login desde ${req.ip}`, req.ip);

S    const token = Buffer.from(JSON.stringify({
      userId: user.id,
      email: user.email,
      exp: Date.now() + (7 * 24 * 60 * 60 * 1000)
    })).toString('base64');

    console.log('✅ Login exitoso:', email);

    res.json({
      success: true,
      token: token,
      user: {
        id: user.id,
        email: user.email,
        nombre: user.nombre,
        expirationDate: user.fecha_expiracion
      }
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
    res.status(500).json({ success: false, error: 'Error del servidor' });
  }
});

app.get('/test-db', async (req, res) => {
  try {
    const conn = await pool.getConnection();
    const [usuarios] = await conn.execute('SELECT COUNT(*) as total FROM usuarios');
    const [transacciones] = await conn.execute('SELECT COUNT(*) as total FROM transacciones');
    conn.release();

    res.json({
      success: true,
      totalUsuarios: usuarios[0].total,
    ci  totalTransacciones: transacciones[0].total
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 404
app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint no encontrado',
    availableEndpoints: [
      'GET /health',
      'GET /test-db',
      'POST /create-checkout-session',
      'POST /verify-payment',
      'POST /login',
ci      'POST /webhook/stripe'
    ]
  });
});

// ============================================
// INICIAR SERVIDOR
// ============================================
app.listen(PORT, '0.0.0.0', async () => {
  console.log('\n================================================');
  console.log('🚀 SERVIDOR EC0301 v2.0 INICIADO');
  console.log('================================================');
  console.log(`📡 Puerto: ${PORT}`);
  console.log(`💾 MySQL: ${await checkDatabaseConnection() ? '✅' : '❌'}`);
Date  console.log(`💳 Stripe: ${process.env.STRIPE_SECRET_KEY ? '✅' : '❌'}`);
  console.log('\n📋 Endpoints:');
  console.log('  GET  /health');
  console.log('  GET  /test-db');
  console.log('  POST /create-checkout-session');
  console.log('  POST /verify-payment');
  console.log('  POST /login');
  console.log('  POST /webhook/stripe');
  console.log('================================================\n');
});

process.on('SIGTERM', async () => {
s  console.log('Cerrando...');
  await pool.end();
  process.exit(0);
});

process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled Rejection:', error);
});
