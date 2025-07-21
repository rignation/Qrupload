// ---- Guest event upload page ----
app.get("/event/:eventId", (req, res) => {
  const events = loadEvents();
  const event = events.find(e => e.id === req.params.eventId);
  if (!event) return res.status(404).send("Event not found.");
  // Responsive and clean guest upload page
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Upload for ${event.name}</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link href="https://fonts.googleapis.com/css?family=Cairo:700|Tajawal:400,700&display=swap" rel="stylesheet">
      <style>
        html, body {
          height: 100%;
          margin: 0;
          padding: 0;
        }
        body {
          min-height: 100vh;
          min-width: 100vw;
          background-image: url('${event.bg}');
          background-size: cover;
          background-position: center center;
          background-repeat: no-repeat;
          color: #fff;
          font-family: 'Tajawal', 'Cairo', Arial, sans-serif;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
        }
        .form-box {
          background: rgba(0,0,0,0.75);
          padding: 32px 18px 24px 18px;
          margin: 24px auto;
          border-radius: 18px;
          max-width: 390px;
          width: 95vw;
          box-shadow: 0 4px 16px #0004;
        }
        h2 {
          font-family: 'Cairo', Arial, sans-serif;
          font-size: 2em;
          margin-bottom: 6px;
        }
        .event-place {
          font-size: 1.1em;
          margin-bottom: 20px;
          color: #ffd2e6;
        }
        input[type="file"] {
          width: 100%;
          margin-bottom: 15px;
        }
        button {
          width: 100%;
          padding: 13px;
          border-radius: 8px;
          border: none;
          font-size: 1.15em;
          background: #fa3b77;
          color: #fff;
          font-weight: bold;
          cursor: pointer;
          margin-top: 10px;
          transition: background 0.18s;
        }
        button:hover {
          background: #c80046;
        }
        @media (max-width: 500px) {
          .form-box {
            padding: 16px 5vw 14px 5vw;
            max-width: 98vw;
          }
          h2 { font-size: 1.4em; }
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
