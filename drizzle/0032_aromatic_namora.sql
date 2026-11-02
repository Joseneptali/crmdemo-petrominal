CREATE TABLE "reunion" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"contact_id" text NOT NULL,
	"asesor_user_id" text,
	"titulo" text NOT NULL,
	"inicio" timestamp NOT NULL,
	"duracion_min" integer DEFAULT 30 NOT NULL,
	"lugar" text,
	"notas" text,
	"correo_cliente" text,
	"estado" text DEFAULT 'programada' NOT NULL,
	"invitacion" jsonb,
	"recordatorios" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reunion" ADD CONSTRAINT "reunion_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reunion" ADD CONSTRAINT "reunion_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reunion" ADD CONSTRAINT "reunion_asesor_user_id_user_id_fk" FOREIGN KEY ("asesor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reunion_org_inicio_idx" ON "reunion" USING btree ("organization_id","inicio");--> statement-breakpoint
CREATE INDEX "reunion_org_asesor_idx" ON "reunion" USING btree ("organization_id","asesor_user_id");