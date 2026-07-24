-- CreateTable
CREATE TABLE "receivable_attachments" (
    "id" TEXT NOT NULL,
    "receivableId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "fileContent" BYTEA,
    "category" TEXT NOT NULL DEFAULT 'NOTA_FISCAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receivable_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "receivable_attachments_receivable_created_idx" ON "receivable_attachments"("receivableId", "createdAt");

-- AddForeignKey
ALTER TABLE "receivable_attachments" ADD CONSTRAINT "receivable_attachments_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "receivables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivable_attachments" ADD CONSTRAINT "receivable_attachments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
