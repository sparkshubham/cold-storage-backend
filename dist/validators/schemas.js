import { z } from 'zod';
export const loginSchema = z.object({
    identifier: z.string().min(3, 'Email or mobile is required'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
});
export const refreshSchema = z.object({
    refreshToken: z.string().min(10),
});
export const forgotPasswordSchema = z.object({
    email: z.string().email(),
});
export const resetPasswordSchema = z.object({
    token: z.string().min(10),
    password: z.string().min(8),
});
export const changePasswordSchema = z.object({
    currentPassword: z.string().min(8),
    newPassword: z.string().min(8),
});
export const gstinSchema = z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, 'Invalid GSTIN')
    .or(z.literal(''))
    .optional();
export const panSchema = z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, 'Invalid PAN')
    .or(z.literal(''))
    .optional();
export const mobileSchema = z.string().trim().min(10).max(15);
export const addressSchema = z.object({
    line1: z.string().optional().default(''),
    line2: z.string().optional().default(''),
    city: z.string().optional().default(''),
    state: z.string().optional().default(''),
    pincode: z.string().optional().default(''),
});
export const companyCreateSchema = z.object({
    name: z.string().min(2).max(120),
    legalName: z.string().optional().default(''),
    ownerName: z.string().optional().default(''),
    mobile: mobileSchema,
    email: z.string().email(),
    gstin: gstinSchema.default(''),
    pan: panSchema.default(''),
    address: addressSchema.optional(),
    storageCapacity: z.number().min(0).optional().default(0),
    capacityUnit: z.string().optional().default('MT'),
    chamberCount: z.number().int().min(0).optional().default(0),
    planId: z.string().optional(),
    adminName: z.string().min(2),
    adminEmail: z.string().email(),
    adminPassword: z.string().min(8),
    adminMobile: z.string().optional().default(''),
});
export const companyUpdateSchema = companyCreateSchema
    .omit({ adminName: true, adminEmail: true, adminPassword: true, adminMobile: true, planId: true })
    .partial();
