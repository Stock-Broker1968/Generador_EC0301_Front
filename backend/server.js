// ============================================================
// GLOBAL SKILLS CERT EC0301 - BACKEND SERVER
// Sistema de autenticación, pagos y gestión de códigos
// ============================================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const postmark = require('postmark');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// CONFIGURACIÓN DE MIDDLEWARES
// ============================================================
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));

app.use(express.json());
app.use(express.raw({ type: 'application/json', limit: '5mb' }));

// ============================================================
// CONEXIÓN A BASE DE DATOS (MySQL - Hostinger)
// ============================================================
const dbPool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// ============================================================
// CONFIGURACIÓN DE SERVICIOS EXTERNOS
// ============================================================
const postmarkClient = new postmark.ServerClient(process.env.POSTMARK_SERVER_TOKEN);

const WHATSAPP_CONFIG = {
  phoneId: process.env.WHATSAPP_PHONE_ID,
  token: process.env.WHATSAPP_TOKEN,
  apiUrl: `https://graph.facebook.com/v17.0/${process.env.WHATSAPP_PHONE_ID}/messages`
};

// ============================================================
// FUNCIONES AUXILIARES
// ============================================================

/**
 * Genera un código de 6 dígitos aleatorio
 */
function generateAccessCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Envía código de acceso por Email usando Postmark
 */
async function sendEmailCode(email, accessCode) {
  try {
    await postmarkClient.sendEmail({
      From: process.env.POSTMARK_FROM_EMAIL,
      To: email,
      Subject: '🎓 Tu código de acceso a Global Skills Cert EC0301',
      HtmlBody: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body { font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 20px; }
            .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .header { text-align: center; margin-bottom: 30px; }
            .code-box { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 10px; text-align: center; margin: 20px 0; }
            .code { font-size: 36px; font-weight: bold; letter-spacing: 8px; margin: 10px 0; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="color: #667eea; margin: 0;">Global Skills Cert</h1>
              <p style="color: #666; margin: 5px 0;">EC0301 - Diseño de Cursos de Formación</p>
            </div>
            
            <p>¡Hola! 👋</p>
            <p>Tu pago ha sido procesado exitosamente. Aquí está tu código de acceso:</p>
            
            <div class="code-box">
              <p style="margin: 0; font-size: 14px;">TU CÓDIGO DE ACCESO</p>
              <div class="code">${accessCode}</div>
              <p style="margin: 0; font-size: 12px;">Válido por 90 días</p>
            </div>
            
            <p><strong>Instrucciones:</strong></p>
            <ol>
              <li>Ingresa a <a href="${process.env.FRONTEND_URL}">${process.env.FRONTEND_URL}</a></li>
              <li>Introduce este código de 6 dígitos</li>
              <li>Comienza a crear tus Cartas Descriptivas EC0301</li>
            </ol>
            
            <p style="background: #fff3cd; padding: 15px; border-radius: 5px; border-left: 4px solid #ffc107;">
              <strong>⚠️ Importante:</strong> Este código es personal e intransferible. Guárdalo en un lugar seguro.
            </p>
            
            <div class="footer">
              <p>Si no solicitaste este código, por favor ignora este mensaje.</p>
              <p>© ${new Date().getFullYear()} Global Skills Cert. Todos los derechos reservados.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      TextBody: `
        Tu código de acceso a Global Skills Cert EC0301:
        
        CÓDIGO: ${accessCode}
        
        Válido por 90 días.
        
        Ingresa a ${process.env.FRONTEND_URL} e introduce este código para acceder.
        
        Si no solicitaste este código, ignora este mensaje.
      `
    });
    
    console.log(`✅ Email enviado correctamente a ${email}`);
    return true;
  } catch (error) {
    console.error('❌ Error enviando email:', error);
    return false;
  }
}

/**
 * Envía código de acceso por WhatsApp usando Meta Cloud API
 */
async function sendWhatsAppCode(phoneNumber, accessCode) {
  try {
    const formattedPhone = phoneNumber.replace(/\D/g, '');
    
    const message = {
      messaging_product: 'whatsapp',
      to: formattedPhone,
      type: 'text',
      text: {
        body: `🎓 *Global Skills Cert EC0301*\n\n` +
              `Tu código de acceso es:\n\n` +
              `*${accessCode}*\n\n` +
              `✅ Válido por 90 días\n` +
              `🔗 Accede en: ${process.env.FRONTEND_URL}\n\n` +
              `_Este código es personal e intransferible._`
      }
    };

    await axios.post(WHATSAPP_CONFIG.apiUrl, message, {
      headers: {
        'Authorization': `Bearer ${WHATSAPP_CONFIG.token}`,
        'Content-Type': 'application/json'
      }
    });

    console.log(`✅ WhatsApp enviado correctamente a ${formattedPhone}`);
    return true;
  } catch (error) {
    console.error('❌ Error enviando WhatsApp:', error.response?.data || error.message);
    return false;
  }
}

// ============================================================
// WEBHOOK DE STRIPE - Procesamiento automático de pagos
// ============================================================
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('❌ Error verificando webhook:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Procesar evento de checkout completado
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    
    console.log('✅ Pago exitoso detectado:', session.id);

    try {
      const email = session.customer_details?.email;
      const phone = session.customer_details?.phone || null;

      if (!email) {
        throw new Error('Email no proporcionado en la sesión');
      }

      // Generar código de acceso
      const accessCode = generateAccessCode();
      const codeHash = await bcrypt.hash(accessCode, 10);

      // Guardar en base de datos
      await dbPool.execute(
        `INSERT INTO access_codes 
         (code_hash, email, phone, stripe_session_id, expires_at, created_at) 
         VALUES (?, ?, ?, ?, NOW() + INTERVAL 90 DAY, NOW())`,
        [codeHash, email, phone, session.id]
      );

      console.log(`✅ Código generado y guardado para ${email}`);

      // Enviar código por Email
      await sendEmailCode(email, accessCode);

      // Enviar por WhatsApp si hay teléfono
      if (phone) {
        await sendWhatsAppCode(phone, accessCode);
      }

      // Notificar al administrador
      await postmarkClient.sendEmail({
        From: process.env.POSTMARK_FROM_EMAIL,
        To: process.env.POSTMARK_ALERT_EMAIL,
        Subject: '🎉 Nuevo pago procesado - EC0301',
        TextBody: `
          Nuevo pago exitoso:
          - Email: ${email}
          - Teléfono: ${phone || 'No proporcionado'}
          - Código generado: ${accessCode}
          - Session ID: ${session.id}
          - Fecha: ${new Date().toLocaleString('es-MX')}
        `
      });

    } catch (error) {
      console.error('❌ Error procesando pago:', error);
    }
  }

  res.json({ received: true });
});

