export default [
  {
    name: "anchored-spec-backstage-modules",
    language: "typescript",
    fileGlobs: ["src/ea/backstage/*.ts", "src/ea/backstage/**/*.ts"],
    patterns: [
      {
        name: "exported-backstage-function",
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
        name: "exported-backstage-class",
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
        name: "exported-backstage-const",
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
