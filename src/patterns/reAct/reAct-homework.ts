/**
 * PATRÓN: ReAct (Reasoning + Acting) — un resultado válido pero equivocado
 * -------------------------------------------------------------------------
 *
 * LABORATORIO: ¿por qué crashea la app en ANDROID al abrir el carrito?
 *
 * Bucle que intercala razonamiento y acción:
 *   pensar → actuar → OBSERVAR → corregir la acción → actuar de nuevo
 *
 * Aquí la primera acción del agente devuelve un resultado VÁLIDO pero
 * EQUIVOCADO. No falla, no da error: devuelve un crash real del carrito,
 * pero de iOS. El agente tiene que darse cuenta al observar el resultado
 * y reformular la llamada.
 *
 * Y no es un truco inventado: en una app React Native la misma pantalla
 * suele tener crashes distintos en cada plataforma. Buscar "los crashes
 * del carrito" a secas es genuinamente ambiguo.
 *
 * LO IMPORTANTE: el dato correcto NO está al alcance de la primera
 * acción. searchCrash no acepta plataforma: no hay forma de "pedirlo bien"
 * a la primera. Solo se llega al crash de Android ejecutando una acción
 * DISTINTA, y solo se sabe que hace falta si se OBSERVA el aviso del
 * resultado. Reintentar idéntico sería el anti-patrón.
 *
 *   A) Sin ReAct → una pasada: se cree el primer resultado
 *   B) Con ReAct → observa la discrepancia y reformula
 *
 * Los datos imitan a un servicio de reporte de crashes (como Crashlytics
 * o Sentry) y son locales para que el laboratorio sea DETERMINISTA.
 */

import { generateText, tool, stepCountIs } from 'ai';
import { z } from 'zod';

import { createTracer, model } from '../../helpers/index.js';

// ---------------------------------------------------------------------------
// LOS DATOS — los grupos de crashes del servicio de reportes
// ---------------------------------------------------------------------------

type Platform = 'ios' | 'android';

type CrashGroup = {
  id: string;
  screen: string;
  platform: Platform;
  error: string;
  affectedUsers: number;
  lastSeen: string;
};

type CrashDetails = {
  crashId: string;
  topFrame: string;
  osVersions: string[];
  probableCause: string;
};

/** Ordenados del más reciente al más viejo, como los devuelve el servicio. */
const CRASH_GROUPS: CrashGroup[] = [
  {
    id: 'CR-101',
    screen: 'CartScreen',
    platform: 'ios',
    error: 'EXC_BAD_ACCESS (SIGSEGV)',
    affectedUsers: 1_240,
    lastSeen: '2026-11-10T09:12:00Z',
  },
  {
    id: 'CR-102',
    screen: 'CartScreen',
    platform: 'android',
    error: 'android.content.ActivityNotFoundException',
    affectedUsers: 860,
    lastSeen: '2026-11-10T08:47:00Z',
  },
  {
    id: 'CR-103',
    screen: 'ProfileScreen',
    platform: 'android',
    error: 'java.lang.OutOfMemoryError',
    affectedUsers: 95,
    lastSeen: '2026-11-08T17:30:00Z',
  },
];

const CRASH_DETAILS: CrashDetails[] = [
  {
    crashId: 'CR-101',
    topFrame: 'RCTImageView -[RCTImageView reloadImage]',
    osVersions: ['iOS 17.6', 'iOS 18.1'],
    probableCause:
      'Las imágenes de los productos se liberan durante el scroll ' +
      'mientras todavía se están decodificando.',
  },
  {
    crashId: 'CR-102',
    topFrame: 'GooglePayModule.requestPayment (GooglePayModule.kt:84)',
    osVersions: ['Android 13', 'Android 14'],
    probableCause:
      'El botón de Google Pay abre un Intent sin comprobar si la app de ' +
      'Google Pay está instalada en el dispositivo.',
  },
  {
    crashId: 'CR-103',
    topFrame: 'BitmapFactory.decodeStream',
    osVersions: ['Android 10'],
    probableCause: 'La foto de perfil se carga en resolución completa.',
  },
];

