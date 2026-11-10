/**
 * PATRÓN: ReAct (Reasoning + Acting)
 * ---------------------------------------------------
 * Bucle que intercala razonamiento y acción:
 *   pensar → actuar → observar → pensar → ...
 *
 * LABORATORIO: investigar un crash en una app React Native
 *
 * La app se cierra al abrir el carrito. Hay que encontrar en qué versión
 * apareció el crash y qué cambio lo causó.
 *
 * El escenario esencial: UNA herramienta y una cadena de longitud
 * desconocida. Se revisan las versiones hacia atrás hasta encontrar una
 * sin el crash. Nadie sabe cuántas hay que revisar hasta revisarlas: la
 * versión anterior solo aparece DENTRO de la ficha de cada versión.
 *
 * Por eso no se puede planificar por adelantado. No es que el plan fijo
 * se equivoque: es que no se puede ni escribir.
 */

import { generateText, tool, stepCountIs } from 'ai';
import { z } from 'zod';

import { createTracer, model } from '../../helpers/index.js';

// ---------------------------------------------------------------------------
// LOS DATOS — el historial de versiones publicadas
// ---------------------------------------------------------------------------

type Release = {
  version: string;
  releasedAt: string;
  /** Crashes al abrir el carrito durante la primera semana de la versión. */
  cartCrashes: number;
  changes: string[];
  /** La versión publicada justo antes. null = primera versión de la app. */
  previousVersion: string | null;
};

const RELEASES: Release[] = [
  {
    version: '3.6.0',
    releasedAt: '2026-11-03',
    cartCrashes: 412,
    changes: [
      'Rediseño del header del carrito',
      'Nuevo banner de ofertas en Home',
    ],
    previousVersion: '3.5.2',
  },
  {
    version: '3.5.2',
    releasedAt: '2026-10-27',
    cartCrashes: 380,
    changes: ['Fix del login con Apple'],
    previousVersion: '3.5.1',
  },
  {
    version: '3.5.1',
    releasedAt: '2026-10-20',
    cartCrashes: 295,
    changes: [
      'Carga diferida de precios en CartItemRow',
      'Actualización de traducciones',
    ],
    previousVersion: '3.5.0',
  },
  {
    version: '3.5.0',
    releasedAt: '2026-10-13',
    cartCrashes: 0,
    changes: ['Modo oscuro'],
    previousVersion: '3.4.0',
  },
  {
    version: '3.4.0',
    releasedAt: '2026-09-29',
    cartCrashes: 0,
    changes: ['Pago con Google Pay y Apple Pay'],
    previousVersion: '3.0.0',
  },
  {
    version: '3.0.0',
    releasedAt: '2026-09-01',
    cartCrashes: 0,
    changes: ['Primera versión de la app'],
    previousVersion: null,
  },
];

const CURRENT_VERSION = '3.6.0';

/**
 * La cadena real: 3.6.0 (412) → 3.5.2 (380) → 3.5.1 (295) → 3.5.0 (0).
 * La 3.5.0 no tiene el crash, así que lo introdujo la 3.5.1:
 * "Carga diferida de precios en CartItemRow".
 *
 * La trampa: la versión actual dice "Rediseño del header del carrito".
 * Parece la culpable, pero el crash ya existía antes.
 *
 * EXPERIMENTO: pon cartCrashes > 0 en todas las versiones. El agente debe
 * llegar a la 3.0.0 (previousVersion null) y decir que el crash existe
 * desde la primera versión, sin inventar versiones más viejas.
 */

// ---------------------------------------------------------------------------
// LA ÚNICA HERRAMIENTA
// ---------------------------------------------------------------------------

const getRelease = tool({
  description:
    'Devuelve la ficha de una versión publicada de la app: fecha, ' +
    'cantidad de crashes al abrir el carrito, lista de cambios y la ' +
    'versión publicada justo antes.',
  inputSchema: z.object({
    version: z.string().describe('Número de versión. ej: "3.6.0"'),
  }),
  execute: async ({ version }) => {
    const release = RELEASES.find((r) => r.version === version);
    if (!release) return { error: `No existe la versión ${version}` };
    return release;
  },
});

// ---------------------------------------------------------------------------
// EL PROBLEMA
// ---------------------------------------------------------------------------

