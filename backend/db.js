const mysql = require('mysql2/promise');
const pool = mysql.createPool({
  host: 'tu_host',
  user: 'tu_usuario',
  password: '******',
  database: 'u259791740_Azpkillscert',
  waitForConnections: true,
  connectionLimit: 10
});
module.exports = pool;