export const planSchema = z.object({
    name: z.string().min(2),
    code: z.string().min(2),
    price: z.number().min(0),
    billingCycle: z.enum(['monthly', 'yearly']).default('monthly'),
    maxUsers: z.number().int().min(1).default(10),
    maxChambers: z.number().int().min(1).default(5),
    maxStorage: z.number().min(0).default(1000),
    maxCustomers: z.number().int().min(1).default(100),
    features: z.array(z.string()).default([]),
    description: z.string().optional().default(''),
    isActive: z.boolean().optional().default(true),
});
export const subscriptionCreateSchema = z.object({
    companyId: z.string().min(1),
    planId: z.string().min(1),
    status: z.enum(['trial', 'active', 'expired', 'suspended', 'cancelled']).optional(),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    amount: z.number().min(0).optional().default(0),
    notes: z.string().optional().default(''),
});
export const userCreateSchema = z.object({
    name: z.string().min(2),
    email: z.string().email(),
    mobile: z.string().optional().default(''),
    password: z.string().min(8),
    roleId: z.string().min(1),
    companyId: z.string().optional(),
    status: z.enum(['active', 'suspended', 'pending']).optional().default('active'),
});
export const userUpdateSchema = userCreateSchema.omit({ password: true }).partial();
const statusSchema = z.enum(['active', 'inactive']).optional().default('active');
const optionalEmail = z.string().email().or(z.literal('')).optional().default('');
export const categorySchema = z.object({
    name: z.string().min(2),
    code: z.string().optional(),
    description: z.string().optional().default(''),
    status: statusSchema,
});
export const unitSchema = z.object({
    name: z.string().min(1),
    code: z.string().min(1),
    status: statusSchema,
});
export const customerSchema = z.object({
    name: z.string().min(2),
    code: z.string().optional(),
    businessName: z.string().optional().default(''),
    mobile: z.string().min(10).max(15),
    alternateMobile: z.string().optional().default(''),
    email: optionalEmail,
    address: z.string().optional().default(''),
    city: z.string().optional().default(''),
    state: z.string().optional().default(''),
    pincode: z.string().optional().default(''),
    gstin: gstinSchema.default(''),
    pan: panSchema.default(''),
    openingBalance: z.coerce.number().optional().default(0),
    creditLimit: z.coerce.number().optional().default(0),
    paymentTerms: z.string().optional().default(''),
    notes: z.string().optional().default(''),
    status: statusSchema,
});
export const supplierSchema = z.object({
    name: z.string().min(2),
    code: z.string().optional(),
    businessName: z.string().optional().default(''),
    mobile: z.string().min(10).max(15),
    email: optionalEmail,
    gstin: gstinSchema.default(''),
    address: z.string().optional().default(''),
    openingBalance: z.coerce.number().optional().default(0),
    status: statusSchema,
});
export const productSchema = z.object({
    name: z.string().min(2),
    code: z.string().optional(),
    categoryId: z.string().optional().nullable(),
    sku: z.string().optional().default(''),
    hsn: z.string().optional().default(''),
    unitId: z.string().optional().nullable(),
    defaultRate: z.coerce.number().optional().default(0),
    storageType: z.string().optional().default(''),
    minTemperature: z.coerce.number().optional().nullable(),
    maxTemperature: z.coerce.number().optional().nullable(),
    description: z.string().optional().default(''),
    status: statusSchema,
});
export const chamberSchema = z.object({
    name: z.string().min(2),
    code: z.string().optional(),
    capacity: z.coerce.number().min(0.0001),
    capacityUnit: z.string().optional().default('MT'),
    temperature: z.coerce.number().optional().nullable(),
    minTemperature: z.coerce.number().optional().nullable(),
    maxTemperature: z.coerce.number().optional().nullable(),
    location: z.string().optional().default(''),
    status: statusSchema,
});
export const rackSchema = z.object({
    name: z.string().min(1),
    code: z.string().optional(),
    chamberId: z.string().min(1),
    capacity: z.coerce.number().min(0.0001),
    status: statusSchema,
});
export const locationSchema = z.object({
    chamberId: z.string().min(1),
    rackId: z.string().min(1),
    section: z.string().optional().default('S01'),
    code: z.string().optional(),
    capacity: z.coerce.number().min(0.0001),
    status: statusSchema,
});
const stockMovementSchema = z.object({
    customerId: z.string().min(1),
    productId: z.string().min(1),
    chamberId: z.string().optional(),
    rackId: z.string().optional(),
    locationId: z.string().min(1),
    quantity: z.coerce.number().positive(),
    unit: z.string().min(1),
    batchId: z.string().optional().nullable(),
    batchNumber: z.string().optional().default(''),
    lotNumber: z.string().optional().default(''),
    vehicleNumber: z.string().optional().default(''),
    notes: z.string().optional().default(''),
    date: z.coerce.date().optional(),
});
export const openingStockSchema = stockMovementSchema;
export const inwardSchema = stockMovementSchema;
export const outwardSchema = stockMovementSchema;
export const adjustmentSchema = stockMovementSchema.extend({
    quantity: z.coerce.number().refine((value) => value !== 0, 'Quantity cannot be zero'),
    reason: z.string().optional().default(''),
});
export const categoryUpdateSchema = categorySchema.partial();
export const unitUpdateSchema = unitSchema.partial();
export const customerUpdateSchema = customerSchema.partial();
export const supplierUpdateSchema = supplierSchema.partial();
export const productUpdateSchema = productSchema.partial();
export const chamberUpdateSchema = chamberSchema.partial();
export const rackUpdateSchema = rackSchema.partial();
export const locationUpdateSchema = locationSchema.partial();
const invoiceRatesSchema = {
    storageRatePerUnitPerDay: z.coerce.number().min(0).optional(),
    inwardHandlingRate: z.coerce.number().min(0).optional(),
    outwardHandlingRate: z.coerce.number().min(0).optional(),
    gstRate: z.coerce.number().min(0).max(100).optional(),
};
export const invoicePreviewQuerySchema = z.object({
    sourceType: z.enum(['inward', 'outward']),
    sourceId: z.string().min(1),
    ...invoiceRatesSchema,
});
export const invoiceGenerateSchema = z.object({
    sourceType: z.enum(['inward', 'outward']),
    sourceId: z.string().min(1),
    notes: z.string().optional().default(''),
    date: z.coerce.date().optional(),
    ...invoiceRatesSchema,
});
//# sourceMappingURL=schemas.js.map