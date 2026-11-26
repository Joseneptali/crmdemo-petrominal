CREATE TABLE "clinica_cita" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"paciente_id" text NOT NULL,
	"profesional_id" text NOT NULL,
	"especialidad_id" text NOT NULL,
	"servicio_id" text,
	"contrato_id" text,
	"inicio" timestamp NOT NULL,
	"duracion_min" integer NOT NULL,
	"valor" bigint DEFAULT 0 NOT NULL,
	"estado" text DEFAULT 'agendada' NOT NULL,
	"origen" text DEFAULT 'manual' NOT NULL,
	"conversation_id" text,
	"notas" text,
	"recordatorios" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clinica_contrato" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"eps_id" text NOT NULL,
	"numero" text NOT NULL,
	"tope_mensual" bigint NOT NULL,
	"inicio" text NOT NULL,
	"fin" text NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clinica_eps" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"nombre" text NOT NULL,
	"nit" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clinica_especialidad" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"nombre" text NOT NULL,
	"descripcion" text,
	"palabras" text,
	"orden" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clinica_oferta" (
	"conversation_id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"especialidad_id" text NOT NULL,
	"slots" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clinica_paciente" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"contact_id" text,
	"tipo_documento" text DEFAULT 'CC' NOT NULL,
	"documento" text,
	"nombres" text NOT NULL,
	"apellidos" text,
	"fecha_nacimiento" text,
	"sexo" text,
	"telefono" text,
	"correo" text,
	"eps_id" text,
	"demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clinica_profesional" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"nombre" text NOT NULL,
	"tipo" text DEFAULT 'oftalmologo' NOT NULL,
	"especialidad_id" text NOT NULL,
	"registro" text,
	"horario" jsonb NOT NULL,
	"duracion_min" integer DEFAULT 20 NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clinica_servicio" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"contrato_id" text NOT NULL,
	"especialidad_id" text NOT NULL,
	"codigo" text,
	"nombre" text NOT NULL,
	"tipo" text DEFAULT 'primera_vez' NOT NULL,
	"valor" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clinica_cita" ADD CONSTRAINT "clinica_cita_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinica_cita" ADD CONSTRAINT "clinica_cita_paciente_id_clinica_paciente_id_fk" FOREIGN KEY ("paciente_id") REFERENCES "public"."clinica_paciente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinica_cita" ADD CONSTRAINT "clinica_cita_profesional_id_clinica_profesional_id_fk" FOREIGN KEY ("profesional_id") REFERENCES "public"."clinica_profesional"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinica_cita" ADD CONSTRAINT "clinica_cita_especialidad_id_clinica_especialidad_id_fk" FOREIGN KEY ("especialidad_id") REFERENCES "public"."clinica_especialidad"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinica_cita" ADD CONSTRAINT "clinica_cita_servicio_id_clinica_servicio_id_fk" FOREIGN KEY ("servicio_id") REFERENCES "public"."clinica_servicio"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinica_cita" ADD CONSTRAINT "clinica_cita_contrato_id_clinica_contrato_id_fk" FOREIGN KEY ("contrato_id") REFERENCES "public"."clinica_contrato"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinica_cita" ADD CONSTRAINT "clinica_cita_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinica_contrato" ADD CONSTRAINT "clinica_contrato_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinica_contrato" ADD CONSTRAINT "clinica_contrato_eps_id_clinica_eps_id_fk" FOREIGN KEY ("eps_id") REFERENCES "public"."clinica_eps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinica_eps" ADD CONSTRAINT "clinica_eps_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinica_especialidad" ADD CONSTRAINT "clinica_especialidad_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinica_oferta" ADD CONSTRAINT "clinica_oferta_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinica_oferta" ADD CONSTRAINT "clinica_oferta_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinica_paciente" ADD CONSTRAINT "clinica_paciente_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinica_paciente" ADD CONSTRAINT "clinica_paciente_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinica_paciente" ADD CONSTRAINT "clinica_paciente_eps_id_clinica_eps_id_fk" FOREIGN KEY ("eps_id") REFERENCES "public"."clinica_eps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinica_profesional" ADD CONSTRAINT "clinica_profesional_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinica_profesional" ADD CONSTRAINT "clinica_profesional_especialidad_id_clinica_especialidad_id_fk" FOREIGN KEY ("especialidad_id") REFERENCES "public"."clinica_especialidad"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinica_servicio" ADD CONSTRAINT "clinica_servicio_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinica_servicio" ADD CONSTRAINT "clinica_servicio_contrato_id_clinica_contrato_id_fk" FOREIGN KEY ("contrato_id") REFERENCES "public"."clinica_contrato"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinica_servicio" ADD CONSTRAINT "clinica_servicio_especialidad_id_clinica_especialidad_id_fk" FOREIGN KEY ("especialidad_id") REFERENCES "public"."clinica_especialidad"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "clinica_cita_prof_inicio_uq" ON "clinica_cita" USING btree ("profesional_id","inicio") WHERE "clinica_cita"."estado" <> 'cancelada';--> statement-breakpoint
CREATE INDEX "clinica_cita_inicio_idx" ON "clinica_cita" USING btree ("organization_id","inicio");--> statement-breakpoint
CREATE INDEX "clinica_cita_paciente_idx" ON "clinica_cita" USING btree ("organization_id","paciente_id");--> statement-breakpoint
CREATE INDEX "clinica_contrato_eps_idx" ON "clinica_contrato" USING btree ("organization_id","eps_id");--> statement-breakpoint
CREATE UNIQUE INDEX "clinica_eps_org_nombre_uq" ON "clinica_eps" USING btree ("organization_id","nombre");--> statement-breakpoint
CREATE UNIQUE INDEX "clinica_especialidad_org_nombre_uq" ON "clinica_especialidad" USING btree ("organization_id","nombre");--> statement-breakpoint
CREATE INDEX "clinica_paciente_contact_idx" ON "clinica_paciente" USING btree ("organization_id","contact_id");--> statement-breakpoint
CREATE INDEX "clinica_paciente_doc_idx" ON "clinica_paciente" USING btree ("organization_id","documento");--> statement-breakpoint
CREATE INDEX "clinica_profesional_esp_idx" ON "clinica_profesional" USING btree ("organization_id","especialidad_id");--> statement-breakpoint
CREATE INDEX "clinica_servicio_contrato_idx" ON "clinica_servicio" USING btree ("organization_id","contrato_id");