export default [
  {
    name: "anchored-spec-docs-and-facts-modules",
    language: "typescript",
    fileGlobs: [
      "src/ea/docs/*.ts",
      "src/ea/docs/**/*.ts",
      "src/ea/facts/*.ts",
      "src/ea/facts/**/*.ts"
    ],
    patterns: [
      {
        name: "exported-docs-function",
        query: `
          (export_statement
            declaration: (function_declaration
              name: (identifier) @symbol.name))
        `,
        captures: [
          { capture: "@symbol.name", role: "title" }
        ],
        inferredSchema: "service",
        inferredDomain: "systems",
        category: "framework-module"
      },
      {
        name: "exported-docs-class",
        query: `
          (export_statement
            declaration: (class_declaration
              name: (type_identifier) @symbol.name))
        `,
        captures: [
          { capture: "@symbol.name", role: "title" }
        ],
        inferredSchema: "service",
        inferredDomain: "systems",
        category: "framework-module"
      },
      {
        name: "exported-docs-const",
        query: `
          (export_statement
            declaration: (lexical_declaration
              (variable_declarator
                name: (identifier) @symbol.name)))
        `,
        captures: [
          { capture: "@symbol.name", role: "title" }
        ],
        inferredSchema: "service",
        inferredDomain: "systems",
        category: "framework-module"
      }
    ]
  }
];
