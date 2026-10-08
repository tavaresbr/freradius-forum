const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");

const UPLOAD_ROOT = path.join(__dirname, "../../uploads/campanhas");

const ALLOWED_MIMES = {
  "image/jpeg": { tipo: "imagem", ext: ".jpg" },
  "image/png":  { tipo: "imagem", ext: ".png" },
  "image/webp": { tipo: "imagem", ext: ".webp" },
  "video/mp4":  { tipo: "video",  ext: ".mp4" },
  "video/webm": { tipo: "video",  ext: ".webm" },
};

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50 MB

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const empresaId  = req.empresa_id;
    const campanhaId = req.params.id;
    const dir = path.join(UPLOAD_ROOT, String(empresaId), String(campanhaId));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const meta = ALLOWED_MIMES[file.mimetype];
    const ext  = meta ? meta.ext : path.extname(file.originalname).toLowerCase();
    cb(null, uuidv4() + ext);
  },
});

function fileFilter(req, file, cb) {
  if (ALLOWED_MIMES[file.mimetype]) {
    cb(null, true);
  } else {
    cb(new Error("Tipo de arquivo não permitido. Use JPEG, PNG, WebP, MP4 ou WebM."));
  }
}

const uploadCampanha = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_VIDEO_BYTES }, // 50 MB global; controller enforces per-type
});

module.exports = { uploadCampanha, ALLOWED_MIMES, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, UPLOAD_ROOT };
