import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { ZONA_CLINICA, type Horario } from "@/lib/clinica";
import { addDaysISO, dayIsoInTz, weekdayKeyOf, zonedWallClockToUtc } from "@/lib/time/slots";
import { agendar, ClinicaError, disponibilidad } from "@/server/clinica";

/**
 * Demo clínica — datos de prueba de la Clínica Oftalmológica Unidad Láser del
 * Atlántico: especialidades, profesionales, EPS con contratos y tope mensual,
 * pacientes (unos con citas, otros sin) y citas pasadas y futuras. Todos los
 * nombres, documentos, teléfonos y EPS son inventados. Se carga una sola vez:
 * si ya hay especialidades, no hace nada.
 */

const ESPECIALIDADES: { nombre: string; descripcion: string; palabras: string }[] = [
  { nombre: "Oftalmología general", descripcion: "Valoración integral de los ojos, ojo rojo, molestias y control anual.", palabras: "oftalmologo,oftalmologia,general,ojo rojo,vista borrosa,revision,chequeo,irritacion,pterigio,orzuelo" },
  { nombre: "Optometría", descripcion: "Examen visual, fórmula de gafas y lentes de contacto.", palabras: "optometria,optometra,gafas,anteojos,lentes,formula,lentes de contacto,examen de la vista,agudeza visual,examen visual" },
  { nombre: "Retina y vítreo", descripcion: "Retinopatía diabética, desprendimiento de retina, degeneración macular, moscas volantes.", palabras: "retina,vitreo,retinopatia,diabetes,diabetico,macula,degeneracion macular,desprendimiento,moscas volantes,destellos" },
  { nombre: "Glaucoma", descripcion: "Presión intraocular alta, campo visual y control del nervio óptico.", palabras: "glaucoma,presion ocular,presion del ojo,tension ocular,campo visual,nervio optico" },
  { nombre: "Córnea y segmento anterior", descripcion: "Cataratas, queratocono, ojo seco y trasplante de córnea.", palabras: "cornea,catarata,cataratas,queratocono,ojo seco,trasplante de cornea,segmento anterior" },
  { nombre: "Cirugía refractiva", descripcion: "Valoración para cirugía láser de miopía, astigmatismo e hipermetropía.", palabras: "cirugia refractiva,lasik,laser,operarme,miopia,astigmatismo,hipermetropia,quitar las gafas,cirugia de los ojos" },
  { nombre: "Oftalmología pediátrica y estrabismo", descripcion: "Salud visual de niños, ojo vago y desviación de los ojos.", palabras: "pediatrica,pediatria,nino,nina,hijo,hija,bebe,estrabismo,bizco,ojo vago,ambliopia,desviacion" },
  { nombre: "Oculoplástica y órbita", descripcion: "Párpados caídos, vías lagrimales, órbita y estética periocular.", palabras: "oculoplastica,parpado,parpados,ptosis,lagrimal,lagrimeo,orbita,bolsas" },
  { nombre: "Neuro-oftalmología", descripcion: "Nervio óptico, visión doble y pérdida de visión de origen neurológico.", palabras: "neuro,neurooftalmologia,neuro-oftalmologia,vision doble,diplopia,neuritis" },
  { nombre: "Uveítis e inflamación ocular", descripcion: "Inflamación interna del ojo y enfermedades autoinmunes oculares.", palabras: "uveitis,inflamacion ocular,inflamacion del ojo,autoinmune" },
];

