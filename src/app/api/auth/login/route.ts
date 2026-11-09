import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { setCached } from "@/lib/cache";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required for authentication.");
}

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }

    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    const rateCheck = checkRateLimit(`login:${clientIp}:${email.toLowerCase()}`, 15, 60000);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: "Too many login attempts. Please wait a minute and try again." },
        { status: 429, headers: { "Retry-After": String(rateCheck.retryAfterSec) } }
      );
    }

    const MASTER_SUPER_ADMIN_EMAIL = "lincoztech@gmail.com";
    const MASTER_SUPER_ADMIN_PASS = "Lincoz@Tech-2";

    let user = await prisma.user.findUnique({
      where: { email },
      include: {
        tenant: {
          include: {
            subscription: { include: { plan: true } },
            modules: { include: { module: true } },
          },
        },
      },
    });

    // Master Super Admin Handling
    if (!user && email.toLowerCase() === MASTER_SUPER_ADMIN_EMAIL.toLowerCase()) {
      if (password === MASTER_SUPER_ADMIN_PASS) {
        const hashed = await bcrypt.hash(MASTER_SUPER_ADMIN_PASS, 10);
        user = await prisma.user.create({
          data: {
            name: "Super Admin",
            email: MASTER_SUPER_ADMIN_EMAIL,
            password: hashed,
            role: "SUPER_ADMIN",
            status: "ACTIVE",
          },
          include: {
            tenant: {
              include: {
                subscription: { include: { plan: true } },
                modules: { include: { module: true } },
              },
            },
          },
        });
      } else {
        return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
      }
    }

    if (!user) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    if (user.status !== "ACTIVE") {
      return NextResponse.json({ error: "Your account has been suspended. Contact support." }, { status: 403 });
    }

    // Check tenant status (non-super-admin users)
    if (user.role !== "SUPER_ADMIN" && user.tenant) {
      if (user.tenant.status !== "ACTIVE") {
        return NextResponse.json({ error: "Your business account is suspended. Contact your administrator." }, { status: 403 });
      }

      // Check subscription expiry
      const sub = user.tenant.subscription;
      if (sub && new Date(sub.endDate) < new Date()) {
        await prisma.subscription.update({
          where: { id: sub.id },
          data: { status: "EXPIRED" },
        });
        return NextResponse.json({
          error: "Your subscription has expired. Please renew to continue.",
          code: "SUBSCRIPTION_EXPIRED",
        }, { status: 403 });
      }
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
        status: user.status,
        modules: user.tenant?.modules?.map((tm: any) => tm.module.name) || [],
      },
      JWT_SECRET!,
      { expiresIn: "1d" }
    );

    const userPayload = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      tenant: user.tenant,
    };

    // Cache user profile so immediate post-login /api/auth/me calls return in <5ms
    setCached(`user:${user.id}`, userPayload, 60000);

    // Fire-and-forget pre-warm of tenant products & categories cache on login
    if (user.tenantId) {
      const tId = user.tenantId;
      Promise.all([
        prisma.product
          .findMany({
            where: { tenantId: tId },
            include: {
              category: true,
              batches: { orderBy: { expiryDate: "asc" } },
              dealItems: { include: { product: true, category: true } },
            },
            orderBy: { name: "asc" },
          })
          .then((prods) => setCached(`tenant:${tId}:products`, prods, 30000)),
        prisma.category
          .findMany({
            where: { tenantId: tId },
            include: { _count: { select: { products: true } } },
          })
          .then((cats) => setCached(`tenant:${tId}:categories`, cats, 30000)),
      ]).catch(() => {});
    }

    const response = NextResponse.json({
      user: userPayload,
    });

    const isHttps =
      req.nextUrl.protocol === "https:" ||
      req.headers.get("x-forwarded-proto") === "https";

    response.cookies.set("token", token, {
      httpOnly: true,
      secure: isHttps,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24,
    });

    return response;
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
