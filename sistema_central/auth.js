// ============================================================
// auth.js - Autenticación con JWT y Códigos de Acceso
// ============================================================
// ✅ Login con código de acceso
// ✅ Validación de JWT
// ✅ Renovación de tokens
// ✅ Revocación de códigos
// ============================================================

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { dbPool } = require('./helpers');

// ============================================================
// FUNCIÓN: Login con código de acceso
// ============================================================
async function loginWithAccessCode(req, res) {
  try {
    const { accessCode } = req.body;

    // 🔍 Validar entrada
    if (!accessCode || accessCode.trim().length === 0) {
      return res.status(400).json({
        error: 'Código de acceso requerido.',
        code: 'MISSING_CODE'
      });
    }

    // 🔐 Buscar códigos válidos (no usados y no expirados)
    const [rows] = await dbPool.execute(
      `SELECT id, email, phone, code_hash, expires_at, created_at 
       FROM access_codes 
       WHERE is_used = 0 AND expires_at > NOW()
       ORDER BY created_at DESC
       LIMIT 100`
    );

    if (rows.length === 0) {
      return res.status(401).json({
        error: 'No hay códigos de acceso válidos disponibles.',
        code: 'NO_VALID_CODES'
      });
    }

    // 🔑 Comparar el código ingresado con los hashes
    let validCodeMatch = null;
    for (const row of rows) {
      try {
        const isMatch = await bcrypt.compare(accessCode, row.code_hash);
        if (isMatch) {
          validCodeMatch = row;
          break;
        }
      } catch (compareError) {
        console.warn('⚠️ Error comparando código:', compareError.message);
        continue;
      }
    }

    if (!validCodeMatch) {
      return res.status(401).json({
        error: 'Código inválido o expirado.',
        code: 'INVALID_CODE'
      });
    }

    // ✅ Marcar código como usado
    await dbPool.execute(
      'UPDATE access_codes SET is_used = 1, used_at = NOW() WHERE id = ?',
      [validCodeMatch.id]
    );

    // 🎟️ Crear token JWT con 30 días de validez
    const token = jwt.sign(
      {
        accessCodeId: validCodeMatch.id,
        email: validCodeMatch.email,
        phone: validCodeMatch.phone,
        type: 'access'
      },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    console.log(`✅ Login exitoso para: ${validCodeMatch.email}`);

    return res.status(200).json({
      message: 'Inicio de sesión exitoso.',
      token,
      user: {
        email: validCodeMatch.email,
        phone: validCodeMatch.phone
      },
      expiresIn: 2592000 // 30 días en segundos
    });

  } catch (error) {
    console.error('❌ Error en /login-code:', error.message);
    return res.status(500).json({
      error: 'Error interno del servidor.',
      code: 'INTERNAL_ERROR'
    });
  }
}

// ============================================================
// FUNCIÓN: Middleware - Verificar JWT
// ============================================================
function verifyJWT(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];

    if (!authHeader) {
      return res.status(401).json({
        error: 'Token de autenticación requerido.',
        code: 'MISSING_TOKEN'
      });
    }

    // Esperar formato "Bearer TOKEN"
    const token = authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        error: 'Formato de token inválido.',
        code: 'INVALID_TOKEN_FORMAT'
      });
    }

    // ✅ Verificar token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();

  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Token expirado. Por favor, inicia sesión nuevamente.',
        code: 'TOKEN_EXPIRED'
      });
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'Token inválido.',
        code: 'INVALID_TOKEN'
      });
    }

    console.error('❌ Error verificando JWT:', error.message);
    return res.status(500).json({
      error: 'Error verificando autenticación.',
      code: 'JWT_ERROR'
    });
  }
}

// ============================================================
// FUNCIÓN: Renovar token JWT
// ============================================================
async function renewToken(req, res) {
  try {
    const { email } = req.user;

    // 🔍 Verificar que el usuario aún tenga acceso válido
    const [rows] = await dbPool.execute(
      `SELECT id FROM access_codes 
       WHERE email = ? AND is_used = 1 AND expires_at > NOW()
       ORDER BY used_at DESC
       LIMIT 1`,
      [email]
    );

    if (rows.length === 0) {
      return res.status(403).json({
        error: 'Tu acceso ha expirado. Por favor, compra un nuevo acceso.',
        code: 'ACCESS_EXPIRED'
      });
    }

    // 🎟️ Crear nuevo token
    const newToken = jwt.sign(
      {
        accessCodeId: rows[0].id,
        email: email,
        type: 'access'
      },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    console.log(`✅ Token renovado para: ${email}`);

    return res.status(200).json({
      message: 'Token renovado exitosamente.',
      token: newToken,
      expiresIn: 2592000
