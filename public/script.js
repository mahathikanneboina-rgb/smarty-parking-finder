// --- CONFIGURATION & STATE ---
const API_BASE = window.location.origin;
let currentFloor = "ground";
let currentTab = "map-tab";
let activeUser = JSON.parse(localStorage.getItem("activeUser")) || null;
let parkingSlots = {};
let activeTicket = null;
let cctvStream = null;
let cctvInterval = null;
let isWebcamMode = false;
let isScanning = false;

// Chart references
let floorChart = null;
let distChart = null;
let peakChart = null;

// Navigation instructions mapping
const directionsMap = {
    ground: (slotId) => `🚗 Car parked at Ground Floor, Slot ${slotId}. Directions: Turn left at the main vehicle entry barrier, drive past Row A, slot is on the right-hand side.`,
    first: (slotId) => `🏍️ Bike parked at 1st Floor, Slot ${slotId}. Directions: Go up the northern ramp to the 1st floor. Turn right into the two-wheeler parking zone.`,
    second: (slotId) => `⚡ EV vehicle parked at 2nd Floor, Slot ${slotId}. Directions: Proceed to the southern ramp up to the 2nd floor. Go straight ahead to the Electric Vehicle charging docks.`
};

// --- INITIALIZATION ---
document.addEventListener("DOMContentLoaded", () => {
    initApp();
    setupEventListeners();
    setupSSE();
});

// --- CORE FUNCTIONS ---

async function initApp() {
    // 1. Check logged-in user state
    updateAuthUI();

    // 2. Fetch initial slot layout
    await fetchSlots();

    // 3. Render map slots
    renderSlotsGrid();

    // 4. Load any active ticket
    if (activeUser) {
        fetchActiveTicket();
    }
}

