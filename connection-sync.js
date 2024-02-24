var mysql = require('sync-mysql');
var dbConfig = require('./dbconfig');

require('dotenv').config();

var connection = new mysql({
    host     : dbConfig.HOST,
    user     : dbConfig.USER,
    password : dbConfig.PASSWORD,
   // port: process.env.DB_PORT,
    database : dbConfig.DB,
  });

  module.exports = connection;
