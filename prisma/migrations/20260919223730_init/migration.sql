-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "client_origin" TEXT NOT NULL,
    "external_order_id" TEXT NOT NULL,
    "vendor_tax_id" TEXT NOT NULL,
    "vendor_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" SERIAL NOT NULL,
    "order_id" TEXT NOT NULL,
    "line_number" INTEGER NOT NULL,
    "material_code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "unit_of_measure" TEXT NOT NULL,
    "quantity_ordered" DECIMAL(15,4) NOT NULL,
    "quantity_received" DECIMAL(15,4) NOT NULL DEFAULT 0,
    "unit_price" DECIMAL(15,4) NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conferencias_log" (
    "id" SERIAL NOT NULL,
    "order_id" TEXT NOT NULL,
    "vendor_tax_id" TEXT NOT NULL,
    "invoice_number" TEXT,
    "status" TEXT NOT NULL,
    "divergence_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conferencias_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "orders_client_origin_idx" ON "orders"("client_origin");

-- CreateIndex
CREATE INDEX "orders_vendor_tax_id_idx" ON "orders"("vendor_tax_id");

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- CreateIndex
CREATE UNIQUE INDEX "orders_client_origin_external_order_id_key" ON "orders"("client_origin", "external_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_items_order_id_line_number_key" ON "order_items"("order_id", "line_number");

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conferencias_log" ADD CONSTRAINT "conferencias_log_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
