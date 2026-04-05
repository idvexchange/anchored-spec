export default [
  {
    name: "anchored-spec-core-runtime-modules",
    language: "typescript",
    fileGlobs: ["src/ea/*.ts"],
    patterns: [
      {
        name: "exported-core-function",
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
        name: "exported-core-class",
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
        name: "exported-core-const",
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
  },
  {
    name: "anchored-spec-report-views",
    language: "typescript",
    fileGlobs: ["src/ea/report.ts", "src/ea/evidence-renderer.ts"],
    patterns: [
      {
        name: "exported-report-view-function",
        query: `
          (export_statement
            declaration: (function_declaration
              name: (identifier) @report.name))
          (#match? @report.name "^(build|render).+")
        `,
        captures: [
          { capture: "@report.name", role: "title" }
        ],
        inferredSchema: "system-interface",
        inferredDomain: "systems",
        category: "report-view"
      }
    ]
  }
];
