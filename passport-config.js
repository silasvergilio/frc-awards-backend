const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt');
var db = require('./connection');
var db_sync = require('./connection-sync');

function initialize(passport) {
    const authenticateUser = async (userName, password, done) => {
        var sql = 'SELECT * FROM Users WHERE userName = ? ';
        let values = [userName];
        var user;
      
        db.query(sql, values, (err, result) => {
            if (err) user = null;
            else {
                user = result[0];
                console.log("Qual é o user ?",user)
                if (user == null) {
                    return done(null, false, {
                        message: "Erro login"
                    });
                }

                try {
                    console.log("password",password);
                    console.log("a senha correta", user.password);
                    if (bcrypt.compareSync(password, user.password)) {
                        console.log("pass informado",password)
                        console.log("pass do user",user.password)
                        return done(null, user);
                    } else {
                        return done(null, false, {
                            message: "Erro login"
                        })
                    }
                } catch (e) {
                    console.log("Erro", e);
                    return done(e);
                }
            };
        })


    }
    passport.use(new LocalStrategy({
        usernameField: 'userName',
        passwordField: 'password'
    }, authenticateUser))
    passport.serializeUser(
        (user, done) => {
            return done(null, user.idUser)
        })

    passport.deserializeUser((id, done) => done(null,  () => {
        console.log("Desserialize");
        var sql = 'SELECT * FROM Users WHERE idUser = ? ';
        let values = [id];
        return  db_sync.query(sql, values);

    }))

}

module.exports = initialize