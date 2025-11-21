require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const mysql = require('mysql2/promise');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// 1. CONFIGURACIÓN DE CORS
// ============================================
const allowedOrigin = 'https://ec0301-globalskillscert.onrender.com';
app.use(cors({
  origin: allowedOrigin,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'stripe-signature'],
  credentials: true
}));

// Middleware para JSON (excepto webhook)
app.use((req, res, next) => {
  if (req.originalUrl === '/webhook/stripe') {
    next();
  } else {
    express.json()(req, res, next);
  }
});

// ============================================
// 2. CONEXIÓN BASE DE DATOS
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
// 3. FUNCIONES DE ENVÍO (Tus funciones)
// ============================================
async function sendWhatsAppMessage(phone, code) {
  if (!phone) return;
  const body = {
    messaging_product: "whatsapp",
    to: phone,
    type: "template",
    template: {
        name: "envio_codigo_acceso", // Asegúrate de tener esta plantilla en Meta
        language: { code: "es_MX" },
        components: [{
            type: "body",
            parameters: [{ type: "text", text: code }]
        }]
    }
  };

  try {
    // Intento con plantilla (Recomendado)
    await fetch(`https://graph.facebook.com/v17.0/${process.env.PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.WHATSAPP_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    console.log('📱 WhatsApp enviado a:', phone);
  } catch (error) {
    console.error('Error WhatsApp:', error);
  }
}

async function sendEmailCode(email, code) {
  const body = {
    From: 'info@skillscert.com', // Tu remitente verificado
    To: email,
    Subject: 'Tu Código de Acceso a SkillsCert EC0301',
    HtmlBody: `
      <h1>¡Gracias por tu compra!</h1>
      <p>Tu código de acceso es: <strong style="font-size: 20px; color: #6366f1;">${code}</strong></p>
      <p>Ingresa en: <a href="${allowedOrigin}">${allowedOrigin}</a></p>
    `,
    TextBody: `Tu código de acceso es: ${code}`
  };

  try {
    await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: {
        'X-Postmark-Server-Token': process.env.POSTMARK_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    console.log('📧 Correo enviado a:', email);
  } catch (error) {
    console.error('Error Email:', error);
  }
}

function generarCodigoAcceso() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// ============================================
// 4. LÓGICA DE NEGOCIO (Guardar y Procesar)
// ============================================
async function guardarUsuarioYCodigo(email, nombre, telefono, codigo, stripeSessionId, monto, ipAddress) {
  const conn = await pool.getConnection();
  try {
    // 1. Guardar en tabla usuarios
    const [existing] = await conn.execute('SELECT id FROM usuarios WHERE email = ?', [email]);
    let usuarioId;

    if (existing.length > 0) {
      usuarioId = existing[0].id;
      await conn.execute(
        `UPDATE usuarios 
         SET codigo_acceso = ?, nombre = ?, telefono = ?, stripe_session_id = ?, 
             payment_status = 'paid', monto_pagado = monto_pagado + ?, fecha_pago = NOW(), 
             fecha_expiracion = DATE_ADD(NOW(), INTERVAL 90 DAY), activo = 1 
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

    return usuarioId;
  } finally {
    conn.release();
  }
}

async function procesarPagoCompletado(session, ip) {
  const email = session.customer_details.email;
  const nombre = session.metadata?.nombre || session.customer_details.name || 'Usuario';
  const telefono = session.metadata?.telefono || session.customer_details.phone;
  
  // Generar código AQUÍ, solo cuando se confirma el pago
  const codigo = generarCodigoAcceso(); 
  const monto = session.amount_total / 100;

  console.log(`💰 Procesando pago confirmado para: ${email}`);

  await guardarUsuarioYCodigo(email, nombre, telefono, codigo, session.id, monto, ip);

  // Enviar notificaciones AHORA (Seguro)
  await sendEmailCode(email, codigo);
  if(telefono) await sendWhatsAppMessage(telefono, codigo);

  return { email, codigo };
}

// ============================================
// 5. ENDPOINTS (Rutas)
// ============================================

// A) Crear sesión de pago (SOLO devuelve URL)
app.post('/create-checkout-session', async (req, res) => {
  const { email, nombre, telefono } = req.body;
  
  if (!email) return res.status(400).json({ error: "Email requerido" });

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card', 'oxxo'],
      line_items: [{
        price_data: {
          currency: 'mxn',
          product_data: { 
            name: 'Acceso SkillsCert EC0301',
            images: ['https://ec0301-globalskillscert.onrender.com/logo.png']
          },
          unit_amount: 99900,
        },
        quantity: 1,
      }],
      mode: 'payment',
      customer_email: email,
      success_url: `${allowedOrigin}/index.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${allowedOrigin}/index.html`,
      metadata: { email, nombre, telefono }
    });

    // ⚠️ CORRECCIÓN DE SEGURIDAD:
    // Eliminé las llamadas a sendEmailCode y sendWhatsAppMessage aquí.
    // Solo devolvemos la URL para que el usuario pague.
    res.json({ success: true, url: session.url, id: session.id });

  } catch (error) {
    console.error('Stripe Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// B) Webhook (Automático)
app.post('/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    try {
        await procesarPagoCompletado(session, 'webhook-ip');
    } catch (e) {
        console.error('Error procesando webhook:', e);
    }
  }
  res.json({ received: true });
});

// C) Verificar Pago (Manual desde frontend)
app.post('/verify-payment', async (req, res) => {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ error: 'Falta Session ID' });
  
    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if (session.payment_status === 'paid') {
          // Verificar si ya existe para no duplicar
          const [rows] = await pool.execute('SELECT codigo_acceso, email FROM usuarios WHERE stripe_session_id = ?', [sessionId]);
          
          if (rows.length > 0) {
              return res.json({ success: true, accessCode: rows[0].codigo_acceso, email: rows[0].email });
          } else {
              const result = await procesarPagoCompletado(session, req.ip);
              return res.json({ success: true, accessCode: result.codigo, email: result.email });
          }
      } else {
          res.json({ success: false, error: 'Pago no completado' });
      }
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Error verificando pago' });
    }
  });

// D) Login
app.post('/login', async (req, res) => {
    const { code } = req.body;
    try {
        const [rows] = await pool.execute('SELECT * FROM usuarios WHERE codigo_acceso = ? AND activo = 1', [code]);
        
        if (rows.length > 0) {
            const user = rows[0];
            // Validar expiración (90 días)
            if (new Date() > new Date(user.fecha_expiracion)) {
                 return res.status(401).json({ success: false, message: 'El código ha expirado.' });
            }
            res.json({ success: true, token: code, user: { nombre: user.nombre, email: user.email } });
        } else {
            res.status(401).json({ success: false, message: 'Código inválido.' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Error de servidor' });
    }
});

// Iniciar Servidor
app.listen(PORT, async () => {
  console.log(`🚀 Servidor corriendo en el puerto ${PORT}`);
  await checkDatabaseConnection();
});
