export default [
  {
    name: "anchored-spec-cli-commands",
    language: "typescript",
    fileGlobs: ["src/cli/commands/*.ts", "src/cli/index.ts"],
    patterns: [
      {
        name: "commander-command-name",
        query: `
          (new_expression
            constructor: (identifier) @_ctor
            (#eq? @_ctor "Command")
            arguments: (arguments
              (string
                (string_fragment) @command.name)))
        `,
        captures: [
          { capture: "@command.name", role: "anchor" }
        ],
        inferredSchema: "system-interface",
        inferredDomain: "systems",
        category: "cli-command"
      }
    ]
  }
];
