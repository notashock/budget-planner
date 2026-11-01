import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { SalaryTemplateService } from '../services/salaryTemplateService.js';

export const salaryTemplatesRouter = express.Router();
salaryTemplatesRouter.use(requireAuth);

// GET /api/salary-templates (Get active salary template)
salaryTemplatesRouter.get('/', async (req, res, next) => {
  try {
    const userId = req.userId || req.session?.userId;
    const template = await SalaryTemplateService.getActiveTemplate(userId);
    return res.success(template);
  } catch (err) {
    next(err);
  }
});

// POST /api/salary-templates (Create/Update versioned salary template)
salaryTemplatesRouter.post('/', async (req, res, next) => {
  try {
    const userId = req.userId || req.session?.userId;
    const template = await SalaryTemplateService.saveTemplate(userId, req.body);
    return res.success(template, 201);
  } catch (err) {
    next(err);
  }
});

// POST /api/salary-templates/deactivate (Deactivate template without deleting history)
salaryTemplatesRouter.post('/deactivate', async (req, res, next) => {
  try {
    const userId = req.userId || req.session?.userId;
    const result = await SalaryTemplateService.deactivateTemplate(userId);
    return res.success(result);
  } catch (err) {
    next(err);
  }
});
