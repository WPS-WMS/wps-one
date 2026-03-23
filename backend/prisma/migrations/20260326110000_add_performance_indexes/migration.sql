-- Performance indexes for common filters/sorts under concurrent load.
CREATE INDEX IF NOT EXISTS "users_tenantId_name_idx" ON "users"("tenantId", "name");

CREATE INDEX IF NOT EXISTS "clients_tenantId_name_idx" ON "Client"("tenantId", "name");
CREATE INDEX IF NOT EXISTS "ClientContact_clientId_createdAt_idx" ON "ClientContact"("clientId", "createdAt");
CREATE INDEX IF NOT EXISTS "ClientUser_clientId_userId_idx" ON "ClientUser"("clientId", "userId");

CREATE INDEX IF NOT EXISTS "Project_clientId_arquivado_createdAt_idx" ON "Project"("clientId", "arquivado", "createdAt");
CREATE INDEX IF NOT EXISTS "ProjectResponsible_userId_projectId_idx" ON "ProjectResponsible"("userId", "projectId");

CREATE INDEX IF NOT EXISTS "Ticket_projectId_createdAt_idx" ON "Ticket"("projectId", "createdAt");
CREATE INDEX IF NOT EXISTS "Ticket_projectId_status_createdAt_idx" ON "Ticket"("projectId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "Ticket_assignedToId_idx" ON "Ticket"("assignedToId");
CREATE INDEX IF NOT EXISTS "Ticket_createdById_idx" ON "Ticket"("createdById");
CREATE INDEX IF NOT EXISTS "Ticket_parentTicketId_idx" ON "Ticket"("parentTicketId");
CREATE INDEX IF NOT EXISTS "TicketResponsible_userId_ticketId_idx" ON "TicketResponsible"("userId", "ticketId");

CREATE INDEX IF NOT EXISTS "Activity_tenantId_name_idx" ON "Activity"("tenantId", "name");

CREATE INDEX IF NOT EXISTS "TimeEntry_userId_date_idx" ON "TimeEntry"("userId", "date");
CREATE INDEX IF NOT EXISTS "TimeEntry_projectId_date_idx" ON "TimeEntry"("projectId", "date");
CREATE INDEX IF NOT EXISTS "TimeEntry_ticketId_date_horaInicio_idx" ON "TimeEntry"("ticketId", "date", "horaInicio");

CREATE INDEX IF NOT EXISTS "TicketComment_ticketId_createdAt_idx" ON "TicketComment"("ticketId", "createdAt");

CREATE INDEX IF NOT EXISTS "TimeEntryPermissionRequest_userId_createdAt_idx" ON "TimeEntryPermissionRequest"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "TimeEntryPermissionRequest_status_createdAt_idx" ON "TimeEntryPermissionRequest"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "TimeEntryPermissionRequest_userId_status_date_idx" ON "TimeEntryPermissionRequest"("userId", "status", "date");

CREATE INDEX IF NOT EXISTS "HourBankRecord_userId_year_month_idx" ON "HourBankRecord"("userId", "year", "month");
