import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";

// List Tenants
export async function GET() {
  try {
    const tenants = await prisma.tenant.findMany({
      include: {
        subscription: {
          include: { plan: { include: { modules: { include: { module: true } } } } },
        },
        modules: true,
        branches: true,
        _count: { select: { users: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(tenants);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Create Tenant + Admin User + Branch + Subscription
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, email, phone, address, planId, adminPassword } = body;

    if (!name) {
      return NextResponse.json({ error: "Business name is required" }, { status: 400 });
    }

    // Check if admin email already exists
    if (email) {
      // Block using the locked super admin email for tenant creation
      if (email.toLowerCase() === "lincoztech@gmail.com") {
        return NextResponse.json({ error: "This email is reserved." }, { status: 403 });
      }
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        return NextResponse.json({ error: "Email already in use" }, { status: 409 });
      }
    }

    // Fetch plan to get billing type
    let endDate = new Date(new Date().setFullYear(new Date().getFullYear() + 1)); // Default 1 year
    if (planId) {
      const plan = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
      if (plan) {
        const now = new Date();
        if (plan.billingType === "TRIAL") {
          endDate = new Date(now.setDate(now.getDate() + 7));
        } else if (plan.billingType === "6_MONTHS") {
          endDate = new Date(now.setMonth(now.getMonth() + 6));
        } else if (plan.billingType === "YEARLY") {
          endDate = new Date(now.setFullYear(now.getFullYear() + 1));
        } else if (plan.billingType === "LIFETIME") {
          endDate = new Date(now.setFullYear(now.getFullYear() + 99)); // 99 years for lifetime
        }
      }
    }

    // 1. Create Tenant with default Branch
    const tenant = await prisma.tenant.create({
      data: {
        name,
        email,
        phone,
        address,
        branches: {
          create: {
            name: "Main Branch",
            location: address || "",
            phone: phone || "",
          },
        },
        ...(planId && {
          subscription: {
            create: {
              planId,
              startDate: new Date(),
              endDate: endDate,
              status: "ACTIVE",
            },
          },
        }),
      },
      include: {
        branches: true,
        subscription: { include: { plan: { include: { modules: true } } } },
      },
    });

    // 2. Create TENANT_ADMIN user for this tenant
    if (email) {
      const password = adminPassword || "admin123";
      const hashed = await bcrypt.hash(password, 10);

      await prisma.user.create({
        data: {
          name: `${name} Admin`,
          email,
          password: hashed,
          role: "TENANT_ADMIN",
          tenantId: tenant.id,
          branchId: tenant.branches[0]?.id || null,
        },
      });
    }

    // 3. Assign Modules from Plan to Tenant
    if (tenant.subscription?.plan?.modules) {
      const tenantModules = tenant.subscription.plan.modules.map((pm: any) => ({
        tenantId: tenant.id,
        moduleId: pm.moduleId,
      }));

      await prisma.tenantModule.createMany({
        data: tenantModules,
        skipDuplicates: true,
      });
    }

    return NextResponse.json(tenant);
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
