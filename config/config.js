// connection à la db
const Sequelize = require("sequelize");
module.exports = new Sequelize(
    'heroku_176c9b11cb265e6',
    'b9eb7622aba688',
    '710c7d94',
     {
       host: 'eu-cdbr-west-03.cleardb.net',
       dialect: 'mysql'
     }
   );

