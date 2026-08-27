# SHOPOPS 🔧
**A complete POS & Inventory Management System for Hardware, Electrical, Plumbing and Sanitary shops.**

Built with React (Vite) + Firebase (Firestore + Auth) — no paid tools, no backend server needed.

---

## Features
- 🛒 **POS Billing** — Fast billing with cart, discount, cash/UPI, WhatsApp receipt
- 📦 **Inventory Management** — Add/edit/delete products with cost, price, stock, supplier
- 📊 **Analytics** — Top selling products by volume and profit
- 📈 **Demand Prediction** — AI-style forecasting: days left, speed, reorder alerts
- 💰 **Expense Tracker** — Log daily costs
- 🚚 **Supplier Management** — Store supplier contacts
- 👥 **Role-based Access** — Admin (full access) vs Staff (billing only)

---

## Tech Stack
| Layer | Tech |
|-------|------|
| Frontend | React 18 + Vite |
| Database | Firebase Firestore |
| Auth | Firebase Authentication |
| Hosting | Firebase Hosting |
| Styling | Pure CSS (no UI library) |

---

## Setup Instructions

### Step 1 — Create Firebase Project

1. Go to [https://console.firebase.google.com](https://console.firebase.google.com)
2. Click **"Add project"** → name it `shopops` → continue
3. Disable Google Analytics (optional) → **Create project**

### Step 2 — Enable Firestore

1. In Firebase Console → **Build > Firestore Database**
2. Click **"Create database"**
3. Choose **"Start in test mode"** (we'll add rules later)
4. Select your region (e.g., `asia-south1` for India) → **Enable**

### Step 3 — Enable Authentication

1. In Firebase Console → **Build > Authentication**
2. Click **"Get started"**
3. Under **Sign-in method**, enable **Email/Password**
4. Go to **Users** tab → **Add user**:
   - Email: `admin@shop.com` | Password: `admin123`
   - Email: `staff@shop.com` | Password: `staff123`

### Step 4 — Get Firebase Config

1. In Firebase Console → **Project Settings** (gear icon)
2. Under **"Your apps"** → click **"Add app"** → choose **Web** (`</>`)
3. Register app as `shopops-web`
4. Copy the `firebaseConfig` object

### Step 5 — Add Config to Project

Open `src/firebase.js` and replace the placeholder values:

```js
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "shopops-xxxxx.firebaseapp.com",
  projectId: "shopops-xxxxx",
  storageBucket: "shopops-xxxxx.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};
```

### Step 6 — Install and Run

```bash
# Install dependencies
npm install

# Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — login with `admin@shop.com / admin123`

---

## Seed Demo Data (Optional)

To populate your Firestore with sample products and suppliers:

```bash
# Install Firebase Admin SDK
npm install firebase-admin

# Download service account key from:
# Firebase Console > Project Settings > Service Accounts > Generate new private key

# Run seed script
node seed.js path/to/serviceAccountKey.json
```

This adds 18 demo products and 3 suppliers matching the screenshots.

---

## Deploy to Firebase Hosting

```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login
firebase login

# Initialize hosting (select your project)
firebase init hosting
# > Public directory: dist
# > Single-page app: Yes
# > Overwrite index.html: No

# Build the app
npm run build

# Deploy
firebase deploy
```

Your app will be live at `https://YOUR-PROJECT-ID.web.app`

---

## Add Firestore Security Rules

After testing, update your Firestore rules (`firestore.rules`):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

Deploy rules:
```bash
firebase deploy --only firestore:rules
```

---

## Project Structure

```
shopops/
├── src/
│   ├── pages/
│   │   ├── Login.jsx          # Login screen
│   │   ├── Dashboard.jsx      # Overview stats & charts
│   │   ├── Billing.jsx        # POS billing screen
│   │   ├── Inventory.jsx      # Product management
│   │   ├── Analytics.jsx      # Sales analytics
│   │   ├── Demand.jsx         # Demand prediction
│   │   ├── Expenses.jsx       # Expense tracker
│   │   └── Suppliers.jsx      # Supplier management
│   ├── components/
│   │   └── Sidebar.jsx        # Navigation sidebar
│   ├── AppContext.jsx          # Global state + Firebase logic
│   ├── firebase.js            # Firebase config
│   ├── App.jsx                # Router & layout
│   ├── main.jsx               # Entry point
│   └── styles.css             # All styles
├── index.html
├── package.json
├── vite.config.js
├── firebase.json              # Firebase hosting config
├── firestore.rules            # Security rules
└── seed.js                    # Demo data seeder
```

---

## How Demand Prediction Works

For each product:
1. **Avg Daily Sales** = `totalSold ÷ days since product was added`
2. **Days Left** = `current stock ÷ avgDailySales`
3. **Status**:
   - 🔴 `REORDER URGENTLY` — days left < 5
   - 🟡 `LOW STOCK WARNING` — days left < 10
   - 🟢 `STOCK OK` — days left ≥ 10
4. **Speed**: `FAST` if avg/day ≥ 1, else `SLOW`

---

## Role-Based Access

| Feature | Admin | Staff |
|---------|-------|-------|
| Dashboard | ✅ | ❌ |
| POS Billing | ✅ | ✅ |
| Inventory | ✅ | ❌ |
| Analytics | ✅ | ❌ |
| Demand | ✅ | ❌ |
| Expenses | ✅ | ❌ |
| Suppliers | ✅ | ❌ |

Role is determined by email: `staff@...` = staff role, everything else = admin.

---

## WhatsApp Integration

After completing a sale, click **WHATSAPP** to send a formatted receipt:
```
*SHOPOPS Receipt*
1x MCB 16A Single Pole - ₹220
1x Hammer Claw 500g - ₹350

*Total: ₹570*
Payment: CASH
Thank you!
```

If a phone number was entered, it pre-fills the recipient. Otherwise opens WhatsApp to select a contact.

---

Made with ❤️ for Indian hardware shops.
