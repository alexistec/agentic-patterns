/**
 * PATRÓN: Uso de herramientas - Tool use
 * ---------------------------
 * El catálogo de cursos NO está en el entrenamiento
 * del modelo. Sin herramientas, el modelo inventa precios y cursos con
 * total confianza o en su defecto, no hace nada.
 * Con herramientas, consulta el dato real.
 */

import { generateText, tool, stepCountIs } from 'ai';
import { z } from 'zod';
import { createTracer, model } from '../../helpers/index.js';

// ---------------------------------------------------------------------------
//  LA "BASE DE DATOS" — datos que el modelo no puede conocer
// ---------------------------------------------------------------------------

type Course = {
  id: string;
  title: string;
  hours: number;
  priceUSD: number;
  level: 'basic' | 'intermediate' | 'advanced';
  students: number;
};

const COURSE_CATALOG: Course[] = [
  {
    id: 'ts-01',
    title: 'TypeScript desde cero',
    hours: 22,
    priceUSD: 19.99,
    level: 'basic',
    students: 48_120,
  },
  {
    id: 'nest-02',
    title: 'NestJS: API REST modular',
    hours: 31,
    priceUSD: 24.99,
    level: 'intermediate',
    students: 22_450,
  },
  {
    id: 'flu-03',
    title: 'Flutter: apps multiplataforma',
    hours: 46,
    priceUSD: 29.99,
    level: 'intermediate',
    students: 61_300,
  },
  {
    id: 'agt-04',
    title: 'Agentes de IA con TypeScript',
    hours: 18,
    priceUSD: 34.99,
    level: 'advanced',
    students: 1_890,
  },
  {
    id: 'dkr-05',
    title: 'Docker para desarrolladores',
    hours: 14,
    priceUSD: 17.99,
    level: 'basic',
    students: 35_770,
  },
];

const QUESTION = 'How much would the Typescript and Docker courses cost together with  a 20% discount?, Also, tell me the total number of hours.';

async function withoutTools() {

    const tracer = createTracer('without-tools');

    const { text } = await generateText({
        model,
        prompt: QUESTION,
        onStepEnd: tracer.onStepFinish
    });

    console.log('\n Response', text.green);


    return tracer.summary();
}


//! ====== Implementing the pattern TOOL USE

// Tool #1 find courses

const findCourses = tool({
    description: 'Search for courses in the Details catalog by text, title, or level. Always use it before answering any questions about courses, prices, or the number of studens ',
    inputSchema: z.object({
        text: z.string().optional().describe('Text to search in the course title'),
        level: z.enum(['basic','intermediate','advanced']).optional()
    }),
    execute : async ({ text, level }) => {
        const filteredCourses = COURSE_CATALOG.filter((course)=> {
            const matchesText = !text || course.title.toLocaleLowerCase().includes(text.toLocaleLowerCase())
            const matchesLevel = !level || course.level === level;

            return matchesText && matchesLevel;
        });

        return {
            found: filteredCourses.length,
            courses: filteredCourses
        }
    }
});

const calculateTotal = tool({
    description: 'Calculate the total price of a list of courses by applying a percentage discount.Always use this tool for any arithmetic operation. Do not calculate mentally.',
    inputSchema: z.object({
        ids: z.array(z.string()).describe('IDs about the courses . for example: ["ts-01","dkr-0523"]'),
        discountPercent: z.number().min(0).max(100).default(0)
    }),
    execute : async({ ids, discountPercent }) => {
        const foundCourses = COURSE_CATALOG.filter((course) => ids.includes(course.id));

        const notFound = ids.filter(
            (id) => !COURSE_CATALOG.some((course) => course.id === id)
        );

        const subtotal = foundCourses.reduce(
            (acc, course) => acc + course.priceUSD,
            0
        );


        const discount =  subtotal * (discountPercent / 100); 

        console.log('Hello alexis: subtotal========================', Number(subtotal.toFixed(2)))

        return {
            subtotal: Number(subtotal.toFixed(2)),
            discount: Number(discount.toFixed(2)),
            total : Number((subtotal - discount).toFixed(2)),
            notFound: notFound
        }
    }
})


async function withTools() {

    const tracer = createTracer('with-tools');

    const { text } = await generateText({
        model,
        prompt: QUESTION,
        tools: {
            findCourses,
            calculateTotal
        },
        stopWhen: stepCountIs(6),
        instructions: 'You are an assitant for the Details course catalog. Never make up course names, prices, or durations. Always check the available tools for this information before answering.',
        onStepEnd: tracer.onStepFinish
    });

    console.log('\n Response', text.green);


    return tracer.summary();
}





export async function toolUseMain(){
    const resultA = await withoutTools();
    const resultB = await withTools();

    console.log('\n ====Comparativa==');
    console.table({
        'Without tools': resultA,
        'With tool': resultB,
    })
}