// ============================================================
//  GPS Tracker - Backend FCM Server
// ============================================================

const express = require('express');
const admin   = require('firebase-admin');
const app     = express();

app.use(express.json());

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential:  admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});

const db = admin.database();
console.log('✅ Terhubung ke Firebase!');

// ── Fungsi kirim notifikasi ke HP ────────────────────────────
async function kirimNotifikasi(fcmToken, lat, lng, waktu) {
  const pesan = {
    token: fcmToken,

    // ✅ Kembalikan notification agar muncul di bar HP
    notification: {
      title: '🚨 Alarm Keamanan!',
      body:  `Kendaraan bergerak! Lat: ${parseFloat(lat).toFixed(5)}, Long: ${parseFloat(lng).toFixed(5)}`,
    },

    // ✅ Data tetap ada agar onMessageReceived dipanggil juga
    data: {
      type:      'alarm_triggered',
      latitude:  String(lat),
      longitude: String(lng),
      timestamp: String(waktu),
    },

    android: {
      priority: 'high',
      // ✅ Kunci utama: tambahkan "direct_boot_ok" dan 
      //    jangan set sound/vibrate di sini — biarkan Android handle
      //    dari GpsTrackerFCMService.kt
      notification: {
        channelId:           'gps_alarm_channel',
        priority:            'max',
        defaultSound:        false,   // ← matikan suara default FCM
        defaultVibrateTimings: false, // ← matikan getar default FCM
        color:               '#D32F2F',
        // Tidak set sound & vibrateTimings
        // agar GpsTrackerFCMService yang handle keduanya
      },
    },
  };

  try {
    const hasil = await admin.messaging().send(pesan);
    console.log('✅ Notifikasi terkirim ke HP! ID:', hasil);
    return true;
  } catch (error) {
    console.error('❌ Gagal kirim notifikasi:', error.message);
    return false;
  }
}

// ── Pantau Firebase terus-menerus ────────────────────────────
let statusTerakhir = null;

function mulaiPantau() {
  const alarmRef = db.ref('gpstracker/alarm');
  console.log('👁️  Memantau Firebase... (tekan Ctrl+C untuk berhenti)');

  alarmRef.on('value', async (snapshot) => {
    const data = snapshot.val();
    if (!data) return;

    const status = data.status    || 'idle';
    const lat    = data.latitude  || 0;
    const lng    = data.longitude || 0;
    const waktu  = data.timestamp || new Date().toLocaleString('id-ID');

    if (status === 'triggered' && statusTerakhir !== 'triggered') {
      console.log('\n⚠️  ALARM! Kendaraan bergerak!');
      console.log(`   Lokasi: ${lat}, ${lng}`);
      console.log(`   Waktu : ${waktu}`);

      statusTerakhir = 'triggered';

      const tokenSnap = await db.ref('gpstracker/device/fcmToken').once('value');
      const fcmToken  = tokenSnap.val();

      if (!fcmToken) {
        console.log('❌ Token HP tidak ditemukan!');
        return;
      }

      const berhasil = await kirimNotifikasi(fcmToken, lat, lng, waktu);

      if (berhasil) {
        await db.ref('gpstracker/alarm').update({
          notificationSent: true,
          notificationTime: new Date().toLocaleString('id-ID'),
        });
      }

    } else if (status !== 'triggered') {
      statusTerakhir = status;
      console.log(`📊 Status alarm: ${status}`);
    }
  });
}

app.get('/', (req, res) => {
  res.json({
    pesan:  'Server GPS Tracker berjalan!',
    status: statusTerakhir,
    waktu:  new Date().toLocaleString('id-ID'),
  });
});

app.post('/test', async (req, res) => {
  const tokenSnap = await db.ref('gpstracker/device/fcmToken').once('value');
  const fcmToken  = tokenSnap.val();
  if (!fcmToken) return res.status(404).json({ error: 'Token HP tidak ditemukan' });
  const berhasil = await kirimNotifikasi(
    fcmToken, -7.629639, 111.523438,
    new Date().toLocaleString('id-ID')
  );
  res.json({ berhasil });
});

app.get('/test', async (req, res) => {
  const tokenSnap = await db.ref('gpstracker/device/fcmToken').once('value');
  const fcmToken  = tokenSnap.val();
  if (!fcmToken) return res.status(404).json({ error: 'Token HP tidak ditemukan. Buka app dulu!' });
  const berhasil = await kirimNotifikasi(
    fcmToken, -7.629639, 111.523438,
    new Date().toLocaleString('id-ID')
  );
  res.json({ berhasil });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 Server berjalan di http://localhost:${PORT}`);
  mulaiPantau();
});