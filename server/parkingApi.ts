// @ts-nocheck
import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';

const app = express();
const PORT = process.env.PORT || 3000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_FILE = process.env.VERCEL
    ? path.join('/tmp', 'smarty-parking-db.json')
    : path.join(__dirname, 'db.json');
const VALID_STATUSES = new Set(['available', 'reserved', 'occupied']);

app.use(cors());
app.use(express.json());

// SSE Client list
let sseClients: Array<{ id: number; res: express.Response }> = [];

// Helper functions for DB access
function readDB() {
    if (!fs.existsSync(DB_FILE)) {
        initDB();
    }
    try {
        const data = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        console.error("Error reading database:", e);
        return { users: [], slots: {}, tickets: [] };
    }
}

function writeDB(data) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error("Error writing to database:", e);
    }
}

function initDB() {
    const defaultDB = {
        users: [],
        slots: {
            ground: Array.from({ length: 20 }, (_, i) => ({
                id: i + 1,
                floor: "ground",
                type: "Car",
                status: "available", // available, reserved, occupied
                vehicleNumber: null,
                updatedAt: new Date().toISOString()
            })),
            first: Array.from({ length: 20 }, (_, i) => ({
                id: i + 1,
                floor: "first",
                type: "Bike",
                status: "available",
                vehicleNumber: null,
                updatedAt: new Date().toISOString()
            })),
            second: Array.from({ length: 20 }, (_, i) => ({
                id: i + 1,
                floor: "second",
                type: "EV",
                status: "available",
                vehicleNumber: null,
                updatedAt: new Date().toISOString()
            }))
        },
        tickets: []
    };
    writeDB(defaultDB);
    console.log("Database initialized successfully.");
}

// Initialize database on startup
if (!fs.existsSync(DB_FILE)) {
    initDB();
}

// Broadcaster function for Server-Sent Events (SSE)
function broadcastToClients(type, data) {
    const message = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
    sseClients.forEach(client => client.res.write(message));
}

// SSE endpoint for live updates
app.get('/api/parking/live', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const clientId = Date.now();
    const newClient = { id: clientId, res };
    sseClients.push(newClient);

    // Send initial ping or layout data
    res.write(`event: ping\ndata: ${JSON.stringify({ connected: true })}\n\n`);

    req.on('close', () => {
        sseClients = sseClients.filter(c => c.id !== clientId);
    });
});

// --- AUTHENTICATION ROUTES ---

app.post('/api/auth/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: "Username and password required" });
    }

    const db = readDB();
    const userExists = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
    if (userExists) {
        return res.status(400).json({ error: "Username already exists" });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    const newUser = { id: Date.now(), username, password: hashedPassword };
    db.users.push(newUser);
    writeDB(db);

    res.status(201).json({ message: "Registration successful", user: { username } });
});

app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: "Username and password required" });
    }

    const db = readDB();
    const user = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
    if (!user || !bcrypt.compareSync(password, user.password)) {
        return res.status(401).json({ error: "Invalid username or password" });
    }

    res.json({ message: "Login successful", user: { username } });
});

// --- PARKING SLOTS ROUTES ---

// Get all slots
app.get('/api/parking/slots', (req, res) => {
    const db = readDB();
    res.json(db.slots);
});

// Update an individual slot (toggle or set state manually)
app.post('/api/parking/slots/update', (req, res) => {
    const { floor, slotId, status, vehicleNumber } = req.body;
    if (!floor || !slotId || !status) {
        return res.status(400).json({ error: "Missing required fields: floor, slotId, status" });
    }
    if (!VALID_STATUSES.has(status)) {
        return res.status(400).json({ error: "Invalid status. Use available, reserved, or occupied" });
    }

    const db = readDB();
    if (!db.slots[floor]) {
        return res.status(400).json({ error: "Invalid floor selection" });
    }

    const slot = db.slots[floor].find(s => s.id === parseInt(slotId));
    if (!slot) {
        return res.status(404).json({ error: "Slot not found" });
    }

    // Update status
    slot.status = status;
    slot.vehicleNumber = vehicleNumber || null;
    slot.updatedAt = new Date().toISOString();

    // If making it available, clear any associated active tickets for this slot
    if (status === 'available') {
        db.tickets = db.tickets.map(t => {
            if (t.floor === floor && t.slotId === parseInt(slotId) && t.active) {
                return { ...t, active: false, checkedOutAt: new Date().toISOString() };
            }
            return t;
        });
    }

    writeDB(db);
    
    // Broadcast live update
    broadcastToClients('slotUpdate', { floor, slotId, status, slot });
    
    res.json({ message: "Slot updated successfully", slot });
});

