import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireTenantUser } from "@/lib/auth";
import { invalidateCacheKey, invalidateTenantCache } from "@/lib/cache";

export const dynamic = "force-dynamic";

// Update own tenant business settings (Only for Tenant/Business Admins)
export async function PATCH(req: NextRequest) {
  const decoded = requireTenantUser(req);
  if (
    !decoded ||
    !decoded.tenantId ||
    !["TENANT_ADMIN", "BUSINESS_ADMIN", "SUPER_ADMIN"].includes(decoded.role)
  ) {
    return NextResponse.json(
      { error: "Unauthorized. Only Business Admins can update business settings." },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const {
      name,
      phone,
      address,
      logoUrl,
      ntn,
      strn,
      cashTaxRate,
      cardTaxRate,
      receiptWhatsAppString,
      receiptAddressString,
      receiptRaastString,
      receiptBankString,
      receiptEasyPaisaString,
      receiptJazzCashString,
      kitchenPrinterIp,
      kitchenPrinterPort,
      cashierPrinterIp,
      cashierPrinterPort,
    } = body;

    const resolvedPhone =
      phone !== undefined ? phone : receiptWhatsAppString !== undefined ? receiptWhatsAppString : undefined;
    const resolvedAddress =
      address !== undefined ? address : receiptAddressString !== undefined ? receiptAddressString : undefined;

    const updated = await prisma.tenant.update({
      where: { id: decoded.tenantId },
      data: {
        name: name !== undefined && String(name).trim() ? String(name).trim() : undefined,
        phone: resolvedPhone,
        address: resolvedAddress,
        logoUrl: logoUrl !== undefined ? logoUrl : undefined,
        ntn: ntn !== undefined ? ntn : undefined,
        strn: strn !== undefined ? strn : undefined,
        cashTaxRate: cashTaxRate !== undefined ? parseFloat(cashTaxRate) : undefined,
        cardTaxRate: cardTaxRate !== undefined ? parseFloat(cardTaxRate) : undefined,
        receiptWhatsAppString:
          receiptWhatsAppString !== undefined ? receiptWhatsAppString : resolvedPhone,
        receiptAddressString:
          receiptAddressString !== undefined ? receiptAddressString : resolvedAddress,
        receiptRaastString: receiptRaastString !== undefined ? receiptRaastString : undefined,
        receiptBankString: receiptBankString !== undefined ? receiptBankString : undefined,
        receiptEasyPaisaString: receiptEasyPaisaString !== undefined ? receiptEasyPaisaString : undefined,
        receiptJazzCashString: receiptJazzCashString !== undefined ? receiptJazzCashString : undefined,
        kitchenPrinterIp: kitchenPrinterIp !== undefined ? kitchenPrinterIp : undefined,
        kitchenPrinterPort: kitchenPrinterPort !== undefined ? parseInt(kitchenPrinterPort) || null : undefined,
        cashierPrinterIp: cashierPrinterIp !== undefined ? cashierPrinterIp : undefined,
        cashierPrinterPort: cashierPrinterPort !== undefined ? parseInt(cashierPrinterPort) || null : undefined,
      },
    });

    // Clear user & tenant cache so /api/auth/me and POS receipts reflect changes immediately
    invalidateCacheKey(`user:${decoded.id}`);
    invalidateTenantCache(decoded.tenantId);

    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
