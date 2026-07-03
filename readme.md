# Employee Attendance System

A modern, responsive employee attendance tracking system using Firebase Firestore.

## Features

- ✅ Clean employee attendance dashboard
- ✅ Employee ID-based attendance cards
- ✅ Month-based attendance storage per employee
- ✅ Clock in/out by date, with hours automatically calculated
- ✅ Firebase Firestore backend for persistent storage
- ✅ Static hosting friendly

---

## Firebase Setup

### 1. Create a Firebase Project

1. Go to https://console.firebase.google.com/
2. Create a new project or use an existing one
3. Add a new Web App to the project

### 2. Enable Firestore

1. Navigate to **Build > Firestore Database**
2. Click **Create database**
3. Choose **Start in test mode** for initial development
4. Choose your preferred Cloud Firestore location

### 3. Copy Firebase Config

From your Firebase Web App settings, copy the config object and paste it into `script.js` under `firebaseConfig`:

```js
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID",
};
```

### 4. Update Firestore Rules for Development

For local testing, you can use this simple rule set in Firestore:

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

> Important: open rules are not safe for production. Lock them down before deploying publicly.

---

## How Attendance is Stored

This app stores data in Firestore with two collections:

- `employees`
  - Each document ID is the `employeeId`
  - Fields: `name`, `jobTitle`

- `attendanceCards`
  - Each document ID is `employeeId_month` (for example `rushil_2026-07`)
  - Fields:
    - `employeeId`
    - `month`
    - `attendance` (object keyed by day of month)

Example attendance document:

```json
{
  "employeeId": "rushil",
  "month": "2026-07",
  "attendance": {
    "1": {
      "Status": "P",
      "in": "09:55",
      "out": "18:01",
      "hours": 8.1
    },
    "2": {
      "Status": "P",
      "in": "10:33",
      "out": "22:33",
      "hours": 12.0
    },
    "3": {
      "Status": "A"
    },
    "4": {
      "Status": "S"
    }
  }
}
```

---

## Running the App

### Development Server

Since Firebase uses ES modules, you need to run the app through an HTTP server (not `file://` protocol).

**Option 1: Using the provided script (macOS/Linux)**
```bash
./serve.sh
```
Then open `http://localhost:8000` in your browser.

**Option 2: Using Python directly**
```bash
python3 -m http.server 8000
```
Then open `http://localhost:8000` in your browser.

**Option 3: Using Node.js**
```bash
npx http-server -p 8000
```
Then open `http://localhost:8000` in your browser.

Once the server is running:
1. Click **Add Employee** to create a new employee card
2. Use **IN** and **OUT** to record attendance

---

## Notes

- Employee records are stored in Firestore
- Attendance is grouped by `employeeId` and `month`
- Each day entry is appended into the monthly attendance card automatically

---

## Files Included

- `index.html` - Main HTML structure with semantic markup
- `styles.css` - UI styling and layout
- `script.js` - Firebase attendance logic and app state
- `readme.md` - Setup and Firebase instructions

---

## Troubleshooting

- **CORS Error or "Unsafe attempt to load URL file://"**: You must run the app through an HTTP server, not directly from `file://`. Use the provided `serve.sh` script or `python3 -m http.server 8000`.
- If employees do not load, ensure Firestore is enabled and your Firebase config is correct.
- If attendance is not saving, verify Firestore rules allow reads and writes, and that `firebaseConfig` in `script.js` is filled.
- If the app fails to start, confirm your browser supports ES modules and you are running it via HTTP server.

---

## Security Notes

- The example setup uses open Firestore rules for development.
- Secure your database in production by restricting reads and writes.
- Consider Firebase Authentication if you need access control.

---

## Customization

- Change the `employeeId` values in the UI when adding employees.
- To customize the UI, edit `styles.css`.
- Use Firestore console to inspect `employees` and `attendanceCards` collections.

---

## License

Open source. Use and modify as needed for your organization.