function setupEventListeners() {
    // Tab switching
    document.querySelectorAll(".nav-link").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const tabId = btn.getAttribute("data-tab");
            switchTab(tabId);
        });
    });

    // Floor buttons
    document.querySelectorAll(".floor-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".floor-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            currentFloor = btn.getAttribute("data-floor");
            document.getElementById("current-floor-title").textContent = `${capitalize(currentFloor)} Floor Layout`;
            renderSlotsGrid();
        });
    });

    // Search logic
    document.getElementById("searchBtn").addEventListener("click", handleSearch);
    document.getElementById("searchInput").addEventListener("keypress", (e) => {
        if (e.key === "Enter") handleSearch();
    });

    // Reset floor
    document.getElementById("resetBtn").addEventListener("click", handleResetFloor);

    // Auth actions
    const authActionBtn = document.getElementById("auth-action-btn");
    const authModal = document.getElementById("auth-modal");
    const closeAuthBtn = document.getElementById("close-auth-modal");
    const authToggleLink = document.getElementById("auth-toggle-link");
    const authForm = document.getElementById("auth-form");

    authActionBtn.addEventListener("click", () => {
        if (activeUser) {
            // Log out
            localStorage.removeItem("activeUser");
            activeUser = null;
            activeTicket = null;
            updateAuthUI();
            document.getElementById("no-ticket-state").classList.remove("hidden");
            document.getElementById("active-ticket-card").classList.add("hidden");
            showToast("Logged out successfully");
        } else {
            // Open Login Modal
            showModal(authModal);
        }
    });

    closeAuthBtn.addEventListener("click", () => hideModal(authModal));
    window.addEventListener("click", (e) => {
        if (e.target === authModal) hideModal(authModal);
    });

    // Toggle between login and register
    let isRegistering = false;
    authToggleLink.addEventListener("click", (e) => {
        e.preventDefault();
        isRegistering = !isRegistering;
        if (isRegistering) {
            document.getElementById("auth-title").textContent = "Register SmartPark Account";
            document.getElementById("auth-submit-btn").textContent = "Register";
            authToggleLink.textContent = "Log In here";
            document.getElementById("auth-toggle-text").textContent = "Already have an account?";
        } else {
            document.getElementById("auth-title").textContent = "Log In to SmartPark";
            document.getElementById("auth-submit-btn").textContent = "Log In";
            authToggleLink.textContent = "Register Now";
            document.getElementById("auth-toggle-text").textContent = "Don't have an account?";
        }
    });

    authForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const usernameInput = document.getElementById("username").value.trim();
        const passwordInput = document.getElementById("password").value;
        const endpoint = isRegistering ? "/api/auth/register" : "/api/auth/login";

        try {
            const res = await fetch(API_BASE + endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: usernameInput, password: passwordInput })
            });
            const data = await res.json();

            if (!res.ok) {
                alert(data.error || "Authentication failed");
                return;
            }

            activeUser = { username: usernameInput };
            localStorage.setItem("activeUser", JSON.stringify(activeUser));
            updateAuthUI();
            hideModal(authModal);
            authForm.reset();
            
            showToast(isRegistering ? "Registration successful! Welcome." : "Logged in successfully.");
            
            // Reload user tickets if login
            fetchActiveTicket();
            
        } catch (err) {
            console.error("Auth error:", err);
            alert("Connection error occurred. Is your server running?");
        }
    });

    // Booking Ticket Form Logic
    const bookingFloorSelect = document.getElementById("booking-floor");
    const bookingSlotSelect = document.getElementById("booking-slot");
    const vehicleCategorySelect = document.getElementById("vehicle-category");
    const ticketForm = document.getElementById("ticket-booking-form");

    bookingFloorSelect.addEventListener("change", () => {
        const floor = bookingFloorSelect.value;
        populateBookingSlots(floor);
        
        // Auto set category and rate display
        if (floor === "ground") {
            vehicleCategorySelect.value = "Car";
            document.getElementById("calc-price-display").textContent = "$3.00 / hour";
        } else if (floor === "first") {
            vehicleCategorySelect.value = "Bike";
            document.getElementById("calc-price-display").textContent = "$1.50 / hour";
        } else {
            vehicleCategorySelect.value = "EV";
            document.getElementById("calc-price-display").textContent = "$4.00 / hour";
        }
    });

    ticketForm.addEventListener("submit", handleTicketBooking);

    // Active ticket checkout
    document.getElementById("checkout-tkt-btn").addEventListener("click", handleCheckout);

    // Print active ticket
    document.getElementById("print-tkt-btn").addEventListener("click", () => {
        window.print();
    });

    // AI CCTV Controls
    document.getElementById("start-cctv-btn").addEventListener("click", startCCTV);
    document.getElementById("camera-toggle-btn").addEventListener("click", toggleCameraSource);
    document.getElementById("ai-simulate-btn").addEventListener("click", runAISimulator);

    // Copy script code
    document.getElementById("copy-py-btn").addEventListener("click", () => {
        const codeText = `# Install dependencies:
# pip install opencv-python ultralytics requests

import cv2
import requests
from ultralytics import YOLO

# Connect to Express Backend
API_URL = "http://localhost:3000/api/parking/ai-update"
model = YOLO('yolov8n.pt')

cap = cv2.VideoCapture(0)  # 0 for webcam

# Define bounding boxes mapped to slot IDs
# Each slot: [slot_id, xmin, ymin, xmax, ymax]
parking_slots = [
    [1, 50, 100, 150, 200],
    [2, 180, 100, 280, 200],
    # Add other slot bounding boxes
]

while cap.isOpened():
    ret, frame = cap.read()
    if not ret:
        break
        
    results = model(frame)
    detections = []
    
    # Analyze bounding boxes overlapping with slot presets
    # Set status: 'occupied' or 'available'
    # Send post request to API
    # requests.post(API_URL, json={"floor": "ground", "detections": detections})
`;
        navigator.clipboard.writeText(codeText);
        showToast("Python code copied to clipboard!");
    });
}

