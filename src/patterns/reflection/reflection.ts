
import { generateText, Output } from 'ai';
import { z } from 'zod';

import { createTracer, model } from '../../helpers/index.js';

/**
 * PATRÓN: Reflection - Reflexión
 * ----------------------------------------
 *
 * LABORATORIO: React Native Performance Review
 *
 * El modelo recibe un componente React Native
 * con problemas de implementación.
 *
 * Comparamos tres estrategias:
 *
 * A) Sin reflexión
 *    → Genera código una sola vez.
 *
 * B) Reflexión ingenua
 *    → Genera código y se pregunta "¿Está bien?".
 *    → No utiliza una rúbrica de revisión.
 *
 * C) Reflexión con rúbrica
 *    → Genera código.
 *    → Revisa requisitos técnicos específicos.
 *    → Corrige problemas encontrados.
 *    → Repite hasta aprobar o alcanzar el límite.
 *
 * OBJETIVO:
 * Demostrar la diferencia entre la autoevaluación
 * del modelo y una auditoría independiente.
 *
 * NOTA:
 * El juez de este laboratorio utiliza heurísticas.
 * No sustituye un compilador, tests ni métricas reales.
 */

// ===========================================================
// 1. LA TAREA
// ===========================================================

const MOBILE_COMPONENT = `
import React from 'react';
import { ScrollView, Text, View } from 'react-native';

type Transaction = {
  id: string;
  description: string;
  amount: number;
};

type Props = {
  transactions: Transaction[];
  search: string;
};

export function ActivityScreen({
  transactions,
  search,
}: Props) {
  const filtered = transactions.filter(item =>
    item.description.toLowerCase().includes(
      search.toLowerCase()
    )
  );

  return (
    <ScrollView>
      {filtered.map((item, index) => (
        <View key={index}>
          <Text>{item.description}</Text>
          <Text>{item.amount}</Text>
        </View>
      ))}
    </ScrollView>
  );
}
`;

const REQUIREMENTS = [
  'Utiliza FlatList en lugar de ScrollView',
  'Utiliza keyExtractor con el ID de la transacción',
  'Utiliza useMemo para memorizar el filtrado',
  'Mantiene TypeScript sin utilizar any explícito',
  'Conserva la búsqueda por descripción',
  'No modifica el array original de transacciones',
  'Renderiza descripción y monto de cada transacción',
];

const TASK = [
  'Actuá como un Senior React Native Engineer.',
  '',
  'Optimizá el siguiente componente.',
  '',
  'REQUISITOS OBLIGATORIOS:',
  ...REQUIREMENTS.map(
    (requirement, i) => `${i + 1}. ${requirement}`
  ),
  '',
  'RESTRICCIONES:',
  '- Conservá la interfaz pública del componente.',
  '- No agregues dependencias externas.',
  '- Mantené el comportamiento de búsqueda.',
  '- No modifiques las transacciones originales.',
  '- Respondé únicamente con código TSX.',
  '',
  'COMPONENTE ORIGINAL:',
  MOBILE_COMPONENT,
].join('\n');

// ===========================================================
// 2. UTILIDADES
// ===========================================================

type Check = {
  label: string;
  passed: boolean;
};

function cleanCode(text: string): string {
  return text
    .trim()
    .replace(
      /^```(?:tsx|typescript|ts|jsx|javascript|js)?\s*\n/i,
      ''
    )
    .replace(/\n?```\s*$/, '')
    .trim();
}

// ===========================================================
// 3. JUEZ PROGRAMÁTICO
// ===========================================================

/**
 * Verificación independiente del modelo.
 *
 * Es un juez heurístico basado en expresiones regulares.
 *
 * Limitaciones:
 * - No comprueba compilación.
 * - No ejecuta tests.
 * - Puede confundir comentarios con código.
 * - No garantiza que keyExtractor sea correcto.
 * - No demuestra una mejora real de performance.
 *
 * Próxima evolución:
 * TypeScript AST + ESLint + Jest.
 */

// Una función flecha que devuelve el id, con o sin tipo:
//   (item) => item.id
//   (item: Transaction) => item.id
//   ({ id }: Transaction) => id
const ARROW_RETURNS_ID =
  String.raw`\(?\s*(?:\{\s*id\s*\}|\w+)\s*(?::\s*\w+)?\s*(?:,\s*\w+(?::\s*\w+)?\s*)?\)?\s*=>\s*(?:\w+\.)?id\b`;

