export function createRepositoryEvidenceAdapter() {
  return {
    id: "custom-service-adapter",
    discoverTargets() {
      return [
        {
          id: "payments-service",
          name: "payments-service",
          path: "services/payments",
          kind: "service-unit",
        },
      ];
    },
    suggestCommands(target) {
      return [
        {
          kind: "verify",
          tier: "commands",
          command: `verify-service ${target.id}`,
          targetId: target.id,
        },
      ];
    },
  };
}
