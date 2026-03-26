/**
 * Anchored Spec CLI — Error handling
 *
 * CliError is thrown by command actions instead of calling process.exit().
 * This makes commands testable and safe for programmatic use.
 */

export class CliError extends Error {
  constructor(
    message: string = "",
    public exitCode: number = 1,
  ) {
    super(message);
    this.name = "CliError";
  }
}
