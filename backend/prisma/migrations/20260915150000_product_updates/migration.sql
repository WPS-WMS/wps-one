-- CreateTable
CREATE TABLE "ProductUpdate" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductUpdate_publishedAt_idx" ON "ProductUpdate"("publishedAt");
