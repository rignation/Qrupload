const express = require("express");
const multer = require("multer");
const AWS = require("aws-sdk");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const QRCode = require("qrcode");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.static("public"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// AWS S3 setup
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION
});
const s3 = new AWS.S3();

// Storage for uploaded files before S3
const upload = multer({ dest: "uploads/" });

// Load events from local file
const EVENTS_FILE = "./events.json";
function loadEvents() {
  if (!fs.existsSync(EVENTS_FILE)) return [];
  return JSON.parse(fs.readFileSync(EVENTS_FILE, "utf-8"));
}
function saveEvents(events) {
  fs.writeFileSync(EVENTS_FILE, JSON.stringify(events, null, 2));
}

// ---- Admin login middleware (simple password) ----
function requireAdmin(req, res, next) {
  if (req.method === "GET" && req.path === "/admin") return next();
  if (req.path.startsWith("/admin") && req.body && req.body.password !== process.env.ADMIN_PASSWORD) {
    return res.status(403).send("Forbidden");
  }
  next();
}

// ---- Admin page ----
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

// ---- Admin create event ----
app.post("/admin/create", upload.single("bgPhoto"), (req, res) => {
  const { eventName, eventDate, eventPlace, password } = req.body;
  if (password !== process.env.ADMIN_PASSWORD) return res.status(403).send("Invalid password.");
  if (!eventName || !eventDate || !eventPlace) return res.status(400).send("Missing fields.");

  // Upload background photo to S3 (make it public-read)
  let bgPhotoUrl = "";
  if (req.file) {
    const bgParams = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: `backgrounds/${uuidv4()}_${req.file.originalname}`,
      Body: fs.createReadStream(req.file.path),
      ContentType: req.file.mimetype,
      ACL: 'public-read' // <== مهم: يجعل الصورة متاحة للكل!
    };
    s3.upload(bgParams, (err, data) => {
      fs.unlinkSync(req.file.path);
      if (err) {
        console.error("S3 Upload Error:", err);
        return res.status(500).send("Background upload error: " + err.message);
      }
      bgPhotoUrl = data.Location;

      // Save event
      const events = loadEvents();
      const eventId = uuidv4();
      events.push({ id: eventId, name: eventName, date: eventDate, place: eventPlace, bg: bgPhotoUrl });
      saveEvents(events);

      // Generate guest link and QR code
      const guestLink = `${req.protocol}://${req.get("host")}/event/${eventId}`;
      QRCode.toDataURL(guestLink, (err, qr) => {
        if (err) return res.status(500).send("QR error");
        res.send(`
          <h2>Event created!</h2>
          <div><b>Name:</b> ${eventName}</div>
          <div><b>Date:</b> ${eventDate}</div>
          <div><b>Place:</b> ${eventPlace}</div>
          <div><b>Guest Link:</b> <a href="${guestLink}">${guestLink}</a></div>
          <div><b>QR Code:</b><br><img src="${qr}" /></div>
          <div><a href="/admin">Back to Admin</a></div>
        `);
      });
    });
  } else {
    return res.status(400).send("No background image uploaded.");
  }
});

// ---- Admin view events ----
app.post("/admin/events", (req, res) => {
  if (req.body.password !== process.env.ADMIN_PASSWORD) return res.status(403).send("Invalid password.");
  const events = loadEvents();
  let html = "<h2>Events List</h2>";
  events.forEach(ev => {
    html += `<div>
      <b>${ev.name}</b> (${ev.date}, ${ev.place})
      [<a href="/admin/photos/${ev.id}?password=${req.body.password}">View uploads</a>] 
      [<a href="/event/${ev.id}" target="_blank">Guest link</a>]
      </div>`;
  });
  html += `<div><a href="/admin">Back</a></div>`;
  res.send(html);
});

// ---- Admin view uploads per event ----
app.get("/admin/photos/:eventId", (req, res) => {
  if (req.query.password !== process.env.ADMIN_PASSWORD) return res.status(403).send("Invalid password.");
  const eventId = req.params.eventId;
  // List S3 objects with prefix 'uploads/{eventId}/'
  const params = {
    Bucket: process.env.S3_BUCKET_NAME,
    Prefix: `uploads/${eventId}/`
  };
  s3.listObjectsV2(params, (err, data) => {
    if (err) return res.status(500).send("S3 error");
    let html = `<h2>Uploaded photos for event: ${eventId}</h2>`;
    if (data.Contents.length === 0) html += "<div>No uploads yet.</div>";
    data.Contents.forEach(obj => {
      const url = s3.getSignedUrl('getObject', { Bucket: params.Bucket, Key: obj.Key, Expires: 60*60 });
      html += `<div><a href="${url}" target="_blank">${obj.Key.split("/").pop()}</a></div>`;
      html += `<div><img src="${url}" style="max-width:200px;" /></div>`;
    });
    html += `<div><a href="/admin">Back</a></div>`;
    res.send(html);
  });
});

// ---- Guest event upload page ----
app.get("/event/:eventId", (req, res) => {
  const events = loadEvents();
  const event = events.find(e => e.id === req.params.eventId);
  if (!event) return res.status(404).send("Event not found.");
  // Render guest upload HTML, passing event info and background
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Upload for ${event.name}</title>
      <link href="https://fonts.googleapis.com/css?family=Cairo:700|Tajawal:400,700&display=swap" rel="stylesheet">
      <style>
        body {
          background-image: url('${event.bg}');
          background-size: cover;
          color: #fff;
          text-align: center;
          font-family: 'Tajawal', 'Cairo', Arial, sans-serif;
        }
        .form-box {
          background: rgba(0,0,0,0.7);
          padding: 30px;
          margin: 60px auto;
          border-radius: 16px;
          max-width: 390px;
          box-shadow: 0 4px 16px #0004;
        }
        h2 {
          font-family: 'Cairo', Arial, sans-serif;
          font-size: 2.1em;
          margin-bottom: 12px;
        }
        input, button {
          padding: 12px;
          border-radius: 8px;
          margin: 8px 0;
          border: none;
          width: 94%;
          font-size: 1.1em;
        }
        button {
          background: #fa3b77;
          color: #fff;
          font-weight: bold;
          cursor: pointer;
          transition: background 0.2s;
        }
        button:hover {
          background: #d2155c;
        }
        .event-place {
          font-size: 1em;
          margin-bottom: 18px;
          color: #ffd2e6;
        }
      </style>
    </head>
    <body>
      <div class="form-box">
        <h2>${event.name}</h2>
        <div class="event-place">${event.date} | ${event.place}</div>
        <form action="/event/${event.id}/upload" method="POST" enctype="multipart/form-data">
          <input type="file" name="file" required accept="image/*,video/*" /><br/>
          <button type="submit">Upload</button>
        </form>
      </div>
    </body>
    </html>
  `);
});

// ---- Guest upload POST ----
app.post("/event/:eventId/upload", upload.single("file"), (req, res) => {
  const eventId = req.params.eventId;
  if (!req.file) return res.status(400).send("No file uploaded.");
  // Upload to S3 under event folder
  const params = {
    Bucket: process.env.S3_BUCKET_NAME,
    Key: `uploads/${eventId}/${Date.now()}_${req.file.originalname}`,
    Body: fs.createReadStream(req.file.path),
    ContentType: req.file.mimetype
  };
  s3.upload(params, (err, data) => {
    fs.unlinkSync(req.file.path);
    if (err) return res.status(500).send("Upload failed: " + err.message);
    res.send(`
      <h2>Thank you! Upload successful.</h2>
      <a href="/event/${eventId}">Upload another</a>
    `);
  });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
