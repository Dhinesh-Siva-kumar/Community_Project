import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { uploadImages } from '../../config/multer';

const router = Router();
router.use(authenticate);

// POST /api/upload — single file
router.post(
  '/',
  uploadImages.single('file'),
  (req: Request, res: Response, _next: NextFunction) => {
    const file = req.file;
    if (!file) {
      res.status(400).json({ message: 'No file uploaded' });
      return;
    }
    res.json({
      filename: file.filename,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      path: `/uploads/${file.filename}`,
    });
  },
);

// POST /api/upload/multiple — up to 10 files
router.post(
  '/multiple',
  uploadImages.array('files', 10),
  (req: Request, res: Response, _next: NextFunction) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    res.json(
      files.map((f) => ({
        filename: f.filename,
        originalname: f.originalname,
        mimetype: f.mimetype,
        size: f.size,
        path: `/uploads/${f.filename}`,
      })),
    );
  },
);

export default router;
