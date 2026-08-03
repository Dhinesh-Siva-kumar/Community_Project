import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { uploadImages } from '../../config/multer';
import { FileValidationService } from '../../services/file-validation.service';
import { saveBufferToFile, isAllowedUploadFolder } from '../../services/upload-storage.service';

function resolveFolder(body: Request['body'], res: Response): string | undefined | false {
  const folder = body?.folder;
  if (folder === undefined) return undefined;
  if (!isAllowedUploadFolder(folder)) {
    res.status(400).json({ message: `Invalid folder: ${folder}` });
    return false;
  }
  return folder;
}

const router = Router();
router.use(authenticate);

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

      const folder = resolveFolder(req.body, res);
      if (folder === false) return;

      // Save buffer to disk after validation
      const filename = await saveBufferToFile(file.buffer, file.originalname, folder);

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

      const folder = resolveFolder(req.body, res);
      if (folder === false) return;

      // Save all validated files to disk
      const savedFiles = await Promise.all(
        files.map(async (f) => {
          const filename = await saveBufferToFile(f.buffer, f.originalname, folder);
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
