const express = require('express');
const personnage = require('./models/personnages.model')
const db = require('./config/config')

const app = express();

app.use(express.json());

app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content, Accept, Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    next();
  });

app.post('/:personnageName', (req, res, next) => {
    const personnageData = {
        name : req.body.name,
        vote : req.body.vote
    };

    console.log(personnageData);

        personnage.create({
            name: personnageData.name,
            vote: personnageData.vote,
        }).then(res => {
            console.log(res)
        }).catch((error) => {
            console.error('Failed to create a new record : ', error);
        });
  });

  app.get('/:personnageName', (req, res) => {

    const name = req.params.personnageName;

       const personnages = personnage.findAll({
            attributes: ["name", "vote"],
            where : {
                name: name
            }
        });

        personnages.then(resultat => {
            console.log(JSON.stringify(resultat))
            res.status(200).json(JSON.stringify(resultat));
        }).catch((error) => {
            console.error('Failed to return the record : ', error);
        });
  });

module.exports = app;