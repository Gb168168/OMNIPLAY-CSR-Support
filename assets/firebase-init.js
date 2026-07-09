const firebaseConfig = {
  apiKey: "AIzaSyB5GdlMKz809ITGf7fMpDsYPVFnDAdnh-0",
  authDomain: "omniplay-csr-support.firebaseapp.com",
  projectId: "omniplay-csr-support",
  storageBucket: "omniplay-csr-support.firebasestorage.app",
  messagingSenderId: "248758412651",
  appId: "1:248758412651:web:d417fb1956442170bc182e",
  measurementId: "G-RSCV4ZGTQH"
};

if (window.firebase?.apps && !window.firebase.apps.length) {
  window.firebase.initializeApp(firebaseConfig);
}

if (window.firebase?.analytics?.isSupported) {
  window.firebase.analytics.isSupported().then((supported) => {
    if (supported) window.firebase.analytics();
  });
}

window.omniplayDb = window.firebase?.firestore ? window.firebase.firestore() : null;
