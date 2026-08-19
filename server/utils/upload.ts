import multer from 'multer';
import { platformConfig } from '../config/platform.js';

export const chunkUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 1,
    // Folga acima do pedaço de 2 MB para metadados do multipart.
    fileSize: platformConfig.uploadChunkBytes + 512 * 1024,
  },
});
