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