const REQUEST =
  'Los usuarios reportan que la app se cierra al abrir el carrito. ' +
  `La versión actual es la ${CURRENT_VERSION}.\n\n` +
  'Averigua en qué versión APARECIÓ el crash: la versión más vieja que ' +
  'lo tiene, justo después de una versión sin crashes en el carrito.\n\n' +
  'Responde con la versión, su fecha y el cambio que probablemente lo causó.';

// ---------------------------------------------------------------------------
// A) SIN ReAct — una sola pasada con el dato que tenemos
// ---------------------------------------------------------------------------
// Le damos la ficha de la versión actual y le pedimos la respuesta.
// Sin herramientas, no puede revisar versiones anteriores: la cadena se
// corta en el primer eslabón. Lo más probable es que culpe al
// "Rediseño del header del carrito".

async function withoutReAct() {
  console.log('\n═══ A) SIN ReAct — una sola pasada ═══\n'.blue);
  const tracer = createTracer('sin-react');

  const currentRelease = RELEASES.find((r) => r.version === CURRENT_VERSION);

  const { text } = await generateText({
    model,
    instructions:
      'Eres un ingeniero mobile que investiga crashes. ' +
      'Responde con los datos disponibles. ' +
      'Si los datos no alcanzan para saberlo con seguridad, dilo. ' +
      'Responde en español.',
    prompt:
      `${REQUEST}\n\n` +
      `DATO DISPONIBLE: ${JSON.stringify(currentRelease, null, 2)}`,
    onStepEnd: tracer.onStepFinish,
  });

  console.log('\n Respuesta:\n'.blue, text.green);

  console.log(
    (
      '\n  ⚠️  Solo conoce la versión actual. Sin poder revisar las' +
      '\n      anteriores, o culpa al último cambio o admite que no sabe.'
    ).yellow,
  );

  return tracer.summary();
}

// ---------------------------------------------------------------------------
// B) CON ReAct — el bucle baja por las versiones
// ---------------------------------------------------------------------------

async function withReAct() {
  console.log('\n═══ B) CON ReAct — bucle adaptativo ═══\n'.blue);
  const tracer = createTracer('con-react');

  const { text } = await generateText({
    model,
    tools: { getRelease },
    // Circuit breaker: 4 consultas + la respuesta final, con margen.
    stopWhen: stepCountIs(10),
    instructions:
      'Eres un ingeniero mobile que investiga crashes. Trabaja en ciclos: ' +
      'consulta la ficha de una versión, mira cuántos crashes tiene en el ' +
      'carrito y decide si necesitas revisar la versión anterior.\n' +
      'CONDICIÓN DE CIERRE: solo has terminado cuando encuentres una versión ' +
      'con 0 crashes en el carrito. La culpable es la versión que revisaste ' +
      'justo antes de esa.\n' +
      'Si llegas a una versión sin versión anterior (previousVersion null) ' +
      'y todavía tiene crashes, detente y di que el crash existe desde la ' +
      'primera versión.\n' +
      'No inventes versiones: sácalas del campo previousVersion del ' +
      'resultado anterior.\n' +
      'Tu último mensaje debe ser la respuesta final, no un razonamiento ' +
      'suelto. Cita la versión, la fecha y el cambio sospechoso. ' +
      'Responde en español.',
    prompt: REQUEST,
    onStepEnd: tracer.onStepFinish,
  });

  console.log('\n Respuesta:\n'.blue, text.green);

  console.log(
    (
      '\n  ✅ Cuenta las consultas: ese número es un DATO del historial' +
      '\n     de versiones, no del enunciado. Por eso no se podía planificar.'
    ).yellow,
  );

  return tracer.summary();
}

// ---------------------------------------------------------------------------
// EJECUCIÓN DEL PROGRAMA
// ---------------------------------------------------------------------------

export async function reActCrashChainMain() {
  const a = await withoutReAct();
  const b = await withReAct();

  console.log('\n═══ COMPARATIVA ═══\n'.blue);
  console.table({
    'Sin ReAct': a,
    'Con ReAct': b,
  });

  console.log(
    '\n  El historial tiene varias versiones, pero cuántas hay que revisar\n' +
      '  solo se sabe al recorrerlo. Un plan trazado por adelantado tendría\n' +
      '  que adivinar cuántas veces bajar.\n\n' +
      '  ReAct compra exactamente eso: decidir la siguiente acción DESPUÉS\n' +
      '  de observar la anterior. Se paga en llamadas y en latencia.\n\n' +
      '  Y el precio de adaptarse es no saber cuándo parar.\n',
  );
}
