import type { MentionUserOption } from "@/components/RichTextEditor";
import type { UserPickerOption } from "@/components/UserPickerDropdown";

type ProjectUserRef = {
  id?: string;
  name?: string;
  email?: string;
  avatarUrl?: string | null;
  updatedAt?: string;
};

function addMentionUser(
  byId: Map<string, MentionUserOption>,
  user: ProjectUserRef | null | undefined,
) {
  if (user?.id && user?.name) {
    byId.set(user.id, {
      id: user.id,
      name: user.name,
      email: user.email ?? byId.get(user.id)?.email,
    });
  }
}

/** Membros + responsáveis (+ atribuído padrão) retornados por GET /api/projects/:id?light=true */
export function parseProjectMentionUsersFromApi(project: unknown): MentionUserOption[] {
  if (!project || typeof project !== "object") return [];
  const p = project as Record<string, unknown>;
  const byId = new Map<string, MentionUserOption>();

  const members = Array.isArray(p.members) ? p.members : [];
  const responsibles = Array.isArray(p.responsibles) ? p.responsibles : [];
  for (const m of members) {
    const row = m as { user?: ProjectUserRef };
    addMentionUser(byId, row?.user);
  }
  for (const r of responsibles) {
    const row = r as { user?: ProjectUserRef };
    addMentionUser(byId, row?.user);
  }
  addMentionUser(byId, p.defaultTaskAssignee as ProjectUserRef | undefined);

  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

function addTaskAssignableUser(
  byId: Map<string, UserPickerOption>,
  user: ProjectUserRef | null | undefined,
) {
  if (user?.id && user?.name) {
    const prev = byId.get(user.id);
    byId.set(user.id, {
      id: user.id,
      name: user.name,
      email: user.email ?? prev?.email,
      avatarUrl: user.avatarUrl !== undefined ? user.avatarUrl : prev?.avatarUrl,
      updatedAt: user.updatedAt ?? prev?.updatedAt,
    });
  }
}

/** Membros + responsáveis + atribuição padrão — elegíveis para membros da tarefa. */
export function parseProjectTaskAssignableUsersFromApi(project: unknown): UserPickerOption[] {
  if (!project || typeof project !== "object") return [];
  const p = project as Record<string, unknown>;
  const byId = new Map<string, UserPickerOption>();

  const members = Array.isArray(p.members) ? p.members : [];
  const responsibles = Array.isArray(p.responsibles) ? p.responsibles : [];
  for (const m of members) {
    const row = m as { user?: ProjectUserRef };
    addTaskAssignableUser(byId, row?.user);
  }
  for (const r of responsibles) {
    const row = r as { user?: ProjectUserRef };
    addTaskAssignableUser(byId, row?.user);
  }
  addTaskAssignableUser(byId, p.defaultTaskAssignee as ProjectUserRef | undefined);

  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

export function mergeMentionUserOptions(...lists: MentionUserOption[][]): MentionUserOption[] {
  const byId = new Map<string, MentionUserOption>();
  for (const list of lists) {
    for (const u of list) {
      if (u?.id && u?.name) {
        byId.set(u.id, { id: u.id, name: u.name, email: u.email ?? byId.get(u.id)?.email });
      }
    }
  }
  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}
