import { getFiles } from '../handlers/getFiles';
import { fileUpload } from '../handlers/fileupload';
import { healthCheck } from '../handlers/healthcheck';
import express from 'express';
import { validateJWT } from '../helpers/jwtValidator';

const router = express.Router();

router.get('/', validateJWT, healthCheck);

router.post('/upload', validateJWT, fileUpload);

router.get('/files', validateJWT, getFiles);

export default router;