const M = (start: string, end: string) => ({ start, end });
const PROFESIONALES: { nombre: string; tipo: string; esp: string; registro: string; duracion: number; horario: Horario }[] = [
  { nombre: "Dra. Mariana Rosales Pérez", tipo: "oftalmologo", esp: "Oftalmología general", registro: "RM 08-1043", duracion: 20, horario: { mon: [M("07:00", "12:00")], tue: [M("07:00", "12:00")], wed: [M("07:00", "12:00")], thu: [M("07:00", "12:00")], fri: [M("07:00", "12:00")] } },
  { nombre: "Dr. Andrés Felipe Cárdenas", tipo: "oftalmologo", esp: "Oftalmología general", registro: "RM 08-2217", duracion: 20, horario: { mon: [M("14:00", "18:00")], tue: [M("14:00", "18:00")], wed: [M("14:00", "18:00")], thu: [M("14:00", "18:00")], fri: [M("14:00", "18:00")], sat: [M("08:00", "12:00")] } },
  { nombre: "Opt. Daniela Fontalvo Rada", tipo: "optometra", esp: "Optometría", registro: "TP 1458", duracion: 30, horario: { mon: [M("07:00", "12:00"), M("13:00", "17:00")], tue: [M("07:00", "12:00"), M("13:00", "17:00")], wed: [M("07:00", "12:00"), M("13:00", "17:00")], thu: [M("07:00", "12:00"), M("13:00", "17:00")], fri: [M("07:00", "12:00"), M("13:00", "17:00")], sat: [M("08:00", "12:00")] } },
  { nombre: "Opt. Jorge Luis Navarro", tipo: "optometra", esp: "Optometría", registro: "TP 2031", duracion: 30, horario: { mon: [M("14:00", "18:00")], wed: [M("14:00", "18:00")], fri: [M("14:00", "18:00")] } },
  { nombre: "Dr. Julián Mendoza Ariza", tipo: "oftalmologo", esp: "Retina y vítreo", registro: "RM 08-3390", duracion: 30, horario: { tue: [M("08:00", "12:00")], thu: [M("08:00", "12:00")] } },
  { nombre: "Dra. Carolina Villalba Ruiz", tipo: "oftalmologo", esp: "Glaucoma", registro: "RM 08-2876", duracion: 30, horario: { mon: [M("14:00", "18:00")], wed: [M("14:00", "18:00")] } },
  { nombre: "Dr. Sergio Barrios Polo", tipo: "oftalmologo", esp: "Córnea y segmento anterior", registro: "RM 08-1925", duracion: 30, horario: { wed: [M("08:00", "12:00")], fri: [M("08:00", "12:00")] } },
  { nombre: "Dr. Ricardo Escorcia Daza", tipo: "oftalmologo", esp: "Cirugía refractiva", registro: "RM 08-3011", duracion: 40, horario: { thu: [M("14:00", "18:00")], sat: [M("08:00", "12:00")] } },
  { nombre: "Dra. Paola Charris Molina", tipo: "oftalmologo", esp: "Oftalmología pediátrica y estrabismo", registro: "RM 08-2654", duracion: 30, horario: { mon: [M("08:00", "12:00")], thu: [M("08:00", "12:00")] } },
  { nombre: "Dra. Lina Fernanda Otero", tipo: "oftalmologo", esp: "Oculoplástica y órbita", registro: "RM 08-3512", duracion: 30, horario: { tue: [M("14:00", "18:00")] } },
  { nombre: "Dr. Hernán De la Hoz Castro", tipo: "oftalmologo", esp: "Neuro-oftalmología", registro: "RM 08-1780", duracion: 40, horario: { fri: [M("14:00", "17:00")] } },
  { nombre: "Dr. Camilo Pertuz Vega", tipo: "oftalmologo", esp: "Uveítis e inflamación ocular", registro: "RM 08-2499", duracion: 30, horario: { wed: [M("08:00", "11:00")] } },
];

/** Valor base de la consulta de primera vez y de control, por especialidad (pesos). */
const TARIFAS: Record<string, [number, number]> = {
  "Oftalmología general": [45_000, 35_000],
  "Optometría": [30_000, 25_000],
  "Retina y vítreo": [85_000, 65_000],
  "Glaucoma": [80_000, 60_000],
  "Córnea y segmento anterior": [80_000, 60_000],
  "Cirugía refractiva": [90_000, 70_000],
  "Oftalmología pediátrica y estrabismo": [75_000, 55_000],
  "Oculoplástica y órbita": [85_000, 65_000],
  "Neuro-oftalmología": [95_000, 75_000],
  "Uveítis e inflamación ocular": [90_000, 70_000],
};

/** EPS inventadas. Vida Plena tiene un tope bajo para mostrar el tope en la demo. */
const EPS = [
  { nombre: "EPS Bienestar Caribe", nit: "900.111.222-1", numero: "CT-2026-014", tope: 5_000_000, factor: 1 },
  { nombre: "EPS Vida Plena", nit: "900.333.444-5", numero: "CT-2026-022", tope: 300_000, factor: 0.95 },
  { nombre: "EPS Horizonte Salud", nit: "900.555.666-9", numero: "CT-2026-031", tope: 8_000_000, factor: 1.1 },
];

