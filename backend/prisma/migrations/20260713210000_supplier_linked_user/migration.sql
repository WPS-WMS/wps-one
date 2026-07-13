-- AlterTable
ALTER TABLE "suppliers" ADD COLUMN "linkedUserId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_linkedUserId_key" ON "suppliers"("linkedUserId");

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_linkedUserId_fkey" FOREIGN KEY ("linkedUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
