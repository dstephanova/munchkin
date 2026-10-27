// Where diaries are kept: Firebase (online, per Google account), or in memory for ?demo testing.
import { firebaseConfig } from "./firebase-config.js";

const FB = "https://www.gstatic.com/firebasejs/10.12.2";

export async function createStore({ demo }) {
  return demo ? memoryStore() : firebaseStore();
}

async function firebaseStore() {
  const [{ initializeApp }, auth, fs] = await Promise.all([
    import(`${FB}/firebase-app.js`),
    import(`${FB}/firebase-auth.js`),
    import(`${FB}/firebase-firestore.js`),
  ]);
  const app = initializeApp(firebaseConfig);
  const a = auth.getAuth(app);
  let db;
  try {
    db = fs.initializeFirestore(app, {
      localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }),
    });
  } catch {
    db = fs.getFirestore(app);
  }
  auth.getRedirectResult(a).catch(() => {});
  const provider = new auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  const mealsCol = () => fs.collection(db, "users", a.currentUser.uid, "meals");

  return {
    demo: false,
    onUser(cb) {
      return auth.onAuthStateChanged(a, (u) => cb(u ? { uid: u.uid, name: u.displayName || "", email: u.email || "", photo: u.photoURL || "" } : null));
    },
    async signIn() {
      // Inside the Android app, use the phone's own Google account picker.
      const FA = window.Capacitor?.isNativePlatform?.() && window.Capacitor.Plugins?.FirebaseAuthentication;
      if (FA) {
        try {
          const r = await FA.signInWithGoogle();
          const cred = auth.GoogleAuthProvider.credential(r.credential?.idToken || null, r.credential?.accessToken || null);
          await auth.signInWithCredential(a, cred);
        } catch (e) {
          const msg = String(e?.message || e || "");
          if (/cancel/i.test(msg)) return;
          throw new Error("Login didn't work: " + msg.slice(0, 120));
        }
        return;
      }
      try {
        await auth.signInWithPopup(a, provider);
      } catch (e) {
        if (e && (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment")) {
          await auth.signInWithRedirect(a, provider);
          return;
        }
        if (e && e.code === "auth/popup-closed-by-user") return;
        if (e && e.code === "auth/unauthorized-domain") {
          throw new Error("This web address isn't allowed to log in yet. Add it under Authentication → Settings → Authorized domains in Firebase.");
        }
        throw new Error("Login didn't work. Try again.");
      }
    },
    async signOut() {
      const FA = window.Capacitor?.isNativePlatform?.() && window.Capacitor.Plugins?.FirebaseAuthentication;
      if (FA) { try { await FA.signOut(); } catch {} }
      return auth.signOut(a);
    },
    watchDay(date, cb, onErr) {
      const q = fs.query(mealsCol(), fs.where("date", "==", date));
      return fs.onSnapshot(q, (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), (e) => onErr && onErr(e));
    },
    async get(id) {
      const s = await fs.getDoc(fs.doc(mealsCol(), id));
      return s.exists() ? { id: s.id, ...s.data() } : null;
    },
    newId() { return fs.doc(mealsCol()).id; },
    async save(meal) {
      const { id, ...data } = meal;
      await fs.setDoc(fs.doc(mealsCol(), id), data);
    },
    async remove(id) { await fs.deleteDoc(fs.doc(mealsCol(), id)); },
    async getRange(start, end) {
      const q = fs.query(mealsCol(), fs.where("date", ">=", start), fs.where("date", "<=", end));
      const snap = await fs.getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
    watchGoals(cb) {
      return fs.onSnapshot(fs.doc(db, "users", a.currentUser.uid, "settings", "goals"), (snap) => cb(snap.exists() ? snap.data() : null), () => cb(null));
    },
    async getKeys() {
      const snap = await fs.getDoc(fs.doc(db, "users", a.currentUser.uid, "settings", "keys"));
      return snap.exists() ? snap.data() : null;
    },
    async saveKeys(k) {
      const ref = fs.doc(db, "users", a.currentUser.uid, "settings", "keys");
      if (k) await fs.setDoc(ref, k); else await fs.deleteDoc(ref);
    },
    async saveGoals(g) { await fs.setDoc(fs.doc(db, "users", a.currentUser.uid, "settings", "goals"), g); },
  };
}

function memoryStore() {
  const meals = new Map();
  const watchers = new Set();
  let goals = null;
  const goalWatchers = new Set();
  const notify = () => watchers.forEach((w) => w());
  const today = new Date();
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const sample = [
    { id: "s1", slot: "breakfast", name: "Oats with banana", items: [
      { name: "Porridge oats", amount: "50 g", calories: 190, protein: 7, carbs: 32, fat: 4 },
      { name: "Banana", amount: "1 medium", calories: 105, protein: 1, carbs: 27, fat: 0 },
      { name: "Milk", amount: "150 ml", calories: 75, protein: 5, carbs: 7, fat: 3 } ] },
    { id: "s2", slot: "lunch", name: "Chicken wrap", items: [
      { name: "Chicken wrap", amount: "1 wrap", calories: 480, protein: 32, carbs: 45, fat: 18 } ] },
  ];
  for (const m of sample) {
    meals.set(m.id, { ...m, date: iso(today), photo: null, chat: [
      { role: "user", text: "example meal" },
      { role: "model", text: "Example entry so you can see how the diary looks." } ], createdAt: Date.now(), updatedAt: Date.now() });
  }
  for (let back = 1; back <= 3; back++) {
    const d = new Date(today); d.setDate(d.getDate() - back);
    meals.set(`p${back}`, { id: `p${back}`, slot: "lunch", name: "Example day", date: iso(d), photo: null, chat: [],
      items: [{ name: "Example food", amount: "", calories: 1200 + back * 80, protein: 70, carbs: 140, fat: 40 }], createdAt: Date.now(), updatedAt: Date.now() });
  }
  let n = 0;
  return {
    demo: true,
    onUser(cb) { setTimeout(() => cb({ uid: "demo", name: "Demo queen", email: "demo@example.com", photo: "" }), 0); return () => {}; },
    async signIn() {},
    async signOut() {},
    watchDay(date, cb) {
      const w = () => cb([...meals.values()].filter((m) => m.date === date));
      watchers.add(w); w();
      return () => watchers.delete(w);
    },
    async get(id) { return meals.get(id) || null; },
    newId() { return `m${Date.now()}${n++}`; },
    async save(meal) { meals.set(meal.id, structuredClone(meal)); notify(); },
    async remove(id) { meals.delete(id); notify(); },
    async getRange(start, end) { return [...meals.values()].filter((m) => m.date >= start && m.date <= end); },
    watchGoals(cb) { goalWatchers.add(cb); cb(goals); return () => goalWatchers.delete(cb); },
    async getKeys() { return null; },
    async saveKeys() {},
    async saveGoals(g) { goals = structuredClone(g); goalWatchers.forEach((w) => w(goals)); },
  };
}
