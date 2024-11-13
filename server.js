const express = require('express');
const mysql = require('mysql2');
const mqtt = require('mqtt');
const path = require('path');


// MQTT Configuration
const mqttBroker = 'mqtt://broker.hivemq.com';
const relayCommandTopic = '152022012_UTS/relay_command';
const dataTopic = '152022012_UTS';

// Create Express app
const app = express();
app.use(express.json());

// Serve static files from a 'public' directory
app.use(express.static(path.join(__dirname, 'public')));


// MySQL Database Configuration
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'uts_152022012',
  multipleStatements: true
});

// Connect to MySQL
db.connect((err) => {
  if (err) {
    console.error('Database connection failed:', err.stack);
    return;
  }
  console.log('Connected to MySQL database');
});



// Connect to MQTT broker and subscribe to topic
const client = mqtt.connect(mqttBroker);

client.on('connect', () => {
  console.log('Connected to MQTT broker');
  client.subscribe(dataTopic);
});

client.on('message', (topic, message) => {
  if (topic === dataTopic) {
    // Parse JSON message
    const data = JSON.parse(message.toString());
    const { suhu, kelembapan, kecerahan } = data;

    // Insert data into database
    const query = 'INSERT INTO sensor_data (temperature, humidity, brightness) VALUES (?, ?, ?)';
    db.query(query, [suhu, kelembapan, kecerahan], (err, results) => {
      if (err) {
        console.error('Failed to insert data:', err);
      } else {
        console.log('Data inserted successfully:', results);
      }
    });
  }
});

app.get('/api/data', (req, res) => {
    let suhumax, suhummin, suhurata;
    let nilaiSuhuMaxHumidMax = [];
    let monthYearMax = [];
  
    // First query: Get max, min, and average temperature
    db.query(
      `SELECT MAX(temperature) AS suhumax, MIN(temperature) AS suhummin, AVG(temperature) AS suhurata FROM sensor_data;`,
      (err, results) => {
        if (err) {
          console.error('Error in first query:', err);
          return res.status(500).json({ error: 'Database query failed on first query' });
        }
  
        suhumax = results[0].suhumax;
        suhummin = results[0].suhummin;
        suhurata = parseFloat(results[0].suhurata.toFixed(2));
  
        // Second query: Get records with max temperature
        db.query(
          `SELECT idx, temperature AS suhu, humidity AS humid, brightness AS kecerahan, timestamp
           FROM sensor_data 
           WHERE temperature = ?
           LIMIT 2;`,
          [suhumax],
          (err, tempResults) => {
            if (err) {
              console.error('Error in max temperature query:', err);
              return res.status(500).json({ error: 'Database query failed on max temperature query' });
            }
  
            // Add max temperature records to the result array
            nilaiSuhuMaxHumidMax = tempResults.map(row => ({
              idx: row.idx,
              suhu: row.suhu,
              humid: row.humid,
              kecerahan: row.kecerahan,
              timestamp: row.timestamp
            }));
  
            // Third query: Get records with max humidity
            db.query(
              `SELECT idx, temperature AS suhu, humidity AS humid, brightness AS kecerahan, timestamp
               FROM sensor_data 
               WHERE humidity = (SELECT MAX(humidity) FROM sensor_data)
               LIMIT 2;`,
              (err, humidResults) => {
                if (err) {
                  console.error('Error in max humidity query:', err);
                  return res.status(500).json({ error: 'Database query failed on max humidity query' });
                }
  
                // Add max humidity records to the result array
                nilaiSuhuMaxHumidMax = [
                  ...nilaiSuhuMaxHumidMax,
                  ...humidResults.map(row => ({
                    idx: row.idx,
                    suhu: row.suhu,
                    humid: row.humid,
                    kecerahan: row.kecerahan,
                    timestamp: row.timestamp
                  }))
                ];
  
                // Fourth query: Get distinct month-year values for max temperature, humidity, and brightness
                db.query(
                  `SELECT DISTINCT DATE_FORMAT(timestamp, '%Y-%m') AS month_year
                   FROM sensor_data 
                   WHERE temperature = ? 
                      OR humidity = (SELECT MAX(humidity) FROM sensor_data)
                      OR brightness = (SELECT MAX(brightness) FROM sensor_data)
                   LIMIT 2;`,
                  [suhumax],
                  (err, monthYearResults) => {
                    if (err) {
                      console.error('Error in month-year query:', err);
                      return res.status(500).json({ error: 'Database query failed on month-year query' });
                    }
  
                    // Map results to the desired format
                    monthYearMax = monthYearResults.map(row => ({
                      month_year: row.month_year
                    }));
  
                    // Format and send the JSON response
                    const formattedData = {
                      suhumax,
                      suhummin,
                      suhurata,
                      nilai_suhu_max_humid_max: nilaiSuhuMaxHumidMax,
                      month_year_max: monthYearMax
                    };
  
                    res.json(formattedData);
                  }
                );
              }
            );
          }
        );
      }
    );
  });
  
  
  

// Endpoint to turn relay ON
app.post('/relay/on', (req, res) => {
  client.publish(relayCommandTopic, 'ON');
  res.json({ status: 'Relay ON' });
});

// Endpoint to turn relay OFF
app.post('/relay/off', (req, res) => {
  client.publish(relayCommandTopic, 'OFF');
  res.json({ status: 'Relay OFF' });
});

// Start the server
const port = 3000;
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