// --- SERVER API CALLS & SYNCS ---

async function fetchSlots() {
    try {
        const res = await fetch(API_BASE + "/api/parking/slots");
        if (res.ok) {
            parkingSlots = await res.json();
            updateStatsSummary();
        }
    } catch (err) {
        console.error("Error fetching slots:", err);
    }
}

async function fetchActiveTicket() {
    if (!activeUser) return;
    try {
        const res = await fetch(API_BASE + `/api/parking/ticket/${activeUser.username}`);
        if (res.ok) {
            activeTicket = await res.json();
            renderActiveTicket();
        } else {
            activeTicket = null;
            document.getElementById("no-ticket-state").classList.remove("hidden");
            document.getElementById("active-ticket-card").classList.add("hidden");
        }
    } catch (err) {
        console.error("Error fetching ticket:", err);
    }
}

async function handleTicketBooking(e) {
    e.preventDefault();
    if (!activeUser) {
        showToast("Please log in to reserve a slot");
        showModal(document.getElementById("auth-modal"));
        return;
    }

    const floor = document.getElementById("booking-floor").value;
    const slotId = document.getElementById("booking-slot").value;
    const vehicleNumber = document.getElementById("vehicle-number").value.trim().toUpperCase();
    const vehicleType = document.getElementById("vehicle-category").value;

    if (!slotId) {
        alert("Please select a slot");
        return;
    }

    try {
        const res = await fetch(API_BASE + "/api/parking/ticket", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                username: activeUser.username,
                floor,
                slotId,
                vehicleType,
                vehicleNumber
            })
        });

        const data = await res.json();
        if (!res.ok) {
            alert(data.error || "Reservation failed");
            return;
        }

        activeTicket = data.ticket;
        renderActiveTicket();
        document.getElementById("ticket-booking-form").reset();
        
        // Re-populate slot selection box
        populateBookingSlots(floor);
        showToast("Parking Slot Reserved Successfully!");
        
        // Auto-switch to ticket display tab
        switchTab("ticket-tab");
        
    } catch (err) {
        console.error("Error reserving slot:", err);
        alert("Server communication error.");
    }
}

async function handleCheckout() {
    if (!activeUser || !activeTicket) return;

    try {
        const res = await fetch(API_BASE + "/api/parking/ticket/checkout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: activeUser.username })
        });

        if (res.ok) {
            activeTicket = null;
            document.getElementById("no-ticket-state").classList.remove("hidden");
            document.getElementById("active-ticket-card").classList.add("hidden");
            showToast("Checked out! Slot has been released.");
            
            // Re-populate booking lists
            const floor = document.getElementById("booking-floor").value;
            populateBookingSlots(floor);
        } else {
            alert("Checkout failed.");
        }
    } catch (err) {
        console.error("Error during checkout:", err);
    }
}

async function handleResetFloor() {
    if (!confirm(`Are you sure you want to reset all slots on the ${capitalize(currentFloor)} Floor?`)) return;

    try {
        const res = await fetch(API_BASE + "/api/parking/slots/reset", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ floor: currentFloor })
        });

        if (res.ok) {
            showToast(`Floor ${capitalize(currentFloor)} reset complete`);
        } else {
            alert("Reset failed.");
        }
    } catch (err) {
        console.error("Error resetting floor:", err);
    }
}

async function toggleSlotStatusDirectly(slotId, currentStatus) {
    // Direct slot toggle for admin purposes (available -> reserved -> occupied)
    let newStatus = "available";
    if (currentStatus === "available") newStatus = "reserved";
    else if (currentStatus === "reserved") newStatus = "occupied";

    try {
        const res = await fetch(API_BASE + "/api/parking/slots/update", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                floor: currentFloor,
                slotId,
                status: newStatus,
                vehicleNumber: newStatus === "occupied" ? "MOCK-INF" : null
            })
        });

        if (!res.ok) {
            const errData = await res.json();
            showToast(errData.error || "Toggle failed");
        }
    } catch (err) {
        console.error("Error updating slot:", err);
    }
}

