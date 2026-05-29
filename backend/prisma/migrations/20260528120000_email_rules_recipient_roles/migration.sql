-- Destinatários por tipo de usuário (Responsável, Membro, Cliente) nas regras de e-mail.
DO $$
BEGIN
  IF to_regclass('public."tenant_email_notification_rules"') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'tenant_email_notification_rules'
        AND column_name = 'recipientRoles'
    ) THEN
      EXECUTE 'ALTER TABLE "tenant_email_notification_rules" ADD COLUMN "recipientRoles" TEXT NOT NULL DEFAULT ''[]''';
    END IF;

    EXECUTE $sql$
      UPDATE "tenant_email_notification_rules"
      SET "recipientRoles" = CASE
        WHEN NOT "isActive" THEN '[]'
        WHEN "trigger" IN ('LIMITE_DIARIO_EXCEDIDO', 'APONTAMENTO', 'REEMBOLSOS') THEN '["RESPONSAVEL"]'
        ELSE '["RESPONSAVEL","MEMBRO","CLIENTE"]'
      END
      WHERE "recipientRoles" = '[]' OR "recipientRoles" IS NULL
    $sql$;
  END IF;
END $$;