// ============================================================
// ENDPOINT: Crear sesión de pago con Stripe
// ============================================================
app.post('/create-checkout-session', async (req, res) => {
  const { email, phone } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email es requerido' });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card', 'oxxo'],
      customer_email: email,
      line_items: [{
        price_data: {
          currency: 'mxn',
          product_data: {
            name: 'Global Skills Cert EC0301',
            description: 'Acceso de 90 días al sistema de diseño de Cartas Descriptivas EC0301',
            images: ['https://ec0301-globalskillscert.onrender.com/assets/logo.png']
          },
          unit_amount: 99900 // $999.00 MXN
        },
        quantity: 1
      }],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/index.html?canceled=true`,
      metadata: {
        email: email,
        phone: phone || ''
      }
    });

    res.json({ id: session.id });
  } catch (error) {
    console.error('❌ Error creando sesión de pago:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// ✨ NUEVO ENDPOINT 1: Validar código de acceso (usado por auth.js)
// ============================================================
app.post('/validate-access-code', async (req, res) => {
  const { accessCode } = req.body;
  
  if (!accessCode || !/^\d{6}$/.test(accessCode)) {
    return res.status(400).json({ message: 'Código inválido. Debe contener 6 dígitos.' });
  }

  try {
    // Obtener todos los códigos no usados y no expirados
    const [rows] = await dbPool.execute(
      'SELECT * FROM access_codes WHERE is_used = 0 AND expires_at > NOW()'
    );

    if (rows.length === 0) {
      return res.status(401).json({ message: 'No hay códigos válidos disponibles.' });
    }

    // Buscar código que coincida con el hash
    let validCodeMatch = null;
    for (const row of rows) {
      const isMatch = await bcrypt.compare(accessCode, row.code_hash);
      if (isMatch) {
        validCodeMatch = row;
        break;
      }
    }

    if (!validCodeMatch) {
      return res.status(401).json({ message: 'Código inválido o expirado.' });
    }

    // Marcar código como usado
    await dbPool.execute(
      'UPDATE access_codes SET is_used = 1, used_at = NOW() WHERE id = ?',
      [validCodeMatch.id]
    );

    // Generar JWT con 90 días de duración
    const token = jwt.sign(
      { 
        id: validCodeMatch.id, 
        email: validCodeMatch.email,
        codeId: validCodeMatch.id 
      },
      process.env.JWT_SECRET,
      { expiresIn: '90d' }
    );

    console.log(`✅ Código validado exitosamente para ${validCodeMatch.email}`);

    res.status(200).json({
      success: true,
      token,
      user: validCodeMatch.email,
      email: validCodeMatch.email,
      accessCode: accessCode,
      expiresAt: validCodeMatch.expires_at
    });

  } catch (error) {
    console.error('❌ Error validando código:', error);
    res.status(500).json({ message: 'Error del servidor al validar código.' });
  }
});

// ============================================================
// ✨ NUEVO ENDPOINT 2: Validar token JWT
// ============================================================
app.post('/validate-token', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ valid: false, message: 'Token no proporcionado' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Verificar que el código sigue siendo válido en la BD
    const [rows] = await dbPool.execute(
      'SELECT * FROM access_codes WHERE id = ? AND expires_at > NOW()',
      [decoded.id]
    );

    if (rows.length === 0) {
      return res.json({ valid: false, message: 'Código expirado' });
    }

    res.json({ 
      valid: true, 
      email: decoded.email,
      expiresAt: rows[0].expires_at 
    });

  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.json({ valid: false, message: 'Token expirado' });
    }
    res.json({ valid: false, message: 'Token inválido' });
  }
});

// ============================================================
// ✨ NUEVO ENDPOINT 3: Refrescar token JWT
// ============================================================
app.post('/refresh-token', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'Token no proporcionado' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { ignoreExpiration: true });
    
    // Verificar que el código original sigue válido
    const [rows] = await dbPool.execute(
      'SELECT * FROM access_codes WHERE id = ? AND expires_at > NOW()',
      [decoded.id]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Código original expirado' });
    }

    // Generar nuevo token con 90 días
    const newToken = jwt.sign(
      { 
        id: decoded.id, 
        email: decoded.email,
        codeId: decoded.codeId 
      },
      process.env.JWT_SECRET,
      { expiresIn: '90d' }
    );
    
    console.log(`✅ Token refrescado para ${decoded.email}`);
    
    res.json({ 
      token: newToken,
      email: decoded.email 
    });

  } catch (error) {
    console.error('❌ Error refrescando token:', error);
    res.status(401).json({ error: 'No se pudo refrescar el token' });
  }
});

// ============================================================
// ✨ NUEVO ENDPOINT 4: Verificar pago (usado por payment.js)
// ============================================================
app.post('/api/payment/verify', async (req, res) => {
  const { sessionId } = req.body;

  if (!sessionId) {
    return res.status(400).json({ 
      success: false,
      message: 'Session ID es requerido' 
    });
  }

  try {
    // Verificar estado del pago en Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== 'paid') {
      return res.status(400).json({
        success: false,
        message: 'El pago aún no ha sido completado',
        paymentStatus: session.payment_status
      });
    }

    // Buscar el código generado para esta sesión
    const [rows] = await dbPool.execute(
      'SELECT * FROM access_codes WHERE stripe_session_id = ? LIMIT 1',
      [sessionId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No se encontró código de acceso para esta sesión. Contacta a soporte.'
      });
    }

    const codeData = rows[0];

    console.log(`✅ Pago verificado exitosamente para ${codeData.email}`);

    res.json({
      success: true,
      email: codeData.email,
      paymentStatus: 'paid',
      expiresAt: codeData.expires_at,
      message: 'Pago verificado. Revisa tu email para obtener el código de acceso.'
    });

  } catch (error) {
    console.error('❌ Error verificando pago:', error);
    res.status(500).json({
      success: false,
      message: 'Error al verificar el pago. Intenta nuevamente.'
    });
  }
});

// ============================================================
// ✨ NUEVO ENDPOINT 5: Logout (cerrar sesión)
// ============================================================
app.post('/logout', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET, { ignoreExpiration: true });
      console.log(`✅ Logout exitoso para ${decoded.email}`);
    } catch (error) {
      // Token inválido, pero igual procesamos el logout
    }
  }
  
  res.json({ 
    success: true,
    message: 'Sesión cerrada exitosamente' 
  });
});

// ============================================================
// ENDPOINTS DE SALUD Y MONITOREO
// ============================================================
app.get('/health', async (req, res) => {
  try {
    await dbPool.execute('SELECT 1');
    res.json({ 
      status: 'ok', 
      database: 'connected',
      timestamp: new Date().toISOString() 
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'error', 
      database: 'disconnected',
      error: error.message 
    });
  }
});

app.get('/', (req, res) => {
  res.json({ 
    message: 'Global Skills Cert EC0301 API',
    version: '2.0.0',
    status: 'running',
    endpoints: {
      auth: [
        'POST /validate-access-code',
        'POST /validate-token',
        'POST /refresh-token',
        'POST /logout'
      ],
      payment: [
        'POST /create-checkout-session',
        'POST /api/payment/verify',
        'POST /webhook'
      ],
      monitoring: [
        'GET /health',
        'GET /'
      ]
    }
  });
});

// ============================================================
// MANEJO DE ERRORES GLOBAL
// ============================================================
app.use((error, req, res, next) => {
  console.error('❌ Error no manejado:', error);
  res.status(500).json({ 
    error: 'Error interno del servidor',
    message: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
});

// ============================================================
// INICIAR SERVIDOR
// ============================================================
app.listen(PORT, () => {
  console.log(`
  ╔════════════════════════════════════════════════════════╗
  ║   🚀 Global Skills Cert EC0301 Backend Server         ║
  ║   📡 Puerto: ${PORT}                                     ║
  ║   🌐 Entorno: ${process.env.NODE_ENV || 'development'}  ║
  ║   ✅ Estado: Activo y escuchando                      ║
  ╚════════════════════════════════════════════════════════╝
  
  🔐 Endpoints de autenticación disponibles
  💳 Stripe Webhooks configurado
  📧 Postmark Email configurado
  📱 WhatsApp API configurada
  🗄️  MySQL Pool conectado
  
  `);
});

// Manejo de cierre graceful
process.on('SIGTERM', async () => {
  console.log('⚠️  SIGTERM recibido. Cerrando conexiones...');
  await dbPool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('\n⚠️  SIGINT recibido. Cerrando conexiones...');
  await dbPool.end();
  process.exit(0);
});
