// Server-only Session 3 R3 grading harness. The private test specifications must
// never be served as browser assets or included in question snapshots.
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// For a public source repository, inject the instructor files as Render secret
// files and set PB3_R3_SPEC_DIR to the directory containing the two JSON specs.
// The local private/ folder is suitable only for a PRIVATE source repository.
const specRoot = process.env.PB3_R3_SPEC_DIR
    ? pathToFileURL(path.resolve(process.env.PB3_R3_SPEC_DIR) + path.sep)
    : new URL('../private/session3-r3/', import.meta.url);
const specs = new Map();
for (const lang of ['PY','JA']) {
    const filename = `Session3_${lang}_Instructor_Spec_R3.json`;
    const raw = JSON.parse(readFileSync(new URL(filename, specRoot), 'utf8'));
    for (const q of raw.questions) {
        if (specs.has(q.id)) throw new Error(`Repeated R3 instructor ID ${q.id}`);
        specs.set(q.id, Object.freeze(q));
    }
}
export const R3_GRADER_VERSION = 'PB3-R3-hidden-tests-1';
export const R3_EXPLANATION_RUBRIC_VERSION = 'PB3-R3-explanation-4x25-v1';
export const isR3Question = q => /^PB3-(PY|JA)-\d\d-(WA|WB|DBG|EXP)-R3$/.test(q?.id || '');
export const isR3CodeQuestion = q => isR3Question(q) && !q.id.includes('-EXP-');
export const isR3Explanation = q => isR3Question(q) && q.id.includes('-EXP-');

export function r3PrivateSpec(questionId) {
    const q = specs.get(questionId);
    if (!q) throw new Error(`Unknown private Session 3 item: ${questionId}`);
    return q;
}

const pyPrelude = String.raw`
# PracticeBridge R3 isolated behavioral checks (server provided)
import json as _pbjson
import copy as _pbcopy
import base64 as _pbbase64

def _pb_make(value, class_name):
    if isinstance(value, dict) and value.get('type') == 'object':
        typ = globals().get(class_name)
        if typ is None: raise ValueError('Missing object class')
        item = typ()
        for key, element in value['fields'].items():
            setattr(item, key, element)
        return item
    if isinstance(value, dict) and value.get('type') == 'array':
        return [_pb_make(x, class_name) for x in value['values']]
    if isinstance(value, list):
        return [_pb_make(x, class_name) for x in value]
    return value

def _pb_state(value):
    if isinstance(value, list): return [_pb_state(x) for x in value]
    if isinstance(value, dict): return {str(k): _pb_state(v) for k,v in sorted(value.items())}
    if hasattr(value, '__dict__'): return {str(k): _pb_state(v) for k,v in sorted(vars(value).items())}
    return value

def _pb_answer(value, fields):
    if isinstance(value, (list, tuple)):
        return [_pb_answer(x, fields) for x in value]
    if hasattr(value, '__dict__') and fields:
        return [getattr(value, field) for field in fields]
    return value
`;

function pyClassName(spec) {
    return /class\s+(\w+)\s*(?:\([^)]*\))?\s*:/.exec(spec.reference_solution || '')?.[1] || '';
}

function pyHarness(spec, code, tests, marker) {
    const fields = resultFields(spec);
    const casesB64 = Buffer.from(JSON.stringify(tests),'utf8').toString('base64');
    const qClass = pyClassName(spec);
    return code + '\n' + pyPrelude + `\n_pb_cases = _pbjson.loads(_pbbase64.b64decode(${JSON.stringify(casesB64)}).decode('utf-8'))\n` +
      `for _pb_idx, _pb_test in enumerate(_pb_cases):\n` +
      `    try:\n` +
      `        _pb_args = [_pb_make(v, ${JSON.stringify(qClass)}) for v in _pb_test['args']]\n` +
      `        _pb_before = _pb_state(_pb_args)\n` +
      `        _pb_got = globals()[${JSON.stringify(spec.entry_point)}](*_pb_args)\n` +
      `        _pb_ok = (_pb_answer(_pb_got, ${JSON.stringify(fields)}) == _pb_test['expected'])\n` +
      `        if _pb_test.get('after') is not None:\n` +
      `            for _pb_key, _pb_value in _pb_test['after'].items():\n` +
      `                _pb_ok = _pb_ok and getattr(_pb_args[0], _pb_key) == _pb_value\n` +
      `            _pb_ok = _pb_ok and _pb_state(_pb_args[1:]) == _pb_before[1:]\n` +
      `        else:\n` +
      `            _pb_ok = _pb_ok and _pb_state(_pb_args) == _pb_before\n` +
      (fields.length ? `        if isinstance(_pb_got, (list, tuple)):\n            _pb_ok = _pb_ok and len({id(x) for x in _pb_got}) == len(_pb_got)\n` : '') +
      `    except BaseException:\n` +
      `        _pb_ok = False\n` +
      `    print(${JSON.stringify(marker)} + str(_pb_idx) + ':' + ('1' if _pb_ok else '0'))\n`;
}

