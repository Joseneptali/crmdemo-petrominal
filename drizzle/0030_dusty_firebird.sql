CREATE TABLE "asesor_correo" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"host" text NOT NULL,
	"puerto" integer DEFAULT 465 NOT NULL,
	"seguro" boolean DEFAULT true NOT NULL,
	"usuario" text NOT NULL,
	"nombre_remitente" text,
	"firma" text,
	"clave_cipher" text NOT NULL,
	"clave_iv" text NOT NULL,
	"clave_tag" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cotizacion" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"numero" integer NOT NULL,
	"contact_id" text NOT NULL,
	"asesor_user_id" text,
	"estado" text DEFAULT 'borrador' NOT NULL,
	"moneda" text DEFAULT 'COP' NOT NULL,
	"iva_porcentaje" integer DEFAULT 19 NOT NULL,
	"validez_dias" integer DEFAULT 15 NOT NULL,
	"condiciones" text,
	"notas" text,
	"subtotal_cents" bigint DEFAULT 0 NOT NULL,
	"total_cents" bigint DEFAULT 0 NOT NULL,
	"envios" jsonb,
	"enviada_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cotizacion_item" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"cotizacion_id" text NOT NULL,
	"producto_id" text,
	"posicion" integer DEFAULT 0 NOT NULL,
	"referencia" text NOT NULL,
	"descripcion" text NOT NULL,
	"unidad" text DEFAULT 'UND' NOT NULL,
	"cantidad_milesimas" integer DEFAULT 1000 NOT NULL,
	"precio_unitario_cents" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "asesor_correo" ADD CONSTRAINT "asesor_correo_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asesor_correo" ADD CONSTRAINT "asesor_correo_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cotizacion" ADD CONSTRAINT "cotizacion_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cotizacion" ADD CONSTRAINT "cotizacion_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cotizacion" ADD CONSTRAINT "cotizacion_asesor_user_id_user_id_fk" FOREIGN KEY ("asesor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cotizacion_item" ADD CONSTRAINT "cotizacion_item_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cotizacion_item" ADD CONSTRAINT "cotizacion_item_cotizacion_id_cotizacion_id_fk" FOREIGN KEY ("cotizacion_id") REFERENCES "public"."cotizacion"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cotizacion_item" ADD CONSTRAINT "cotizacion_item_producto_id_producto_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."producto"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "asesor_correo_org_user_uq" ON "asesor_correo" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cotizacion_org_numero_uq" ON "cotizacion" USING btree ("organization_id","numero");--> statement-breakpoint
CREATE INDEX "cotizacion_org_contacto_idx" ON "cotizacion" USING btree ("organization_id","contact_id");--> statement-breakpoint
CREATE INDEX "cotizacion_item_cot_idx" ON "cotizacion_item" USING btree ("organization_id","cotizacion_id");