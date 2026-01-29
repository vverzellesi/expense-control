import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUserId, unauthorizedResponse } from "@/lib/auth-utils";

interface SnapshotData {
  month: number;
  year: number;
  totalValue: number;
  totalInvested: number;
  totalWithdrawn: number;
}

interface SnapshotsResponse {
  snapshots: SnapshotData[];
  current: SnapshotData;
}

/**
 * Calculate current investment totals from all investments
 */
async function calculateCurrentTotals(userId: string): Promise<{
  totalValue: number;
  totalInvested: number;
  totalWithdrawn: number;
}> {
  const investments = await prisma.investment.findMany({
    where: { userId },
    select: {
      currentValue: true,
      totalInvested: true,
      totalWithdrawn: true,
    },
  });

  let totalValue = 0;
  let totalInvested = 0;
  let totalWithdrawn = 0;

  for (const investment of investments) {
    totalValue += investment.currentValue;
    totalInvested += investment.totalInvested;
    totalWithdrawn += investment.totalWithdrawn;
  }

  return { totalValue, totalInvested, totalWithdrawn };
}

/**
 * Ensure snapshot exists for the previous month (lazy generation)
 * This creates a snapshot for the last month if one doesn't exist
 */
async function ensurePreviousMonthSnapshot(userId: string): Promise<void> {
  const now = new Date();
  const currentMonth = now.getMonth() + 1; // 1-12
  const currentYear = now.getFullYear();

  // Calculate previous month
  let prevMonth = currentMonth - 1;
  let prevYear = currentYear;
  if (prevMonth === 0) {
    prevMonth = 12;
    prevYear = currentYear - 1;
  }

  // Check if snapshot for previous month already exists
  const existingSnapshot = await prisma.investmentSnapshot.findUnique({
    where: {
      month_year_userId: {
        month: prevMonth,
        year: prevYear,
        userId,
      },
    },
  });

  // If snapshot already exists, no need to create one
  if (existingSnapshot) {
    return;
  }

  // Calculate current totals and save as previous month's snapshot
  // NOTE: This is an approximation - it uses current values for the previous month.
  // If user made changes in the current month before this snapshot was generated,
  // those changes will be reflected in the previous month's snapshot.
  // This trade-off was chosen for simplicity over precise historical tracking.
  // For accurate historical data, users should update values at month-end.
  const totals = await calculateCurrentTotals(userId);

  // Only create snapshot if user has investments
  if (totals.totalInvested > 0 || totals.totalValue > 0) {
    await prisma.investmentSnapshot.create({
      data: {
        month: prevMonth,
        year: prevYear,
        totalValue: totals.totalValue,
        totalInvested: totals.totalInvested,
        totalWithdrawn: totals.totalWithdrawn,
        userId,
      },
    });
  }
}

export async function GET(request: NextRequest): Promise<NextResponse<SnapshotsResponse | { error: string }>> {
  try {
    const userId = await getAuthenticatedUserId();
    const searchParams = request.nextUrl.searchParams;
    const monthsParam = searchParams.get("months");
    const months = monthsParam ? parseInt(monthsParam, 10) : 12;

    // Ensure previous month snapshot exists (lazy generation)
    await ensurePreviousMonthSnapshot(userId);

    // Calculate date range for fetching snapshots
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    // Calculate the start date (months ago)
    let startMonth = currentMonth - months;
    let startYear = currentYear;
    while (startMonth <= 0) {
      startMonth += 12;
      startYear -= 1;
    }

    // Fetch historical snapshots within the range
    const snapshots = await prisma.investmentSnapshot.findMany({
      where: {
        userId,
        OR: [
          // Same year, month >= startMonth
          {
            year: startYear,
            month: { gte: startMonth },
          },
          // Years between start and current (if spanning multiple years)
          ...(currentYear > startYear
            ? [
                {
                  year: { gt: startYear, lt: currentYear },
                },
                // Current year, month <= currentMonth - 1 (not current month)
                {
                  year: currentYear,
                  month: { lt: currentMonth },
                },
              ]
            : []),
        ],
      },
      orderBy: [{ year: "asc" }, { month: "asc" }],
    });

    // Format snapshots for response
    const formattedSnapshots: SnapshotData[] = snapshots.map((snapshot) => ({
      month: snapshot.month,
      year: snapshot.year,
      totalValue: snapshot.totalValue,
      totalInvested: snapshot.totalInvested,
      totalWithdrawn: snapshot.totalWithdrawn,
    }));

    // Calculate current totals for the "current" field
    const currentTotals = await calculateCurrentTotals(userId);

    const current: SnapshotData = {
      month: currentMonth,
      year: currentYear,
      totalValue: currentTotals.totalValue,
      totalInvested: currentTotals.totalInvested,
      totalWithdrawn: currentTotals.totalWithdrawn,
    };

    return NextResponse.json({
      snapshots: formattedSnapshots,
      current,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Error fetching investment snapshots:", error);
    return NextResponse.json(
      { error: "Erro ao buscar historico de investimentos" },
      { status: 500 }
    );
  }
}
