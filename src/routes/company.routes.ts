import { Router } from 'express';
import { authenticate, requireSuperAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { companyCreateSchema, companyUpdateSchema } from '../validators/schemas.js';
import * as companyController from '../controllers/company.controller.js';

const router = Router();

router.use(authenticate, requireSuperAdmin);

router.get('/', companyController.list);
router.post('/', validate(companyCreateSchema), companyController.create);
router.get('/:id', companyController.getById);
router.patch('/:id', validate(companyUpdateSchema), companyController.update);
router.post('/:id/suspend', companyController.suspend);
router.post('/:id/activate', companyController.activate);
router.delete('/:id', companyController.remove);

export default router;
