/**
 * SHOPOPS - Firebase Seed Script
 * Run this once to populate your Firestore with demo data.
 *
 * Usage:
 *   1. npm install firebase-admin
 *   2. Download your Firebase service account key from Firebase Console
 *      (Project Settings > Service Accounts > Generate new private key)
 *   3. node seed.js path/to/serviceAccountKey.json
 */

const admin = require("firebase-admin");
const path = require("path");

const keyPath = process.argv[2];
if (!keyPath) {
  console.error("Usage: node seed.js path/to/serviceAccountKey.json");
  process.exit(1);
}

const serviceAccount = require(path.resolve(keyPath));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

const suppliers = [
  { name: "Sri Krishna Hardware Wholesale", phone: "+919876543210", location: "Coimbatore, TN" },
  { name: "Chennai Electricals Ltd", phone: "+919811122233", location: "Anna Nagar, Chennai" },
  { name: "BathFit Sanitary Traders", phone: "+919900011122", location: "Madurai, TN" },
];

const products = [
  { name: "Angle Grinder 4\"", category: "Hardware", purchasePrice: 2200, sellingPrice: 3100, stock: 6, supplier: "Sri Krishna Hardware Wholesale", totalSold: 5 },
  { name: "Brass Tap Chrome", category: "Sanitary", purchasePrice: 280, sellingPrice: 450, stock: 35, supplier: "BathFit Sanitary Traders", totalSold: 0 },
  { name: "Ceiling Fan 48\"", category: "Electrical", purchasePrice: 1800, sellingPrice: 2600, stock: 15, supplier: "Chennai Electricals Ltd", totalSold: 0 },
  { name: "Copper Elbow Joint 1/2\"", category: "Plumbing", purchasePrice: 25, sellingPrice: 45, stock: 200, supplier: "BathFit Sanitary Traders", totalSold: 0 },
  { name: "Copper Wire 1.5mm (per m)", category: "Electrical", purchasePrice: 18, sellingPrice: 30, stock: 500, supplier: "Chennai Electricals Ltd", totalSold: 0 },
  { name: "Galvanized Iron Pipe 1/2\"", category: "Plumbing", purchasePrice: 120, sellingPrice: 160, stock: 79, supplier: "BathFit Sanitary Traders", totalSold: 1 },
  { name: "Hammer Claw 500g", category: "Hardware", purchasePrice: 220, sellingPrice: 350, stock: 39, supplier: "Sri Krishna Hardware Wholesale", totalSold: 1 },
  { name: "LED Bulb 9W B22", category: "Electrical", purchasePrice: 60, sellingPrice: 110, stock: 249, supplier: "Chennai Electricals Ltd", totalSold: 1 },
  { name: "MCB 16A Single Pole", category: "Electrical", purchasePrice: 140, sellingPrice: 220, stock: 59, supplier: "Chennai Electricals Ltd", totalSold: 1 },
  { name: "Measuring Tape 5m", category: "Hardware", purchasePrice: 90, sellingPrice: 160, stock: 22, supplier: "Sri Krishna Hardware Wholesale", totalSold: 0 },
  { name: "Padlock Heavy Duty", category: "Hardware", purchasePrice: 180, sellingPrice: 340, stock: 14, supplier: "Sri Krishna Hardware Wholesale", totalSold: 1 },
  { name: "PVC Pipe 4\" x 10ft", category: "Plumbing", purchasePrice: 350, sellingPrice: 480, stock: 38, supplier: "BathFit Sanitary Traders", totalSold: 2 },
  { name: "Stainless Hinges 4\"", category: "Hardware", purchasePrice: 45, sellingPrice: 85, stock: 119, supplier: "Sri Krishna Hardware Wholesale", totalSold: 1 },
  { name: "Switch Socket 6A", category: "Electrical", purchasePrice: 55, sellingPrice: 95, stock: 80, supplier: "Chennai Electricals Ltd", totalSold: 0 },
  { name: "PVC Conduit 1\" x 3m", category: "Electrical", purchasePrice: 70, sellingPrice: 120, stock: 45, supplier: "Chennai Electricals Ltd", totalSold: 0 },
  { name: "CPVC Pipe 3/4\"", category: "Plumbing", purchasePrice: 210, sellingPrice: 310, stock: 30, supplier: "BathFit Sanitary Traders", totalSold: 0 },
  { name: "Water Tank Float Valve", category: "Plumbing", purchasePrice: 65, sellingPrice: 110, stock: 25, supplier: "BathFit Sanitary Traders", totalSold: 0 },
  { name: "Vguard Neo Tower Fan", category: "Electrical", purchasePrice: 2700, sellingPrice: 3600, stock: 5, supplier: "Chennai Electricals Ltd", totalSold: 0 },
];

async function seed() {
  console.log("🌱 Seeding Firestore...\n");

  // Suppliers
  console.log("Adding suppliers...");
  const supplierRefs = {};
  for (const s of suppliers) {
    const ref = await db.collection("suppliers").add({ ...s, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    supplierRefs[s.name] = ref.id;
    console.log(`  ✓ ${s.name}`);
  }

  // Products
  console.log("\nAdding products...");
  for (const p of products) {
    await db.collection("products").add({ ...p, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    console.log(`  ✓ ${p.name}`);
  }

  console.log("\n✅ Seed complete!");
  console.log("\nNow create Firebase Auth users:");
  console.log("  admin@shop.com  / admin123  (admin role)");
  console.log("  staff@shop.com  / staff123  (staff role)");
  console.log("\nGo to Firebase Console > Authentication > Add User");
  process.exit(0);
}

seed().catch(err => {
  console.error("Seed failed:", err);
  process.exit(1);
});
