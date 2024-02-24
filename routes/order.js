var express = require('express');
var bodyParser = require('body-parser')
var router = express.Router();
var db = require('../connection');

// create application/json parser
var jsonParser = bodyParser.json()


router.put('/:award', jsonParser, function (req, res) {

  var sql = 'UPDATE ?? SET position = ? WHERE Teams_idTime = ? ';
  var values = [req.params.award,req.body.position,req.body.id]

  db.query(sql, values, function (err, result) {
    if (err) throw err;
    console.log("1 record updated");
    res.send("Inserted");
  });

});




module.exports = router;