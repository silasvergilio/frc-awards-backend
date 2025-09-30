var mysql = require('mysql')
require('dotenv').config();
var dbConfig = require('./dbconfig');

var connection = mysql.createPool({
  host: dbConfig.HOST,
  user: dbConfig.USER,
  password: dbConfig.PASSWORD,
  connectionLimit : 5,
  migrate: 'safe',
  port: dbConfig.PORT,
  database: dbConfig.DB,
});

connection.on('error', function(err) {
  console.error('DB error:', err);
  if (err.code === 'PROTOCOL_CONNECTION_LOST') {
      handleDisconnect(); // Reconnect
  } else {
      throw err;
  }
});

module.exports = connection;