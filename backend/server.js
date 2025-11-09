// ============================================
// ARCHIVO: backend/server.js
// Backend EC0301 con MySQL (Hostinger)
// ============================================
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const mysql = require('mysql2/promise');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// CONFIGURACIÓN DE BASE DE DATOS
// ============================================
const dbConfig = {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
};

// Pool de conexiones
const pool = mysql.createPool(dbConfig);

// Función para verificar conexión
async function checkDatabaseConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Conexión a MySQL establecida');
    connection.release();
    return true;
  } catch (error) {
    console.error('❌ Error conectando a MySQL:', error.message);
    return false;
  }
}

// ============================================
// MIDDLEWARE
// ============================================
app.use(cors({
  origin: [
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'https://tudominio.com',
    process.env.FRONTEND_URL
  ].filter(Boolean),
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// ============================================
// FUNCIONES AUXILIARES
// ============================================

// Generar código de acceso único
function generateAccessCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Generar JWT simple (mejorar con jsonwebtoken en producción)
function generateToken(payload) {
  return Buffer.from(JSON.stringify({
    ...payload,
    exp: Date.now() + (7 * 24 * 60 * 60 * 1000) // 7 días
  })).toString('base64');
}

// Registrar actividad en logs
async function logActivity(userId, accion, descripcion, ipAddress = null) {
  try {
    await pool.execute(
      'INSERT INTO logs_actividad (usuario_id, accion, descripcion, ip_address, fecha) VALUES (?, ?, ?, ?, NOW())',
      [userId, accion, descripcion, ipAddress]
    );
  } catch (error) {
    console.error('Error logging actividad:', error);
  }
}

// ============================================
// ENDPOINTS
// ============================================

// Health Check
app.get('/health', async (req, res) => {
  const dbConnected = await checkDatabaseConnection();
  
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    database: dbConnected ? 'connected' : 'disconnected',
    stripe: !!process.env.STRIPE_SECRET_KEY ? 'configured' : 'missing',
    version: '1.0.0'
  });
});

// ============================================
// CREAR SESIÓN DE CHECKOUT
// ============================================
app.post('/create-checkout-session', async (req, res) => {
  console.log('📝 Creando sesión de Stripe Checkout...');

  try {
    // Validar Stripe
    if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_SECRET_KEY.startsWith('sk_')) {
      throw new Error('Stripe no configurado correctamente');
    }

    // Crear sesión de Stripe
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'mxn',
            product_data: {
              name: 'Acceso SkillsCert EC0301',
              description: 'Sistema completo de diseño de cursos EC0301 - Acceso 1 año',
            },
            unit_amount: 50000, // 500 MXN
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${req.headers.origin || 'http://localhost:5500'}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.origin || 'http://localhost:5500'}/index.html?canceled=true`,
      customer_email: req.body.email || undefined,
      metadata: {
        timestamp: new Date().toISOString(),
        source: 'ec0301-frontend'
      }
    });

    console.log('✅ Sesión creada:', session.id);

    // Registrar transacción pendiente
    try {
      await pool.execute(
        `INSERT INTO transacciones (usuario_id, stripe_session_id, monto, moneda, estado, fecha_transaccion)
         VALUES (NULL, ?, 500.00, 'MXN', 'pending', NOW())`,
        [session.id]
      );
    } catch (dbError) {
      console.warn('⚠️ No se pudo registrar transacción en BD:', dbError.message);
    }

    res.json({
      id: session.id,
      url: session.url
    });

  } catch (error) {
    console.error('❌ Error creando sesión:', error.message);
    res.status(500).json({
      error: error.message,
      type: error.type || 'api_error'
    });
  }
});

// ============================================
// VERIFICAR PAGO
// ============================================
app.post('/verify-payment', async (req, res) => {
  console.log('🔍 Verificando pago...');
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

    console.log('Session status:', session.payment_status);

    if (session.payment_status === 'paid') {
      const email = session.customer_details.email;
      
      // Verificar si el usuario ya existe
      const [existingUser] = await pool.execute(
        'SELECT id, codigo_acceso FROM usuarios WHERE email = ? LIMIT 1',
        [email]
      );

      let userId, accessCode;

      if (existingUser.length > 0) {
        // Usuario existente - extender acceso
        userId = existingUser[0].id;
        accessCode = existingUser[0].codigo_acceso;

        await pool.execute(
          `UPDATE usuarios 
           SET payment_status = 'paid', 
               fecha_pago = NOW(), 
               fecha_expiracion = DATE_ADD(NOW(), INTERVAL 365 DAY),
               activo = 1,
               stripe_session_id = ?
           WHERE id = ?`,
          [sessionId, userId]
        );

        console.log('✅ Acceso renovado para usuario existente:', email);
      } else {
        // Nuevo usuario - crear cuenta
        accessCode = generateAccessCode();

        const [result] = await pool.execute(
          `INSERT INTO usuarios 
           (email, nombre, telefono, codigo_acceso, stripe_session_id, payment_status, fecha_pago, fecha_expiracion)
           VALUES (?, ?, ?, ?, ?, 'paid', NOW(), DATE_ADD(NOW(), INTERVAL 365 DAY))`,
          [
            email,
            session.customer_details.name || null,
            session.customer_details.phone || null,
            accessCode,
            sessionId
          ]
        );

        userId = result.insertId;

        // Registrar código en histórico
        await pool.execute(
          'INSERT INTO codigos_acceso_historico (codigo, usuario_id, usado, fecha_generacion, fecha_uso) VALUES (?, ?, 1, NOW(), NOW())',
          [accessCode, userId]
        );

        console.log('✅ Nuevo usuario creado:', email);
      }

      // Actualizar transacción
      await pool.execute(
        `UPDATE transacciones 
         SET usuario_id = ?, 
             estado = 'completed', 
             fecha_completado = NOW(),
             email_pago = ?,
             stripe_payment_intent = ?
         WHERE stripe_session_id = ?`,
        [userId, email, session.payment_intent, sessionId]
      );

      // Log de actividad
      await logActivity(userId, 'pago_verificado', `Pago completado: ${sessionId}`, req.ip);

      return res.json({
        success: true,
        email: email,
        accessCode: accessCode,
        expirationDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        timestamp: new Date().toISOString()
      });

    } else {
      return res.json({
        success: false,
        error: 'Pago no completado',
        status: session.payment_status
      });
    }

  } catch (error) {
    console.error('❌ Error verificando pago:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// LOGIN
// ============================================
app.post('/login', async (req, res) => {
  console.log('🔐 Procesando login...');
  const { email, accessCode } = req.body;

  if (!email || !accessCode) {
    return res.status(400).json({ 
      success: false, 
      error: 'Email y código de acceso requeridos' 
    });
  }

  try {
    // Buscar usuario
    const [users] = await pool.execute(
      `SELECT id, email, nombre, codigo_acceso, activo, fecha_expiracion
       FROM usuarios
       WHERE email = ? AND codigo_acceso = ? AND activo = 1
       LIMIT 1`,
      [email, accessCode]
    );

    if (users.length === 0) {
      await logActivity(null, 'login_fallido', `Intento fallido: ${email}`, req.ip);
      return res.status(401).json({
        success: false,
        error: 'Credenciales inválidas'
      });
    }

    const user = users[0];

    // Verificar expiración
    if (user.fecha_expiracion && new Date(user.fecha_expiracion) < new Date()) {
      return res.status(401).json({
        success: false,
        error: 'Acceso expirado. Por favor renueva tu suscripción.'
      });
    }

    // Actualizar último acceso
    await pool.execute(
      'UPDATE usuarios SET ultimo_acceso = NOW() WHERE id = ?',
      [user.id]
    );

    // Crear sesión
    const token = generateToken({ userId: user.id, email: user.email });
    
    await pool.execute(
      `INSERT INTO sesiones (usuario_id, token, ip_address, fecha_creacion, fecha_expiracion, activa)
       VALUES (?, ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 7 DAY), 1)`,
      [user.id, token, req.ip]
    );

    // Log de actividad
    await logActivity(user.id, 'login_exitoso', `Login desde ${req.ip}`, req.ip);

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
    console.error('❌ Error en login:', error);
    res.status(500).json({
      success: false,
      error: 'Error del servidor'
    });
  }
});

// ============================================
// GUARDAR/ACTUALIZAR PROYECTO
// ============================================
app.post('/api/proyectos/guardar', async (req, res) => {
  const { userId, projectId, projectData } = req.body;

  if (!userId || !projectId || !projectData) {
    return res.status(400).json({
      success: false,
      error: 'Datos incompletos'
    });
  }

  try {
    // Verificar si el proyecto existe
    const [existing] = await pool.execute(
      'SELECT id FROM proyectos WHERE usuario_id = ? AND proyecto_id = ? LIMIT 1',
      [userId, projectId]
    );

    if (existing.length > 0) {
      // Actualizar proyecto existente
      await pool.execute(
        `UPDATE proyectos 
         SET datos_json = ?, fecha_modificacion = NOW()
         WHERE usuario_id = ? AND proyecto_id = ?`,
        [JSON.stringify(projectData), userId, projectId]
      );

      console.log('✅ Proyecto actualizado:', projectId);
    } else {
      // Crear nuevo proyecto
      await pool.execute(
        `INSERT INTO proyectos (usuario_id, proyecto_id, nombre, version, datos_json, fecha_creacion)
         VALUES (?, ?, ?, '1.0.0', ?, NOW())`,
        [userId, projectId, projectData.nombre || 'Proyecto Sin Nombre', JSON.stringify(projectData)]
      );

      console.log('✅ Proyecto creado:', projectId);
    }

    // Log de actividad
    await logActivity(userId, 'proyecto_guardado', `Proyecto ${projectId} guardado`, req.ip);

    res.json({ success: true });

  } catch (error) {
    console.error('❌ Error guardando proyecto:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// CARGAR PROYECTO
// ============================================
app.get('/api/proyectos/:userId/:projectId', async (req, res) => {
  const { userId, projectId } = req.params;

  try {
    const [projects] = await pool.execute(
      'SELECT datos_json, fecha_modificacion FROM proyectos WHERE usuario_id = ? AND proyecto_id = ? LIMIT 1',
      [userId, projectId]
    );

    if (projects.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Proyecto no encontrado'
      });
    }

    res.json({
      success: true,
      data: JSON.parse(projects[0].datos_json),
      lastModified: projects[0].fecha_modificacion
    });

  } catch (error) {
    console.error('❌ Error cargando proyecto:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// ESTADÍSTICAS (Dashboard Admin)
// ============================================
app.get('/api/admin/stats', async (req, res) => {
  try {
    // Total usuarios
    const [usuarios] = await pool.execute('SELECT COUNT(*) as total FROM usuarios WHERE activo = 1');
    
    // Total proyectos
    const [proyectos] = await pool.execute('SELECT COUNT(*) as total FROM proyectos');
    
    // Ingresos del mes
    const [ingresos] = await pool.execute(
      `SELECT SUM(monto) as total 
       FROM transacciones 
       WHERE estado = 'completed' 
       AND MONTH(fecha_completado) = MONTH(NOW())
       AND YEAR(fecha_completado) = YEAR(NOW())`
    );

    res.json({
      success: true,
      stats: {
        totalUsuarios: usuarios[0].total,
        totalProyectos: proyectos[0].total,
        ingresosMes: ingresos[0].total || 0
      }
    });

  } catch (error) {
    console.error('❌ Error obteniendo estadísticas:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// 404 Handler
// ============================================
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Endpoint no encontrado',
    path: req.path
  });
});

// ============================================
// INICIAR SERVIDOR
// ============================================
app.listen(PORT, async () => {
  console.log('================================================');
  console.log('🚀 Servidor EC0301 + MySQL iniciado');
  console.log(`📡 Puerto: ${PORT}`);
  console.log(`🌐 URL: http://localhost:${PORT}`);
  
  const dbConnected = await checkDatabaseConnection();
  console.log(`💾 MySQL: ${dbConnected ? '✅ Conectado' : '❌ Desconectado'}`);
  console.log(`💳 Stripe: ${process.env.STRIPE_SECRET_KEY ? '✅ Configurado' : '❌ NO configurado'}`);
  console.log('================================================');
});

// ============================================
// MANEJO DE ERRORES
// ============================================
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled Rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);

  // ============================================
// WEBHOOK DE STRIPE
// ============================================
app.post('/webhook', express.raw({type: 'application/json'}), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const body = req.body;

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error(`⚠️ Webhook signature verification failed.`, err.message);
    return res.sendStatus(400);
  }

  console.log(`📧 Webhook recibido: ${event.type}`);

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      console.log(`✅ Pago completado: ${session.id}`);
      console.log(`📧 Email: ${session.customer_email}`);
      break;
    }
    case 'payment_intent.succeeded': {
      console.log(`💳 Payment succeeded`);
      break;
    }
    case 'payment_intent.payment_failed': {
      console.log(`❌ Payment failed`);
      break;
    }
    default:
      console.log(`Evento sin manejar: ${event.type}`);
  }

  res.json({received: true});
});
});
