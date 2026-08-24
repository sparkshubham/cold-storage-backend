import { CustomerModel } from '../models/Customer.js';
import { ChamberModel } from '../models/Chamber.js';
import { InventoryModel } from '../models/Inventory.js';
import { InwardModel } from '../models/Inward.js';
import { OutwardModel } from '../models/Outward.js';
import { CompanyModel } from '../models/Company.js';
import { UserModel } from '../models/User.js';
import { SubscriptionModel } from '../models/Subscription.js';
import { occupancyPercent } from '../utils/stockMath.js';
import { toObjectId } from '../types/auth.js';

export async function getSuperAdminDashboard() {
  const now = new Date();
  const inSevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    totalCompanies,
    activeCompanies,
    suspendedCompanies,
    trialCompanies,
    totalUsers,
    totalCustomers,
    monthlyRevenueAgg,
    outstandingAgg,
    expiringSubscriptions,
    growth,
    occupiedAgg,
  ] = await Promise.all([
    CompanyModel.countDocuments({ deletedAt: null }),
    CompanyModel.countDocuments({ deletedAt: null, status: 'active' }),
    CompanyModel.countDocuments({ deletedAt: null, status: 'suspended' }),
    CompanyModel.countDocuments({ deletedAt: null, status: 'trial' }),
    UserModel.countDocuments({ deletedAt: null }),
    CustomerModel.countDocuments({ deletedAt: null }),
    SubscriptionModel.aggregate([
      { $match: { deletedAt: null, status: { $in: ['active', 'trial'] }, createdAt: { $gte: startOfMonth } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    SubscriptionModel.aggregate([
      { $match: { deletedAt: null, status: { $in: ['expired', 'suspended'] } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    SubscriptionModel.countDocuments({
      deletedAt: null,
      status: { $in: ['active', 'trial'] },
      endDate: { $gte: now, $lte: inSevenDays },
    }),
    CompanyModel.aggregate([
      { $match: { deletedAt: null } },
      {
        $group: {
          _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
      { $limit: 12 },
    ]),
    ChamberModel.aggregate([
      { $match: { deletedAt: null } },
      { $group: { _id: null, occupied: { $sum: '$occupiedCapacity' } } },
    ]),
  ]);

  const capacityAgg = await CompanyModel.aggregate([
    { $match: { deletedAt: null } },
    { $group: { _id: null, totalCapacity: { $sum: '$storageCapacity' } } },
  ]);

  const totalStorageCapacity = capacityAgg[0]?.totalCapacity ?? 0;
  const occupiedCapacity = occupiedAgg[0]?.occupied ?? 0;

  return {
    totalCompanies,
    activeCompanies,
    suspendedCompanies,
    trialCompanies,
    totalUsers,
    totalCustomers,
    totalStorageCapacity,
    occupiedCapacity,
    availableCapacity: Math.max(totalStorageCapacity - occupiedCapacity, 0),
    monthlySaasRevenue: monthlyRevenueAgg[0]?.total ?? 0,
    outstandingSubscription: outstandingAgg[0]?.total ?? 0,
    expiringSubscriptions,
    charts: {
      companyGrowth: growth.map((row) => ({
        label: `${row._id.year}-${String(row._id.month).padStart(2, '0')}`,
        value: row.count,
      })),
      statusBreakdown: [
        { label: 'Active', value: activeCompanies },
        { label: 'Trial', value: trialCompanies },
        { label: 'Suspended', value: suspendedCompanies },
      ],
    },
  };
}

export async function getCompanyDashboard(companyId: string) {
  const companyObjectId = toObjectId(companyId);
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const company = await CompanyModel.findById(companyId).select(
    'name storageCapacity capacityUnit chamberCount status',
  );
  const [userCount, totalCustomers, chamberAgg, stockAgg, todaysInward, todaysOutward] = await Promise.all([
    UserModel.countDocuments({ companyId, deletedAt: null }),
    CustomerModel.countDocuments({ companyId, deletedAt: null }),
    ChamberModel.aggregate([
      { $match: { companyId: companyObjectId, deletedAt: null } },
      { $group: { _id: null, capacity: { $sum: '$capacity' }, occupied: { $sum: '$occupiedCapacity' } } },
    ]),
    InventoryModel.aggregate([
      { $match: { companyId: companyObjectId, deletedAt: null } },
      { $group: { _id: null, qty: { $sum: '$quantity' } } },
    ]),
    InwardModel.countDocuments({ companyId, deletedAt: null, date: { $gte: startOfDay } }),
    OutwardModel.countDocuments({ companyId, deletedAt: null, date: { $gte: startOfDay } }),
  ]);

  const totalCapacity = chamberAgg[0]?.capacity ?? company?.storageCapacity ?? 0;
  const occupiedCapacity = chamberAgg[0]?.occupied ?? 0;
  const availableCapacity = Math.max(totalCapacity - occupiedCapacity, 0);

  return {
    company: company
      ? {
          id: String(company._id),
          name: company.name,
          status: company.status,
          chamberCount: company.chamberCount,
        }
      : null,
    totalCapacity,
    occupiedCapacity,
    availableCapacity,
    occupancyPercent: occupancyPercent(occupiedCapacity, totalCapacity),
    todaysInward,
    todaysOutward,
    currentStock: stockAgg[0]?.qty ?? 0,
    totalCustomers,
    outstandingAmount: 0,
    todaysRevenue: 0,
    monthlyRevenue: 0,
    userCount,
    charts: {
      occupancy: [
        { label: 'Occupied', value: occupiedCapacity },
        { label: 'Available', value: availableCapacity },
      ],
    },
  };
}
