import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import jwt from "jsonwebtoken";

export const dynamic = "force-dynamic";
const JWT_SECRET = process.env.JWT_SECRET || "licoz_pos_jwt_super_secret_2026_xK9mP3qR7vN2wL8";

function getAuth(req: NextRequest) {
  const token = req.cookies.get("token")?.value;
  if (!token) return null;
  try { return jwt.verify(token, JWT_SECRET) as any; } catch { return null; }
}

export async function GET(req: NextRequest) {
  const decoded = getAuth(req);
  if (!decoded) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      include: { tenant: { include: { branches: { take: 1 } } } },
    });
    const branchId = user?.branchId || user?.tenant?.branches?.[0]?.id;
    if (!branchId) return NextResponse.json([]);

    const tables = await prisma.table.findMany({
      where: { branchId },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(tables);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const decoded = getAuth(req);
  if (!decoded) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { name, capacity } = body;

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      include: { tenant: { include: { branches: { take: 1 } } } },
    });
    const branchId = user?.branchId || user?.tenant?.branches?.[0]?.id;
    if (!branchId) return NextResponse.json({ error: "No branch found" }, { status: 400 });

    const table = await prisma.table.create({
      data: { name, capacity: parseInt(capacity) || 4, branchId },
    });
    return NextResponse.json(table);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
