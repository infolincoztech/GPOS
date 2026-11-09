import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireTenantUser } from "@/lib/auth";
import { getCached, setCached, invalidateTenantCache } from "@/lib/cache";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = requireTenantUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized: Please log in again." }, { status: 401 });
    }

    const cacheKey = `tenant:${user.tenantId}:products`;
    const cached = getCached<any>(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    const products = await prisma.product.findMany({
      where: { tenantId: user.tenantId },
      include: {
        category: true,
        batches: {
          orderBy: { expiryDate: "asc" },
        },
        dealItems: {
          include: {
            product: true,
            category: true,
          },
        },
      },
      orderBy: { name: "asc" },
    });

    setCached(cacheKey, products, 30000);
    return NextResponse.json(products);
  } catch (error: any) {
    console.error("GET Products Critical Error:", error);
    return NextResponse.json(
      {
        error: "Database error while fetching products.",
        details: error.message,
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const user = requireTenantUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();

    // Support Bulk CSV Import when body.products array is provided
    if (Array.isArray(body?.products)) {
      const items = body.products;
      if (items.length === 0) {
        return NextResponse.json({ error: "No valid products found in CSV." }, { status: 400 });
      }

      // Fetch existing categories and products for this tenant to match by name/SKU/barcode
      const [existingCategories, existingProducts] = await Promise.all([
        prisma.category.findMany({ where: { tenantId: user.tenantId } }),
        prisma.product.findMany({
          where: { tenantId: user.tenantId },
          select: { id: true, name: true, sku: true, barcode: true },
        }),
      ]);

      const categoryMap = new Map<string, string>();
      for (const cat of existingCategories) {
        categoryMap.set(cat.name.trim().toLowerCase(), cat.id);
      }

      // Create any new categories referenced in the CSV
      const newCategoryNames = new Set<string>();
      for (const raw of items) {
        const catName = String(raw.categoryName || raw.category || "").trim();
        if (catName && !categoryMap.has(catName.toLowerCase())) {
          newCategoryNames.add(catName);
        }
      }

      for (const catName of newCategoryNames) {
        const createdCat = await prisma.category.create({
          data: {
            name: catName,
            tenantId: user.tenantId,
          },
        });
        categoryMap.set(catName.toLowerCase(), createdCat.id);
      }

      let importedCount = 0;
      let updatedCount = 0;

      for (const raw of items) {
        const name = String(raw.name || "").trim();
        if (!name) continue;

        const hasSizes =
          raw.sizes !== undefined &&
          raw.sizes !== null &&
          raw.sizes !== "" &&
          !(Array.isArray(raw.sizes) && raw.sizes.length === 0);

        let parsedSizes: any = null;
        if (hasSizes) {
          try {
            parsedSizes = typeof raw.sizes === "string" ? JSON.parse(raw.sizes) : raw.sizes;
            if (Array.isArray(parsedSizes) && parsedSizes.length === 0) parsedSizes = null;
          } catch {
            parsedSizes = null;
          }
        }

        let computedStock = parseFloat(String(raw.stock ?? 0).replace(/[^0-9.-]/g, "")) || 0;
        let computedPrice = parseFloat(String(raw.price ?? 0).replace(/[^0-9.-]/g, "")) || 0;
        const computedCost = parseFloat(String(raw.costPrice ?? 0).replace(/[^0-9.-]/g, "")) || 0;
        const computedMinStock = parseFloat(String(raw.minStock ?? 5).replace(/[^0-9.-]/g, "")) || 5;

        if (Array.isArray(parsedSizes) && parsedSizes.length > 0) {
          computedStock = parsedSizes.reduce((acc: number, s: any) => acc + (parseFloat(s.stock) || 0), 0);
          computedPrice = parseFloat(parsedSizes[0].price) || computedPrice;
        }

        const catName = String(raw.categoryName || raw.category || "").trim();
        const resolvedCategoryId =
          raw.categoryId || (catName ? categoryMap.get(catName.toLowerCase()) : undefined);

        const sku = raw.sku ? String(raw.sku).trim() : null;
        const barcode = raw.barcode ? String(raw.barcode).trim() : null;

        const productData: any = {
          name,
          price: computedPrice,
          costPrice: computedCost,
          stock: computedStock,
          minStock: computedMinStock,
          categoryId: resolvedCategoryId || undefined,
          sku: sku || undefined,
          barcode: barcode || undefined,
          image: raw.image ? String(raw.image).trim() : undefined,
          formula: raw.formula ? String(raw.formula).trim() : undefined,
          description: raw.description ? String(raw.description).trim() : undefined,
          type: raw.type || "STANDARD",
          unit: raw.unit ? String(raw.unit).trim().toUpperCase() : "PCS",
          ...(parsedSizes ? { sizes: parsedSizes } : {}),
        };

        // Match existing product by SKU, Barcode, or exact Name
        const existingMatch = existingProducts.find(
          (ep) =>
            (sku && ep.sku && ep.sku.toLowerCase() === sku.toLowerCase()) ||
            (barcode && ep.barcode && ep.barcode.toLowerCase() === barcode.toLowerCase()) ||
            ep.name.toLowerCase() === name.toLowerCase()
        );

        if (existingMatch) {
          await prisma.product.update({
            where: { id: existingMatch.id },
            data: productData,
          });
          updatedCount++;
        } else {
          const created = await prisma.product.create({
            data: {
              ...productData,
              tenantId: user.tenantId,
            },
            select: { id: true, name: true, sku: true, barcode: true },
          });
          existingProducts.push(created);
          importedCount++;
        }
      }

      invalidateTenantCache(user.tenantId);
      return NextResponse.json({
        success: true,
        importedCount,
        updatedCount,
        totalProcessed: importedCount + updatedCount,
      });
    }

    const { name, price, costPrice, minStock, categoryId, categoryName, sku, barcode, stock, image, sizes, formula, description, type, unit } = body;

    if (!name) {
      return NextResponse.json({ error: "Product name is required." }, { status: 400 });
    }
    const hasSizes =
      sizes !== undefined &&
      sizes !== null &&
      sizes !== "" &&
      !(Array.isArray(sizes) && sizes.length === 0);
    const parsedSizes = hasSizes ? (typeof sizes === "string" ? JSON.parse(sizes) : sizes) : null;

    if (!hasSizes) {
      if (price === undefined || price === "" || price === null) {
        return NextResponse.json({ error: "Price is required when sizes are not provided." }, { status: 400 });
      }
      if (stock === undefined || stock === "" || stock === null) {
        return NextResponse.json({ error: "Stock is required when sizes are not provided." }, { status: 400 });
      }
    }

    let computedStock = stock === undefined || stock === "" || stock === null ? 0 : parseFloat(stock);
    let computedPrice = price === undefined || price === "" || price === null ? 0 : parseFloat(price);

    if (hasSizes && Array.isArray(parsedSizes)) {
      computedStock = parsedSizes.reduce((acc: number, s: any) => acc + (parseFloat(s.stock) || 0), 0);
      if (parsedSizes.length > 0) {
        computedPrice = parseFloat(parsedSizes[0].price) || 0;
      }
    }

    let resolvedCategoryId = categoryId || undefined;
    if (!resolvedCategoryId && categoryName) {
      const cleanCat = String(categoryName).trim();
      if (cleanCat) {
        const existingCat = await prisma.category.findFirst({
          where: {
            tenantId: user.tenantId,
            name: { equals: cleanCat, mode: "insensitive" },
          },
        });
        if (existingCat) {
          resolvedCategoryId = existingCat.id;
        } else {
          const createdCat = await prisma.category.create({
            data: { name: cleanCat, tenantId: user.tenantId },
          });
          resolvedCategoryId = createdCat.id;
        }
      }
    }

    const data: any = {
      name,
      price: computedPrice,
      costPrice: costPrice !== undefined && costPrice !== "" ? parseFloat(costPrice) || 0 : 0,
      minStock: minStock !== undefined && minStock !== "" ? parseFloat(minStock) || 5 : 5,
      stock: computedStock,
      categoryId: resolvedCategoryId,
      sku,
      barcode,
      image,
      formula,
      description,
      type: type || "STANDARD",
      unit: unit || "PCS",
    };
    if (hasSizes) {
      data.sizes = parsedSizes;
    }
    data.tenantId = user.tenantId;
    const product = await prisma.product.create({
      data,
      include: { category: true },
    });

    invalidateTenantCache(user.tenantId);
    return NextResponse.json(product);
  } catch (error: any) {
    console.error("POST Product Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
