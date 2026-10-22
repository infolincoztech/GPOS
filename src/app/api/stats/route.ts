import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import jwt from "jsonwebtoken";

export const dynamic = "force-dynamic";
import { startOfDay, endOfDay, startOfMonth, endOfMonth, subMonths } from "date-fns";

const JWT_SECRET = process.env.JWT_SECRET || "licoz_pos_jwt_super_secret_2026_xK9mP3qR7vN2wL8";

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("token")?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const decoded: any = jwt.verify(token, JWT_SECRET);
    const tenantId = decoded.tenantId;

    if (!tenantId) return NextResponse.json({ error: "No tenant context" }, { status: 403 });

    const now = new Date();
    
    // Today's Sales
    const todaysOrders = await prisma.order.findMany({
      where: {
        tenantId,
        createdAt: {
          gte: startOfDay(now),
          lte: endOfDay(now)
        },
        status: "COMPLETED"
      }
    });
    
    const todayRevenue = todaysOrders.reduce((acc: number, order: any) => acc + order.totalAmount, 0);

    // This Month's Sales
    const monthlyOrders = await prisma.order.findMany({
      where: {
        tenantId,
        createdAt: {
          gte: startOfMonth(now),
          lte: endOfMonth(now)
        },
        status: "COMPLETED"
      }
    });

    const monthRevenue = monthlyOrders.reduce((acc: number, order: any) => acc + order.totalAmount, 0);

    // Products Count
    const totalProducts = await prisma.product.count({ where: { tenantId } });

    // Recent Orders (Last 5)
    const recentOrders = await prisma.order.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        user: { select: { name: true } }
      }
    });

    return NextResponse.json({
      todayRevenue,
      todayOrdersCount: todaysOrders.length,
      monthRevenue,
      monthOrdersCount: monthlyOrders.length,
      totalProducts,
      recentOrders
    });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
