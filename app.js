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

app.get("/", (req,res,next) => {
    const personnages = [
        {
            _id: 1,
            name: "Homer",
            src: './images/homer.jpg'
        },
    ];
    res.status(200).json(personnages);
})

app.get('/:personnageName/PersonnageData', (req,res) => {
    console.log(req.params.personnageName)
})

app.post('/:personnageName', (req, res, next) => {
    const personnageData = {
        name : req.body.name,
        vote : req.body.vote
    };

    console.log(personnageData);

    db.sync().then(() => {
        console.log('personnage table created successfully!');
     
        personnage.create({
            name: personnageData.name,
            vote: personnageData.vote,
        }).then(res => {
            console.log(res)
        }).catch((error) => {
            console.error('Failed to create a new record : ', error);
        });
     
     }).catch((error) => {
        console.error('Unable to create table : ', error);
     });
     
    res.status(201).json(req.body);
  });



module.exports = app;