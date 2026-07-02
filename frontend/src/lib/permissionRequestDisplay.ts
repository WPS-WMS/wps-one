export function formatPermissionRequestHorasSuffix(req: {
  totalHoras?: number | null;
  dayTotalHoras?: number | null;
  extraHoras?: number | null;
}): string {
  if (req.dayTotalHoras != null && Number.isFinite(req.dayTotalHoras)) {
    const day = req.dayTotalHoras.toFixed(1);
    const extra =
      req.extraHoras != null && Number.isFinite(req.extraHoras) && req.extraHoras > 0
        ? req.extraHoras.toFixed(1)
        : null;
    if (extra) return ` (${day}h total do dia · +${extra}h extras)`;
    return ` (${day}h total do dia)`;
  }
  if (req.totalHoras) return ` (${req.totalHoras.toFixed(1)}h)`;
  return "";
}
