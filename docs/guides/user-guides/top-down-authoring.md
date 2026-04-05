# Top-Down Authoring

Use this workflow when you already know what the architecture should be and want to model it intentionally.

## Default sequence

```bash
npx anchored-spec init --mode manifest
npx anchored-spec create --kind Domain --title "Commerce" --owner group:default/platform-team
npx anchored-spec create --kind System --title "Checkout Platform" --owner group:default/platform-team
npx anchored-spec create --kind Component --type service --title "Orders Service" --owner group:default/platform-team
npx anchored-spec validate
```

## Recommended order

1. create domain and system boundaries
2. create runtime components, APIs, and resources
3. add relationships
4. validate
5. add reports or semantic review workflows as the model becomes useful

## Best fit

- greenfield repositories
- strong architectural intent
- early governance and review needs
