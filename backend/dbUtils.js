const pool = require('./db');

// 2. Guardar Código de Acceso
async function guardarCodigoAccesso(email, code) {
  await pool.execute(
    "INSERT INTO access_codes (email, code, created_at, expires_at, status) VALUES (?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 1 YEAR), 1)",
    [email, code]
  );
}

// 3. Verificar Código en Login
async function verificarCodigoAccesso(email, accessCode) {
  const [rows] = await pool.execute(
    "SELECT * FROM access_codes WHERE email=? AND code=? AND status=1 AND expires_at>NOW() LIMIT 1",
    [email, accessCode]
  );
  return rows.length > 0;
}

// 4. Registrar Transacción de Stripe
async function registrarTransaccion(email, amount, referencia) {
  await pool.execute(
    "INSERT INTO transacciones (email, amount, referencia, fecha) VALUES (?, ?, ?, NOW())",
    [email, amount, referencia]
  );
}

// 5. Registro de Módulos Completados
async function registrarModulo(email, modulo, avance) {
  await pool.execute(
    "INSERT INTO modulos_completados (email, modulo, avance, completado_en) VALUES (?, ?, ?, NOW())",
    [email, modulo, avance]
  );
}

// 6. Log de Actividad
async function logActividad(email, accion, info) {
  await pool.execute(
    "INSERT INTO logs_actividad (usuario, accion, detalles, fecha) VALUES (?, ?, ?, NOW())",
    [email, accion, info]
  );
}

module.exports = {
  guardarCodigoAccesso,
  verificarCodigoAccesso,
  registrarTransaccion,
  registrarModulo,
  logActividad
};
