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

function fetchData(status) {
  const url =
    "https://api.blockchain.info/charts/market-price?format=csv&timespan=all";
    return fetch(url)
    .then(response => {
      if(status === 'init'){
        writeToDB(response.body);
      }else if(status === 'updating'){
        updateDB(response.body);
      }
  
    })
    .catch(error => {
      console.error("Error:", error);
    });
}

const getDataFromDatabase = () => {
  return new Promise((resolve, reject) => {
    db.all("SELECT * FROM tableValues", (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
};

const sendUpdatedDataToClient = async () => {
  try {
    const data = await getDataFromDatabase();
    io.emit("dataUpdate", data);
  } catch (error) {
    console.error("Error:", error);
  }
};
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

      
     
        const stmt =  db.prepare(
          "INSERT OR REPLACE INTO tableValues VALUES (?, ?, ?)"
        );
          
        results.forEach((data, id) => {
  
          const year = new Date(Object.values(data)[0]);
         
        
         
          const price = Object.values(data)[1];

 
          if (!isNaN(year) && !isNaN(price)) {
       
             stmt.run(id, year, price);
            
           
          }
         
          
        });

        stmt.finalize();
      });
    });
};


const updateDB = (response) => {
  const results = [];
  response
    .pipe(csv())
    .on("data", (data) => results.push(data))
    .on("end", () => {
      db.all("SELECT * FROM tableValues ORDER BY id DESC LIMIT 1", (err, rows) => {
        if (err) {
          console.error("Error:", err);
          return;
        }
        const lastRow = Object.values(rows[0])[0];
        const stmt =  db.prepare(
          "INSERT INTO tableValues VALUES (?, ?, ?)"
        );
          
        results.forEach((data, id) => {
          const year = new Date(Object.values(data)[0]);
          const price = Object.values(data)[1];
  
  
          if (!isNaN(year) && !isNaN(price)) {
            if(lastRow < id){
              stmt.run(id, year, price);  
              console.log("Updated");
            }
          } 
        });
      });
    
   
    });
};

io.on("connection", (socket) => {
  console.log("Connected.");

  sendUpdatedDataToClient();
  // setInterval(sendUpdatedDataToClient, 5000);

  socket.on('filter_req', (range) => {
    filterData(range);
  });

  socket.on("disconnect", () => {
    console.log("Disconnected.");
  });

});



function filterData(range = 0){
      let currentDate = new Date().getTime();
      let rangeDate = '';
      let unit = 'year';
      if (range <= 30 && range != 0) {
        unit = 'day';
      } else if (range <= 730 && range != 0) {
        unit = 'month';
      } else {
        unit = 'year';
      }
      rangeDate = range ? currentDate - (range * 24 * 60 * 60 * 1000) : 0;

        db.all(
                "SELECT * FROM tableValues WHERE year >= ? AND year <= ?",
                [rangeDate, currentDate],
                (err, rows) => {
                  if (err) {
                    console.error("Error:", err);
                    return;
                  }
    
                  io.emit('filterData', rows, unit);
    
                }
        );
}

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});
server.listen(port, () => {
    fetchData('init');
    setInterval(function(){fetchData('updating')} , 5000);
    console.log(`http://localhost:${port}`);
});