function findByScreen(screen: string) {
  return CRASH_GROUPS.filter(
    (c) => c.screen.toLowerCase() === screen.toLowerCase(),
  );
}

// ---------------------------------------------------------------------------
// HERRAMIENTA 1 — buscar crashes de una pantalla
// ---------------------------------------------------------------------------

const searchCrash = tool({
  description:
    'Busca crashes de una pantalla de la app. ' +
    'Devuelve una única coincidencia: el crash más reciente.',
  inputSchema: z.object({
    screen: z.string().describe('Nombre de la pantalla. ej: "CartScreen"'),
  }),
  execute: async ({ screen }) => {
    console.log('Tool searchCrash llamada - args:'.red, { screen });
    const matches = findByScreen(screen);

    if (matches.length === 0) {
      return { error: `No hay crashes en la pantalla "${screen}"` };
    }

    // ══════════════════════════════════════════════════════════════════
    //  EL INTERRUPTOR
    //
    //  Esta herramienta NO acepta plataforma. No se puede filtrar desde
    //  aquí, por muy claro que el usuario haya dicho "en Android":
    //  devuelve siempre el crash más reciente, que aquí es de iOS.
    //
    //  Ese es el punto: el dato correcto NO está al alcance de la
    //  primera acción. Solo se llega a él ejecutando una acción
    //  DISTINTA (listCrashes), y para eso hay que haber leído el
    //  aviso. Reintentar esta misma llamada no cambiaría nada.
    // ══════════════════════════════════════════════════════════════════
    const [latest] = matches;
    const platforms = [...new Set(matches.map((m) => m.platform))];

    if (matches.length === 1) return { resolved: latest };

    return {
      resolved: latest,
      warning:
        `Hay ${matches.length} grupos de crashes en "${screen}" en estas ` +
        `plataformas: ${platforms.join(', ')}. Se devolvió el más reciente, ` +
        'que puede no ser de la plataforma que buscas. ' +
        'Usa listCrashes para filtrar por plataforma.',
      alternativesAvailable: matches.length - 1,
    };
  },
});

// ---------------------------------------------------------------------------
// HERRAMIENTA 2 — la acción correctiva
// ---------------------------------------------------------------------------
// Solo tiene sentido llamarla DESPUÉS de haber observado el aviso.
// Es una acción distinta, no una repetición.

const listCrashes = tool({
  description:
    'Lista los crashes de una pantalla filtrados por plataforma. ' +
    'Úsala cuando searchCrash avise de crashes en varias plataformas ' +
    'y necesites el de una plataforma concreta.',
  inputSchema: z.object({
    screen: z.string().describe('Nombre de la pantalla. ej: "CartScreen"'),
    platform: z.enum(['ios', 'android']),
  }),
  execute: async ({ screen, platform }) => {
    console.log('Tool listCrashes llamada - args:'.red, { screen, platform });
    const matches = findByScreen(screen).filter((c) => c.platform === platform);

    if (matches.length === 0) {
      return { error: `No hay crashes de ${platform} en "${screen}"` };
    }

    return { count: matches.length, matches };
  },
});

// ---------------------------------------------------------------------------
// HERRAMIENTA 3 — el detalle del crash
// ---------------------------------------------------------------------------
// Como getWeather en el ejercicio del clima: recibe un ID y responde con
// seguridad. Si el ID es el equivocado, la respuesta también lo será.

const getCrashDetails = tool({
  description:
    'Devuelve el detalle de un crash: la línea de código donde ocurre, ' +
    'las versiones del sistema afectadas y la causa probable. ' +
    'Requiere el ID del crash, que se obtiene de searchCrash o listCrashes.',
  inputSchema: z.object({
    crashId: z.string().describe('ID del crash. ej: "CR-101"'),
  }),
  execute: async ({ crashId }) => {
    console.log('Tool getCrashDetails llamada - args:'.red, { crashId });
    const details = CRASH_DETAILS.find((d) => d.crashId === crashId);
    if (!details) return { error: `No existe el crash ${crashId}` };
    return details;
  },
});

const TOOLS = { searchCrash, listCrashes, getCrashDetails };

// ---------------------------------------------------------------------------
// EL PROBLEMA
// ---------------------------------------------------------------------------

