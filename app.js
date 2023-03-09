const express = require('express');

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

app.post("/post", (req, res) => {
    console.log("Connected to React");
    res.redirect("/");
  });


app.post('/personnageData', (req, res, next) => {
    console.log(req.body);
    res.status(201).json(req.body);
  });




module.exports = app;