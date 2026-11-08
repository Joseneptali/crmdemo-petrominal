import { presetDeBaseUrl } from "@/lib/ai/presets";

/**
 * Privacidad de los datos que viajan al proveedor de IA.
 *
 * Por el LLM pasan nombres, teléfonos, correos y el texto completo de las
 * conversaciones. OpenRouter enruta cada petición a uno de varios proveedores
 * que sirven el mismo modelo, y cada uno tiene su propia política: algunos
 * guardan los prompts o entrenan con ellos. Sin instrucciones, cualquiera de
 * ellos puede recibir el turno.
 *
 * Por eso, cuando el destino es OpenRouter, el CRM le pide en cada petición:
 * - `zdr: true` → solo endpoints sin retención de datos (Zero Data Retention).
 * - `data_collection: "deny"` → nunca un proveedor que entrene con los datos.
 *
 * Va encendido por defecto: es lo que el negocio espera de sus datos sin tener
 * que saber que existe. `OPENROUTER_PRIVACIDAD=off` lo apaga, como válvula de
 * escape si el modelo elegido no tiene ningún endpoint ZDR (OpenRouter
 * respondería con error y el agente dejaría de contestar).
 *
 * Otros proveedores compatibles con OpenAI (Z.ai directo, OpenAI, Groq, un
 * vLLM propio…) no conocen el campo `provider`: ahí el cuerpo no se toca, y la
 * privacidad depende del contrato con ese proveedor.
 */

export type PreferenciasProveedor = {
  zdr: true;
  data_collection: "deny";
};

export const PREFERENCIAS_PRIVADAS: PreferenciasProveedor = {
  zdr: true,
  data_collection: "deny",
};

/**
 * `true` si a esta `base_url` hay que pedirle privacidad. Lee `process.env`
 * directo, igual que `provider.ts`: preguntar esto no puede depender de que
 * todo el entorno valide.
 */
export function aplicaPrivacidad(baseUrl: string): boolean {
  const interruptor = process.env.OPENROUTER_PRIVACIDAD?.trim().toLowerCase();
  if (interruptor === "off" || interruptor === "false" || interruptor === "0") {
    return false;
  }
  return presetDeBaseUrl(baseUrl) === "openrouter";
}

/**
 * Las preferencias a mezclar en un cuerpo que el CRM arma (`chatJson`), o
 * `undefined` si no aplica.
 */
export function preferenciasPara(
  baseUrl: string
): PreferenciasProveedor | undefined {
  return aplicaPrivacidad(baseUrl) ? PREFERENCIAS_PRIVADAS : undefined;
}

/**
 * Para el proxy del cerebro (`/api/bot/llm`), que reenvía un cuerpo crudo.
 *
 * Toca UN solo campo y conserva todo lo demás tal como llegó. Si el cerebro
 * ya mandaba su propio `provider` (orden, proveedores permitidos…), se
 * respeta y solo se fuerzan las dos llaves de privacidad: en esas dos manda
 * el CRM, porque los datos son del negocio. Un cuerpo que no es un objeto
 * JSON se reenvía sin cambios: el proveedor sabrá rechazarlo mejor que el CRM.
 */
export function conPrivacidad(cuerpoCrudo: string, baseUrl: string): string {
  if (!aplicaPrivacidad(baseUrl)) return cuerpoCrudo;
  let cuerpo: unknown;
  try {
    cuerpo = JSON.parse(cuerpoCrudo);
  } catch {
    return cuerpoCrudo;
  }
  if (!cuerpo || typeof cuerpo !== "object" || Array.isArray(cuerpo)) {
    return cuerpoCrudo;
  }
  const original = cuerpo as Record<string, unknown>;
  const previo =
    original.provider &&
    typeof original.provider === "object" &&
    !Array.isArray(original.provider)
      ? (original.provider as Record<string, unknown>)
      : {};
  return JSON.stringify({
    ...original,
    provider: { ...previo, ...PREFERENCIAS_PRIVADAS },
  });
}