// Reset slots for a specific floor
app.post('/api/parking/slots/reset', (req, res) => {
    const { floor } = req.body;
    if (!floor) {
        return res.status(400).json({ error: "Floor required" });
    }

    const db = readDB();
    if (!db.slots[floor]) {
        return res.status(400).json({ error: "Invalid floor" });
    }

    // Reset slots
    db.slots[floor] = db.slots[floor].map(slot => ({
        ...slot,
        status: "available",
        vehicleNumber: null,
        updatedAt: new Date().toISOString()
    }));

    // Inactivate associated tickets
    db.tickets = db.tickets.map(t => {
        if (t.floor === floor && t.active) {
            return { ...t, active: false, checkedOutAt: new Date().toISOString() };
        }
        return t;
    });

    writeDB(db);
    
    // Broadcast updates
    broadcastToClients('floorReset', { floor, slots: db.slots[floor] });
    
    res.json({ message: `Floor ${floor} reset successfully`, slots: db.slots[floor] });
});

// --- DIGITAL PARKING TICKET & RESERVATION ---

// Create ticket / Reserve a slot
app.post('/api/parking/ticket', (req, res) => {
    const { username, floor, slotId, vehicleType, vehicleNumber } = req.body;
    if (!username || !floor || !slotId || !vehicleType) {
        return res.status(400).json({ error: "Missing required fields for ticket generation" });
    }

    const db = readDB();
    if (!db.slots[floor]) {
        return res.status(400).json({ error: "Invalid floor" });
    }

    const slot = db.slots[floor].find(s => s.id === parseInt(slotId));
    if (!slot) {
        return res.status(404).json({ error: "Slot not found" });
    }

    if (slot.status !== 'available') {
        return res.status(400).json({ error: "Slot is already reserved or occupied" });
    }

    // Create ticket
    const ticketId = 'TKT-' + Math.floor(100000 + Math.random() * 900000);
    const now = new Date();
    const newTicket = {
        id: ticketId,
        username,
        floor,
        slotId: parseInt(slotId),
        vehicleType,
        vehicleNumber: vehicleNumber || "N/A",
        createdAt: now.toISOString(),
        active: true
    };

    // Deactivate previous active tickets for this user
    db.tickets = db.tickets.map(t => {
        if (t.username.toLowerCase() === username.toLowerCase() && t.active) {
            // Also free their previous slot if they had one active
            const prevSlot = db.slots[t.floor]?.find(s => s.id === t.slotId);
            if (prevSlot && prevSlot.status === 'reserved') {
                prevSlot.status = 'available';
                prevSlot.vehicleNumber = null;
                broadcastToClients('slotUpdate', { floor: t.floor, slotId: t.slotId, status: 'available', slot: prevSlot });
            }
            return { ...t, active: false, checkedOutAt: now.toISOString() };
        }
        return t;
    });

    db.tickets.push(newTicket);

    // Update slot status to reserved
    slot.status = 'reserved';
    slot.vehicleNumber = vehicleNumber || null;
    slot.updatedAt = now.toISOString();

    writeDB(db);
    
    // Broadcast slot update
    broadcastToClients('slotUpdate', { floor, slotId: parseInt(slotId), status: 'reserved', slot });
    
    res.status(201).json({ message: "Slot reserved and ticket generated", ticket: newTicket });
});

// Get user's active ticket
app.get('/api/parking/ticket/:username', (req, res) => {
    const { username } = req.params;
    const db = readDB();
    const activeTicket = db.tickets.find(t => t.username.toLowerCase() === username.toLowerCase() && t.active);
    
    if (!activeTicket) {
        return res.status(404).json({ error: "No active ticket found for this user" });
    }
    
    res.json(activeTicket);
});

// Checkout / Release slot
app.post('/api/parking/ticket/checkout', (req, res) => {
    const { username } = req.body;
    if (!username) {
        return res.status(400).json({ error: "Username required" });
    }

    const db = readDB();
    const activeTicket = db.tickets.find(t => t.username.toLowerCase() === username.toLowerCase() && t.active);
    
    if (!activeTicket) {
        return res.status(404).json({ error: "No active ticket found for user" });
    }

    // Deactivate ticket
    activeTicket.active = false;
    activeTicket.checkedOutAt = new Date().toISOString();

    // Free the slot
    const slot = db.slots[activeTicket.floor].find(s => s.id === activeTicket.slotId);
    if (slot) {
        slot.status = 'available';
        slot.vehicleNumber = null;
        slot.updatedAt = new Date().toISOString();
        broadcastToClients('slotUpdate', { floor: activeTicket.floor, slotId: activeTicket.slotId, status: 'available', slot });
    }

    writeDB(db);
    res.json({ message: "Checkout completed successfully", ticket: activeTicket });
});

