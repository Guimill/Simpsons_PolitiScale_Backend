// connection à la db
const Sequelize = require("sequelize");
module.exports = new Sequelize(
    'Simpsons',
    'root',
    'Universum555-',
     {
       host: 'localhost',
       dialect: 'mysql'
     }
   );