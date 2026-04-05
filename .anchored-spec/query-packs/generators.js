export default [
  {
    name: "anchored-spec-generators",
    language: "typescript",
    fileGlobs: ["src/ea/generators/*.ts", "src/ea/generators/**/*.ts"],
    patterns: [
      {
        name: "exported-generator-function",
        query: `
          (export_statement
            declaration: (function_declaration
              name: (identifier) @generator.name))
        `,
        captures: [
          { capture: "@generator.name", role: "title" }
        ],
        inferredSchema: "service",
        inferredDomain: "systems",
        category: "generator"
      },
      {
        name: "exported-generator-class",
        query: `
          (export_statement
            declaration: (class_declaration
              name: (type_identifier) @generator.name))
        `,
        captures: [
          { capture: "@generator.name", role: "title" }
        ],
        inferredSchema: "service",
        inferredDomain: "systems",
        category: "generator"
      },
      {
        name: "exported-generator-const",
        query: `
          (export_statement
            declaration: (lexical_declaration
              (variable_declarator
                name: (identifier) @generator.name)))
        `,
        captures: [
          { capture: "@generator.name", role: "title" }
        ],
        inferredSchema: "service",
        inferredDomain: "systems",
        category: "generator"
      }
    ]
  }
];