// --- AI yolo webHOOK ENDPOINT ---

// Bulk update slots (e.g. from Python script YOLO predictions)
app.post('/api/parking/ai-update', (req, res) => {
    const { floor, detections } = req.body; // detections = [{ slotId: 1, status: 'occupied'/'available' }]
    if (!floor || !Array.isArray(detections)) {
        return res.status(400).json({ error: "Invalid data format. Need floor and detections array." });
    }

    const db = readDB();
    if (!db.slots[floor]) {
        return res.status(400).json({ error: "Invalid floor" });
    }

    let updatedCount = 0;
    const updatedSlots = [];

    detections.forEach(det => {
        if (!det || !VALID_STATUSES.has(det.status)) return;
        const slot = db.slots[floor].find(s => s.id === parseInt(det.slotId));
        if (slot) {
            // Only update if status is actually changing
            // Important rule: AI camera can mark slots as occupied or available.
            // If the slot is currently reserved (user booked it but hasn't arrived), and AI detects a car,
            // we update status to occupied. If AI detects empty, we keep reserved unless ticket expires.
            if (slot.status !== det.status) {
                if (slot.status === 'reserved' && det.status === 'available') {
                    // Let the reservation stay (user might be arriving)
                    return;
                }
                slot.status = det.status;
                slot.updatedAt = new Date().toISOString();
                if (det.status === 'available') {
                    slot.vehicleNumber = null;
                    // Also check out any active tickets for this slot
                    db.tickets = db.tickets.map(t => {
                        if (t.floor === floor && t.slotId === slot.id && t.active) {
                            return { ...t, active: false, checkedOutAt: new Date().toISOString() };
                        }
                        return t;
                    });
                }
                updatedCount++;
                updatedSlots.push({ slotId: slot.id, status: slot.status, slot });
            }
        }
    });

    if (updatedCount > 0) {
        writeDB(db);
        // Broadcast the bulk update
        broadcastToClients('bulkUpdate', { floor, updates: updatedSlots });
    }

    res.json({ message: `AI Processed successfully. Updated ${updatedCount} slots.`, updatedCount });
});

// --- ANALYTICS DATA GENERATOR ---

app.get('/api/parking/analytics', (req, res) => {
    const db = readDB();
    const floors = Object.values(db.slots);
    const totalSlots = floors.reduce((total, slots) => total + slots.length, 0);
    
    // 1. Calculate occupancy rate per floor
    const occupancy = {};
    Object.keys(db.slots).forEach(floor => {
        const total = db.slots[floor].length;
        const occupied = db.slots[floor].filter(s => s.status === 'occupied').length;
        const reserved = db.slots[floor].filter(s => s.status === 'reserved').length;
        occupancy[floor] = {
            total,
            occupied,
            reserved,
            available: total - occupied - reserved,
            percent: total ? Math.round(((occupied + reserved) / total) * 100) : 0
        };
    });

    // 2. Generate simulated peak hour trends (24h format)
    const peakHours = [
        { hour: "08:00", occupancy: 20 },
        { hour: "10:00", occupancy: 55 },
        { hour: "12:00", occupancy: 85 },
        { hour: "14:00", occupancy: 70 },
        { hour: "16:00", occupancy: 90 },
        { hour: "18:00", occupancy: 95 },
        { hour: "20:00", occupancy: 60 },
        { hour: "22:00", occupancy: 15 }
    ];

    // 3. Vehicle distribution count
    const totalOccupiedCount = db.slots.ground.filter(s => s.status === 'occupied').length + 
                              db.slots.first.filter(s => s.status === 'occupied').length + 
                              db.slots.second.filter(s => s.status === 'occupied').length;
    
    const totalReservedCount = db.slots.ground.filter(s => s.status === 'reserved').length + 
                              db.slots.first.filter(s => s.status === 'reserved').length + 
                              db.slots.second.filter(s => s.status === 'reserved').length;

    const distribution = {
        Car: db.slots.ground.filter(s => s.status === 'occupied' || s.status === 'reserved').length,
        Bike: db.slots.first.filter(s => s.status === 'occupied' || s.status === 'reserved').length,
        EV: db.slots.second.filter(s => s.status === 'occupied' || s.status === 'reserved').length
    };

    res.json({
        occupancy,
        peakHours,
        distribution,
        summary: {
            totalSlots,
            activeOccupied: totalOccupiedCount,
            activeReserved: totalReservedCount,
            totalAvailable: totalSlots - totalOccupiedCount - totalReservedCount
        }
    });
});

export default app;
