"""
Smart Parking Finder - AI YOLOv8 Vehicle Detector

This script uses OpenCV to capture video frames (from a webcam or file) and 
runs Ultralytics YOLOv8 object detection to identify parked vehicles. It maps
the detections to coordinate bounding boxes representing parking spaces and
transmits status updates to the Node.js Express server.

Pre-requisites:
    pip install opencv-python ultralytics requests

How to Run:
    1. Start the Node/Express backend server:
       npm start
    2. Start this Python script:
       python ai_detector.py
"""

import cv2
import requests
import json
import time
from ultralytics import YOLO

# Backend configuration
API_ENDPOINT = "http://localhost:3000/api/parking/ai-update"
FLOOR = "ground"  # AI camera monitoring the Ground floor (Cars)

# Initialize YOLO model (YOLOv8 nano is lightweight and fast)
print("[AI] Loading YOLOv8 model...")
model = YOLO('yolov8n.pt')

# Initialize Camera or Video stream
# Replace 0 with a file path string (e.g., 'parking_feed.mp4') to use recorded footage
camera_source = 0
cap = cv2.VideoCapture(camera_source)

if not cap.isOpened():
    print(f"[AI ERROR] Could not open camera source {camera_source}")
    exit()

# Define coordinate regions (bounding boxes) for our simulated parking slots
# Format: [Slot_ID, xmin, ymin, xmax, ymax]
# In a real environment, you would calibrate these coordinates for your camera feed
parking_slots = [
    [1,  50,  80,  150, 180],
    [2,  160, 80,  260, 180],
    [3,  270, 80,  370, 180],
    [4,  380, 80,  480, 180],
    [5,  490, 80,  590, 180],
    [6,  50,  200, 150, 300],
    [7,  160, 200, 260, 300],
    [8,  270, 200, 370, 300],
    [9,  380, 200, 480, 300],
    [10, 490, 200, 590, 300]
]

print(f"[AI] Connected to source: {camera_source}")
print(f"[AI] Calibration defined for {len(parking_slots)} parking slots.")
print("[AI] Running detection loop. Press 'q' in the video window to quit.")

last_post_time = time.time()
update_interval = 2.0  # Send data to server every 2 seconds to avoid flooding

while cap.isOpened():
    success, frame = cap.read()
    if not success:
        print("[AI] Video stream ended or failed to read frame.")
        break

    # Resize frame for uniform processing
    frame = cv2.resize(frame, (640, 360))
    
    # Run YOLOv8 detection
    # classes: 2 = car, 3 = motorcycle, 5 = bus, 7 = truck
    results = model(frame, verbose=False, classes=[2, 3, 5, 7])
    
    # Keep track of detected vehicle bounding boxes
    detected_vehicles = []
    if len(results) > 0:
        boxes = results[0].boxes
        for box in boxes:
            # Get box coordinates
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            conf = box.conf[0].item()
            detected_vehicles.append({
                "coords": (int(x1), int(y1), int(x2), int(y2)),
                "confidence": conf
            })

    # Match detected vehicles with our parking slot regions
    # A slot is considered 'occupied' if a vehicle box overlaps substantially with it
    slot_updates = []
    
    for slot in parking_slots:
        slot_id, s_x1, s_y1, s_x2, s_y2 = slot
        is_occupied = False
        
        # Draw slot boundary (default: green for available)
        slot_color = (0, 255, 0)
        
        for vehicle in detected_vehicles:
            v_x1, v_y1, v_x2, v_y2 = vehicle["coords"]
            
            # Calculate intersection box
            ix1 = max(s_x1, v_x1)
            iy1 = max(s_y1, v_y1)
            ix2 = min(s_x2, v_x2)
            iy2 = min(s_y2, v_y2)
            
            if ix1 < ix2 and iy1 < iy2:
                # Calculate areas
                intersection_area = (ix2 - ix1) * (iy2 - iy1)
                slot_area = (s_x2 - s_x1) * (s_y2 - s_y1)
                
                # Check overlap ratio
                overlap_ratio = intersection_area / float(slot_area)
                if overlap_ratio > 0.3:  # 30% overlap threshold
                    is_occupied = True
                    slot_color = (0, 0, 255) # Red for occupied
                    break
        
        slot_updates.append({
            "slotId": slot_id,
            "status": "occupied" if is_occupied else "available"
        })
        
        # Visual Annotations on camera window
        cv2.rectangle(frame, (s_x1, s_y1), (s_x2, s_y2), slot_color, 2)
        status_label = "OCCUPIED" if is_occupied else "AVAILABLE"
        cv2.putText(frame, f"Slot {slot_id}: {status_label}", (s_x1, s_y1 - 5),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.4, slot_color, 1)

    # Output count info on screen
    occupied_count = sum(1 for s in slot_updates if s["status"] == "occupied")
    cv2.putText(frame, f"Detections: {occupied_count}/{len(parking_slots)} slots occupied", (15, 30),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)

    # Show annotated CCTV feed
    cv2.imshow("SmartPark AI - CCTV Monitor Feed", frame)

    # Transmit detections to backend periodically
    current_time = time.time()
    if current_time - last_post_time >= update_interval:
        try:
            payload = {
                "floor": FLOOR,
                "detections": slot_updates
            }
            res = requests.post(API_ENDPOINT, json=payload, timeout=1.5)
            if res.status_code == 200:
                print(f"[AI Update] Synced layout. Occupied: {occupied_count}/{len(parking_slots)}")
            else:
                print(f"[AI Warning] Server returned status code {res.status_code}")
        except requests.exceptions.RequestException as e:
            print("[AI Sync Error] Cannot connect to parking API server. Is it offline?")
            
        last_post_time = current_time

    # Escape key check
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

# Clean up
cap.release()
cv2.destroyAllWindows()
print("[AI] Detector stopped successfully.")
