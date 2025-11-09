// ============================================
// SERVER.JS CORREGIDO - RENDER + STRIPE
// ============================================
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
const PORT = process.env.PORT || 10000;

// ============================================
// MIDDLEWARE CRÍTICO - ORDEN IMPORTANTE
// ============================================

// 1. CORS debe ir PRIMERO
app.use(cors({
  origin: '*', // Permitir todos los orígenes
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true
}));

// 2. Body Parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 3. Logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  console.log('Body:', JSON.stringify(req.body, null, 2));
  next();
});

// ============================================
// HEALTH CHECK
// ============================================
app.get('/health', (req, res) => {
  console.log('✅ Health check solicitado');
  res.status(200).json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    stripe: !!process.env.STRIPE_SECRET_KEY ? 'configured' : 'missing',
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0'
  });
});

// ============================================
// CREATE CHECKOUT SESSION - ENDPOINT PRINCIPAL
// ============================================
app.post('/create-checkout-session', async (req, res) => {
  console.log('');
  console.log('==============================================');
  console.log('📝 POST /create-checkout-session RECIBIDO');
  console.log('==============================================');
  console.log('Timestamp:', new Date().toISOString());
  console.log('Method:', req.method);
  console.log('Headers:', req.headers);
  console.log('Body:', req.body);
  console.log('Origin:', req.headers.origin);
  console.log('==============================================');

  try {
    // Validar que Stripe esté configurado
    if (!process.env.STRIPE_SECRET_KEY) {
      console.error('❌ ERROR: STRIPE_SECRET_KEY no está configurada');
      return res.status(500).json({
        error: 'Stripe no configurado en el servidor',
        details: 'STRIPE_SECRET_KEY missing'
      });
    }

    if (!process.env.STRIPE_SECRET_KEY.startsWith('sk_')) {
      console.error('❌ ERROR: STRIPE_SECRET_KEY inválida');
      return res.status(500).json({
        error: 'Configuración de Stripe inválida',
        details: 'STRIPE_SECRET_KEY debe empezar con sk_test_ o sk_live_'
      });
    }

    console.log('✅ Stripe configurado correctamente');
    console.log('✅ Clave Stripe:', process.env.STRIPE_SECRET_KEY.substring(0, 15) + '...');

    // Determinar URLs de éxito y cancelación
    const origin = req.headers.origin || 
                   req.headers.referer?.replace(/\/$/, '') || 
                   'https://ec0301-globalskillscert-backend.onrender.com';

    const successUrl = `${origin}/success.html?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${origin}/index.html?canceled=true`;

    console.log('📍 Success URL:', successUrl);
    console.log('📍 Cancel URL:', cancelUrl);

    // Crear sesión de Stripe
    console.log('🔄 Creando sesión de Stripe...');
    
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'mxn',
            product_data: {
              name: 'Acceso SkillsCert EC0301',
              description: 'Sistema completo de diseño de cursos EC0301 - Acceso por 1 año',
              images: ['https://i.imgur.com/EHyR2nP.png'], // Logo opcional
            },
            unit_amount: 50000, // 500.00 MXN en centavos
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_email: req.body.email || undefined,
      metadata: {
        timestamp: new Date().toISOString(),
        source: 'ec0301-frontend',
        environment: process.env.NODE_ENV || 'development'
      }
    });

    console.log('✅ Sesión de Stripe creada exitosamente');
    console.log('✅ Session ID:', session.id);
    console.log('✅ Checkout URL:', session.url);
    console.log('==============================================');

    // Responder con JSON válido
    return res.status(200).json({
      success: true,
      id: session.id,
      url: session.url,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('');
    console.error('❌❌❌ ERROR EN CREATE-CHECKOUT-SESSION ❌❌❌');
    console.error('Error tipo:', error.type);
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('==============================================');

    return res.status(500).json({
      error: error.message || 'Error creando sesión de pago',
      type: error.type || 'api_error',
      code: error.code || 'unknown_error',
      timestamp: new Date().toISOString()
    });
  }
});

// ============================================
// VERIFY PAYMENT
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
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    console.log('Session status:', session.payment_status);

    if (session.payment_status === 'paid') {
      const accessCode = generateAccessCode();
      
      console.log('✅ Pago verificado');
      console.log('Email:', session.customer_details.email);
      console.log('Código generado:', accessCode);

      return res.json({
        success: true,
        email: session.customer_details.email,
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

  // TODO: Validar contra base de datos
  // Por ahora, aceptar cualquier código de 8 caracteres para testing
  if (accessCode.length === 8) {
    return res.json({
      success: true,
      token: generateToken({ email }),
      user: { email }
    });
  }

  res.status(401).json({
    success: false,
    error: 'Credenciales inválidas'
  });
});

// ============================================
// FUNCIONES AUXILIARES
// ============================================
function generateAccessCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function generateToken(payload) {
  return Buffer.from(JSON.stringify({
    ...payload,
    exp: Date.now() + (7 * 24 * 60 * 60 * 1000)
  })).toString('base64');
}

// ============================================
// 404 HANDLER
// ============================================
app.use((req, res) => {
  console.log('❌ 404 - Ruta no encontrada:', req.method, req.path);
  res.status(404).json({ 
    error: 'Endpoint no encontrado',
    path: req.path,
    method: req.method,
    availableEndpoints: [
      'GET /health',
      'POST /create-checkout-session',
      'POST /verify-payment',
      'POST /login'
    ]
  });
});

// ============================================
// ERROR HANDLER GLOBAL
// ============================================
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
app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('================================================');
  console.log('🚀 Servidor EC0301 INICIADO');
  console.log('================================================');
  console.log(`📡 Puerto: ${PORT}`);
  console.log(`🌐 Ambiente: ${process.env.NODE_ENV || 'development'}`);
  console.log(`💳 Stripe: ${process.env.STRIPE_SECRET_KEY ? '✅ Configurado' : '❌ NO configurado'}`);
  console.log('');
  console.log('Endpoints disponibles:');
  console.log('  GET  /health');
  console.log('  POST /create-checkout-session');
  console.log('  POST /verify-payment');
  console.log('  POST /login');
  console.log('================================================');
  console.log('');
});

// ============================================
// MANEJO DE ERRORES DE PROCESO
// ============================================
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled Rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

// Manejo de señales de terminación
process.on('SIGTERM', () => {
  console.log('👋 SIGTERM recibido, cerrando servidor...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('👋 SIGINT recibido, cerrando servidor...');
  process.exit(0);
});
