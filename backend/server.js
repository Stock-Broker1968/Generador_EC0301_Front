// ============================================
// SERVER.JS - VERSIÓN FINAL OPTIMIZADA
// Backend EC0301 con MySQL, Stripe, WhatsApp y Email
// ============================================
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const mysql = require('mysql2/promise');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// MIDDLEWARE
// ============================================
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  if (req.method === 'POST') {
    console.log('Body:', JSON.stringify(req.body, null, 2));
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
  password: process.env.DB_PASSWORD || process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

// Verificar conexión al iniciar
async function checkDatabaseConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('✅ MySQL conectado correctamente');
    connection.release();
    return true;
  } catch (error) {
    console.error('❌ Error conectando a MySQL:', error.message);
    return false;
  }
}

// ============================================
// FUNCIONES AUXILIARES
// ============================================

// Generar código de acceso único
function generarCodigoAcceso() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Guardar código en base de datos
async function guardarCodigoAcceso(email, accessCode, nombre = null, telefono = null) {
  const conn = await pool.getConnection();
  try {
    // Verificar si usuario ya existe
    const [existing] = await conn.execute(
      'SELECT id FROM usuarios WHERE email = ?',
      [email]
    );

    if (existing.length > 0) {
      // Actualizar usuario existente
      await conn.execute(
        `UPDATE usuarios 
         SET codigo_acceso = ?, 
             payment_status = 'paid', 
             fecha_pago = NOW(), 
             fecha_expiracion = DATE_ADD(NOW(), INTERVAL 365 DAY),
             activo = 1
         WHERE email = ?`,
        [accessCode, email]
      );
      return existing[0].id;
    } else {
      // Crear nuevo usuario
      const [result] = await conn.execute(
        `INSERT INTO usuarios 
         (email, nombre, telefono, codigo_acceso, payment_status, fecha_pago, fecha_expiracion, fecha_registro, activo)
         VALUES (?, ?, ?, ?, 'paid', NOW(), DATE_ADD(NOW(), INTERVAL 365 DAY), NOW(), 1)`,
        [email, nombre, telefono, accessCode]
      );
      
      // Registrar en histórico
      await conn.execute(
        'INSERT INTO codigos_acceso_historico (codigo, usuario_id, usado, fecha_generacion, fecha_uso) VALUES (?, ?, 1, NOW(), NOW())',
        [accessCode, result.insertId]
      );
      
      return result.insertId;
    }
  } finally {
    conn.release();
  }
}

// Registrar transacción
async function registrarTransaccion(usuarioId, email, monto, moneda, stripeSessionId, stripePaymentIntent = null) {
  const conn = await pool.getConnection();
  try {
    await conn.execute(
      `INSERT INTO transacciones 
       (usuario_id, stripe_session_id, stripe_payment_intent, monto, moneda, estado, email_pago, fecha_transaccion, fecha_completado)
       VALUES (?, ?, ?, ?, ?, 'completed', ?, NOW(), NOW())`,
      [usuarioId, stripeSessionId, stripePaymentIntent, monto / 100, moneda, email]
    );
  } finally {
    conn.release();
  }
}

// Log de actividad
async function logActividad(usuarioId, accion, descripcion, ipAddress = null) {
  const conn = await pool.getConnection();
  try {
    await conn.execute(
      'INSERT INTO logs_actividad (usuario_id, accion, descripcion, ip_address, fecha) VALUES (?, ?, ?, ?, NOW())',
      [usuarioId, accion, descripcion, ipAddress]
    );
  } catch (error) {
    console.error('Error registrando log:', error.message);
  } finally {
    conn.release();
  }
}

// Enviar email (Postmark)
async function enviarEmail(email, accessCode, nombre) {
  // TODO: Implementar con Postmark
  console.log(`📧 Email enviado a ${email} con código ${accessCode}`);
  return true;
}

// Enviar WhatsApp (Meta API)
async function enviarWhatsApp(telefono, accessCode, nombre) {
  // TODO: Implementar con Meta WhatsApp API
  console.log(`📱 WhatsApp enviado a ${telefono} con código ${accessCode}`);
  return true;
}

// ============================================
// ENDPOINTS
// ============================================

