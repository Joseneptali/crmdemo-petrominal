/** Petrominal — contrato del informe gerencial (API y UI). */

export type Informe = {
  desde: string;
  hasta: string;
  kpis: {
    clientesNuevos: number;
    conversacionesNuevas: number;
    cotizaciones: number;
    cotizacionesEnviadas: number;
    montoEnviado: number;
    reunionesProgramadas: number;
    reunionesRealizadas: number;
    sinAsesor: number;
  };
  porEtapa: { etapa: string; tipo: string; leads: number }[];
  porAsesor: {
    nombre: string;
    clientes: number;
    cotizaciones: number;
    enviadas: number;
    montoEnviado: number;
    reuniones: number;
    realizadas: number;
  }[];
  porDia: { dia: string; cotizaciones: number; monto: number; clientesNuevos: number }[];
  proximasReuniones: { inicio: string; titulo: string; cliente: string; asesor: string | null }[];
};
