<div align="center">

# 🅿️ SmartPark AI — Smart Parking Management System

**A Full-Stack AI-Powered Smart Parking Finder built with Node.js, Express, and YOLOv8**

[![Node.js](https://img.shields.io/badge/Node.js-v18+-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-4.x-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES2022-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Python](https://img.shields.io/badge/Python-3.8+-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![YOLOv8](https://img.shields.io/badge/YOLOv8-AI%20Detection-FF4088?style=for-the-badge)](https://ultralytics.com)

![SmartPark Banner](https://img.shields.io/badge/Status-Live%20Demo%20Ready-10b981?style=for-the-badge)

</div>

---

## 📖 About the Project

**SmartPark AI** is a complete Smart Parking Management System that solves the real-world problem of people wasting time searching for parking slots in malls, hospitals, colleges, and theaters.

The system shows real-time parking availability before a vehicle enters, supports digital ticket reservations, provides visual analytics, and includes an AI camera module powered by **YOLOv8 + OpenCV** for automatic slot detection.

> 🏆 Built as a portfolio project — suitable for GitHub showcase, college demonstrations, and resume.

---

## ✨ Features

### Phase 1 — Core Parking Map
- 🟢 **Available**, 🟡 **Reserved**, 🔴 **Occupied** slot visualization
- Real-time slot status counters
- Slot search with animated highlight
- Persistent slot state (JSON database)

### Phase 2 — Advanced Frontend
- 🏢 **Multi-floor parking** — Ground (Cars), 1st Floor (Bikes), 2nd Floor (EVs)
- 🚗 Vehicle categories with dedicated zones
- 🎫 **Digital Parking Ticket** with QR code & wayfinding directions
- 📊 Occupancy percentage ring meter

### Phase 3 — Full Stack Backend
- ⚡ **Node.js + Express** REST API
- 👤 **User Authentication** — Register & Login with bcrypt password hashing
- 💾 **JSON file-based database** — Zero setup required
- 📡 **Server-Sent Events (SSE)** — Live real-time synchronization across all tabs/devices
- 📈 Analytics endpoint for charts and metrics

### Phase 4 — AI Integration
- 🤖 **HTML5 Canvas YOLO Simulator** — Draw bounding boxes in the browser
- 📷 **Webcam Mode** — Real device camera feed with overlay
- 🐍 **`ai_detector.py`** — Full Python script with OpenCV + YOLOv8 for physical camera integration
- 🔁 AI detections auto-sync to the web dashboard via REST API

---

## 🖼️ Screenshots

| Parking Map | Analytics Dashboard |
|---|---|
| *Real-time slot grid with floor switching* | *Chart.js occupancy & distribution charts* |

| Digital Ticket Pass | AI CCTV Simulator |
|---|---|
| *Printable boarding pass with QR code* | *Canvas YOLO bounding box overlay* |

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org) v18 or higher
- npm (comes with Node.js)
- *(Optional)* Python 3.8+ for AI camera integration

### 1. Clone the Repository
```bash
git clone https://github.com/YOUR_USERNAME/smarty-parking-finder.git
cd smarty-parking-finder
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Start the Server
```bash
npm start
```

### 4. Open in Browser
```
http://localhost:3000
```

That's it! The database (`db.json`) will auto-initialize on first run.

---

## 🤖 AI Camera Integration (Optional)

To connect a real webcam or CCTV camera feed:

### Install Python Requirements
```bash
pip install opencv-python ultralytics requests
```

### Run the AI Detector
```bash
python ai_detector.py
```

The script will:
1. Open your webcam (or a video file)
2. Run YOLOv8 inference on each frame
3. Map detected vehicles to pre-calibrated parking slot zones
4. Sync results to the web dashboard in real time via `POST /api/parking/ai-update`

---

## 🗂️ Project Structure

```
smarty-parking-finder/
├── 📄 server.js              # Express server, REST API, SSE broadcaster
├── 📄 package.json           # Node.js dependencies & scripts
├── 📄 db.json                # Auto-generated file database (gitignored)
├── 🐍 ai_detector.py         # Python YOLOv8 + OpenCV AI script
├── 📁 public/
│   ├── 📄 index.html         # Main SPA dashboard (4 tabs)
│   ├── 🎨 style.css          # Glassmorphic dark theme UI
│   └── ⚙️  script.js         # Client logic, SSE, Chart.js, Canvas renderer
└── 📄 .gitignore
```

---

## 🌐 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/parking/slots` | Get all parking slots for all floors |
| `POST` | `/api/parking/slots/update` | Update a single slot status |
| `POST` | `/api/parking/slots/reset` | Reset all slots on a floor |
| `POST` | `/api/auth/register` | Register a new user |
| `POST` | `/api/auth/login` | User login |
| `POST` | `/api/parking/ticket` | Reserve a slot & generate a ticket |
| `GET` | `/api/parking/ticket/:username` | Get user's active ticket |
| `POST` | `/api/parking/ticket/checkout` | Release a reserved slot |
| `GET` | `/api/parking/analytics` | Get analytics data for charts |
| `POST` | `/api/parking/ai-update` | Bulk slot update from AI camera script |
| `GET` | `/api/parking/live` | **SSE** — Subscribe to live slot updates |

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | HTML5, Vanilla CSS (Glassmorphism), Vanilla JavaScript |
| **Charts** | Chart.js (Bar, Doughnut, Line) |
| **Icons / Fonts** | FontAwesome 6, Google Fonts (Inter, Outfit) |
| **Backend** | Node.js, Express.js |
| **Database** | JSON file database (zero-config) |
| **Auth** | bcryptjs password hashing |
| **Live Updates** | Server-Sent Events (SSE) |
| **AI / CV** | Python, OpenCV, Ultralytics YOLOv8 |

---

## 🔮 Future Enhancements

- [ ] MongoDB integration for scalable production data
- [ ] JWT token-based authentication
- [ ] Mobile app (React Native)
- [ ] Raspberry Pi integration for physical sensor modules
- [ ] Payment gateway integration (Stripe)
- [ ] Email/SMS notifications for reservation reminders
- [ ] Docker containerization

---

## 👤 Author

**Mahathi** — Built with ❤️ for college project demonstration and GitHub portfolio.

---

## 📝 License

This project is open source under the [MIT License](LICENSE).
