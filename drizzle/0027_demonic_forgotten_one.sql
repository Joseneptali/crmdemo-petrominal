CREATE TABLE "producto" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"referencia" text NOT NULL,
	"descripcion" text NOT NULL,
	"linea" text DEFAULT '' NOT NULL,
	"grupo" text DEFAULT '' NOT NULL,
	"marca" text DEFAULT '' NOT NULL,
	"unidad" text DEFAULT 'UND' NOT NULL,
	"codigo_barras" text,
	"origen" text DEFAULT 'manual' NOT NULL,
	"foto_mime" text,
	"foto_version" integer DEFAULT 0 NOT NULL,
	"creado_por" text,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "producto" ADD CONSTRAINT "producto_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "producto" ADD CONSTRAINT "producto_creado_por_user_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "producto_org_ref_uq" ON "producto" USING btree ("organization_id","referencia");--> statement-breakpoint
CREATE INDEX "producto_org_linea_idx" ON "producto" USING btree ("organization_id","linea");