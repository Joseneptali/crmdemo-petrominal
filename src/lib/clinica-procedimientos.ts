/**
 * Demo clínica — exámenes y procedimientos de la Clínica Oftalmológica Unidad
 * Láser del Atlántico, con su preparación (resumen de los PDF «Recomendación
 * de preparación» del Programa Seguridad del Paciente). Las duraciones salen
 * de esos PDF; los códigos y valores son de demostración.
 */

export const CONTACTO_CLINICA = {
  telefono: "378 1220 (ext. 101, 111, 223 y 231)",
  whatsapp: "301 514 6014",
};

export const LOGO_CLINICA = "clinica-docs/logo-unidad-laser.jpg";
export const CARPETA_RECOMENDACIONES = "clinica-docs/recomendaciones";

/** Lo que se le envía a quien agenda una CONSULTA (no hay PDF para las consultas). */
export const RECOMENDACION_CONSULTA = [
  "Llegue 15 minutos antes de su cita.",
  "Traiga su cédula, el carnet de la EPS y la orden o autorización vigente.",
  "Traiga sus gafas o lentes de contacto, la fórmula anterior y la lista de medicamentos que toma.",
  "Si le van a dilatar la pupila, venga acompañado y no conduzca después: la visión queda borrosa unas horas.",
];

/** Quién realiza el examen: enfermería/técnicos o el médico de una especialidad. */
export type Ejecutor = "enfermeria" | string;

export type ProcedimientoDemo = {
  nombre: string;
  codigo: string;
  tipo: "examen" | "procedimiento";
  /** Nombre de la especialidad relacionada. */
  area: string;
  duracionMin: number;
  /** "enfermeria" o el nombre de la especialidad cuyo médico lo realiza. */
  ejecutor: Ejecutor;
  palabras: string;
  recomendacion: string[];
  pdf: string;
  /** Valor base en pesos. */
  valor: number;
};