type Pac = { nombres: string; apellidos: string; doc: string; nac: string; sexo: string; tel: string; eps: string; cita?: { esp: string; dias: number; estado?: "atendida" | "agendada" } };
const PACIENTES: Pac[] = [
  { nombres: "Luis Eduardo", apellidos: "Mercado Fontalvo", doc: "72145890", nac: "1962-03-14", sexo: "M", tel: "3009990101", eps: "EPS Bienestar Caribe", cita: { esp: "Glaucoma", dias: 2 } },
  { nombres: "María José", apellidos: "Pacheco Ariza", doc: "1043567812", nac: "1990-07-22", sexo: "F", tel: "3009990102", eps: "EPS Bienestar Caribe", cita: { esp: "Optometría", dias: 1 } },
  { nombres: "Rafael Antonio", apellidos: "Barraza Lobo", doc: "8734512", nac: "1955-11-02", sexo: "M", tel: "3009990103", eps: "EPS Horizonte Salud", cita: { esp: "Retina y vítreo", dias: 4 } },
  { nombres: "Ana Lucía", apellidos: "Orozco De Ávila", doc: "32789456", nac: "1968-01-30", sexo: "F", tel: "3009990104", eps: "EPS Vida Plena", cita: { esp: "Córnea y segmento anterior", dias: -6, estado: "atendida" } },
  { nombres: "Santiago", apellidos: "Polo Charris", doc: "1129876543", nac: "2016-05-10", sexo: "M", tel: "3009990105", eps: "EPS Vida Plena", cita: { esp: "Oftalmología pediátrica y estrabismo", dias: 3 } },
  { nombres: "Carmen Elena", apellidos: "Rodríguez Insignares", doc: "22567341", nac: "1959-09-18", sexo: "F", tel: "3009990106", eps: "EPS Vida Plena", cita: { esp: "Glaucoma", dias: -3, estado: "atendida" } },
  { nombres: "Jhon Jairo", apellidos: "Salcedo Peña", doc: "1047234567", nac: "1985-12-05", sexo: "M", tel: "3009990107", eps: "EPS Vida Plena", cita: { esp: "Retina y vítreo", dias: 5 } },
  { nombres: "Valentina", apellidos: "Herrera Torregrosa", doc: "1140876234", nac: "1998-04-27", sexo: "F", tel: "3009990108", eps: "EPS Horizonte Salud", cita: { esp: "Cirugía refractiva", dias: 6 } },
  { nombres: "Óscar Mauricio", apellidos: "Villa Rentería", doc: "9087654", nac: "1971-08-09", sexo: "M", tel: "3009990109", eps: "EPS Bienestar Caribe", cita: { esp: "Oftalmología general", dias: -10, estado: "atendida" } },
  { nombres: "Gloria Inés", apellidos: "Manotas Solano", doc: "32456123", nac: "1950-02-11", sexo: "F", tel: "3009990110", eps: "EPS Horizonte Salud", cita: { esp: "Oculoplástica y órbita", dias: 7 } },
  { nombres: "Kevin Andrés", apellidos: "Ruiz Mendoza", doc: "1001234987", nac: "2003-10-15", sexo: "M", tel: "3009990111", eps: "EPS Bienestar Caribe", cita: { esp: "Oftalmología general", dias: 1 } },
  { nombres: "Patricia", apellidos: "Gómez Barrios", doc: "55234876", nac: "1966-06-03", sexo: "F", tel: "3009990112", eps: "EPS Bienestar Caribe", cita: { esp: "Neuro-oftalmología", dias: 8 } },
  { nombres: "Camila Andrea", apellidos: "Jiménez Ortega", doc: "1045789321", nac: "1995-03-19", sexo: "F", tel: "3009990113", eps: "EPS Bienestar Caribe" },
  { nombres: "Fernando", apellidos: "Ospino Rada", doc: "72987123", nac: "1960-12-24", sexo: "M", tel: "3009990114", eps: "EPS Horizonte Salud" },
  { nombres: "Daniela", apellidos: "Castro Padilla", doc: "1143234765", nac: "2001-09-01", sexo: "F", tel: "3009990115", eps: "EPS Vida Plena", cita: { esp: "Optometría", dias: -2, estado: "atendida" } },
  { nombres: "Emilio José", apellidos: "Vergara Lugo", doc: "3789234", nac: "1948-05-17", sexo: "M", tel: "3009990116", eps: "EPS Bienestar Caribe" },
  { nombres: "Sofía", apellidos: "Martínez Cuello", doc: "1098765432", nac: "2012-11-08", sexo: "F", tel: "3009990117", eps: "EPS Horizonte Salud" },
  { nombres: "Alberto", apellidos: "Fuentes Royero", doc: "8901234", nac: "1957-07-29", sexo: "M", tel: "3009990118", eps: "EPS Vida Plena", cita: { esp: "Retina y vítreo", dias: -8, estado: "atendida" } },
  { nombres: "Yolanda", apellidos: "Estrada Morales", doc: "39876543", nac: "1973-01-12", sexo: "F", tel: "3009990119", eps: "EPS Bienestar Caribe" },
  { nombres: "Diego Armando", apellidos: "Peña Caballero", doc: "1042987654", nac: "1988-08-21", sexo: "M", tel: "3009990120", eps: "EPS Horizonte Salud" },
];

