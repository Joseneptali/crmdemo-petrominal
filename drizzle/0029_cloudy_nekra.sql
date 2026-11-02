CREATE TABLE "petrominal_ajustes" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"admin_principal_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "asesor_user_id" text;--> statement-breakpoint
ALTER TABLE "petrominal_ajustes" ADD CONSTRAINT "petrominal_ajustes_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "petrominal_ajustes" ADD CONSTRAINT "petrominal_ajustes_admin_principal_user_id_user_id_fk" FOREIGN KEY ("admin_principal_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "petrominal_ajustes_org_uq" ON "petrominal_ajustes" USING btree ("organization_id");--> statement-breakpoint
ALTER TABLE "contact" ADD CONSTRAINT "contact_asesor_user_id_user_id_fk" FOREIGN KEY ("asesor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;