function resultFields(spec) {
    const family = spec.id.match(/PB3-(?:PY|JA)-(\d\d)-/)?.[1];
    if (family === '02') return spec.id.includes('-02-WB-') ? ['amount','excess'] : ['amount','counted'];
    if (family === '10') return ['number','text'];
    return [];
}
const toCamel = s => s.replace(/_([a-z])/g, (_,c) => c.toUpperCase());
function javaLiteral(v) {
    if (v === null) return 'null';
    if (typeof v === 'boolean') return String(v);
    if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v)+'d';
    if (typeof v === 'string') return JSON.stringify(v);
    throw new Error(`Unsupported Java literal ${typeof v}`);
}
function javaExpected(v) {
    if (Array.isArray(v)) return `java.util.Arrays.asList(${v.map(javaExpected).join(',')})`;
    return javaLiteral(v);
}
function javaMethodParamTypes(spec) {
    const source = spec.reference_solution;
    const re = new RegExp(`static\\s+[\\w<>\\[\\]]+\\s+${spec.entry_point}\\s*\\(([^)]*)\\)`);
    const hit = re.exec(source);
    if (!hit) throw new Error(`Missing Java signature for ${spec.id}`);
    return hit[1].split(',').map(x=>x.trim().split(/\s+/)[0]);
}
function javaAssignArg(value, type, name) {
    const lines=[];
    const assignFields=(v,t,obj)=> {
        for(const [field,val] of Object.entries(v.fields))lines.push(`fieldSet(${obj},${JSON.stringify(toCamel(field))},${javaLiteral(val)});`);
    };
    if (type.endsWith('[]')) {
        const elementType = type.slice(0,-2);
        const values = Array.isArray(value)?value:value?.type==='array'?value.values:null;
        if (!values) throw new Error(`Expected Java array for ${name}/${type}`);
        if (elementType==='int'||elementType==='boolean'||elementType==='double') {
            lines.push(`${type} ${name} = new ${elementType}[]{${values.map(javaLiteral).join(',')}};`);
        } else {
            const local=[];
            for (let i=0; i<values.length; i++) {
                const obj=`${name}_item_${i}`;
                lines.push(`${elementType} ${obj} = new ${elementType}();`);
                assignFields(values[i],elementType,obj);
                local.push(obj);
            }
            lines.push(`${type} ${name} = new ${elementType}[]{${local.join(',')}};`);
        }
    } else if (value?.type==='object') {
        lines.push(`${type} ${name} = new ${type}();`);
        assignFields(value,type,name);
    } else {
        lines.push(`${type} ${name} = ${javaLiteral(value)};`);
    }
    return lines;
}

const javaPrelude = String.raw`
public class Main {
    static void fieldSet(Object obj, String name, Object value) throws Exception {
        java.lang.reflect.Field f = obj.getClass().getDeclaredField(name);
        f.setAccessible(true);
        Class<?> typ = f.getType();
        if (typ == int.class) f.setInt(obj, ((Number) value).intValue());
        else if (typ == double.class) f.setDouble(obj, ((Number) value).doubleValue());
        else if (typ == boolean.class) f.setBoolean(obj, (Boolean) value);
        else f.set(obj, value);
    }
    static Object fieldGet(Object obj, String name) throws Exception {
        java.lang.reflect.Field f = obj.getClass().getDeclaredField(name);
        f.setAccessible(true); return f.get(obj);
    }
    static Object norm(Object v, String[] fields) throws Exception {
        if (v == null || v instanceof String || v instanceof Number || v instanceof Boolean) return v;
        if (v instanceof java.util.Collection<?>) {
            java.util.List<Object> xs = new java.util.ArrayList<>();
            for (Object x : (java.util.Collection<?>)v) xs.add(norm(x, fields));
            return xs;
        }
        if (v.getClass().isArray()) {
            java.util.List<Object> xs = new java.util.ArrayList<>();
            for (int i=0; i<java.lang.reflect.Array.getLength(v);i++) xs.add(norm(java.lang.reflect.Array.get(v,i), fields));
            return xs;
        }
        if (fields.length > 0) {
            java.util.List<Object> xs = new java.util.ArrayList<>();
            for (String field: fields) xs.add(fieldGet(v,field));
            return xs;
        }
        java.util.Map<String,Object> obj = new java.util.TreeMap<>();
        for (java.lang.reflect.Field f: v.getClass().getDeclaredFields()) {
            if (java.lang.reflect.Modifier.isStatic(f.getModifiers())) continue;
            f.setAccessible(true); obj.put(f.getName(),norm(f.get(v), new String[]{}));
        }
        return obj;
    }
    static boolean unique(Object result) {
        if (!(result instanceof java.util.Collection<?>)) return false;
        java.util.IdentityHashMap<Object,Boolean> used = new java.util.IdentityHashMap<>();
        for(Object item : (java.util.Collection<?>)result) {
            if (item == null || used.put(item,Boolean.TRUE) != null) return false;
        }
        return true;
    }
`;

