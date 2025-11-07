require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { ServerClient } = require('postmark');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();
const PORT = process.env.PORT || 3000;

// === CORS seguro solo para tu front
app.use(cors({
  origin: process.env.FRONTEND_URL || 'https://ec0301-globalskillscert.onrender.com'
}));

// === BD ===
const dbPool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// === Postmark (emails)
const postmarkClient = new ServerClient(process.env.POSTMARK_SERVER_TOKEN);

// ============ WhatsApp Business Cloud API config ============
const WHATSAPP_URL = `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_ID}/messages`;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN; // TOKEN PERMANENTE
const WHATSAPP_FROM_PHONE = process.env.WHATSAPP_FROM_PHONE_NUMBER;

// === Stripe Webhook (antes del middleware JSON) ===
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    console.log(`✅ Webhook verificado: ${event.type}`);
  } catch (err) {
    console.error(`❌ Error verificación webhook: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    console.log(`🛒 Pago completado para sesión: ${session.id}`);
    try {
      const customerDetails = session.customer_details || {};
      const email = customerDetails.email;
      const phone = customerDetails.phone;
      const accessCode = Math.random().toString().substring(2, 8);
      const hashedCode = await bcrypt.hash(accessCode, 10);
      // Guarda código en DB
      await dbPool.execute(
        'INSERT INTO access_codes (code_hash, email, phone, stripe_session_id, expires_at) VALUES (?, ?, ?, ?, NOW() + INTERVAL 1 DAY)',
        [hashedCode, email, phone, session.id]
      );
      // ENVÍA POR EMAIL (Postmark)
      await postmarkClient.sendEmail({
        "From": process.env.POSTMARK_FROM_EMAIL,
        "To": email,
        "Subject": "Tu código de acceso a SkillsCert EC0301",
        "TextBody": `¡Gracias por tu pago! Tu código de acceso es: ${accessCode}`
      });
      // ENVÍA POR WHATSAPP
      if (phone) {
        await sendWhatsAppMessage(phone, `¡Gracias por tu pago! Tu código de acceso a la plataforma es: ${accessCode}`);
      }
      console.log(`✅ Códigos enviados: email y whatsapp`);
    } catch (dbOrApiError) {
      console.error(`❌ Error post-pago:`, dbOrApiError);
    }
  }
  res.status(200).json({ received: true });
});

// === Middleware JSON después del webhook
app.use(express.json());

// === Función para enviar WhatsApp ===
async function sendWhatsAppMessage(userPhone, message) {
  try {
    // Ajusta formato adecuado e.g. '521XXXXXXXXXX' ("521"+10 dígitos México)
    const toPhone = userPhone.replace(/\D/g, "");
    const payload = {
      messaging_product: "whatsapp",
      to: toPhone,
      type: "text",
      text: { body: message }
    };
    const resp = await fetch(WHATSAPP_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    if (!resp.ok) throw new Error(`WhatsApp API error: ${await resp.text()}`);
    console.log(`✅ WhatsApp enviado a ${toPhone}`);
  } catch (err) {
    console.error('❌ Error enviando WhatsApp:', err.message);
  }
}

// === Endpoint principal
app.get('/', (req, res) => {
  res.send('¡Backend Generando EC v1.1 con Auth/Postmark/WhatsApp Cloud está funcionando!');
});

// === Stripe Checkout Session ===
app.post('/create-checkout-session', async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card', 'oxxo'],
      line_items: [{
        price_data: {
          currency: 'mxn',
          product_data: { name: 'Acceso Plataforma Generando EC' },
          unit_amount: 50000,
        },
        quantity: 1,
      }],
      mode: 'payment',
      billing_address_collection: 'required',
      customer_creation: 'always',
      customer_email: req.body.email || null,
      phone_number_collection: { enabled: true },
      success_url: `${process.env.FRONTEND_URL}/Paginas_principales/success.html`,
      cancel_url: `${process.env.FRONTEND_URL}/Paginas_principales/index.html`,
      payment_method_options: { oxxo: { expires_after_days: 3 } }
    });
    res.json({ id: session.id });
  } catch (error) {
    console.error("❌ Error creando sesión de Stripe:", error);
    res.status(500).json({ error: 'No se pudo iniciar el proceso de pago.' });
  }
});

// === Login-code/JWT ===
const authRouter = express.Router();
app.use('/api/auth', authRouter);

authRouter.post('/login-code', async (req, res) => {
  const { accessCode } = req.body;
  if (!accessCode) return res.status(400).json({ error: 'Código de acceso requerido.' });
  try {
    const [rows] = await dbPool.execute(
      'SELECT * FROM access_codes WHERE is_used = 0 AND expires_at > NOW()',
      []
    );
    let validCodeMatch = null;
    for (const row of rows) {
      if (await bcrypt.compare(accessCode, row.code_hash)) {
        validCodeMatch = row;
        break;
      }
    }
    if (!validCodeMatch) return res.status(401).json({ error: 'Código inválido o expirado.' });
    await dbPool.execute(
      'UPDATE access_codes SET is_used = 1, used_at = NOW() WHERE id = ?',
      [validCodeMatch.id]
    );
    const token = jwt.sign(
      {
        id: validCodeMatch.id,
        email: validCodeMatch.email,
        phone: validCodeMatch.phone
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.status(200).json({ message: 'Inicio de sesión exitoso.', token });
  } catch (error) {
    console.error("❌ Error en /login-code:", error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor escuchando en http://localhost:${PORT}`);
});
