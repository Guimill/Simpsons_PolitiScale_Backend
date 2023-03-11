const { DataTypes} = require("sequelize");
const db = require('../config/config')

//creation d'une table "personnage"

const personnage = db.define("personnages", {
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    vote: {
      type: DataTypes.STRING,
      allowNull: false
    }
 });

db.sync().then(() => {
  console.log('personnage table created successfully!');
}).catch((error) => {
  console.error('Unable to create personnage : ', error);
});

 module.exports = personnage;