/**
 * Acepta keyExtractor en línea o como función aparte:
 *   keyExtractor={(item: Transaction) => item.id}
 *   keyExtractor={keyExtractor}  →  const keyExtractor = (item) => item.id
 */
function usesIdAsKey(code: string): boolean {
  const inline = new RegExp(String.raw`keyExtractor\s*=\s*\{\s*` + ARROW_RETURNS_ID);
  if (inline.test(code)) return true;

  const reference = code.match(/keyExtractor\s*=\s*\{\s*(\w+)\s*\}/);
  if (!reference) return false;

  const definition = new RegExp(
    String.raw`\b${reference[1]}\s*=\s*(?:useCallback\s*\(\s*)?` + ARROW_RETURNS_ID
  );
  return definition.test(code);
}

// Solo cuenta "any" usado como tipo, no la palabra en un comentario.
const EXPLICIT_ANY = /(?::|\bas)\s*any\b|<\s*any\s*>/;

function auditMobileCode(code: string): Check[] {
  return [
    {
      label: 'Utiliza FlatList',
      passed: /<FlatList\b/.test(code),
    },
    {
      label: 'No utiliza ScrollView',
      passed: !/<ScrollView\b/.test(code),
    },
    {
      label: 'Utiliza keyExtractor con item.id',
      passed: usesIdAsKey(code),
    },
    {
      label: 'Utiliza useMemo',
      passed: /\buseMemo\s*(?:<[^>]*>)?\s*\(/.test(code),
    },
    {
      label: 'No utiliza any explícito',
      passed: !EXPLICIT_ANY.test(code),
    },
    {
      label: 'Conserva la búsqueda',
      passed:
        code.includes('description') &&
        code.includes('toLowerCase') &&
        code.includes('includes'),
    },
    {
      label: 'Renderiza descripción y monto',
      passed:
        code.includes('item.description') &&
        code.includes('item.amount'),
    },
    {
      label: 'No presenta mutaciones directas evidentes',
      passed:
        !/\btransactions\.(sort|reverse|splice|push|pop|shift|unshift)\s*\(/.test(
          code
        ),
    },
  ];
}

function printAudit(checks: Check[]): number {
  const passed = checks.filter(
    check => check.passed
  ).length;

  for (const check of checks) {
    const mark = check.passed ? '✓' : '✗';

    console.log(`     ${mark} ${check.label}`);
  }

  console.log(
    `\n     → ${passed}/${checks.length} verificaciones aprobadas`
  );

  return passed;
}

// ===========================================================
// 4. BORRADOR COMPARTIDO
// ===========================================================

/**
 * Las tres estrategias parten del MISMO borrador.
 * Así la diferencia entre A, B y C viene solo de la reflexión,
 * y no de que cada una tuvo un primer intento distinto.
 */

type Cost = { steps: number; totalTokens: number };

type Draft = { code: string; cost: Cost };

async function generateDraft(): Promise<Draft> {
  console.log('\n═══ BORRADOR INICIAL (compartido) ═══\n');

  const tracer = createTracer('mobile-borrador');

  const { text } = await generateText({
    model,
    prompt: TASK,
    onStepEnd: tracer.onStepFinish,
  });

  const code = cleanCode(text);

  console.log('\nCÓDIGO GENERADO:\n');
  console.log(code);

  return { code, cost: tracer.summary() };
}

// Cada estrategia suma el costo del borrador a su propio costo.
function addCost(base: Cost, extra: Cost): Cost {
  return {
    steps: base.steps + extra.steps,
    totalTokens: base.totalTokens + extra.totalTokens,
  };
}

// ===========================================================
// 5. A) SIN REFLEXIÓN
// ===========================================================

function withoutReflection(draft: Draft) {
  console.log('\n═══ A) SIN REFLEXIÓN ═══\n');

  console.log('AUDITORÍA:\n');

  const score = printAudit(
    auditMobileCode(draft.code)
  );

  return {
    ...draft.cost,
    score,
    iterations: 0,
  };
}

// ===========================================================
// 6. B) REFLEXIÓN INGENUA
// ===========================================================

const naiveVerdictSchema = z.object({
  isGoodEnough: z.boolean().describe(
    'Indica si el código está listo para entregar'
  ),
  comment: z.string().describe(
    'Explicación breve del veredicto'
  ),
});

async function naiveReflection(initial: Draft) {
  console.log(
    '\n═══ B) REFLEXIÓN INGENUA ═══\n'
  );

  const tracer = createTracer(
    'mobile-naive-reflection'
  );

  // PASO 1: Partir del borrador compartido.
  const draft = initial.code;

  // PASO 2: Reflexión sin criterios explícitos.
  const { output: verdict } = await generateText({
    model,
    output: Output.object({
      schema: naiveVerdictSchema,
    }),
    prompt: [
      'Revisá este código React Native.',
      '',
      '¿Considerás que está correctamente',
      'implementado y optimizado?',
      '¿Está listo para entregar?',
      '',
      'CÓDIGO:',
      draft,
    ].join('\n'),
    onStepEnd: tracer.onStepFinish,
  });

  console.log('\nVEREDICTO DEL MODELO:\n');

  console.log(
    verdict.isGoodEnough
      ? 'El modelo considera que está listo.'
      : 'El modelo considera que necesita cambios.'
  );

  console.log(`Comentario: ${verdict.comment}`);

  // PASO 3: Auditoría independiente.
  console.log('\nAUDITORÍA PROGRAMÁTICA:\n');

  const checks = auditMobileCode(draft);
  const score = printAudit(checks);

  console.log('\nCOMPARACIÓN:\n');

  console.log({
    modelApproved: verdict.isGoodEnough,
    auditPassed: score,
    auditTotal: checks.length,
  });

  return {
    ...addCost(initial.cost, tracer.summary()),
    score,
    iterations: 0,
    modelApproved: verdict.isGoodEnough,
  };
}

// ===========================================================
// 7. C) REFLEXIÓN CON RÚBRICA
// ===========================================================

// Solo lista los requisitos incumplidos: si la lista está vacía, todo se cumple.
const criticSchema = z.object({
  missing: z.array(
    z.object({
      requirementNumber: z.number()
        .int()
        .min(1)
        .max(REQUIREMENTS.length),

      evidence: z.string().describe(
        'Evidencia concreta de por qué no se cumple'
      ),
    })
  ).describe(
    'Requisitos incumplidos con evidencia'
  ),

  isComplete: z.boolean().describe(
    'True únicamente si todos los requisitos se cumplen'
  ),
});

const MAX_ITERATION = 3;

async function reflectionWithRubric(initial: Draft) {
  console.log(
    '\n═══ C) REFLEXIÓN CON RÚBRICA ═══\n'
  );

  const tracer = createTracer(
    'mobile-rubric-reflection'
  );

  // PASO 1: Partir del borrador compartido.
  let draft = initial.code;
  let iteration = 0;
  let revisions = 0;

  console.log('AUDITORÍA INICIAL:\n');
  printAudit(auditMobileCode(draft));

  // PASO 2: Ciclo de reflexión.
  while (iteration < MAX_ITERATION) {
    iteration++;

    console.log(
      `\n═══ ITERACIÓN ${iteration} ═══\n`
    );

    // Revisión del mismo modelo con rúbrica.
    const { output: critique } = await generateText({
      model,
      output: Output.object({
        schema: criticSchema,
      }),

      prompt: [
        'REQUISITOS:',
        ...REQUIREMENTS.map(
          (r, i) => `${i + 1}. ${r}`
        ),
        '',
        'CÓDIGO A REVISAR:',
        draft,
      ].join('\n'),

      instructions: [
        'Actuá como un revisor Senior React Native.',
        'Verificá cada requisito de forma estricta.',
        'No asumas que algo está correcto sin evidencia.',
        'Incluí en missing únicamente los requisitos incumplidos.',
        'Si todos se cumplen, missing debe ser una lista vacía.',
        'Si hay requisitos incumplidos,',
        'isComplete debe ser false.',
        'No inventes evidencia.',
      ].join(' '),

      onStepEnd: tracer.onStepFinish,
    });

    const missing = critique.missing;

    console.log('\nRESULTADO DE LA REVISIÓN:\n');
    console.log(
      JSON.stringify(critique, null, 2)
    );

    // PASO 3: Auditoría programática.
    const checks = auditMobileCode(draft);
    const score = printAudit(checks);

    const failedChecks = checks
      .filter(check => !check.passed)
      .map(check => check.label);

    const modelApproved =
      critique.isComplete &&
      missing.length === 0;

    const auditApproved =
      score === checks.length;

    // Detener si ambos coinciden en la aprobación.
    if (modelApproved && auditApproved) {
      console.log(
        '\nEl modelo y la auditoría básica aprobaron el código.'
      );
      break;
    }

    console.log('\nPROBLEMAS DETECTADOS:\n');

    missing.forEach(item => {
      console.log(
        `Requisito ${item.requirementNumber}: ` +
        item.evidence
      );
    });

    failedChecks.forEach(label => {
      console.log(`Auditoría: ${label}`);
    });

    // Evitar superar el límite de iteraciones.
    if (iteration >= MAX_ITERATION) {
      console.log(
        '\nSe alcanzó el máximo de iteraciones.'
      );
      break;
    }

    // PASO 4: Corrección del código.
    const { text: revised } = await generateText({
      model,

      instructions: [
        'Actuá como Senior React Native Engineer.',
        'Corregí los problemas señalados.',
        'Conservá lo que ya funciona.',
        'No cambies la interfaz pública.',
        'No agregues dependencias externas.',
        'No elimines funcionalidades existentes.',
        'Respondé únicamente con código TSX.',
      ].join(' '),

      prompt: [
        'CÓDIGO ACTUAL:',
        draft,
        '',
        'OBSERVACIONES DEL REVISOR:',
        ...missing.map(
          item => JSON.stringify(item)
        ),
        '',
        'VERIFICACIONES PROGRAMÁTICAS FALLIDAS:',
        ...failedChecks,
        '',
        'REQUISITOS OBLIGATORIOS:',
        ...REQUIREMENTS.map(
          (r, i) => `${i + 1}. ${r}`
        ),
        '',
        'COMPONENTE ORIGINAL:',
        MOBILE_COMPONENT,
      ].join('\n'),

      onStepEnd: tracer.onStepFinish,
    });

    draft = cleanCode(revised);
    revisions++;

    console.log('\nCÓDIGO CORREGIDO:\n');
    console.log(draft);
  }

  // PASO 5: Auditoría final.
  console.log('\n═══ RESULTADO FINAL ═══\n');

  console.log(draft);

  console.log('\nAUDITORÍA FINAL:\n');

  const score = printAudit(
    auditMobileCode(draft)
  );

  return {
    ...addCost(initial.cost, tracer.summary()),
    score,
    iterations: iteration,
    revisions,
  };
}

// ===========================================================
// 8. EJECUCIÓN DEL LABORATORIO
// ===========================================================

export async function reflectionMain() {
  console.log(
    '\n========================================'
  );
  console.log(
    '   REFLECTION PATTERN - REACT NATIVE'
  );
  console.log(
    '========================================\n'
  );

  const draft = await generateDraft();

  const a = withoutReflection(draft);
  const b = await naiveReflection(draft);
  const c = await reflectionWithRubric(draft);

  console.log('\n═══ COMPARATIVA FINAL ═══\n');

  console.table({
    'Sin reflexión': a,
    'Reflexión ingenua': b,
    'Reflexión con rúbrica': c,
  });

  console.log(`
CONCLUSIONES DEL LABORATORIO:

1. Generar código no garantiza que sea correcto.

2. Una autoevaluación genérica puede pasar por alto
   problemas de implementación.

3. La rúbrica permite revisar requisitos concretos.

4. El juez programático contrasta la opinión del modelo
   con verificaciones independientes.

5. Más iteraciones no garantizan una mejor solución.

6. Aprobar la rúbrica no demuestra una mejora real
   de performance.

7. Separar generador y revisor en agentes especializados
   es una posible evolución hacia Evaluator-Optimizer.

EXPERIMENTO:

Compará los scores obtenidos y el costo en tokens
de cada estrategia usando las métricas del tracer.
`);
}
