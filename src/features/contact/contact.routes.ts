import express from 'express';
import { submitContactForm } from './contact.controller.js';

const router = express.Router();

// POST /api/contact
router.post('/', submitContactForm);

export const contactRoutes = router;
