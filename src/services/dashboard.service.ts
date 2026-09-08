import { prisma } from '../db/prisma.js';
import { notDeleted } from '../db/serialize.js';
import { occupancyPercent } from '../utils/stockMath.js';

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
    companyDates,
    occupiedAgg,
    capacityAgg,
  ] = await Promise.all([
    prisma.company.count({ where: { deletedAt: null } }),
    prisma.company.count({ where: { deletedAt: null, status: 'active' } }),
    prisma.company.count({ where: { deletedAt: null, status: 'suspended' } }),
    prisma.company.count({ where: { deletedAt: null, status: 'trial' } }),
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.customer.count({ where: { deletedAt: null } }),
    prisma.subscription.aggregate({
      where: {
        deletedAt: null,
        status: { in: ['active', 'trial'] },
        createdAt: { gte: startOfMonth },
      },
      _sum: { amount: true },
    }),
    prisma.subscription.aggregate({
      where: { deletedAt: null, status: { in: ['expired', 'suspended'] } },
      _sum: { amount: true },
    }),
    prisma.subscription.count({
      where: {
        deletedAt: null,
        status: { in: ['active', 'trial'] },
        endDate: { gte: now, lte: inSevenDays },
      },
    }),
    prisma.company.findMany({
      where: { deletedAt: null },
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.chamber.aggregate({
      where: { deletedAt: null },
      _sum: { occupiedCapacity: true },
    }),
    prisma.company.aggregate({
      where: { deletedAt: null },
      _sum: { storageCapacity: true },
    }),
  ]);

  const growthMap = new Map<string, number>();
  for (const row of companyDates) {
    const label = `${row.createdAt.getFullYear()}-${String(row.createdAt.getMonth() + 1).padStart(2, '0')}`;
    growthMap.set(label, (growthMap.get(label) ?? 0) + 1);
  }
  const companyGrowth = [...growthMap.entries()]
    .map(([label, value]) => ({ label, value }))
    .slice(0, 12);

  const totalStorageCapacity = capacityAgg._sum.storageCapacity ?? 0;
  const occupiedCapacity = occupiedAgg._sum.occupiedCapacity ?? 0;

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
    monthlySaasRevenue: monthlyRevenueAgg._sum.amount ?? 0,
    outstandingSubscription: outstandingAgg._sum.amount ?? 0,
    expiringSubscriptions,
    charts: {
      companyGrowth,
      statusBreakdown: [
        { label: 'Active', value: activeCompanies },
        { label: 'Trial', value: trialCompanies },
        { label: 'Suspended', value: suspendedCompanies },
      ],
    },
  };
}

export async function getCompanyDashboard(companyId: string) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [company, userCount, totalCustomers, chamberAgg, stockAgg, todaysInward, todaysOutward] =
    await Promise.all([
      prisma.company.findFirst({
        where: { id: companyId },
        select: { id: true, name: true, storageCapacity: true, capacityUnit: true, chamberCount: true, status: true },
      }),
      prisma.user.count({ where: notDeleted({ companyId }) }),
      prisma.customer.count({ where: notDeleted({ companyId }) }),
      prisma.chamber.aggregate({
        where: notDeleted({ companyId }),
        _sum: { capacity: true, occupiedCapacity: true },
      }),
      prisma.inventory.aggregate({
        where: notDeleted({ companyId }),
        _sum: { quantity: true },
      }),
      prisma.inward.count({ where: notDeleted({ companyId, date: { gte: startOfDay } }) }),
      prisma.outward.count({ where: notDeleted({ companyId, date: { gte: startOfDay } }) }),
    ]);

  const totalCapacity = chamberAgg._sum.capacity ?? company?.storageCapacity ?? 0;
  const occupiedCapacity = chamberAgg._sum.occupiedCapacity ?? 0;
  const availableCapacity = Math.max(totalCapacity - occupiedCapacity, 0);

  return {
    company: company
      ? {
          id: company.id,
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
    currentStock: stockAgg._sum.quantity ?? 0,
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
