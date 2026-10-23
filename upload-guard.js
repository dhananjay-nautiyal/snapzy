/* Shared upload guard for post and ad images.
   Layer 1 - fileFilter: extension allowlist + declared MIME type (cheap reject).
   Layer 2 - verifyImageFile: magic-byte check of the actual file CONTENT after
   multer has written it, so a spoofed extension/MIME header can't smuggle in
   HTML, SVG (which can carry scripts), or anything else that isn't a real
   image. The content must also match the extension, so what we serve is what
   the bytes really are.
   SVG is deliberately never accepted: it is not in the extension allowlist
   and has no accepted magic signature. */
const fs = require('fs');
const path = require('path');

const ALLOWED_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
const REJECT_MESSAGE =
  "That file's contents don't match a real JPG, PNG, GIF or WEBP image.";

function rejection(message) {
  const err = new Error(message);
  err.code = 'UPLOAD_REJECTED';
  return err;
}

// Layer 1: what the client SAYS the file is.
function fileFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_EXTS.includes(ext) && file.mimetype.startsWith('image/')) {
    return cb(null, true);
  }
  cb(rejection('Only JPG, PNG, GIF or WEBP images up to 5MB are allowed.'));
}

// Magic signatures: enough leading bytes to identify each format.
const SIGNATURES = [
  { exts: ['.jpg', '.jpeg'], test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    exts: ['.png'],
    test: (b) =>
      b.length >= 8 &&
      b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
      b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a,
  },
  { exts: ['.gif'], test: (b) => b.toString('latin1', 0, 4) === 'GIF8' },
  {
    exts: ['.webp'],
    test: (b) =>
      b.length >= 12 &&
      b.toString('latin1', 0, 4) === 'RIFF' &&
      b.toString('latin1', 8, 12) === 'WEBP',
  },
];

// Read just the first 16 bytes - never the whole (up to 5MB) file.
function readHead(filePath) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(16);
    const { bytesRead } = fs.readSync(fd, buf, 0, buf.length, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    fs.closeSync(fd);
  }
}

// Layer 2: what the file ACTUALLY is. Express middleware - place it directly
// after upload.single('image'). On rejection the written file is deleted,
// req.file is cleared (so handlers never see it), and the error flows to the
// route's existing flash-message error handler.
function verifyImageFile(req, res, next) {
  if (!req.file) return next();

  let head = null;
  try {
    head = readHead(req.file.path);
  } catch (e) {
    // Unreadable file - treat as invalid rather than letting it through.
  }

  // The filename extension comes from diskStorage (original extension,
  // randomized basename), so it is always in ALLOWED_EXTS here.
  const ext = path.extname(req.file.filename).toLowerCase();
  const signature = head ? SIGNATURES.find((s) => s.test(head)) : null;
  if (signature && signature.exts.includes(ext)) return next();

  fs.unlink(req.file.path, () => {});
  req.file = null;
  next(rejection(REJECT_MESSAGE));
}

module.exports = { ALLOWED_EXTS, fileFilter, verifyImageFile };