function javaHarness(spec, code, tests, marker) {
    const types=javaMethodParamTypes(spec);
    const fields=resultFields(spec).map(toCamel);
    const blocks=tests.map((t,i)=>{
        if(types.length!==t.args.length)throw new Error(`Arg count mismatch ${spec.id} case ${i}`);
        const declarations=t.args.flatMap((a,j)=>javaAssignArg(a,types[j],`a${j}`)).join('\n            ');
        const vars=t.args.map((_,j)=>`a${j}`).join(', ');
        const expected=javaExpected(t.expected);
        const after=t.after===null||t.after===undefined ?
            `ok = ok && java.util.Objects.deepEquals(before, norm(new Object[]{${vars}}, new String[]{}));` :
            Object.entries(t.after).map(([k,v])=>`ok = ok && java.util.Objects.equals(fieldGet(a0,${JSON.stringify(toCamel(k))}),${javaLiteral(v)});`).join('\n                ')+
            `\n                ok = ok && java.util.Objects.deepEquals(restBefore, norm(new Object[]{${t.args.map((_,j)=>`a${j}`).slice(1).join(', ')}}, new String[]{}));`;
        return `        {\n            boolean ok = false;\n            try {\n            ${declarations}\n`+
            `                Object before = norm(new Object[]{${vars}}, new String[]{});\n`+
            `                Object restBefore = norm(new Object[]{${t.args.map((_,j)=>`a${j}`).slice(1).join(', ')}}, new String[]{});\n`+
            `                Object result = Solution.${spec.entry_point}(${vars});\n`+
            `                ok = java.util.Objects.deepEquals(norm(result, new String[]{${fields.map(JSON.stringify).join(',')}}),${expected});\n`+
            (fields.length ? `                ok = ok && unique(result);\n`:'')+
            `                ${after}\n`+
            `            } catch (Throwable ignored) { ok = false; }\n`+
            `            System.out.println(${JSON.stringify(marker+i+':')} + (ok ? "1" : "0"));\n        }`;
    });
    return code + '\n' + javaPrelude +
        `    public static void main(String[] args) {\n${blocks.join('\n')}\n    }\n}\n`;
}

export function buildR3Harness(language, question, code, visibility = 'hidden') {
    if (!isR3CodeQuestion(question)) throw new Error(`Not an R3 executable task: ${question?.id}`);
    const spec=r3PrivateSpec(question.id);
    const lang = spec.id.includes('-PY-')?'python':'java';
    if(language !== lang)throw new Error(`Question/language mismatch ${question.id}/${language}`);
    const available=spec.hidden_test_cases;
    if(!Array.isArray(available)||available.length<2)throw new Error(`No private cases for ${question.id}`);
    // The first R3 test is explicitly designated as a visible example and is
    // excluded from the scored hidden-check denominator.
    const cases=visibility==='sample' ? available.slice(0,1) : available.slice(1);
    const marker=`__PB_R3_${crypto.randomBytes(12).toString('hex')}_`;
    const source=lang==='python'?pyHarness(spec, code, cases, marker):javaHarness(spec, code, cases, marker);
    return {source, marker, count:cases.length, visibility};
}

export function readR3HarnessResult(run, harness) {
    const stdout=String(run?.stdout||'');
    const lines=stdout.split(/\r?\n/);
    const found=new Map();
    for(const line of lines){
        if(!line.startsWith(harness.marker))continue;
        const m=new RegExp(`^${harness.marker}(\\d+):([01])$`).exec(line.trim());
        if(m)found.set(Number(m[1]),Number(m[2]));
    }
    let passed=0;
    for(let n=0;n<harness.count;n++)if(found.get(n)===1)passed++;
    return {passed,total:harness.count,complete:found.size===harness.count};
}