/** Primer hueco del horario del profesional en un día pasado (hacia atrás desde `dias`). */
function instantePasado(horario: Horario, dias: number, ahora: Date, desplazamiento: number): Date | null {
  for (let k = 0; k < 14; k++) {
    const dia = addDaysISO(dayIsoInTz(ahora, ZONA_CLINICA), dias - k);
    const wd = weekdayKeyOf(dia, ZONA_CLINICA);
    const iv = wd ? horario[wd]?.[0] : undefined;
    if (!iv) continue;
    const base = zonedWallClockToUtc(dia, iv.start, ZONA_CLINICA);
    if (base) return new Date(base.getTime() + desplazamiento * 60_000);
  }
  return null;
}

export async function cargarDemoClinica(
  organizationId: string,
  opts: { telefonoPrueba?: string | null; ahora?: Date } = {}
): Promise<{ cargado: boolean; citas: number }> {
  const db = getDb();
  const ya = await db
    .select({ id: schema.clinicaEspecialidad.id })
    .from(schema.clinicaEspecialidad)
    .where(eq(schema.clinicaEspecialidad.organizationId, organizationId))
    .limit(1);
  if (ya.length > 0) return { cargado: false, citas: 0 };
  const ahora = opts.ahora ?? new Date();

  const espId = new Map<string, string>();
  await db.insert(schema.clinicaEspecialidad).values(
    ESPECIALIDADES.map((e, i) => {
      const id = newId("clinicaEspecialidad");
      espId.set(e.nombre, id);
      return { id, organizationId, nombre: e.nombre, descripcion: e.descripcion, palabras: e.palabras, orden: i };
    })
  );

  const profPorEsp = new Map<string, { id: string; horario: Horario; duracion: number }>();
  await db.insert(schema.clinicaProfesional).values(
    PROFESIONALES.map((p) => {
      const id = newId("clinicaProfesional");
      if (!profPorEsp.has(p.esp)) profPorEsp.set(p.esp, { id, horario: p.horario, duracion: p.duracion });
      return {
        id,
        organizationId,
        nombre: p.nombre,
        tipo: p.tipo,
        especialidadId: espId.get(p.esp)!,
        registro: p.registro,
        horario: p.horario,
        duracionMin: p.duracion,
      };
    })
  );

  const epsId = new Map<string, string>();
  const contratoId = new Map<string, string>();
  const anio = ahora.getUTCFullYear();
  for (const e of EPS) {
    const id = newId("clinicaEps");
    epsId.set(e.nombre, id);
    await db.insert(schema.clinicaEps).values({ id, organizationId, nombre: e.nombre, nit: e.nit });
    const cid = newId("clinicaContrato");
    contratoId.set(e.nombre, cid);
    await db.insert(schema.clinicaContrato).values({
      id: cid,
      organizationId,
      epsId: id,
      numero: e.numero,
      topeMensual: e.tope,
      inicio: `${anio}-01-01`,
      fin: `${anio + 1}-12-31`,
    });
    await db.insert(schema.clinicaServicio).values(
      ESPECIALIDADES.flatMap((esp, i) => {
        const [pv, ctrl] = TARIFAS[esp.nombre]!;
        const r = (v: number) => Math.round((v * e.factor) / 1000) * 1000;
        const cod = String(890200 + i * 10);
        return [
          { id: newId("clinicaServicio"), organizationId, contratoId: cid, especialidadId: espId.get(esp.nombre)!, codigo: cod, nombre: `Consulta de primera vez — ${esp.nombre}`, tipo: "primera_vez", valor: r(pv) },
          { id: newId("clinicaServicio"), organizationId, contratoId: cid, especialidadId: espId.get(esp.nombre)!, codigo: String(Number(cod) + 1), nombre: `Consulta de control — ${esp.nombre}`, tipo: "control", valor: r(ctrl) },
        ];
      })
    );
  }

  const pacientes = [...PACIENTES];
  if (opts.telefonoPrueba) {
    // El número de quien prueba la demo: un paciente con cita para preguntar por ella.
    pacientes.push({
      nombres: "José",
      apellidos: "Rosania",
      doc: "1044556677",
      nac: "1985-06-15",
      sexo: "M",
      tel: opts.telefonoPrueba,
      eps: "EPS Bienestar Caribe",
      cita: { esp: "Optometría", dias: 2 },
    });
  }

  let citas = 0;
  for (const p of pacientes) {
    const pid = newId("clinicaPaciente");
    await db.insert(schema.clinicaPaciente).values({
      id: pid,
      organizationId,
      tipoDocumento: Number(p.nac.slice(0, 4)) > anio - 18 ? "TI" : "CC",
      documento: p.doc,
      nombres: p.nombres,
      apellidos: p.apellidos,
      fechaNacimiento: p.nac,
      sexo: p.sexo,
      telefono: p.tel,
      correo: `${p.nombres.split(" ")[0]!.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")}.${p.doc.slice(-4)}@ejemplo.com`,
      epsId: epsId.get(p.eps) ?? null,
      demo: true,
    });
    if (!p.cita) continue;
    const especialidadId = espId.get(p.cita.esp)!;
    try {
      if (p.cita.estado === "atendida") {
        const prof = profPorEsp.get(p.cita.esp)!;
        const inicio = instantePasado(prof.horario, p.cita.dias, ahora, (citas % 4) * prof.duracion);
        if (!inicio) continue;
        const cid = contratoId.get(p.eps) ?? null;
        const servicios = cid
          ? await db.select().from(schema.clinicaServicio).where(eq(schema.clinicaServicio.contratoId, cid))
          : [];
        const servicio = servicios.find((s) => s.especialidadId === especialidadId && s.tipo === "primera_vez");
        await db.insert(schema.clinicaCita).values({
          id: newId("clinicaCita"),
          organizationId,
          pacienteId: pid,
          profesionalId: prof.id,
          especialidadId,
          servicioId: servicio?.id ?? null,
          contratoId: servicio ? cid : null,
          inicio,
          duracionMin: prof.duracion,
          valor: servicio?.valor ?? 0,
          estado: "atendida",
          origen: "manual",
          notas: "Cita de prueba (demo)",
        });
        citas++;
        continue;
      }
      // Futura: el primer hueco libre a partir de ese día.
      const desde = addDaysISO(dayIsoInTz(ahora, ZONA_CLINICA), p.cita.dias);
      const disp = await disponibilidad(organizationId, {
        especialidadId,
        pacienteId: pid,
        epsId: epsId.get(p.eps) ?? null,
        now: ahora,
        fromISO: desde,
        toISO: addDaysISO(desde, 30),
      });
      const hueco = disp.huecos[Math.min(1, disp.huecos.length - 1)];
      if (!hueco) continue;
      await agendar(organizationId, {
        pacienteId: pid,
        especialidadId,
        startUtc: hueco.startUtc,
        origen: "manual",
        notas: "Cita de prueba (demo)",
        now: ahora,
      });
      citas++;
    } catch (err) {
      if (!(err instanceof ClinicaError)) throw err;
    }
  }

  return { cargado: true, citas };
}
