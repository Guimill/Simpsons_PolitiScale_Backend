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

// récupération des données des boutons de vote

app.post('/Vote/:personnageName', (req, res, next) => {
    const personnageData = {
        name : req.body.name,
        vote : req.body.vote
    };

    console.log(personnageData);

    // création des rows

        personnage.create({
            name: personnageData.name,
            vote: personnageData.vote,
        }).then(res => {
            console.log(res)
        }).catch((error) => {
            console.error('Failed to create a new record : ', error);
        });
  });

  // récupération des données de la table "personnage" pour la production de statistiques pour la partie vote

  app.get('/Vote/:personnageName', (req, res) => {

    const name = req.params.personnageName;

    const personnagesVote = personnage.findAll({
            attributes: ["name", "vote"],
            where : {
                name: name
            }
        });

        personnagesVote.then(resultat => {
            console.log(resultat)
            res.status(200).json(resultat);
        }).catch((error) => {
            console.error('Failed to return the record : ', error);
        });
  });

// récupération des données de la table "personnage" pour la production de statistiques pour la partie bilan

app.get('/Bilan', (req, res) => {

    const personnagesVote = personnage.findAll({
            attributes: ["name", "vote"]
        });

        personnagesVote.then(resultat => {
            console.log(resultat)
            res.status(200).json(resultat);
        }).catch((error) => {
            console.error('Failed to return the record : ', error);
        });
  });



module.exports = app;