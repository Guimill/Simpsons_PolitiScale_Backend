const Sequelize = require("sequelize");
module.exports = new Sequelize(
    'cartoon',
    'root',
    'Universum555-',
     {
       host: 'localhost',
       dialect: 'mysql'
     }
   );