export const PROCEDIMIENTOS_DEMO: ProcedimientoDemo[] = [
  {
    nombre: "Angiografía de retina",
    codigo: "951301",
    tipo: "examen",
    area: "Retina y vítreo",
    duracionMin: 60,
    ejecutor: "enfermeria",
    palabras: "angiografia,angiografia de retina,fluoresceina,contraste",
    recomendacion: [
      "El día del examen no consuma lácteos ni sus derivados.",
      "Tome sus medicamentos normalmente y tráigalos; si usa inhaladores u oxígeno, tráigalos también.",
      "Si está en diálisis, hágala después de la angiografía (programe ambas el mismo día).",
      "Venga acompañado y con disponibilidad de tiempo.",
    ],
    pdf: "angiografia-de-retina.pdf",
    valor: 180_000,
  },
  {
    nombre: "Angiotomografía (OCT angiografía)",
    codigo: "951302",
    tipo: "examen",
    area: "Retina y vítreo",
    duracionMin: 20,
    ejecutor: "enfermeria",
    palabras: "angiotomografia,angio oct,angio-oct,octa",
    recomendacion: [
      "Venga acompañado de un adulto responsable. Dura de 10 a 15 minutos.",
      "Si usa gotas de pilocarpina, suspéndalas 24 horas antes.",
      "No suspenda su medicamento habitual. Deberá leer y firmar el consentimiento informado.",
    ],
    pdf: "angiotomografia.pdf",
    valor: 160_000,
  },
  {
    nombre: "Tomografía óptica coherente (OCT)",
    codigo: "951303",
    tipo: "examen",
    area: "Retina y vítreo",
    duracionMin: 30,
    ejecutor: "enfermeria",
    palabras: "tomografia optica,tomografia,oct,tomografia de coherencia",
    recomendacion: [
      "Venga acompañado y con disponibilidad de tiempo; no conduzca.",
      "Quítese los lentes de contacto antes de venir.",
      "Si usa gotas de pilocarpina, suspéndalas 24 horas antes.",
      "Por la dilatación tendrá visión borrosa de 4 a 6 horas.",
    ],
    pdf: "estudio-tomografia-optica.pdf",
    valor: 120_000,
  },
  {
    nombre: "Electrorretinograma",
    codigo: "951304",
    tipo: "examen",
    area: "Retina y vítreo",
    duracionMin: 120,
    ejecutor: "enfermeria",
    palabras: "electrorretinograma,electroretinograma,erg",
    recomendacion: [
      "Dura cerca de 2 horas: venga acompañado, con tiempo y sin conducir.",
      "Duerma mínimo 8 horas la noche anterior.",
      "Mujeres: sin maquillaje ni cremas en la cara.",
      "No suspenda sus medicamentos ni sus gotas oftálmicas.",
    ],
    pdf: "electrorretinograma.pdf",
    valor: 250_000,
  },
  {
    nombre: "Fotocoagulación con láser",
    codigo: "141501",
    tipo: "procedimiento",
    area: "Retina y vítreo",
    duracionMin: 60,
    ejecutor: "Retina y vítreo",
    palabras: "fotocoagulacion,laser de retina,panfotocoagulacion",
    recomendacion: [
      "Venga acompañado; la preparación dura alrededor de 1 hora.",
      "Suspenda las gotas de pilocarpina 24 horas antes.",
      "No suspenda su medicamento habitual. Deberá leer y firmar el consentimiento informado.",
      "Después tendrá visión borrosa, molestia a la luz y posible dolor de cabeza.",
    ],
    pdf: "fotocoagulacion-con-laser.pdf",
    valor: 350_000,
  },
  {
    nombre: "Ecografía ocular",
    codigo: "881101",
    tipo: "examen",
    area: "Retina y vítreo",
    duracionMin: 20,
    ejecutor: "Retina y vítreo",
    palabras: "ecografia,ecografia ocular,ultrasonido",
    recomendacion: [
      "No requiere preparación especial; dura entre 10 y 15 minutos y no causa dolor.",
    ],
    pdf: "ecografia-ocular.pdf",
    valor: 110_000,
  },
  {
    nombre: "Fotos a color de segmento anterior y posterior",
    codigo: "951305",
    tipo: "examen",
    area: "Retina y vítreo",
    duracionMin: 15,
    ejecutor: "enfermeria",
    palabras: "fotos a color,fotografia,fotos del ojo,retinografia",
    recomendacion: [
      "Venga acompañado de un adulto responsable. Dura de 5 a 10 minutos.",
      "No suspenda su medicamento habitual.",
    ],
    pdf: "fotos-a-color.pdf",
    valor: 70_000,
  },
  {
    nombre: "Campo visual computarizado",
    codigo: "951201",
    tipo: "examen",
    area: "Glaucoma",
    duracionMin: 30,
    ejecutor: "enfermeria",
    palabras: "campo visual,campimetria",
    recomendacion: [
      "Traiga sus gafas y su fórmula, si las tiene.",
      "Duerma 8 horas la noche anterior: el examen requiere concentración.",
    ],
    pdf: "campo-visual.pdf",
    valor: 90_000,
  },
  {
    nombre: "Tonografía",
    codigo: "951202",
    tipo: "examen",
    area: "Glaucoma",
    duracionMin: 90,
    ejecutor: "enfermeria",
    palabras: "tonografia,tonometria,curva de presion,presion intraocular",
    recomendacion: [
      "Traiga un litro de agua (se toma durante el examen).",
      "Dura alrededor de hora y media: venga con disponibilidad de tiempo.",
    ],
    pdf: "estudio-tonografia.pdf",
    valor: 85_000,
  },
  {
    nombre: "Iridotomía e iridoplastia (láser)",
    codigo: "121201",
    tipo: "procedimiento",
    area: "Glaucoma",
    duracionMin: 45,
    ejecutor: "Glaucoma",
    palabras: "iridotomia,iridoplastia,laser de iris",
    recomendacion: [
      "Venga acompañado y con disponibilidad de tiempo.",
      "No conduzca en las primeras 2 horas después del procedimiento.",
      "Asista a los controles que le indique su oftalmólogo.",
    ],
    pdf: "iridotomia-e-iridoplastia.pdf",
    valor: 320_000,
  },
  {
    nombre: "Ultrabiomicroscopía (UBM)",
    codigo: "881102",
    tipo: "examen",
    area: "Glaucoma",
    duracionMin: 30,
    ejecutor: "Glaucoma",
    palabras: "ultrabiomicroscopia,ubm",
    recomendacion: [
      "Venga acompañado y con disponibilidad de tiempo.",
      "No suspenda sus medicamentos; si usa lágrimas artificiales, tráigalas.",
      "No use lentes de contacto durante el examen.",
    ],
    pdf: "ultrabiomicroscopia.pdf",
    valor: 140_000,
  },
  {
    nombre: "Topografía corneal computarizada",
    codigo: "951101",
    tipo: "examen",
    area: "Córnea y segmento anterior",
    duracionMin: 15,
    ejecutor: "enfermeria",
    palabras: "topografia,topografia corneal",
    recomendacion: ["No use lentes de contacto como mínimo 15 días antes del examen."],
    pdf: "topografia-corneal.pdf",
    valor: 95_000,
  },
  {
    nombre: "Paquimetría corneal",
    codigo: "951102",
    tipo: "examen",
    area: "Córnea y segmento anterior",
    duracionMin: 15,
    ejecutor: "enfermeria",
    palabras: "paquimetria,grosor de la cornea",
    recomendacion: [
      "No use lentes de contacto un día antes del examen.",
      "Avise si es alérgico a alguna gota anestésica. Las gotas no dilatan ni cambian la visión.",
    ],
    pdf: "paquimetria-corneal.pdf",
    valor: 60_000,
  },
  {
    nombre: "Recuento de células endoteliales",
    codigo: "951103",
    tipo: "examen",
    area: "Córnea y segmento anterior",
    duracionMin: 15,
    ejecutor: "enfermeria",
    palabras: "recuento de celulas,celulas endoteliales,endotelio,microscopia especular",
    recomendacion: [
      "Venga acompañado de un adulto responsable. Dura de 5 a 10 minutos.",
      "No suspenda su medicamento habitual.",
    ],
    pdf: "recuento-de-celulas-endotelial.pdf",
    valor: 80_000,
  },
  {
    nombre: "Biometría ocular",
    codigo: "951104",
    tipo: "examen",
    area: "Córnea y segmento anterior",
    duracionMin: 40,
    ejecutor: "enfermeria",
    palabras: "biometria,calculo del lente,lente intraocular",
    recomendacion: [
      "Venga acompañado y con disponibilidad de tiempo: 15 a 20 minutos por ojo.",
      "No requiere preparación especial; si usa lentes de contacto, retírelos antes.",
    ],
    pdf: "biometria-ocular.pdf",
    valor: 100_000,
  },
  {
    nombre: "Capsulotomía (láser YAG)",
    codigo: "135201",
    tipo: "procedimiento",
    area: "Córnea y segmento anterior",
    duracionMin: 45,
    ejecutor: "Córnea y segmento anterior",
    palabras: "capsulotomia,capsultomia,yag,limpieza del lente,opacidad de capsula",
    recomendacion: [
      "Venga acompañado y con disponibilidad de tiempo.",
      "No conduzca en las primeras 2 horas después del procedimiento.",
    ],
    pdf: "capsultomia.pdf",
    valor: 300_000,
  },
  {
    nombre: "Potenciales visuales evocados",
    codigo: "951401",
    tipo: "examen",
    area: "Neuro-oftalmología",
    duracionMin: 60,
    ejecutor: "enfermeria",
    palabras: "potenciales visuales,potenciales evocados,pve",
    recomendacion: [
      "Dura cerca de 1 hora: venga acompañado y con tiempo. Duerma 8 horas la noche anterior.",
      "Traiga sus gafas y la fórmula. Mujeres: sin maquillaje ni cremas.",
      "Lave el cabello el día anterior y tráigalo seco, sin gel, aceites ni cremas; traiga ganchos para separarlo.",
      "Niños: con un adulto (preferiblemente la mamá), juguetes y su alimentación habitual.",
    ],
    pdf: "potenciales-visuales-evocados.pdf",
    valor: 210_000,
  },
];

/** Lo que va siempre: los documentos que se traen a cualquier examen. */
export const TRAER_SIEMPRE =
  "Traiga la orden de remisión de su médico, la orden de servicio vigente, la historia clínica, la cédula y el carnet.";
