import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { uploadImages } from '../../config/multer';
import { FileValidationService } from '../../services/file-validation.service';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../../config/env';

const router = Router();
router.use(authenticate);

// Helper to save buffer to disk
async function saveBufferToFile(buffer: Buffer, originalName: string): Promise<string> {
  const uploadsBase = path.resolve(env.UPLOADS_PATH);
  const ext = path.extname(originalName);
  const filename = uuidv4() + ext;
  const filePath = path.join(uploadsBase, filename);
  
  // Ensure directory exists
  if (!fs.existsSync(uploadsBase)) {
    fs.mkdirSync(uploadsBase, { recursive: true });
  }
  
  fs.writeFileSync(filePath, buffer);
  return filename;
}

// POST /api/upload — single file
router.post(
  '/',
  uploadImages.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const file = req.file;
      if (!file) {
        res.status(400).json({ message: 'No file uploaded' });
        return;
      }

      // Validate the uploaded file
      const validation = await FileValidationService.validateMulterFile(file);
      if (!validation.valid) {
        res.status(400).json({
          message: 'File validation failed',
          error: validation.error,
        });
        return;
      }

      // Save buffer to disk after validation
      const filename = await saveBufferToFile(file.buffer, file.originalname);

      res.json({
        filename,
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        path: `/uploads/${filename}`,
      });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/upload/multiple — up to 10 files
router.post(
  '/multiple',
  uploadImages.array('files', 10),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];

      // Validate all uploaded files
      const validation = await FileValidationService.validateMulterFiles(files);
      if (!validation.valid) {
        res.status(400).json({
          message: 'File validation failed',
          errors: validation.invalidFiles,
        });
        return;
      }

      // Save all validated files to disk
      const savedFiles = await Promise.all(
        files.map(async (f) => {
          const filename = await saveBufferToFile(f.buffer, f.originalname);
          return {
            filename,
            originalname: f.originalname,
            mimetype: f.mimetype,
            size: f.size,
            path: `/uploads/${filename}`,
          };
        }),
      );

      res.json(savedFiles);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
