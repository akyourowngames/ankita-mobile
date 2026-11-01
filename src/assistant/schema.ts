import { ASSISTANT_LIMITS as L } from './config.ts';
import { object } from './validation.ts';

export class ToolFault extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.name = 'ToolFault'; this.code = code; }
}
type Schema = { type?: string | string[]; properties?: Record<string, Schema>; required?: string[]; additionalProperties?: boolean | Schema; items?: Schema; enum?: unknown[]; minLength?: number; maxLength?: number; minimum?: number; maximum?: number; maxItems?: number; anyOf?: Schema[]; oneOf?: Schema[] };
export function validateToolArguments(args: unknown, parameters: Record<string, unknown>): asserts args is Record<string, unknown> {
  const invalid = (message: string): never => { throw new ToolFault('invalid_arguments', message); };
  if (!object(args) || JSON.stringify(args).length > L.argumentChars) invalid('Tool arguments must be a bounded JSON object.');
  function check(value: unknown, schema: Schema, path: string, depth: number) {
    if (depth > L.schemaDepth) invalid('Tool arguments are too deeply nested.');
    if (schema.enum && !schema.enum.some(item => JSON.stringify(item) === JSON.stringify(value))) invalid(`${path} is not an allowed value.`);
    if (schema.anyOf || schema.oneOf) {
      let matching = 0;
      for (const option of schema.anyOf || schema.oneOf || []) { try { check(value, option, path, depth + 1); matching++; } catch {} }
      if (!matching || (schema.oneOf && matching !== 1)) invalid(`${path} does not match the tool schema.`);
    }
    const types = schema.type ? Array.isArray(schema.type) ? schema.type : [schema.type] : [];
    const matches = (type: string) => type === 'object' ? object(value) : type === 'array' ? Array.isArray(value) : type === 'null' ? value === null : type === 'integer' ? typeof value === 'number' && Number.isInteger(value) : typeof value === type;
    if (types.length && !types.some(matches)) invalid(`${path} has the wrong type.`);
    if (typeof value === 'number' && (!Number.isFinite(value) || (schema.minimum !== undefined && value < schema.minimum) || (schema.maximum !== undefined && value > schema.maximum))) invalid(`${path} is outside the allowed range.`);
    if (typeof value === 'string' && ((schema.minLength !== undefined && value.trim().length < schema.minLength) || (schema.maxLength !== undefined && value.length > schema.maxLength))) invalid(`${path} has an invalid length.`);
    if (Array.isArray(value)) { if (schema.maxItems !== undefined && value.length > schema.maxItems) invalid(`${path} has too many items.`); if (schema.items) value.forEach(item => check(item, schema.items!, path, depth + 1)); }
    if (object(value)) {
      if (Object.keys(value).length > L.schemaProperties) invalid(`${path} has too many properties.`);
      for (const name of schema.required || []) if (!(name in value)) invalid(`${path}.${name} is required.`);
      for (const [name, item] of Object.entries(value)) {
        if (['__proto__', 'constructor', 'prototype'].includes(name)) invalid('Unsafe tool property.');
        const child = schema.properties?.[name];
        if (child) check(item, child, `${path}.${name}`, depth + 1);
        else if (schema.additionalProperties === false) invalid(`${path}.${name} is not supported.`);
        else if (object(schema.additionalProperties)) check(item, schema.additionalProperties as Schema, `${path}.${name}`, depth + 1);
      }
    }
  }
  check(args, parameters, 'arguments', 0);
}
export function canonicalArguments(value: unknown): string {
  const sort = (item: unknown, depth: number): unknown => {
    if (depth > L.schemaDepth) throw new ToolFault('invalid_arguments', 'Tool arguments are too deeply nested.');
    if (Array.isArray(item)) return item.map(child => sort(child, depth + 1));
    if (object(item)) return Object.fromEntries(Object.keys(item).sort().map(key => [key, sort(item[key], depth + 1)]));
    return item;
  };
  return JSON.stringify(sort(value, 0));
}
