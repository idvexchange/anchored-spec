/**
 * Anchored Spec — JavaScript/TypeScript Query Packs
 *
 * Tree-sitter query patterns for discovering EA artifacts from
 * JavaScript and TypeScript codebases.
 *
 * Covers: Express/Fastify/Hono routes, Prisma/TypeORM DB access,
 * EventEmitter/Bull events, fetch/axios external calls.
 */

import type { QueryPack } from "../types.js";

// ─── Route Discovery ────────────────────────────────────────────────────────────

const expressRoutes: QueryPack = {
  name: "express-routes",
  language: "javascript",
  fileGlobs: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx", "**/*.mjs"],
  patterns: [
    {
      name: "express-route-handler",
      query: `
        (call_expression
          function: (member_expression
            object: (identifier) @_router
            property: (property_identifier) @method)
          arguments: (arguments
            (string (string_fragment) @route.path)))
      `,
      captures: [
        { capture: "@method", role: "method" },
        { capture: "@route.path", role: "anchor" },
      ],
      inferredKind: "api-contract",
      inferredDomain: "systems",
      category: "route",
    },
    {
      name: "express-route-template-literal",
      query: `
        (call_expression
          function: (member_expression
            object: (identifier) @_router
            property: (property_identifier) @method)
          arguments: (arguments
            (template_string) @route.path))
      `,
      captures: [
        { capture: "@method", role: "method" },
        { capture: "@route.path", role: "anchor" },
      ],
      inferredKind: "api-contract",
      inferredDomain: "systems",
      category: "route",
    },
  ],
};

// Next.js App Router API routes
const nextjsRoutes: QueryPack = {
  name: "nextjs-api-routes",
  language: "javascript",
  fileGlobs: ["**/app/**/route.ts", "**/app/**/route.js", "**/pages/api/**/*.ts", "**/pages/api/**/*.js"],
  patterns: [
    {
      name: "nextjs-route-handler-export",
      query: `
        (export_statement
          declaration: (function_declaration
            name: (identifier) @method))
      `,
      captures: [
        { capture: "@method", role: "method" },
      ],
      inferredKind: "api-contract",
      inferredDomain: "systems",
      category: "route",
    },
    {
      name: "nextjs-route-handler-arrow",
      query: `
        (export_statement
          declaration: (lexical_declaration
            (variable_declarator
              name: (identifier) @method
              value: (arrow_function))))
      `,
      captures: [
        { capture: "@method", role: "method" },
      ],
      inferredKind: "api-contract",
      inferredDomain: "systems",
      category: "route",
    },
  ],
};

// ─── DB Access Discovery ────────────────────────────────────────────────────────

const prismaAccess: QueryPack = {
  name: "prisma-db-access",
  language: "javascript",
  fileGlobs: ["**/*.ts", "**/*.js", "**/*.mjs"],
  patterns: [
    {
      name: "prisma-model-operation",
      query: `
        (call_expression
          function: (member_expression
            object: (member_expression
              object: (identifier) @_prisma
              property: (property_identifier) @model)
            property: (property_identifier) @operation))
      `,
      captures: [
        { capture: "@model", role: "table" },
        { capture: "@operation", role: "metadata" },
      ],
      inferredKind: "physical-schema",
      inferredDomain: "data",
      category: "db-access",
    },
  ],
};

const typeormAccess: QueryPack = {
  name: "typeorm-db-access",
  language: "javascript",
  fileGlobs: ["**/*.ts", "**/*.js"],
  patterns: [
    {
      name: "typeorm-entity-decorator",
      query: `
        (decorator
          (call_expression
            function: (identifier) @_decorator)
          (#eq? @_decorator "Entity"))
      `,
      captures: [],
      inferredKind: "physical-schema",
      inferredDomain: "data",
      category: "db-access",
    },
  ],
};

// ─── Event Discovery ────────────────────────────────────────────────────────────

