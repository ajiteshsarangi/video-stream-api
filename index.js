const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const app = express();

const VIDEO_FOLDER = path.join(__dirname, "videos");

if (!fs.existsSync(VIDEO_FOLDER)) {
  fs.mkdirSync(VIDEO_FOLDER);
}

const storage = multer.diskStorage({
  destination: VIDEO_FOLDER + "/uploads",
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({
  storage: storage,
  fileFilter: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    if (ext !== ".mp4" && ext !== ".avi" && ext !== ".mov" && ext !== ".mkv") {
      return cb(new Error("Only video files are allowed"));
    }
    cb(null, true);
  },
});

if (!fs.existsSync(VIDEO_FOLDER + "/metadata.json")) {
  fs.writeFileSync(VIDEO_FOLDER + "/metadata.json", "[]");
}

// Video uploading request
app.post("/api/videos", upload.single("video"), (req, res) => {
  if (!req.file) {
    return res.status(400).send("No video file uploaded");
  }

  const video = {
    id: Date.now(),
    filename: req.file.filename,
    originalname: req.file.originalname,
    mimetype: req.file.mimetype,
    size: req.file.size,
  };

  let data = [];
  try {
    data = JSON.parse(fs.readFileSync(VIDEO_FOLDER + "/metadata.json"));
  } catch (error) {
    console.log("metadata file not found");
  }

  data.push(video);
  fs.writeFileSync(VIDEO_FOLDER + "/metadata.json", JSON.stringify(data, null, 2));
  res.send("Video uploaded successfully");
});

// Video streaming request
app.get("/api/videos/:id/stream", (req, res) => {
  const data = JSON.parse(fs.readFileSync(VIDEO_FOLDER + "/metadata.json"));
  const video = data.find((v) => v.id === parseInt(req.params.id));
  if (!video) {
    return res.status(404).send("Video not found");
  }
  const path = `${VIDEO_FOLDER}/uploads/${video.filename}`;
  const stat = fs.statSync(path);
  const fileSize = stat.size;
  const range = req.headers.range;
  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = end - start + 1;
    const file = fs.createReadStream(path, { start, end });
    const headers = {
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunkSize,
      "Content-Type": "video/mp4",
    };
    res.writeHead(206, headers);
    file.pipe(res);
  } else {
    const headers = {
      "Content-Length": fileSize,
      "Content-Type": "video/mp4",
    };
    res.writeHead(200, headers);
    fs.createReadStream(path).pipe(res);
  }
});

// Video delete request
app.delete("/api/videos/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const metadataPath = VIDEO_FOLDER + "/metadata.json";
  const data = JSON.parse(fs.readFileSync(metadataPath));
  const videoIndex = data.findIndex((v) => v.id === id);
  if (videoIndex === -1) {
    return res.status(404).send("Video not found");
  }
  const video = data[videoIndex];
  const videoPath = VIDEO_FOLDER + "/videos/" + video.filename;
  fs.access(videoPath, (err) => {
    if (err) {
      return res.status(404).send("Video file not found");
    }
    fs.unlink(videoPath, (err) => {
      if (err) {
        return res.status(500).send("Error deleting video file");
      }
      data.splice(videoIndex, 1);
      fs.writeFileSync(metadataPath, JSON.stringify(data, null, 2));
      res.send("Video deleted successfully");
    });
  });
});

const PORT = 3000;

// Start the server
app.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});
