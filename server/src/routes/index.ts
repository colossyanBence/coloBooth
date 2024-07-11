import { getFiles } from '../handlers/getFiles';
import { fileUpload } from '../handlers/fileupload';
import { healthCheck } from '../handlers/healthcheck';
import express from 'express';

const router = express.Router();

router.get('/', healthCheck);

router.post('/upload', fileUpload);

router.get('/files', getFiles);

export default router;