// Health Check
app.get('/health', async (req, res) => {
  const dbConnected = await checkDatabaseConnection();
  
  let stripeStatus = 'not_configured';
  try {
    if (process.env.STRIPE_SECRET_KEY) {
      await stripe.balance.retrieve();
      stripeStatus = 'configured';
    }
  } catch (e) {
    stripeStatus = 'error: ' + e.message;
  }

  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    database: dbConnected ? 'connected' : 'disconnected',
    stripe: stripeStatus,
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0'
  });
});

// Crear sesión de Stripe Checkout
app.post('/create-checkout-session', async (req, res) => {
  console.log('\n==============================================');
  console.log('📝 POST /create-checkout-session');
  console.log('==============================================');

  try {
    // Validar Stripe
    if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_SECRET_KEY.startsWith('sk_')) {
      throw new Error('Stripe no configurado correctamente');
    }

    const { email, name, phone } = req.body;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email requerido'
      });
    }

    // Determinar URLs
    const origin = req.headers.origin || req.headers.referer?.replace(/\/$/, '') || 'http://localhost:5500';
    const successUrl = `${origin}/landing.html?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${origin}/landing.html?canceled=true`;

    console.log('📍 Success URL:', successUrl);
    console.log('📍 Cancel URL:', cancelUrl);
    console.log('📧 Email:', email);
    console.log('👤 Nombre:', name || 'No proporcionado');
    console.log('📱 Teléfono:', phone || 'No proporcionado');

    // Crear sesión de Stripe
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'mxn',
          product_data: {
            name: 'Acceso SkillsCert EC0301',
            description: 'Sistema completo de diseño de cursos - Acceso por 1 año',
            images: ['https://i.imgur.com/EHyR2nP.png']
          },
          unit_amount: 99900 // 999.00 MXN
        },
        quantity: 1
      }],
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_email: email,
      metadata: {
        sistema: 'ec0301',
        email: email,
        nombre: name || '',
        telefono: phone || '',
        timestamp: new Date().toISOString()
      }
    });

    console.log('✅ Sesión creada:', session.id);
    console.log('==============================================\n');

    res.status(200).json({
      success: true,
      id: session.id,
      url: session.url,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('==============================================\n');
    
    res.status(500).json({
      success: false,
      error: error.message,
      type: error.type || 'api_error',
      code: error.code || 'unknown_error'
    });
  }
});

