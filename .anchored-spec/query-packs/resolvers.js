export default [
  {
    name: "anchored-spec-resolver-classes",
    language: "typescript",
    fileGlobs: ["src/ea/resolvers/*.ts", "src/ea/resolvers/tree-sitter/*.ts", "src/resolvers/*.ts"],
    patterns: [
      {
        name: "exported-resolver-class",
        query: `
          (export_statement
            declaration: (class_declaration
              name: (type_identifier) @resolver.name))
        `,
        captures: [
          { capture: "@resolver.name", role: "title" }
        ],
        inferredSchema: "service",
        inferredDomain: "systems",
        category: "resolver"
      }
    ]
  }
];
