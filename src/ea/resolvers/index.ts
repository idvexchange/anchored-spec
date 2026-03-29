/**
 * Anchored Spec — EA Resolvers
 *
 * Barrel exports for the resolver framework and built-in resolvers.
 */

// Resolver types
export type {
  EaResolver,
  EaResolverContext,
  EaAnchorResolution,
  ObservedEaState,
  ObservedEntity,
  ObservedRelationship,
  ResolverLogger,
} from "./types.js";
export { consoleLogger, silentLogger } from "./types.js";

// OpenAPI Resolver
export type { OpenApiSpec } from "./openapi.js";
export {
  OpenApiResolver,
  findOpenApiFiles,
  loadOpenApiSpec,
  hasEndpoint,
  extractAllEndpoints,
  parseSimpleYaml,
} from "./openapi.js";

// Kubernetes Resolver
export type { K8sManifest } from "./kubernetes.js";
export {
  KubernetesResolver,
  findK8sFiles,
  loadK8sManifests,
  k8sResourceId,
  extractImages,
  extractReplicas,
} from "./kubernetes.js";
