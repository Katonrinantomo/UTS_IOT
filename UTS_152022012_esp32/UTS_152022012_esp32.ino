#include <WiFi.h>
#include <PubSubClient.h>
#include <DHT.h>

// Konfigurasi WiFi dan MQTT
const char* ssid = "Haha";
const char* password = "hahahaha";
const char* mqtt_server = "broker.hivemq.com";
const char* mqtt_topic = "152022012_UTS";
const char* relay_command_topic = "152022012_UTS/relay_command";

WiFiClient espClient;
PubSubClient client(espClient);

// Konfigurasi DHT
#define DHTPIN 4
#define DHTTYPE DHT22
DHT dht(DHTPIN, DHTTYPE);

// Konfigurasi pin LED, buzzer, relay, dan LDR
#define LED_HIJ 5
#define LED_KUN 18
#define LED_MER 19
#define BUZZER 21
#define RELAY 22
#define LDR_PIN 34 // Pin untuk membaca data dari LDR (gunakan ADC)

// Fungsi untuk menghubungkan ke WiFi
void setup_wifi() {
  delay(10);
  Serial.println("Menghubungkan ke WiFi...");
  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(1000);
    Serial.print(".");
  }
  Serial.println("\nWiFi tersambung");
}

// Fungsi untuk menyalakan relay
void relayOn() {
  digitalWrite(RELAY, HIGH);
  Serial.println("Relay ON");
}

// Fungsi untuk mematikan relay
void relayOff() {
  digitalWrite(RELAY, LOW);
  Serial.println("Relay OFF");
}

// Callback untuk menerima pesan MQTT
void callback(char* topic, byte* message, unsigned int length) {
  Serial.print("Pesan diterima di topik: ");
  Serial.print(topic);
  Serial.print(". Pesan: ");
  String messageTemp;

  for (int i = 0; i < length; i++) {
    messageTemp += (char)message[i];
  }
  Serial.println(messageTemp);

  // Memeriksa apakah pesan yang diterima adalah perintah untuk relay
  if (String(topic) == relay_command_topic) {
    if (messageTemp == "ON") {
      relayOn();
    } else if (messageTemp == "OFF") {
      relayOff();
    }
  }
}

// Fungsi untuk menyambung ulang ke MQTT
void reconnect() {
  while (!client.connected()) {
    Serial.print("Menghubungkan ke MQTT...");
    if (client.connect("152022003")) {
      Serial.println("MQTT tersambung");
      client.subscribe(relay_command_topic); // Berlangganan topik untuk kontrol relay
    } else {
      Serial.print("Gagal, rc=");
      Serial.print(client.state());
      Serial.println(" mencoba lagi dalam 5 detik");
      delay(5000);
    }
  }
}

void setup() {
  Serial.begin(115200);
  setup_wifi();
  client.setServer(mqtt_server, 1883);
  client.setCallback(callback); // Menetapkan callback MQTT
  dht.begin();

  pinMode(LED_HIJ, OUTPUT);
  pinMode(LED_KUN, OUTPUT);
  pinMode(LED_MER, OUTPUT);
  pinMode(BUZZER, OUTPUT);
  pinMode(RELAY, OUTPUT);
  pinMode(LDR_PIN, INPUT);
}

void loop() {
  if (!client.connected()) {
    reconnect();
  }
  client.loop();

  float suhu = dht.readTemperature();
  float kelembapan = dht.readHumidity();
  int ldrValue = analogRead(LDR_PIN); // Membaca nilai LDR (0-4095 untuk ESP32)

  // Membalik nilai kecerahan, sehingga 0 adalah gelap dan 4095 adalah terang
  int kecerahan = map(ldrValue, 4095, 0, 0, 4095);

  if (isnan(suhu) || isnan(kelembapan)) {
    Serial.println("Gagal membaca data dari sensor DHT");
    return;
  }

  Serial.print("Suhu: ");
  Serial.print(suhu);
  Serial.print(" °C, Kelembapan: ");
  Serial.print(kelembapan);
  Serial.print(" %, Kecerahan: ");
  Serial.print(kecerahan);
  Serial.println(" (semakin besar semakin terang)");

  // Logika kontrol LED dan Buzzer
  if (suhu > 35) {
    digitalWrite(LED_HIJ, LOW);
    digitalWrite(LED_KUN, LOW);
    digitalWrite(LED_MER, HIGH);
    digitalWrite(BUZZER, HIGH);
  } else if (suhu >= 30 && suhu <= 35) {
    digitalWrite(LED_HIJ, LOW);
    digitalWrite(LED_KUN, HIGH);
    digitalWrite(LED_MER, LOW);
    digitalWrite(BUZZER, LOW);
  } else {
    digitalWrite(LED_HIJ, HIGH);
    digitalWrite(LED_KUN, LOW);
    digitalWrite(LED_MER, LOW);
    digitalWrite(BUZZER, LOW);
  }

  // Kirim data suhu, kelembapan, dan kecerahan melalui MQTT
  String payload = "{\"suhu\": " + String(suhu) + 
                   ", \"kelembapan\": " + String(kelembapan) + 
                   ", \"kecerahan\": " + String(kecerahan) + "}";
  client.publish(mqtt_topic, payload.c_str());

  delay(2000); // Interval pengiriman data
}
