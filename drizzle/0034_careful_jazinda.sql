ALTER TABLE "cotizacion" ADD COLUMN "solicitud" text;--> statement-breakpoint
ALTER TABLE "cotizacion" ADD COLUMN "forma_pago" text;--> statement-breakpoint
ALTER TABLE "cotizacion" ADD COLUMN "lugar_entrega" text;--> statement-breakpoint
ALTER TABLE "cotizacion" ADD COLUMN "descuento_porcentaje" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "cotizacion" ADD COLUMN "zona_franca" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "cotizacion_item" ADD COLUMN "dias_entrega" text;