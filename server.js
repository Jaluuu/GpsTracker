// ============================================================
//  GPS Tracker - Backend FCM Server
//  Jalankan dengan: node server.js
// ============================================================

const express = require('express');
const admin   = require('firebase-admin');
const app     = express();

app.use(express.json());

// ── LANGKAH 1: Hubungkan ke Firebase ────────────────────────
// File serviceAccountKey.json harus ada di folder yang sama!
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential:  admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL
  //            ↑↑↑ GANTI dengan URL database Firebase kamu!
});

const db = admin.database();
console.log('✅ Terhubung ke Firebase!');

// ── LANGKAH 2: Fungsi kirim notifikasi ke HP ────────────────
async function kirimNotifikasi(fcmToken, lat, lng, waktu) {
  const pesan = {
    token: fcmToken,

    // Ini yang muncul di layar HP
    notification: {
      title: '🚨 Alarm Keamanan!',
      body:  `Kendaraan bergerak! Lat: ${parseFloat(lat).toFixed(5)}, Long: ${parseFloat(lng).toFixed(5)}`,
    },

    // Data tambahan yang dibaca oleh app Android
    data: {
      type:      'alarm_triggered',
      latitude:  String(lat),
      longitude: String(lng),
      timestamp: String(waktu),
    },

    // Pengaturan Android: prioritas tinggi agar HP "bangun"
    android: {
      priority: 'high',
      notification: {
        channelId: 'gps_alarm_channel',
        priority:  'max',
        sound:     'default',
        color:     '#D32F2F',
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

// ── LANGKAH 3: Pantau Firebase terus-menerus ────────────────
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

    // Hanya kirim notifikasi saat status BARU menjadi "triggered"
    if (status === 'triggered' && statusTerakhir !== 'triggered') {
      console.log('\n⚠️  ALARM! Kendaraan bergerak!');
      console.log(`   Lokasi: ${lat}, ${lng}`);
      console.log(`   Waktu : ${waktu}`);

      statusTerakhir = 'triggered';

      // Ambil token HP dari Firebase
      const tokenSnap = await db.ref('gpstracker/device/fcmToken').once('value');
      const fcmToken  = tokenSnap.val();

      if (!fcmToken) {
        console.log('❌ Token HP tidak ditemukan. Pastikan app Android sudah dibuka minimal sekali!');
        return;
      }

      // Kirim notifikasi!
      const berhasil = await kirimNotifikasi(fcmToken, lat, lng, waktu);

      if (berhasil) {
        // Tandai di Firebase bahwa notifikasi sudah dikirim
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

// ── Endpoint untuk cek server masih hidup ───────────────────
app.get('/', (req, res) => {
  res.json({
    pesan:   'Server GPS Tracker berjalan!',
    status:  statusTerakhir,
    waktu:   new Date().toLocaleString('id-ID'),
  });
});

// Endpoint test kirim notifikasi manual
app.post('/test', async (req, res) => {
  const tokenSnap = await db.ref('gpstracker/device/fcmToken').once('value');
  const fcmToken  = tokenSnap.val();

  if (!fcmToken) {
    return res.status(404).json({ error: 'Token HP tidak ditemukan' });
  }

  const berhasil = await kirimNotifikasi(
    fcmToken, -7.629639, 111.523438,
    new Date().toLocaleString('id-ID')
  );

  res.json({ berhasil });
});

// ── Jalankan server ─────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 Server berjalan di http://localhost:${PORT}`);
  mulaiPantau();
});
