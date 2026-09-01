import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireCompanyContext, tenantGuard } from '../middleware/tenant.js';
import { authorize } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { invoiceGenerateSchema, invoicePreviewQuerySchema } from '../validators/schemas.js';
import * as invoiceController from '../controllers/invoice.controller.js';

const invoices = Router();
invoices.use(authenticate, tenantGuard, requireCompanyContext);
invoices.get('/', authorize('invoice.view'), invoiceController.listInvoices);
invoices.get('/preview', authorize('invoice.view'), validate(invoicePreviewQuerySchema, 'query'), invoiceController.previewInvoice);
invoices.get('/:id', authorize('invoice.view'), invoiceController.getInvoice);
invoices.post('/', authorize('invoice.create'), validate(invoiceGenerateSchema), invoiceController.generateInvoice);

export { invoices as invoiceRoutes };
