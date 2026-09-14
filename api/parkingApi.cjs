"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var parkingApi_exports = {};
__export(parkingApi_exports, {
  default: () => parkingApi_default
});
module.exports = __toCommonJS(parkingApi_exports);
var import_express = __toESM(require("express"), 1);
var import_cors = __toESM(require("cors"), 1);
var import_node_fs = __toESM(require("node:fs"), 1);
var import_node_path = __toESM(require("node:path"), 1);
var import_node_url = require("node:url");
var import_bcryptjs = __toESM(require("bcryptjs"), 1);
const import_meta = {};
const app = (0, import_express.default)();
const PORT = process.env.PORT || 3e3;
const __dirname = import_node_path.default.dirname((0, import_node_url.fileURLToPath)(import_meta.url));
const DB_FILE = process.env.VERCEL ? import_node_path.default.join("/tmp", "smarty-parking-db.json") : import_node_path.default.join(__dirname, "db.json");
const VALID_STATUSES = /* @__PURE__ */ new Set(["available", "reserved", "occupied"]);
app.use((0, import_cors.default)());
app.use(import_express.default.json());
let sseClients = [];
function readDB() {
  if (!import_node_fs.default.existsSync(DB_FILE)) {
    initDB();
  }
  try {
    const data = import_node_fs.default.readFileSync(DB_FILE, "utf8");
    return JSON.parse(data);
  } catch (e) {
    console.error("Error reading database:", e);
    return { users: [], slots: {}, tickets: [] };
  }
}
function writeDB(data) {
  try {
    import_node_fs.default.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf8");
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
        status: "available",
        // available, reserved, occupied
        vehicleNumber: null,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      })),
      first: Array.from({ length: 20 }, (_, i) => ({
        id: i + 1,
        floor: "first",
        type: "Bike",
        status: "available",
        vehicleNumber: null,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      })),
      second: Array.from({ length: 20 }, (_, i) => ({
        id: i + 1,
        floor: "second",
        type: "EV",
        status: "available",
        vehicleNumber: null,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      }))
    },
    tickets: []
  };
  writeDB(defaultDB);
  console.log("Database initialized successfully.");
}
if (!import_node_fs.default.existsSync(DB_FILE)) {
  initDB();
}
function broadcastToClients(type, data) {
  const message = `event: ${type}
data: ${JSON.stringify(data)}

`;
  sseClients.forEach((client) => client.res.write(message));
}
app.get("/api/parking/live", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  const clientId = Date.now();
  const newClient = { id: clientId, res };
  sseClients.push(newClient);
  res.write(`event: ping
data: ${JSON.stringify({ connected: true })}

`);
  req.on("close", () => {
    sseClients = sseClients.filter((c) => c.id !== clientId);
  });
});
app.post("/api/auth/register", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required" });
  }
  const db = readDB();
  const userExists = db.users.find((u) => u.username.toLowerCase() === username.toLowerCase());
  if (userExists) {
    return res.status(400).json({ error: "Username already exists" });
  }
  const hashedPassword = import_bcryptjs.default.hashSync(password, 10);
  const newUser = { id: Date.now(), username, password: hashedPassword };
  db.users.push(newUser);
  writeDB(db);
  res.status(201).json({ message: "Registration successful", user: { username } });
});
app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required" });
  }
  const db = readDB();
  const user = db.users.find((u) => u.username.toLowerCase() === username.toLowerCase());
  if (!user || !import_bcryptjs.default.compareSync(password, user.password)) {
    return res.status(401).json({ error: "Invalid username or password" });
  }
  res.json({ message: "Login successful", user: { username } });
});
app.get("/api/parking/slots", (req, res) => {
  const db = readDB();
  res.json(db.slots);
});
app.post("/api/parking/slots/update", (req, res) => {
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
  const slot = db.slots[floor].find((s) => s.id === parseInt(slotId));
  if (!slot) {
    return res.status(404).json({ error: "Slot not found" });
  }
  slot.status = status;
  slot.vehicleNumber = vehicleNumber || null;
  slot.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  if (status === "available") {
    db.tickets = db.tickets.map((t) => {
      if (t.floor === floor && t.slotId === parseInt(slotId) && t.active) {
        return { ...t, active: false, checkedOutAt: (/* @__PURE__ */ new Date()).toISOString() };
      }
      return t;
    });
  }
  writeDB(db);
  broadcastToClients("slotUpdate", { floor, slotId, status, slot });
  res.json({ message: "Slot updated successfully", slot });
});
app.post("/api/parking/slots/reset", (req, res) => {
  const { floor } = req.body;
  if (!floor) {
    return res.status(400).json({ error: "Floor required" });
  }
  const db = readDB();
  if (!db.slots[floor]) {
    return res.status(400).json({ error: "Invalid floor" });
  }
  db.slots[floor] = db.slots[floor].map((slot) => ({
    ...slot,
    status: "available",
    vehicleNumber: null,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  }));
  db.tickets = db.tickets.map((t) => {
    if (t.floor === floor && t.active) {
      return { ...t, active: false, checkedOutAt: (/* @__PURE__ */ new Date()).toISOString() };
    }
    return t;
  });
  writeDB(db);
  broadcastToClients("floorReset", { floor, slots: db.slots[floor] });
  res.json({ message: `Floor ${floor} reset successfully`, slots: db.slots[floor] });
});
app.post("/api/parking/ticket", (req, res) => {
  const { username, floor, slotId, vehicleType, vehicleNumber } = req.body;
  if (!username || !floor || !slotId || !vehicleType) {
    return res.status(400).json({ error: "Missing required fields for ticket generation" });
  }
  const db = readDB();
  if (!db.slots[floor]) {
    return res.status(400).json({ error: "Invalid floor" });
  }
  const slot = db.slots[floor].find((s) => s.id === parseInt(slotId));
  if (!slot) {
    return res.status(404).json({ error: "Slot not found" });
  }
  if (slot.status !== "available") {
    return res.status(400).json({ error: "Slot is already reserved or occupied" });
  }
  const ticketId = "TKT-" + Math.floor(1e5 + Math.random() * 9e5);
  const now = /* @__PURE__ */ new Date();
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
  db.tickets = db.tickets.map((t) => {
    if (t.username.toLowerCase() === username.toLowerCase() && t.active) {
      const prevSlot = db.slots[t.floor]?.find((s) => s.id === t.slotId);
      if (prevSlot && prevSlot.status === "reserved") {
        prevSlot.status = "available";
        prevSlot.vehicleNumber = null;
        broadcastToClients("slotUpdate", { floor: t.floor, slotId: t.slotId, status: "available", slot: prevSlot });
      }
      return { ...t, active: false, checkedOutAt: now.toISOString() };
    }
    return t;
  });
  db.tickets.push(newTicket);
  slot.status = "reserved";
  slot.vehicleNumber = vehicleNumber || null;
  slot.updatedAt = now.toISOString();
  writeDB(db);
  broadcastToClients("slotUpdate", { floor, slotId: parseInt(slotId), status: "reserved", slot });
  res.status(201).json({ message: "Slot reserved and ticket generated", ticket: newTicket });
});
app.get("/api/parking/ticket/:username", (req, res) => {
  const { username } = req.params;
  const db = readDB();
  const activeTicket = db.tickets.find((t) => t.username.toLowerCase() === username.toLowerCase() && t.active);
  if (!activeTicket) {
    return res.status(404).json({ error: "No active ticket found for this user" });
  }
  res.json(activeTicket);
});
app.post("/api/parking/ticket/checkout", (req, res) => {
  const { username } = req.body;
  if (!username) {
    return res.status(400).json({ error: "Username required" });
  }
  const db = readDB();
  const activeTicket = db.tickets.find((t) => t.username.toLowerCase() === username.toLowerCase() && t.active);
  if (!activeTicket) {
    return res.status(404).json({ error: "No active ticket found for user" });
  }
  activeTicket.active = false;
  activeTicket.checkedOutAt = (/* @__PURE__ */ new Date()).toISOString();
  const slot = db.slots[activeTicket.floor].find((s) => s.id === activeTicket.slotId);
  if (slot) {
    slot.status = "available";
    slot.vehicleNumber = null;
    slot.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    broadcastToClients("slotUpdate", { floor: activeTicket.floor, slotId: activeTicket.slotId, status: "available", slot });
  }
  writeDB(db);
  res.json({ message: "Checkout completed successfully", ticket: activeTicket });
});
app.post("/api/parking/ai-update", (req, res) => {
  const { floor, detections } = req.body;
  if (!floor || !Array.isArray(detections)) {
    return res.status(400).json({ error: "Invalid data format. Need floor and detections array." });
  }
  const db = readDB();
  if (!db.slots[floor]) {
    return res.status(400).json({ error: "Invalid floor" });
  }
  let updatedCount = 0;
  const updatedSlots = [];
  detections.forEach((det) => {
    if (!det || !VALID_STATUSES.has(det.status)) return;
    const slot = db.slots[floor].find((s) => s.id === parseInt(det.slotId));
    if (slot) {
      if (slot.status !== det.status) {
        if (slot.status === "reserved" && det.status === "available") {
          return;
        }
        slot.status = det.status;
        slot.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
        if (det.status === "available") {
          slot.vehicleNumber = null;
          db.tickets = db.tickets.map((t) => {
            if (t.floor === floor && t.slotId === slot.id && t.active) {
              return { ...t, active: false, checkedOutAt: (/* @__PURE__ */ new Date()).toISOString() };
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
    broadcastToClients("bulkUpdate", { floor, updates: updatedSlots });
  }
  res.json({ message: `AI Processed successfully. Updated ${updatedCount} slots.`, updatedCount });
});
app.get("/api/parking/analytics", (req, res) => {
  const db = readDB();
  const floors = Object.values(db.slots);
  const totalSlots = floors.reduce((total, slots) => total + slots.length, 0);
  const occupancy = {};
  Object.keys(db.slots).forEach((floor) => {
    const total = db.slots[floor].length;
    const occupied = db.slots[floor].filter((s) => s.status === "occupied").length;
    const reserved = db.slots[floor].filter((s) => s.status === "reserved").length;
    occupancy[floor] = {
      total,
      occupied,
      reserved,
      available: total - occupied - reserved,
      percent: total ? Math.round((occupied + reserved) / total * 100) : 0
    };
  });
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
  const totalOccupiedCount = db.slots.ground.filter((s) => s.status === "occupied").length + db.slots.first.filter((s) => s.status === "occupied").length + db.slots.second.filter((s) => s.status === "occupied").length;
  const totalReservedCount = db.slots.ground.filter((s) => s.status === "reserved").length + db.slots.first.filter((s) => s.status === "reserved").length + db.slots.second.filter((s) => s.status === "reserved").length;
  const distribution = {
    Car: db.slots.ground.filter((s) => s.status === "occupied" || s.status === "reserved").length,
    Bike: db.slots.first.filter((s) => s.status === "occupied" || s.status === "reserved").length,
    EV: db.slots.second.filter((s) => s.status === "occupied" || s.status === "reserved").length
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
var parkingApi_default = app;
