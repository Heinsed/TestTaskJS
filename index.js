const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const fetch = require("node-fetch");
const csv = require("csv-parser");
var sqlite3 = require("sqlite3").verbose();
const app = express();
const server = http.createServer(app);

const io = socketIO(server);
const port = 3000;

const db = new sqlite3.Database("database.db");

async function fetchData() {
  console.log('fetching...');
  const url =
    "https://api.blockchain.info/charts/market-price?format=csv&timespan=all";
  const response =  await fetch(url);
  writeToDB(response.body);

}

const writeToDB = (response) => {
  const results = [];

  response
    .pipe(csv())
    .on("data", (data) => results.push(data))
    .on("end", () => {
      db.serialize(() => {
        db.run(
          "CREATE TABLE IF NOT EXISTS tableValues (id INTEGER PRIMARY KEY, year INTEGER, price REAL)"
        );
        const stmt = db.prepare(
          "INSERT OR REPLACE INTO tableValues VALUES (?, ?, ?)"
        );
        results.forEach((data, id) => {
          data.id = id + 1;
          const year = new Date(Object.values(data)[0]);

          const price = Object.values(data)[1];
          if (!isNaN(year) && !isNaN(price)) {
            stmt.run(data.id, year, price);
          }
        });

        stmt.finalize();
      });
    });
};

io.on("connection", (socket) => {
  fetchData();
  console.log("Connected.");
  
  socket.on("getData", () => {

    db.all("SELECT * FROM tableValues", (err, rows) => {
      if (err) {
        return console.error(err);
      }
      socket.emit("data", rows);
    });
    console.log('updating...')
  });
  socket.on("disconnect", () => {
    console.log("Disconnected.");
  });
});
app.get("/db", (req, res) => {
  const param = req.query.param;
  if (param) {
    db.all("SELECT * FROM tableValues", (err, rows) => {
      if (err) {
        console.error("Error retrieving data from database:", err);
        res.status(500).send("Internal Server Error");
        return;
      }

      res.json(rows);
    });
  } else {
    const param1 = req.query.param1;
    const param2 = req.query.param2;
    db.all(
      "SELECT * FROM tableValues WHERE year >= ? AND year <= ?",
      [param2, param1],
      (err, rows) => {
        if (err) {
          console.error("Error retrieving data from database:", err);
          res.status(500).send("Internal Server Error");
          return;
        }

        res.json(rows);
      }
    );
  }
});
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});

fetchData()
  .then(() => {
    server.listen(port, () => {
      console.log(`http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error("Error:", error);
  });
