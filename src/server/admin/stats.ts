import "server-only";
import { sql } from "drizzle-orm";
import type { TenantTx } from "@/server/tenant";

// Statistici simple pentru raportul lunar (CLAUDE.md §6): programări pe lună, după sursă și status.

export type MonthStats = {
  month: string; // „2026-10”
  online: number;
  manual: number;
  completed: number;
  cancelled: number;
  noShow: number;
};

export async function monthlyStats(t: TenantTx, timeZone: string, months = 12): Promise<MonthStats[]> {
  const result = await t.tx.execute<{
    month: string;
    online: number;
    manual: number;
    completed: number;
    cancelled: number;
    no_show: number;
  }>(sql`
    select to_char(date_trunc('month', starts_at at time zone ${timeZone}), 'YYYY-MM') as month,
      count(*) filter (where source = 'online')::int as online,
      count(*) filter (where source = 'manual')::int as manual,
      count(*) filter (where status = 'completed')::int as completed,
      count(*) filter (where status = 'cancelled')::int as cancelled,
      count(*) filter (where status = 'no_show')::int as no_show
    from bookings
    where tenant_id = ${t.tenantId}
      and starts_at >= date_trunc('month', now() at time zone ${timeZone}) at time zone ${timeZone} - make_interval(months => ${months - 1})
    group by 1
    order by 1 desc
  `);
  return result.rows.map((row) => ({
    month: row.month,
    online: row.online,
    manual: row.manual,
    completed: row.completed,
    cancelled: row.cancelled,
    noShow: row.no_show,
  }));
}
