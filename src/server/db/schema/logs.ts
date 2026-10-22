// Jurnalele unui service: notificări trimise (și coada de trimitere) + istoricul modificărilor.
import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import {
  AUDIT_ACTOR_KINDS,
  NOTIFICATION_AUDIENCES,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_STATUSES,
  SMS_ENCODINGS,
} from "@/domain/enums";
import { createdAtColumn, idColumn, inList, timestamps } from "./_shared";
import { bookings } from "./bookings";
import { tenantIdColumn } from "./platform";

/**
 * Fiecare SMS / notificare push. Servește și drept coadă: rândurile `scheduled` sunt trimise de cron.
 * Nu stocăm textul mesajului și nici telefonul complet.
 */
export const notificationsLog = pgTable(
  "notifications_log",
  {
    id: idColumn(),
    tenantId: tenantIdColumn(),
    bookingId: uuid("booking_id"),
    channel: text("channel", { enum: NOTIFICATION_CHANNELS }).notNull(),
    /** Tipul mesajului (ex. customer_reminder). */
    kind: text("kind").notNull(),
    audience: text("audience", { enum: NOTIFICATION_AUDIENCES }).notNull(),
    /** Aceeași cheie = același mesaj. Împiedică trimiterea dublă. */
    dedupeKey: text("dedupe_key").notNull(),
    status: text("status", { enum: NOTIFICATION_STATUSES }).notNull(),
    skipReason: text("skip_reason"),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    attempts: smallint("attempts").notNull().default(0),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    /** Ex. „+40 7** *** *30”. */
    recipientMasked: text("recipient_masked"),
    provider: text("provider"),
    providerMsgId: text("provider_msg_id"),
    encoding: text("encoding", { enum: SMS_ENCODINGS }),
    segments: smallint("segments"),
    costEstimateBani: integer("cost_estimate_bani"),
    errorCode: text("error_code"),
    ...timestamps(),
  },
  (t) => [
    unique("notifications_log_tenant_id_uq").on(t.tenantId, t.id),
    unique("notifications_log_dedupe_uq").on(t.tenantId, t.dedupeKey),
    foreignKey({
      name: "notifications_log_booking_fk",
      columns: [t.tenantId, t.bookingId],
      foreignColumns: [bookings.tenantId, bookings.id],
    }).onDelete("cascade"),
    index("notifications_log_due_idx")
      .on(t.tenantId, t.scheduledFor)
      .where(sql`${t.status} = 'scheduled'`),
    index("notifications_log_sent_idx").on(t.tenantId, t.sentAt),
    check("notifications_log_channel_ck", inList(t.channel, NOTIFICATION_CHANNELS)),
    check("notifications_log_audience_ck", inList(t.audience, NOTIFICATION_AUDIENCES)),
    check("notifications_log_status_ck", inList(t.status, NOTIFICATION_STATUSES)),
    check(
      "notifications_log_encoding_ck",
      sql`${t.encoding} is null or ${inList(t.encoding, SMS_ENCODINGS)}`,
    ),
  ],
);

/**
 * Cine a modificat ce și când (prețuri, servicii, program, setări, statusul programărilor),
 * cu valoarea veche și cea nouă. Fără date personale în `before` / `after`.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    tenantId: tenantIdColumn(),
    actorUserId: text("actor_user_id"),
    actorKind: text("actor_kind", { enum: AUDIT_ACTOR_KINDS }).notNull(),
    /** Ex. `price_matrix.update`, `settings.update`. */
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    requestId: text("request_id"),
    createdAt: createdAtColumn(),
  },
  (t) => [
    index("audit_log_recent_idx").on(t.tenantId, t.createdAt.desc()),
    index("audit_log_entity_idx").on(t.tenantId, t.entityType, t.entityId, t.createdAt.desc()),
    check("audit_log_actor_kind_ck", inList(t.actorKind, AUDIT_ACTOR_KINDS)),
  ],
);
