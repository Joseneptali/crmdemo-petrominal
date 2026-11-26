CREATE TABLE "clinica_procedimiento" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"nombre" text NOT NULL,
	"codigo" text,
	"tipo" text DEFAULT 'examen' NOT NULL,
	"especialidad_id" text NOT NULL,
	"duracion_min" integer NOT NULL,
	"profesional_ids" jsonb NOT NULL,
	"palabras" text,
	"recomendacion" text,
	"pdf" text,
	"orden" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clinica_cita" ADD COLUMN "procedimiento_id" text;--> statement-breakpoint
ALTER TABLE "clinica_cita" ADD COLUMN "confirmacion" jsonb;--> statement-breakpoint
ALTER TABLE "clinica_oferta" ADD COLUMN "procedimiento_id" text;--> statement-breakpoint
ALTER TABLE "clinica_servicio" ADD COLUMN "procedimiento_id" text;--> statement-breakpoint
ALTER TABLE "clinica_procedimiento" ADD CONSTRAINT "clinica_procedimiento_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinica_procedimiento" ADD CONSTRAINT "clinica_procedimiento_especialidad_id_clinica_especialidad_id_fk" FOREIGN KEY ("especialidad_id") REFERENCES "public"."clinica_especialidad"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "clinica_procedimiento_org_nombre_uq" ON "clinica_procedimiento" USING btree ("organization_id","nombre");--> statement-breakpoint
ALTER TABLE "clinica_cita" ADD CONSTRAINT "clinica_cita_procedimiento_id_clinica_procedimiento_id_fk" FOREIGN KEY ("procedimiento_id") REFERENCES "public"."clinica_procedimiento"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinica_servicio" ADD CONSTRAINT "clinica_servicio_procedimiento_id_clinica_procedimiento_id_fk" FOREIGN KEY ("procedimiento_id") REFERENCES "public"."clinica_procedimiento"("id") ON DELETE cascade ON UPDATE no action;