// --- SERVER-SENT EVENTS (SSE) SYNCHRONIZATION ---

function setupSSE() {
    const sse = new EventSource(API_BASE + "/api/parking/live");

    sse.addEventListener("ping", (e) => {
        console.log("Live stream connected:", JSON.parse(e.data));
    });

    sse.addEventListener("slotUpdate", (e) => {
        const update = JSON.parse(e.data);
        if (parkingSlots[update.floor]) {
            const index = parkingSlots[update.floor].findIndex(s => s.id === parseInt(update.slotId));
            if (index !== -1) {
                parkingSlots[update.floor][index] = update.slot;
                updateStatsSummary();
                if (update.floor === currentFloor) {
                    renderSlotsGrid();
                }
                
                // If it relates to active user ticket
                if (activeTicket && activeTicket.floor === update.floor && activeTicket.slotId === parseInt(update.slotId)) {
                    if (update.status === "available") {
                        activeTicket = null;
                        document.getElementById("no-ticket-state").classList.remove("hidden");
                        document.getElementById("active-ticket-card").classList.add("hidden");
                    }
                }
            }
        }
    });

    sse.addEventListener("bulkUpdate", (e) => {
        const data = JSON.parse(e.data);
        const { floor, updates } = data;
        
        if (parkingSlots[floor]) {
            updates.forEach(upd => {
                const index = parkingSlots[floor].findIndex(s => s.id === parseInt(upd.slotId));
                if (index !== -1) {
                    parkingSlots[floor][index] = upd.slot;
                }
            });
            updateStatsSummary();
            if (floor === currentFloor) {
                renderSlotsGrid();
            }
            showToast(`AI camera updated ${updates.length} slots on Floor ${capitalize(floor)}`);
        }
    });

    sse.addEventListener("floorReset", (e) => {
        const data = JSON.parse(e.data);
        const { floor, slots } = data;
        
        if (parkingSlots[floor]) {
            parkingSlots[floor] = slots;
            updateStatsSummary();
            if (floor === currentFloor) {
                renderSlotsGrid();
            }
            
            // Check if active ticket was cleared
            if (activeTicket && activeTicket.floor === floor) {
                activeTicket = null;
                document.getElementById("no-ticket-state").classList.remove("hidden");
                document.getElementById("active-ticket-card").classList.add("hidden");
            }
            showToast(`Floor ${capitalize(floor)} layout was reset`);
        }
    });

    sse.onerror = (err) => {
        console.error("SSE connection lost. Re-establishing...", err);
    };
}

// --- RENDER FRONTEND COMPONENTS ---

function renderSlotsGrid() {
    const grid = document.getElementById("parkingGrid");
    grid.innerHTML = "";

    const slots = parkingSlots[currentFloor] || [];
    
    slots.forEach(slot => {
        const slotEl = document.createElement("div");
        slotEl.className = `slot ${slot.status}`;
        slotEl.setAttribute("data-id", slot.id);
        
        // Setup Icon
        let iconClass = "fa-car";
        if (slot.type === "Bike") iconClass = "fa-motorcycle";
        else if (slot.type === "EV") iconClass = "fa-bolt";

        slotEl.innerHTML = `
            <span class="slot-num">${slot.id}</span>
            <i class="fa-solid ${iconClass} slot-type-icon"></i>
            <span class="slot-type">${slot.type}</span>
        `;

        slotEl.addEventListener("click", () => {
            toggleSlotStatusDirectly(slot.id, slot.status);
        });

        grid.appendChild(slotEl);
    });

    // Populate slot selector for current floor booking
    const bookingFloor = document.getElementById("booking-floor").value;
    populateBookingSlots(bookingFloor);
}