const eventEmitter: QueryPack = {
  name: "event-emitter",
  language: "javascript",
  fileGlobs: ["**/*.ts", "**/*.js", "**/*.mjs"],
  patterns: [
    {
      name: "event-emit",
      query: `
        (call_expression
          function: (member_expression
            property: (property_identifier) @_method
            (#eq? @_method "emit"))
          arguments: (arguments
            (string (string_fragment) @event.name)))
      `,
      captures: [
        { capture: "@event.name", role: "event" },
      ],
      inferredKind: "event-contract",
      inferredDomain: "systems",
      category: "event",
    },
    {
      name: "event-on-listener",
      query: `
        (call_expression
          function: (member_expression
            property: (property_identifier) @_method
            (#eq? @_method "on"))
          arguments: (arguments
            (string (string_fragment) @event.name)))
      `,
      captures: [
        { capture: "@event.name", role: "event" },
      ],
      inferredKind: "event-contract",
      inferredDomain: "systems",
      category: "event",
    },
  ],
};

const bullQueue: QueryPack = {
  name: "bull-queue",
  language: "javascript",
  fileGlobs: ["**/*.ts", "**/*.js", "**/*.mjs"],
  patterns: [
    {
      name: "bull-queue-add",
      query: `
        (call_expression
          function: (member_expression
            property: (property_identifier) @_method
            (#eq? @_method "add"))
          arguments: (arguments
            (string (string_fragment) @event.name)))
      `,
      captures: [
        { capture: "@event.name", role: "event" },
      ],
      inferredKind: "event-contract",
      inferredDomain: "systems",
      category: "event",
    },
    {
      name: "bull-queue-process",
      query: `
        (call_expression
          function: (member_expression
            property: (property_identifier) @_method
            (#eq? @_method "process"))
          arguments: (arguments
            (string (string_fragment) @event.name)))
      `,
      captures: [
        { capture: "@event.name", role: "event" },
      ],
      inferredKind: "event-contract",
      inferredDomain: "systems",
      category: "event",
    },
  ],
};

// ─── External Call Discovery ────────────────────────────────────────────────────

const fetchCalls: QueryPack = {
  name: "fetch-external-calls",
  language: "javascript",
  fileGlobs: ["**/*.ts", "**/*.js", "**/*.mjs"],
  patterns: [
    {
      name: "fetch-call",
      query: `
        (call_expression
          function: (identifier) @_fn
          (#eq? @_fn "fetch")
          arguments: (arguments
            (string (string_fragment) @url)))
      `,
      captures: [
        { capture: "@url", role: "service" },
      ],
      inferredKind: "service",
      inferredDomain: "systems",
      category: "external-call",
    },
    {
      name: "fetch-call-template",
      query: `
        (call_expression
          function: (identifier) @_fn
          (#eq? @_fn "fetch")
          arguments: (arguments
            (template_string) @url))
      `,
      captures: [
        { capture: "@url", role: "service" },
      ],
      inferredKind: "service",
      inferredDomain: "systems",
      category: "external-call",
    },
  ],
};

const axiosCalls: QueryPack = {
  name: "axios-external-calls",
  language: "javascript",
  fileGlobs: ["**/*.ts", "**/*.js", "**/*.mjs"],
  patterns: [
    {
      name: "axios-method-call",
      query: `
        (call_expression
          function: (member_expression
            object: (identifier) @_axios
            (#eq? @_axios "axios")
            property: (property_identifier) @method)
          arguments: (arguments
            (string (string_fragment) @url)))
      `,
      captures: [
        { capture: "@url", role: "service" },
        { capture: "@method", role: "method" },
      ],
      inferredKind: "service",
      inferredDomain: "systems",
      category: "external-call",
    },
  ],
};

// ─── Pack Registry ──────────────────────────────────────────────────────────────

/** All built-in JavaScript/TypeScript query packs. */
export const javascriptPacks: QueryPack[] = [
  expressRoutes,
  nextjsRoutes,
  prismaAccess,
  typeormAccess,
  eventEmitter,
  bullQueue,
  fetchCalls,
  axiosCalls,
];