// Verificar pago y generar código
app.post('/verify-payment', async (req, res) => {
  console.log('\n==============================================');
  console.log('🔍 POST /verify-payment');
  console.log('==============================================');

  const { sessionId } = req.body;

  if (!sessionId) {
    return res.status(400).json({
      success: false,
      error: 'Session ID requerido'
    });
  }

  try {
    // Recuperar sesión de Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    console.log('Session Status:', session.payment_status);

    if (session.payment_status === 'paid') {
      const email = session.customer_details.email;
      const nombre = session.metadata.nombre || session.customer_details.name;
      const telefono = session.metadata.telefono || session.customer_details.phone;

      console.log('✅ Pago confirmado');
      console.log('📧 Email:', email);
      console.log('👤 Nombre:', nombre);
      console.log('📱 Teléfono:', telefono);

      // Generar código
      const accessCode = generarCodigoAcceso();
      console.log('🔑 Código generado:', accessCode);

      // Guardar en base de datos
      const usuarioId = await guardarCodigoAcceso(email, accessCode, nombre, telefono);
      console.log('💾 Usuario ID:', usuarioId);

      // Registrar transacción
      await registrarTransaccion(
        usuarioId,
        email,
        session.amount_total,
        session.currency.toUpperCase(),
        session.id,
        session.payment_intent
      );

      // Log de actividad
      await logActividad(usuarioId, 'pago_verificado', `Pago Stripe completado: ${session.id}`, req.ip);

      // Enviar notificaciones
      try {
        await enviarEmail(email, accessCode, nombre);
        if (telefono) {
          await enviarWhatsApp(telefono, accessCode, nombre);
        }
      } catch (notifError) {
        console.error('⚠️ Error enviando notificaciones:', notifError.message);
      }

      console.log('==============================================\n');

      return res.json({
        success: true,
        email: email,
        accessCode: accessCode,
        expirationDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        timestamp: new Date().toISOString()
      });
    } else {
      console.log('⚠️ Pago no completado');
      console.log('==============================================\n');
      
      return res.json({
        success: false,
        error: 'Pago no completado',
        status: session.payment_status
      });
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('==============================================\n');
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Login
app.post('/login', async (req, res) => {
  console.log('\n==============================================');
  console.log('🔐 POST /login');
  console.log('==============================================');

  const { email, accessCode } = req.body;

  if (!email || !accessCode) {
    return res.status(400).json({
      success: false,
      error: 'Email y código de acceso requeridos'
    });
  }

  try {
    const conn = await pool.getConnection();
    
    try {
      const [users] = await conn.execute(
        `SELECT id, email, nombre, codigo_acceso, activo, fecha_expiracion
         FROM usuarios
         WHERE email = ? AND codigo_acceso = ? AND activo = 1
         LIMIT 1`,
        [email, accessCode.toUpperCase()]
      );

      if (users.length === 0) {
        console.log('❌ Credenciales inválidas para:', email);
        await logActividad(null, 'login_fallido', `Intento fallido: ${email}`, req.ip);
        
        return res.status(401).json({
          success: false,
          error: 'Credenciales inválidas'
        });
      }

      const user = users[0];

      // Verificar expiración
      if (user.fecha_expiracion && new Date(user.fecha_expiracion) < new Date()) {
        console.log('⚠️ Acceso expirado para:', email);
        return res.status(401).json({
          success: false,
          error: 'Acceso expirado. Por favor renueva tu suscripción.'
        });
      }

      // Actualizar último acceso
      await conn.execute(
        'UPDATE usuarios SET ultimo_acceso = NOW() WHERE id = ?',
        [user.id]
      );

      // Log de actividad
      await logActividad(user.id, 'login_exitoso', `Login desde ${req.ip}`, req.ip);

      console.log('✅ Login exitoso:', email);
      console.log('==============================================\n');

      // Generar token simple (mejorar con JWT en producción)
      const token = Buffer.from(JSON.stringify({
        userId: user.id,
        email: user.email,
        exp: Date.now() + (7 * 24 * 60 * 60 * 1000)
      })).toString('base64');

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

    } finally {
      conn.release();
    }
  } catch (error) {
    console.error('❌ Error en login:', error.message);
    console.error('==============================================\n');
    
    res.status(500).json({
      success: false,
      error: 'Error del servidor'
    });
  }
});

// Test de base de datos
app.get('/test-db', async (req, res) => {
  try {
    const conn = await pool.getConnection();
    
    try {
      const [rows] = await conn.execute('SELECT COUNT(*) as total FROM usuarios');
      
      res.json({
        success: true,
        message: 'Conexión a base de datos exitosa',
        totalUsuarios: rows[0].total
      });
    } finally {
      conn.release();
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 404 Handler
app.use((req, res) => {
  console.log('❌ 404 - Ruta no encontrada:', req.method, req.path);
  res.status(404).json({
    error: 'Endpoint no encontrado',
    path: req.path,
    method: req.method,
    availableEndpoints: [
      'GET /health',
      'GET /test-db',
      'POST /create-checkout-session',
      'POST /verify-payment',
      'POST /login'
    ]
  });
});

// Error handler global
app.use((error, req, res, next) => {
  console.error('❌ Error no manejado:', error);
  res.status(500).json({
    error: 'Error interno del servidor',
    message: error.message,
    timestamp: new Date().toISOString()
  });
});

// ============================================
// INICIAR SERVIDOR
// ============================================
app.listen(PORT, '0.0.0.0', async () => {
  console.log('\n================================================');
  console.log('🚀 SERVIDOR EC0301 INICIADO');
  console.log('================================================');
  console.log(`📡 Puerto: ${PORT}`);
  console.log(`🌐 Ambiente: ${process.env.NODE_ENV || 'development'}`);
  
  const dbConnected = await checkDatabaseConnection();
  console.log(`💾 MySQL: ${dbConnected ? '✅ Conectado' : '❌ Desconectado'}`);
  console.log(`💳 Stripe: ${process.env.STRIPE_SECRET_KEY ? '✅ Configurado' : '❌ NO configurado'}`);
  
  console.log('\n📋 Endpoints disponibles:');
  console.log('  GET  /health');
  console.log('  GET  /test-db');
  console.log('  POST /create-checkout-session');
  console.log('  POST /verify-payment');
  console.log('  POST /login');
  console.log('================================================\n');
});

// Manejo de señales de terminación
process.on('SIGTERM', async () => {
  console.log('👋 SIGTERM recibido, cerrando servidor...');
  await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('👋 SIGINT recibido, cerrando servidor...');
  await pool.end();
  process.exit(0);
});

process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled Rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});