function populateBookingSlots(floor) {
    const slotSelect = document.getElementById("booking-slot");
    slotSelect.innerHTML = '<option value="">-- Choose Slot --</option>';

    const slots = parkingSlots[floor] || [];
    const availableSlots = slots.filter(s => s.status === "available");

    availableSlots.forEach(s => {
        const opt = document.createElement("option");
        opt.value = s.id;
        opt.textContent = `Slot ${s.id}`;
        slotSelect.appendChild(opt);
    });
}

function updateStatsSummary() {
    // Compute total available, reserved, occupied slots across all floors
    let total = 60;
    let available = 0;
    let reserved = 0;
    let occupied = 0;

    Object.keys(parkingSlots).forEach(floor => {
        parkingSlots[floor].forEach(slot => {
            if (slot.status === "available") available++;
            else if (slot.status === "reserved") reserved++;
            else if (slot.status === "occupied") occupied++;
        });
    });

    document.getElementById("availableSlots").textContent = available;
    document.getElementById("reservedSlots").textContent = reserved;
    document.getElementById("occupiedSlots").textContent = occupied;

    const occupancyRate = Math.round(((reserved + occupied) / total) * 100);
    document.getElementById("occupancyPercent").textContent = `${occupancyRate}%`;

    // Update SVG Progress ring
    const circle = document.getElementById("occupancyCircle");
    const radius = circle.r.baseVal.value;
    const circumference = radius * 2 * Math.PI;
    const offset = circumference - (occupancyRate / 100) * circumference;
    circle.style.strokeDashoffset = offset;

    // EV details updates
    const evAvailable = (parkingSlots.second || []).filter(s => s.status === "available").length;
    const evStatusText = document.getElementById("ev-charger-stat");
    if (evStatusText) {
        evStatusText.textContent = `${evAvailable} Available`;
        if (evAvailable === 0) {
            evStatusText.className = "metric-value text-danger";
        } else {
            evStatusText.className = "metric-value text-success";
        }
    }
}

