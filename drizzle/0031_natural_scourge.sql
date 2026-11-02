ALTER TABLE "conversation" ADD COLUMN "fuera_horario_at" timestamp;--> statement-breakpoint
ALTER TABLE "petrominal_ajustes" ADD COLUMN "horario_activo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "petrominal_ajustes" ADD COLUMN "horario_modo" text DEFAULT 'ia' NOT NULL;--> statement-breakpoint
ALTER TABLE "petrominal_ajustes" ADD COLUMN "horario" jsonb;--> statement-breakpoint
ALTER TABLE "petrominal_ajustes" ADD COLUMN "mensaje_fuera_horario" text;