const QUESTION =
  '¿Por qué crashea la app en Android cuando el usuario abre el carrito ' +
  '(CartScreen)? Dime el error y la causa probable.';

// ---------------------------------------------------------------------------
// A) SIN ReAct — se cree el primer resultado
// ---------------------------------------------------------------------------
// Sin ciclo de observación, el agente encadena searchCrash →
// getCrashDetails y responde. El resultado es coherente, está bien
// redactado, y explica un crash de iOS a quien preguntó por Android.

async function withoutReAct() {
  console.log('\n═══ A) SIN ReAct — una sola pasada ═══\n'.blue);
  const tracer = createTracer('sin-react');

  const { text } = await generateText({
    model,
    prompt: QUESTION,
    tools: TOOLS,
    // Circuit breaker: searchCrash → getCrashDetails = 2 acciones.
    stopWhen: stepCountIs(4),
    instructions:
      'Eres un ingeniero mobile. Usa las herramientas para obtener el ' +
      'dato y responde de inmediato con lo que devuelvan. ' +
      'No cuestiones los resultados. Responde en español.',
    onStepEnd: tracer.onStepFinish,
  });

  console.log('\n Respuesta:\n'.blue, text.green);

  console.log(
    (
      '\n  ⚠️  La respuesta es fluida y probablemente falsa. Fíjate en el' +
      '\n      campo "warning" del primer resultado: la herramienta AVISÓ' +
      '\n      de la ambigüedad y nadie lo leyó.'
    ).yellow,
  );

  return tracer.summary();
}

// ---------------------------------------------------------------------------
// B) CON ReAct — observar, detectar la discrepancia, reformular
// ---------------------------------------------------------------------------

async function withReAct() {
  console.log('\n═══ B) CON ReAct — bucle adaptativo ═══\n'.blue);
  const tracer = createTracer('con-react');

  const { text } = await generateText({
    model,
    prompt: QUESTION,
    tools: TOOLS,
    // Circuit breaker: searchCrash → listCrashes → getCrashDetails = 3 acciones.
    stopWhen: stepCountIs(8),
    instructions:
      'Eres un ingeniero mobile que investiga crashes. Trabaja en ciclos: ' +
      'llama a una herramienta, lee TODO el resultado y compáralo con lo ' +
      'que pidió el usuario. ' +
      'Si el resultado trae un aviso (warning) o no coincide con la ' +
      'pregunta, no lo uses: usa otra herramienta para corregirlo, no ' +
      'repitas la misma llamada. ' +
      'Solo pide el detalle de un crash cuando estés seguro de que es el ' +
      'correcto. En la respuesta final di qué crash usaste y de qué ' +
      'plataforma es. Responde en español.',
    onStepEnd: tracer.onStepFinish,
  });

  console.log('\n Respuesta:\n'.blue, text.green);

  console.log(
    (
      '\n  ✅ Mira la traza: la acción correctiva es OTRA herramienta,' +
      '\n     no la misma repetida. El dato correcto no estaba al alcance' +
      '\n     del primer intento: había que ir a buscarlo.'
    ).yellow,
  );

  return tracer.summary();
}

// ---------------------------------------------------------------------------
// EJECUCIÓN DEL PROGRAMA
// ---------------------------------------------------------------------------

export async function reActCrashPlatformMain() {
  const a = await withoutReAct();
  const b = await withReAct();

  console.log('\n═══ COMPARATIVA ═══\n'.blue);
  console.table({
    'Sin ReAct': a,
    'Con ReAct': b,
  });

  console.log(
    '\n  Ninguna herramienta falló. Ninguna devolvió un error. La primera\n' +
      '  respuesta era técnicamente correcta: hay un crash en el carrito.\n' +
      '  Pero es de iOS, y la pregunta era por Android.\n\n' +
      '  Lo que falta sin ReAct no es capacidad de recuperarse de errores,\n' +
      '  es el paso de OBSERVAR: comparar lo que volvió con lo que se pidió.\n\n' +
      '  Y observar solo sirve si puedes cambiar la siguiente acción. Por eso\n' +
      '  el bucle importa: sin él, la observación no tiene dónde aterrizar.\n',
  );
}