function renderActiveTicket() {
    if (!activeTicket) return;

    document.getElementById("no-ticket-state").classList.add("hidden");
    document.getElementById("active-ticket-card").classList.remove("hidden");

    document.getElementById("tkt-id-val").textContent = activeTicket.id;
    document.getElementById("tkt-floor-val").textContent = capitalize(activeTicket.floor);
    document.getElementById("tkt-slot-val").textContent = `Slot ${activeTicket.slotId}`;
    document.getElementById("tkt-type-val").textContent = activeTicket.vehicleType;
    document.getElementById("tkt-plate-val").textContent = activeTicket.vehicleNumber;
    
    const bookedTime = new Date(activeTicket.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    document.getElementById("tkt-time-val").textContent = bookedTime;

    // Print Directions path
    const navText = directionsMap[activeTicket.floor](activeTicket.slotId);
    document.getElementById("tkt-nav-directions").textContent = navText;
}

// --- TAB NAV & ANALYTICS CHARTS ---

function switchTab(tabId) {
    document.querySelectorAll(".nav-link").forEach(btn => {
        btn.classList.remove("active");
        if (btn.getAttribute("data-tab") === tabId) {
            btn.classList.add("active");
        }
    });

    document.querySelectorAll(".tab-pane").forEach(pane => {
        pane.classList.remove("active");
    });

    document.getElementById(tabId).classList.add("active");
    currentTab = tabId;

    if (tabId === "analytics-tab") {
        renderAnalyticsCharts();
    }
}

async function renderAnalyticsCharts() {
    try {
        const res = await fetch(API_BASE + "/api/parking/analytics");
        if (!res.ok) return;
        const analytics = await res.json();

        // 1. Destroy existing charts to prevent canvas re-use errors
        if (floorChart) floorChart.destroy();
        if (distChart) distChart.destroy();
        if (peakChart) peakChart.destroy();

        // 2. Bar Chart: Floor Occupancy Rate
        const ctxFloor = document.getElementById("floorOccupancyChart").getContext("2d");
        floorChart = new Chart(ctxFloor, {
            type: 'bar',
            data: {
                labels: ['Ground (Cars)', '1st Floor (Bikes)', '2nd Floor (EVs)'],
                datasets: [{
                    label: 'Occupancy Rate (%)',
                    data: [
                        analytics.occupancy.ground.percent,
                        analytics.occupancy.first.percent,
                        analytics.occupancy.second.percent
                    ],
                    backgroundColor: ['rgba(14, 165, 233, 0.6)', 'rgba(16, 185, 129, 0.6)', 'rgba(245, 158, 11, 0.6)'],
                    borderColor: ['#0ea5e9', '#10b981', '#f59e0b'],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { min: 0, max: 100, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
                    x: { grid: { display: false }, ticks: { color: '#94a3b8' } }
                }
            }
        });

        // 3. Doughnut Chart: Vehicle Distribution
        const ctxDist = document.getElementById("vehicleDistributionChart").getContext("2d");
        distChart = new Chart(ctxDist, {
            type: 'doughnut',
            data: {
                labels: ['Cars', 'Bikes', 'EV Charging'],
                datasets: [{
                    data: [
                        analytics.distribution.Car,
                        analytics.distribution.Bike,
                        analytics.distribution.EV
                    ],
                    backgroundColor: ['#0ea5e9', '#10b981', '#f59e0b'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: { color: '#94a3b8', font: { family: 'Inter' } }
                    }
                }
            }
        });

        // 4. Line Chart: Peak Booking Hours
        const ctxPeak = document.getElementById("peakHoursChart").getContext("2d");
        peakChart = new Chart(ctxPeak, {
            type: 'line',
            data: {
                labels: analytics.peakHours.map(d => d.hour),
                datasets: [{
                    label: 'Simulated Occupancy %',
                    data: analytics.peakHours.map(d => d.occupancy),
                    borderColor: '#0ea5e9',
                    backgroundColor: 'rgba(14, 165, 233, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { min: 0, max: 100, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
                    x: { grid: { display: false }, ticks: { color: '#94a3b8' } }
                }
            }
        });

    } catch (err) {
        console.error("Error rendering charts:", err);
    }
}

// --- AI CCTV CAMERA YOLO EMULATOR ---

function startCCTV() {
    const canvas = document.getElementById("cctvCanvas");
    const ctx = canvas.getContext("2d");
    const offState = document.getElementById("camera-off-state");
    
    offState.classList.add("hidden");

    if (isWebcamMode) {
        // Access true physical webcam feed
        navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 360 } })
            .then(stream => {
                cctvStream = stream;
                const video = document.createElement("video");
                video.srcObject = stream;
                video.autoplay = true;
                video.playsInline = true;
                
                video.addEventListener("play", () => {
                    cctvInterval = setInterval(() => {
                        ctx.drawImage(video, 0, 0, 640, 360);
                        drawAISimulatorOverlay(ctx);
                    }, 33); // ~30 fps
                });
            })
            .catch(err => {
                console.error("Webcam access error:", err);
                showToast("Could not access webcam. Using animated canvas simulation instead.");
                isWebcamMode = false;
                startMockCCTVSimulation();
            });
    } else {
        startMockCCTVSimulation();
    }
}

function startMockCCTVSimulation() {
    const canvas = document.getElementById("cctvCanvas");
    const ctx = canvas.getContext("2d");
    
    let frameCount = 0;
    cctvInterval = setInterval(() => {
        frameCount++;
        drawMockParkingLot(ctx, frameCount);
        drawAISimulatorOverlay(ctx);
    }, 33);
}

function stopCCTV() {
    clearInterval(cctvInterval);
    if (cctvStream) {
        cctvStream.getTracks().forEach(track => track.stop());
        cctvStream = null;
    }
    const canvas = document.getElementById("cctvCanvas");
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, 640, 360);
    document.getElementById("camera-off-state").classList.remove("hidden");
    document.getElementById("yolo-detections").textContent = "0 Vehicles";
}

function toggleCameraSource() {
    stopCCTV();
    isWebcamMode = !isWebcamMode;
    showToast(isWebcamMode ? "Switched to live webcam mode" : "Switched to schematic simulation mode");
    startCCTV();
}

function drawMockParkingLot(ctx, frameCount) {
    // Draw grid background representational parking spaces
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(0, 0, 640, 360);

    // Draw yellow parking lines
    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 3;
    
    // Draw parking slot cells in canvas
    for (let i = 0; i < 5; i++) {
        // Top Row Slots
        ctx.strokeRect(50 + i * 110, 50, 90, 100);
        // Label
        ctx.fillStyle = "#64748b";
        ctx.font = "14px 'Outfit'";
        ctx.fillText(`SLOT ${i+1}`, 75 + i * 110, 40);

        // Draw Mock Cars in some slots (e.g. slots 1, 3, 5 are occupied)
        if (i === 0 || i === 2 || i === 4) {
            drawCarGraphic(ctx, 60 + i * 110, 65, "#38bdf8"); // blue car
        }

        // Bottom Row Slots
        ctx.strokeRect(50 + i * 110, 200, 90, 100);
        ctx.fillText(`SLOT ${i+6}`, 75 + i * 110, 320);
        
        // Slot 8 and 10 occupied
        if (i === 2 || i === 4) {
            drawCarGraphic(ctx, 60 + i * 110, 215, "#f43f5e"); // red car
        }
    }
    
    // Floating CCTV overlay timestamps
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(500, 10, 130, 25);
    ctx.fillStyle = "#10b981";
    ctx.font = "11px Courier New";
    const dateStr = new Date().toLocaleTimeString();
    ctx.fillText(`CAM-01 | ${dateStr}`, 505, 27);
}

function drawCarGraphic(ctx, x, y, color) {
    ctx.fillStyle = color;
    // Car Body
    ctx.fillRect(x + 10, y + 15, 50, 35);
    // Cabin
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fillRect(x + 20, y + 20, 30, 25);
    // Wheels
    ctx.fillStyle = "#000";
    ctx.fillRect(x + 15, y + 10, 10, 8);
    ctx.fillRect(x + 45, y + 10, 10, 8);
    ctx.fillRect(x + 15, y + 47, 10, 8);
    ctx.fillRect(x + 45, y + 47, 10, 8);
}

function drawAISimulatorOverlay(ctx) {
    // If not scanning or doing regular feed
    ctx.strokeStyle = "rgba(0, 255, 0, 0.4)";
    ctx.lineWidth = 1;
    // Draw crosshair
    ctx.beginPath();
    ctx.moveTo(320, 20); ctx.lineTo(320, 340);
    ctx.moveTo(20, 180); ctx.lineTo(620, 180);
    ctx.stroke();

    // If scanning, show overlay bounding boxes
    if (isScanning) {
        ctx.strokeStyle = "#ef4444";
        ctx.lineWidth = 2;
        ctx.fillStyle = "#ef4444";
        ctx.font = "bold 11px Inter";

        let detectionsCount = 0;

        // Bounding boxes drawn on top of cars
        if (!isWebcamMode) {
            // Draw boxes matching our mock schematic
            const spots = [
                { id: 1, x: 55, y: 55, w: 80, h: 90, label: "car [97%]" },
                { id: 3, x: 275, y: 55, w: 80, h: 90, label: "car [95%]" },
                { id: 5, x: 495, y: 55, w: 80, h: 90, label: "car [99%]" },
                { id: 8, x: 275, y: 205, w: 80, h: 90, label: "car [92%]" },
                { id: 10, x: 495, y: 205, w: 80, h: 90, label: "car [94%]" }
            ];
            spots.forEach(box => {
                ctx.strokeRect(box.x, box.y, box.w, box.h);
                ctx.fillText(box.label, box.x, box.y - 5);
            });
            detectionsCount = spots.length;
        } else {
            // Webcam mode: draw 2-3 randomized boxes to simulate actual moving objects!
            const box1 = { x: 120, y: 80, w: 140, h: 180, label: "vehicle [88%]" };
            const box2 = { x: 380, y: 120, w: 120, h: 160, label: "vehicle [91%]" };
            [box1, box2].forEach(box => {
                ctx.strokeRect(box.x, box.y, box.w, box.h);
                ctx.fillText(box.label, box.x, box.y - 5);
            });
            detectionsCount = 2;
        }

        document.getElementById("yolo-detections").textContent = `${detectionsCount} Vehicles`;
    }
}

async function runAISimulator() {
    if (isScanning) return;
    
    // Check if camera feed is active
    if (!cctvInterval) {
        showToast("Please start the Camera Feed first!");
        return;
    }

    isScanning = true;
    document.getElementById("cctv-overlay-text").classList.remove("hidden");
    
    // Simulate latency
    setTimeout(async () => {
        document.getElementById("cctv-overlay-text").classList.add("hidden");
        
        // Define detections to send to backend API
        // In simulation: we occupy slots 1, 3, 5, 8, 10, and free others
        let detections = [];
        for (let sId = 1; sId <= 20; sId++) {
            if ([1, 3, 5, 8, 10].includes(sId)) {
                detections.push({ slotId: sId, status: "occupied" });
            } else {
                detections.push({ slotId: sId, status: "available" });
            }
        }

        try {
            const res = await fetch(API_BASE + "/api/parking/ai-update", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    floor: currentFloor,
                    detections: detections
                })
            });

            if (res.ok) {
                showToast("YOLO Scan Complete. Dashboard Updated!");
            } else {
                alert("Failed to send AI updates to backend.");
            }
        } catch (e) {
            console.error("AI API Error:", e);
        }

        isScanning = false;
    }, 2000);
}

// --- UTILITY HELPER FUNCTIONS ---

function updateAuthUI() {
    const authActionBtn = document.getElementById("auth-action-btn");
    const userDisplay = document.getElementById("user-display");

    if (activeUser) {
        userDisplay.innerHTML = `<i class="fa-solid fa-circle-user text-primary"></i> ${activeUser.username}`;
        authActionBtn.textContent = "Log Out";
    } else {
        userDisplay.innerHTML = `<i class="fa-solid fa-circle-user"></i> Guest`;
        authActionBtn.textContent = "Log In";
    }
}

function handleSearch() {
    const searchVal = Number(document.getElementById("searchInput").value.trim());
    if (isNaN(searchVal) || searchVal <= 0 || searchVal > 20) {
        showToast("Please enter a valid slot ID (1-20)");
        return;
    }

    const targetSlot = document.querySelector(`.slot[data-id="${searchVal}"]`);
    if (targetSlot) {
        // Clear previous highlights
        document.querySelectorAll(".slot").forEach(s => s.classList.remove("highlight"));
        
        targetSlot.classList.add("highlight");
        targetSlot.scrollIntoView({ behavior: "smooth", block: "center" });

        // Remove glow animation after 4 seconds
        setTimeout(() => {
            targetSlot.classList.remove("highlight");
        }, 4000);
    } else {
        showToast(`Slot ${searchVal} not found on this floor`);
    }
}

function showModal(modalEl) {
    modalEl.classList.remove("hidden");
}

function hideModal(modalEl) {
    modalEl.classList.add("hidden");
}

function showToast(message) {
    const toast = document.getElementById("toast-notification");
    document.getElementById("toast-message").textContent = message;
    toast.classList.remove("hidden");
    
    // Automatically hide toast
    setTimeout(() => {
        toast.classList.add("hidden");
    }, 3500);
}

function capitalize(str) {
    if (!str) return "";
    return str.charAt(0).toUpperCase() + str.slice(1);
}
